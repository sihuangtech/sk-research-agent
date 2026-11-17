import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Project } from '../shared/contracts.js';
import type { Checkpoint } from '../shared/partner.js';
import { DomainError } from './errors.js';
import { ignoredFolders, insidePath, scanWorkspace, toPosix } from './research/workspace.js';
import type { Store } from './store.js';

const largeFile = 20_000_000;
const budget = 1_000_000_000;
const keep = 50;
const escape = (path: string) => `/${toPosix(path).replace(/([*?[\\!#])/g, '\\$1')}`;

/**
 * Snapshots of project files kept in a separate Git directory under the app data folder.
 * The project's own repository, branches and index are never touched. Large files and
 * protected paths are left out, so restoring never changes them.
 */
export class Checkpoints {
  private available?: Promise<boolean>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private store: Store,
    private dataDir: string,
  ) {}
  private git(project: Project, args: string[], input?: string) {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_DIR: join(this.dataDir, 'checkpoints', project.id),
      GIT_WORK_TREE: project.path,
      GIT_LITERAL_PATHSPECS: '1',
    };
    delete env.AGENTIC_TOKEN;
    const config = ['user.name=Second Moon', 'user.email=checkpoints@second-moon.invalid'];
    const options = [...config, 'core.autocrlf=false', 'core.quotepath=false', 'gc.auto=0'];
    return new Promise<string>((resolve, reject) => {
      const child = spawn('git', [...options.flatMap((o) => ['-c', o]), ...args], {
        cwd: project.path,
        env,
        stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
      child.stdin?.end(input);
      let out = '';
      let err = '';
      child.stdout?.on('data', (d) => (out += d));
      child.stderr?.on('data', (d) => (err += d));
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
    });
  }
  private serial<T>(work: () => Promise<T>) {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => {});
    return next;
  }
  isAvailable() {
    this.available ??= new Promise((resolve) => {
      const child = spawn('git', ['--version'], { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
    return this.available;
  }
  /** Records the current project files. Returns null when Git is missing or the project is too large. */
  create(project: Project, sessionId: string | null, label: string) {
    return this.serial(async (): Promise<Checkpoint | null> => {
      if (!(await this.isAvailable())) return null;
      const scan = await scanWorkspace(project.path);
      if (scan.truncated) return null;
      const skip = await this.skipped(project, scan);
      let total = 0;
      for (const [path, file] of scan.files) if (!skip.has(path)) total += file.size;
      if (total > budget) return null;
      const excluded = [...ignoredFolders].map((name) => `${name}/`);
      excluded.push(...[...skip].map(escape));
      const gitDir = join(this.dataDir, 'checkpoints', project.id);
      await mkdir(join(gitDir, 'info'), { recursive: true });
      await this.git(project, ['init', '--quiet']);
      await writeFile(join(gitDir, 'info', 'exclude'), `${excluded.join('\n')}\n`);
      // Rebuild the index so files that became large or protected stop being tracked.
      await this.git(project, ['read-tree', '--empty']);
      await this.git(project, ['add', '--all']);
      await this.git(project, ['commit', '--quiet', '--allow-empty', '-m', label || '-']);
      const files = (await this.git(project, ['ls-files'])).split('\n').filter(Boolean).length;
      const checkpoint: Checkpoint = {
        id: randomUUID(),
        projectId: project.id,
        sessionId,
        label: label.slice(0, 200),
        commit: await this.git(project, ['rev-parse', 'HEAD']),
        createdAt: Date.now(),
        files,
        skipped: skip.size,
      };
      await this.store.put('checkpoints', checkpoint);
      const old = (await this.list(project.id)).slice(keep);
      for (const entry of old) await this.store.remove('checkpoints', entry.id);
      return checkpoint;
    });
  }
  /** Large files and protected paths, which checkpoints neither record nor restore. */
  private async skipped(project: Project, scan?: Awaited<ReturnType<typeof scanWorkspace>>) {
    const files = (scan || (await scanWorkspace(project.path))).files;
    const protectedPaths = project.protectedPaths || [];
    return new Set(
      [...files]
        .filter(
          ([path, file]) =>
            file.size > largeFile || protectedPaths.some((p) => insidePath(path, p)),
        )
        .map(([path]) => path),
    );
  }
  async list(projectId: string) {
    return (await this.store.list('checkpoints'))
      .filter((checkpoint) => checkpoint.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  /**
   * Puts project files back as they were at the checkpoint, after saving the current state as a
   * new checkpoint so the restore itself can be undone. Files created later are removed.
   */
  async restore(id: string, label: string) {
    const target = await this.store.get('checkpoints', id);
    const project = await this.store.get('projects', target.projectId);
    const sessions = await this.store.list('sessions');
    if (sessions.some((s) => s.projectId === project.id && s.status === 'running'))
      throw new DomainError('checkpointBusy', 409);
    const safety = await this.create(project, null, label);
    if (!safety) throw new DomainError('checkpointUnavailable');
    await this.serial(async () => {
      const list = async (args: string[]) =>
        (await this.git(project, args)).split('\0').filter(Boolean);
      const skip = await this.skipped(project);
      const protectedPaths = project.protectedPaths || [];
      // Files in either snapshot; files absent from the target are removed by `git restore`.
      const paths = new Set([
        ...(await list(['ls-tree', '-r', '-z', '--name-only', target.commit])),
        ...(await list(['ls-files', '-z'])),
      ]);
      const allowed = [...paths].filter(
        (path) => !skip.has(path) && !protectedPaths.some((p) => insidePath(path, p)),
      );
      if (!allowed.length) return;
      const args = ['restore', `--source=${target.commit}`, '--worktree'];
      await this.git(
        project,
        [...args, '--pathspec-from-file=-', '--pathspec-file-nul'],
        `${allowed.join('\0')}\0`,
      );
    });
    return safety;
  }
}
