import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { relative } from 'node:path';
import type { ResearchSource } from '../../shared/research.js';
import { DomainError } from '../errors.js';
import { projectPath } from '../files.js';
import { readPdf } from '../pdf.js';

export async function snapshotFile(root: string, path: string): Promise<ResearchSource> {
  const full = await projectPath(root, path);
  const before = await stat(full);
  if (!before.isFile()) throw new DomainError('notFile');
  if (before.size > 50_000_000) throw new DomainError('researchSourceTooLarge');
  const data = await readFile(full);
  const after = await stat(full);
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size)
    throw new DomainError('fileConflict');
  return {
    path: relative(root, full),
    sha256: createHash('sha256').update(data).digest('hex'),
    bytes: data.length,
    capturedAt: Date.now(),
    role: 'artifact',
    verification: 'file-snapshot',
  };
}
export type SourceInput = Pick<ResearchSource, 'path' | 'url' | 'page' | 'quote' | 'role'>;
const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
export async function captureSource(root: string, input: SourceInput): Promise<ResearchSource> {
  if (!input.path) return { ...input, verification: 'reference-only' };
  const snapshot = await snapshotFile(root, input.path);
  const source: ResearchSource = { ...input, ...snapshot, role: input.role };
  if (input.quote) {
    let text: string;
    if (/\.pdf$/i.test(input.path)) {
      if (!input.page) throw new DomainError('researchPageRequired');
      const pdf = await readPdf(root, input.path, input.page, input.page);
      text = pdf.pages[0].text;
    } else {
      if (input.page) throw new DomainError('researchPageRequired');
      text = await readFile(await projectPath(root, input.path), 'utf8');
    }
    if (!normalize(text).includes(normalize(input.quote)))
      throw new DomainError('researchExcerptMismatch');
    const after = await snapshotFile(root, input.path);
    if (after.sha256 !== snapshot.sha256) throw new DomainError('fileConflict');
    source.verification = 'excerpt-matched';
  }
  return source;
}
export async function checkSources(root: string, sources: ResearchSource[]) {
  return Promise.all(
    sources.map(async (source) => {
      if (!source.path) return { ...source, state: 'reference-only' as const };
      try {
        const current = await snapshotFile(root, source.path);
        return {
          ...source,
          state: current.sha256 === source.sha256 ? ('unchanged' as const) : ('changed' as const),
        };
      } catch {
        return { ...source, state: 'unavailable' as const };
      }
    }),
  );
}
