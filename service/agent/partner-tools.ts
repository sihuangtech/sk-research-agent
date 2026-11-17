import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { Project } from '../../shared/contracts.js';
import type { Locale } from '../../shared/locale.js';
import type { ReportKind } from '../../shared/partner.js';
import type { Changed } from '../changes.js';
import { DomainError, message, type MessageCode } from '../errors.js';
import { projectPath } from '../files.js';
import { insidePath } from '../research/workspace.js';
import type { Store } from '../store.js';

const pendingLimit = 5;
/** Report citations look like `[#1a2b3c4d]`: the first eight characters of a record ID. */
export const citationPattern = /\[#([0-9a-f]{8})\]/g;

/** Calendar date on this computer, e.g. 2026-11-18. UTC would be a day off overnight in Asia. */
export function localDate(time = Date.now()) {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function citedIds(text: string) {
  return [...new Set([...text.matchAll(citationPattern)].map((match) => match[1]))];
}
const reply = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  details: {},
});
function tool(
  locale: Locale,
  name: string,
  label: MessageCode,
  description: MessageCode,
  parameters: ToolDefinition['parameters'],
  execute: (args: any) => Promise<unknown>,
): ToolDefinition {
  return {
    name,
    label: message(label, locale),
    description: message(description, locale),
    parameters,
    execute: async (_id, args) => {
      try {
        return reply(await execute(args));
      } catch (error) {
        if (error instanceof DomainError) throw new Error(message(error.code, locale));
        throw error;
      }
    },
  };
}
/** Lets the agent suggest something to remember about the researcher. Nothing is used until confirmed. */
export function memoryTool(store: Store, project: Project, locale: Locale, changed: Changed) {
  return tool(
    locale,
    'memory_propose',
    'memoryProposeLabel',
    'memoryProposeDescription',
    Type.Object({
      content: Type.String({ maxLength: 1000 }),
      scope: Type.Union([Type.Literal('personal'), Type.Literal('project')]),
      reason: Type.String({ maxLength: 500 }),
    }),
    async ({ content, scope, reason }) => {
      const memories = await store.list('memories');
      const projectId = scope === 'project' ? project.id : null;
      if (memories.some((m) => m.content.trim() === content.trim())) return { duplicate: true };
      const pending = memories.filter((m) => m.status === 'proposed');
      if (pending.length >= pendingLimit) throw new DomainError('memoryProposalLimit');
      const memory = await store.put('memories', {
        id: randomUUID(),
        projectId,
        content: content.trim(),
        source: 'agent',
        reason: reason.trim(),
        status: 'proposed',
        updatedAt: Date.now(),
      });
      changed({
        overview: true,
        alerts: [{ kind: 'memoryProposed', projectId: project.id, subject: memory.content }],
      });
      return { proposed: memory.id, note: message('memoryProposedNote', locale) };
    },
  );
}
/** Saves a report under `reports/` after checking that every citation names a real record. */
export function reportTool(store: Store, project: Project, kind: ReportKind, locale: Locale) {
  return tool(
    locale,
    'save_report',
    'reportSaveLabel',
    'reportSaveDescription',
    Type.Object({ content: Type.String({ maxLength: 60000 }) }),
    async ({ content }: { content: string }) => {
      if ((project.protectedPaths || []).some((p) => insidePath('reports', p)))
        throw new DomainError('guardProtected');
      const records = (await store.list('research')).filter((r) => r.projectId === project.id);
      const known = new Set(records.map((record) => record.id.slice(0, 8)));
      const cited = citedIds(content);
      const unknown = cited.filter((id) => !known.has(id));
      if (unknown.length)
        throw new Error(message('reportCitationsMissing', locale, { ids: unknown.join(', ') }));
      if (records.length && !cited.length) throw new DomainError('reportCitationsRequired');
      const folder = join(await projectPath(project.path), 'reports');
      await mkdir(folder, { recursive: true });
      await projectPath(project.path, 'reports');
      const date = localDate();
      let name = `${kind === 'weekly' ? 'weekly' : 'group-meeting'}-${date}.md`;
      for (let n = 2; await stat(join(folder, name)).catch(() => null); n++)
        name = `${kind === 'weekly' ? 'weekly' : 'group-meeting'}-${date}-${n}.md`;
      await writeFile(join(folder, name), content, { flag: 'wx' });
      return { path: `reports/${name}`, citations: cited.length };
    },
  );
}
