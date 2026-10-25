import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { DomainError, message, type MessageCode } from '../errors.js';
import type { Locale } from '../../shared/locale.js';
import { researchKinds, researchStates } from '../../shared/research.js';
import type { Store } from '../store.js';
import { Notebook } from './notebook.js';

export function notebookTools(
  store: Store,
  projectId: string,
  sessionId: string,
  locale: Locale,
  changed: () => void,
): ToolDefinition[] {
  const notebook = new Notebook(store);
  const reply = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    details: {},
  });
  const tool = (
    name: string,
    label: MessageCode,
    description: MessageCode,
    parameters: ToolDefinition['parameters'],
    execute: (args: any) => Promise<unknown>,
  ): ToolDefinition => ({
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
  });
  return [
    tool(
      'research_search',
      'researchSearchLabel',
      'researchSearchDescription',
      Type.Object({ query: Type.String({ maxLength: 1000 }) }),
      async ({ query }) => ({ entries: (await notebook.entries(projectId, query)).slice(0, 12) }),
    ),
    tool(
      'research_record',
      'researchRecordLabel',
      'researchRecordDescription',
      Type.Object({
        kind: Type.Union(
          researchKinds.filter((kind) => kind !== 'handoff').map((kind) => Type.Literal(kind)),
        ),
        status: Type.Optional(Type.Union(researchStates.map((state) => Type.Literal(state)))),
        title: Type.String({ maxLength: 200 }),
        content: Type.String({ maxLength: 12000 }),
        relatedIds: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
        supersedesId: Type.Optional(Type.String()),
        sources: Type.Optional(
          Type.Array(
            Type.Object({
              path: Type.Optional(Type.String()),
              url: Type.Optional(Type.String()),
              page: Type.Optional(Type.Integer({ minimum: 1 })),
              quote: Type.Optional(Type.String()),
              role: Type.Optional(Type.Union([Type.Literal('source'), Type.Literal('artifact')])),
            }),
            { maxItems: 10 },
          ),
        ),
      }),
      async (args) => {
        const entry = await notebook.record(projectId, { ...args, sessionId }, 'agent');
        changed();
        return entry;
      },
    ),
    tool(
      'research_executions',
      'researchExecutionLabel',
      'researchExecutionDescription',
      Type.Object({}),
      async () => ({ events: (await store.executions(projectId)).slice(0, 40) }),
    ),
  ];
}
