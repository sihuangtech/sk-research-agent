import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  Automation,
  Conversation,
  Job,
  Memory,
  Project,
  Provider,
} from '../shared/contracts.js';
import { DomainError } from './errors.js';
import type { ExecutionEvent, ResearchEntry } from '../shared/research.js';

// Business records only. Pi JSONL remains the sole source of conversation history.
const records = sqliteTable('records', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  data: text('data').notNull(),
});
interface Collections {
  projects: Project;
  sessions: Conversation;
  providers: Provider;
  memories: Memory;
  jobs: Job;
  automations: Automation;
  research: ResearchEntry;
}
export class Store {
  private constructor(
    private client: ReturnType<typeof createClient>,
    private db: ReturnType<typeof drizzle>,
  ) {}
  static async open(directory: string) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const client = createClient({ url: `file:${join(directory, 'research.sqlite')}` });
    await client.execute('PRAGMA journal_mode=WAL');
    await client.execute(
      'CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL)',
    );
    await client.execute('CREATE INDEX IF NOT EXISTS records_kind ON records(kind)');
    await client.execute(
      'CREATE TABLE IF NOT EXISTS execution_events (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, data TEXT NOT NULL)',
    );
    await client.execute(
      'CREATE INDEX IF NOT EXISTS execution_project ON execution_events(project_id)',
    );
    return new Store(client, drizzle(client));
  }
  async list<K extends keyof Collections>(kind: K): Promise<Collections[K][]> {
    return (await this.db.select().from(records).where(eq(records.kind, kind))).map((r) =>
      JSON.parse(r.data),
    );
  }
  async get<K extends keyof Collections>(kind: K, id: string): Promise<Collections[K]> {
    const row = (
      await this.db
        .select()
        .from(records)
        .where(and(eq(records.kind, kind), eq(records.id, id)))
    )[0];
    if (!row) throw Object.assign(new DomainError('notFound'), { statusCode: 404 });
    return JSON.parse(row.data);
  }
  async put<K extends keyof Collections>(kind: K, value: Collections[K]) {
    await this.db
      .insert(records)
      .values({ id: value.id, kind, data: JSON.stringify(value) })
      .onConflictDoUpdate({ target: records.id, set: { data: JSON.stringify(value) } });
    return value;
  }
  async remove(kind: keyof Collections, id: string) {
    await this.db.delete(records).where(and(eq(records.kind, kind), eq(records.id, id)));
  }
  async appendExecution(event: ExecutionEvent) {
    await this.client.execute({
      sql: 'INSERT INTO execution_events (id, project_id, data) VALUES (?, ?, ?)',
      args: [event.id, event.projectId, JSON.stringify(event)],
    });
  }
  async executions(projectId: string): Promise<ExecutionEvent[]> {
    const result = await this.client.execute({
      sql: 'SELECT data FROM execution_events WHERE project_id = ? ORDER BY rowid DESC',
      args: [projectId],
    });
    return result.rows.map((r) => JSON.parse(String(r.data)));
  }
  close() {
    this.client.close();
  }
}
