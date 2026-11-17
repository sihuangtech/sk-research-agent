import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { ResearchSource } from '../../shared/research.js';
import { snapshotFile } from './sources.js';

/** Folders that hold tooling, caches or other repositories rather than research output. */
export const ignoredFolders = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.ipynb_checkpoints',
  '.pytest_cache',
  '.mypy_cache',
]);
const scanLimit = 20_000;
const reportLimit = 100;

export interface WorkspaceScan {
  files: Map<string, { size: number; mtimeMs: number }>;
  /** True when the project had more files than one scan visits; later files are not compared. */
  truncated: boolean;
}
/** Lists project files with size and modification time, without reading their contents. */
export async function scanWorkspace(root: string): Promise<WorkspaceScan> {
  const files: WorkspaceScan['files'] = new Map();
  let truncated = false;
  const visit = async (directory: string) => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.size >= scanLimit) {
        truncated = true;
        return;
      }
      const full = join(directory, entry.name);
      if (entry.isDirectory() && !ignoredFolders.has(entry.name)) await visit(full);
      else if (entry.isFile()) {
        const info = await stat(full).catch(() => null);
        if (info) files.set(relative(root, full), { size: info.size, mtimeMs: info.mtimeMs });
      }
    }
  };
  await visit(root);
  return { files, truncated };
}
/** Paths created or changed since `before`, most recently modified first. */
export async function changedPaths(root: string, before: WorkspaceScan) {
  const after = await scanWorkspace(root);
  return [...after.files]
    .filter(([path, file]) => {
      const old = before.files.get(path);
      return !old || old.size !== file.size || old.mtimeMs !== file.mtimeMs;
    })
    .sort((a, b) => b[1].mtimeMs - a[1].mtimeMs)
    .map(([path]) => path);
}
/**
 * Fingerprints files a command produced so results can be traced to the command that made them.
 * Files over the source size limit or changed while hashing are listed without a fingerprint.
 */
export async function captureArtifacts(root: string, before: WorkspaceScan) {
  const paths = (await changedPaths(root, before)).slice(0, reportLimit);
  const files: ResearchSource[] = [];
  for (const path of paths) {
    const file = await snapshotFile(root, path).catch(() => null);
    files.push(file || { path, role: 'artifact', verification: 'reference-only' });
  }
  return files;
}
/** True when `path` is `protectedPath` itself or lies inside it. */
export function insidePath(path: string, protectedPath: string) {
  const a = path.split(/[\\/]+/).filter((part) => part && part !== '.');
  const b = protectedPath.split(/[\\/]+/).filter((part) => part && part !== '.');
  return b.length > 0 && b.every((part, index) => a[index] === part);
}
export const toPosix = (path: string) => path.split(sep).join('/');
