import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Job, Project } from '../shared/contracts.js';
import { DomainError } from './errors.js';
import type { Store } from './store.js';

export class Jobs {
  private children = new Map<string, { child: ChildProcess; job: Job; done: Promise<void> }>();
  constructor(
    private store: Store,
    private changed: () => void,
  ) {}
  async recover() {
    for (const job of await this.store.list('jobs'))
      if (job.status === 'running') {
        await this.store.put('jobs', {
          ...job,
          status: 'interrupted',
          endedAt: Date.now(),
          noticeCode: 'jobInterrupted',
        });
      }
  }
  async start(project: Project, command: string, sessionId: string | null = null) {
    const job: Job = {
      id: randomUUID(),
      projectId: project.id,
      sessionId,
      command,
      status: 'running',
      createdAt: Date.now(),
      log: '',
    };
    await this.store.put('jobs', job);
    await this.store.appendExecution({
      id: randomUUID(),
      projectId: project.id,
      sessionId,
      jobId: job.id,
      callId: job.id,
      tool: 'research_job',
      phase: 'started',
      createdAt: job.createdAt,
      arguments: { command },
      environment: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        cwd: project.path,
      },
    });
    const env = { ...process.env };
    delete env.AGENTIC_TOKEN;
    const child = spawn(command, {
      cwd: project.path,
      shell: true,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let persist = Promise.resolve();
    const save = () => {
      const copy = { ...job };
      persist = persist.then(async () => {
        await this.store.put('jobs', copy);
        this.changed();
      });
    };
    const append = (data: Buffer) => {
      job.log = (job.log + data.toString()).slice(-100_000);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    const timer = setInterval(save, 1000);
    const done = new Promise<void>((resolve) => {
      child.on('error', (error) => {
        job.log += `\n${error.message}`;
      });
      child.once('close', (code) => {
        clearInterval(timer);
        job.endedAt = Date.now();
        job.exitCode = code;
        if (job.status === 'running') job.status = code === 0 ? 'completed' : 'failed';
        save();
        persist = persist.then(() =>
          this.store.appendExecution({
            id: randomUUID(),
            projectId: project.id,
            sessionId,
            jobId: job.id,
            callId: job.id,
            tool: 'research_job',
            phase:
              job.status === 'completed'
                ? 'completed'
                : job.status === 'cancelled'
                  ? 'interrupted'
                  : 'failed',
            createdAt: job.endedAt!,
            exitCode: code,
            durationMs: job.endedAt! - job.createdAt,
          }),
        );
        void persist.finally(() => {
          this.children.delete(job.id);
          resolve();
        });
      });
    });
    this.children.set(job.id, { child, job, done });
    this.changed();
    return job;
  }
  async cancel(id: string) {
    const entry = this.children.get(id);
    if (!entry) throw new DomainError('jobFinished');
    entry.job.status = 'cancelled';
    if (entry.child.pid) {
      if (process.platform === 'win32')
        spawn('taskkill', ['/pid', String(entry.child.pid), '/T', '/F']);
      else {
        try {
          process.kill(-entry.child.pid, 'SIGTERM');
        } catch {}
      }
      const pid = entry.child.pid;
      const killTimer = setTimeout(() => {
        if (this.children.has(id) && process.platform !== 'win32') {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch {}
        }
      }, 1500);
      killTimer.unref();
    }
    await entry.done;
  }
  async stop() {
    await Promise.all([...this.children.keys()].map((id) => this.cancel(id)));
  }
}
