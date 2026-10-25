import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { researchKinds, researchStates, type ResearchEntry } from '../../shared/research.js';
import { DomainError } from '../errors.js';
import type { Store } from '../store.js';
import { captureSource } from './sources.js';

export const entryInput = z
  .object({
    kind: z.enum(researchKinds),
    status: z.enum(researchStates).default('open'),
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(12000),
    sessionId: z.string().uuid().nullable().default(null),
    relatedIds: z.array(z.string().uuid()).max(20).default([]),
    supersedesId: z.string().uuid().optional(),
    sources: z
      .array(
        z
          .object({
            path: z.string().trim().min(1).max(1000).optional(),
            url: z
              .url()
              .refine((url) => ['http:', 'https:'].includes(new URL(url).protocol))
              .optional(),
            page: z.number().int().min(1).optional(),
            quote: z.string().trim().min(1).max(8000).optional(),
            role: z.enum(['source', 'artifact']).default('source'),
          })
          .refine((source) => Boolean(source.path || source.url))
          .refine((source) => !source.page || Boolean(source.path)),
      )
      .max(10)
      .default([]),
  })
  .refine(
    (entry) => entry.kind !== 'evidence' || entry.sources.length > 0,
    'researchEvidenceRequired',
  );

function terms(query: string) {
  const text = query.toLocaleLowerCase();
  const words = text.match(/[\p{L}\p{N}_-]+/gu) || [];
  const chinese = (text.match(/[\p{Script=Han}]+/gu) || []).flatMap((word) =>
    Array.from({ length: Math.max(0, word.length - 1) }, (_, i) => word.slice(i, i + 2)),
  );
  return [...new Set([...words, ...chinese])].filter((word) => word.length > 0).slice(0, 80);
}
export class Notebook {
  constructor(private store: Store) {}
  async entries(projectId: string, query = '', includeHistory = false) {
    const all = (await this.store.list('research')).filter(
      (entry) => entry.projectId === projectId,
    );
    const superseded = new Set(all.map((entry) => entry.supersedesId));
    const tokens = terms(query);
    return all
      .filter((entry) => includeHistory || !superseded.has(entry.id))
      .map((entry) => {
        const title = entry.title.toLocaleLowerCase();
        const text = `${entry.content} ${JSON.stringify(entry.sources)}`.toLocaleLowerCase();
        const score = tokens.reduce(
          (sum, token) => sum + (title.includes(token) ? 4 : 0) + (text.includes(token) ? 1 : 0),
          0,
        );
        return { entry, score };
      })
      .filter(({ score }) => !query.trim() || score > 0)
      .sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt)
      .map(({ entry }) => entry);
  }
  async record(projectId: string, raw: unknown, author: ResearchEntry['author']) {
    const input = entryInput.parse(raw);
    const project = await this.store.get('projects', projectId);
    if (
      input.sessionId &&
      (await this.store.get('sessions', input.sessionId)).projectId !== projectId
    )
      throw new DomainError('researchProjectMismatch');
    for (const relatedId of [
      ...input.relatedIds,
      ...(input.supersedesId ? [input.supersedesId] : []),
    ]) {
      const related = await this.store.get('research', relatedId);
      if (related.projectId !== projectId) throw new DomainError('researchProjectMismatch');
      if (relatedId === input.supersedesId && author === 'agent' && related.author === 'user')
        throw new DomainError('researchRevisionDenied');
    }
    const sources = await Promise.all(
      input.sources.map((source) => captureSource(project.path, source)),
    );
    const entry: ResearchEntry = {
      ...input,
      id: randomUUID(),
      projectId,
      author,
      createdAt: Date.now(),
      sources,
    };
    await this.store.put('research', entry);
    return entry;
  }
  async context(projectId: string, query: string) {
    const relevant = await this.entries(projectId, query);
    const recent = await this.entries(projectId);
    const selected = [
      ...new Map(
        [...relevant.slice(0, 8), ...recent.slice(0, 4)].map((entry) => [entry.id, entry]),
      ).values(),
    ];
    const result: unknown[] = [];
    let remaining = 14000;
    for (const entry of selected) {
      const compact = {
        ...entry,
        content: entry.content.slice(0, 1800),
        sources: entry.sources.map((source) => ({ ...source, quote: source.quote?.slice(0, 600) })),
      };
      const size = JSON.stringify(compact).length;
      if (size > remaining) continue;
      remaining -= size;
      result.push(compact);
    }
    return JSON.stringify(result);
  }
}
