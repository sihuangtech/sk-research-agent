import { randomUUID } from 'node:crypto';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { ExecutionEvent } from '../../shared/research.js';
import type { Store } from '../store.js';
import { snapshotFile } from './sources.js';
import { captureArtifacts, scanWorkspace, type WorkspaceScan } from './workspace.js';

export function auditArguments(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {};
  return Object.fromEntries(
    Object.entries(args)
      .slice(0, 24)
      .map(([key, value]) => [
        key,
        /content|oldText|newText|password|secret|token|api.?key/i.test(key)
          ? { omitted: true, characters: typeof value === 'string' ? value.length : undefined }
          : typeof value === 'string'
            ? value.slice(0, 4000)
            : typeof value === 'number' || typeof value === 'boolean'
              ? value
              : '[structured input]',
      ]),
  );
}
export class ExecutionAudit {
  private pending = new Map<string, { tool: string; args: Record<string, unknown> }>();
  private scans = new Map<string, Promise<WorkspaceScan>>();
  private queue = Promise.resolve();
  private failure?: unknown;
  private runId = randomUUID();
  constructor(
    private store: Store,
    private projectId: string,
    private sessionId: string,
    private root: string,
    private appended: () => void = () => {},
  ) {}
  /** Scans the project before a shell command runs, so the files it produces can be found. */
  async prepare(toolCallId: string, tool: string) {
    if (!['bash', 'powershell'].includes(tool)) return;
    const scan = scanWorkspace(this.root);
    this.scans.set(toolCallId, scan);
    await scan;
  }
  observe(event: AgentSessionEvent) {
    if (event.type !== 'tool_execution_start' && event.type !== 'tool_execution_end') return;
    const timestamp = Date.now();
    this.queue = this.queue
      .then(async () => {
        const base = {
          projectId: this.projectId,
          sessionId: this.sessionId,
          callId: `${this.runId}:${event.toolCallId}`,
          tool: event.toolName,
          createdAt: timestamp,
        };
        if (event.type === 'tool_execution_start') {
          const args = auditArguments(event.args);
          this.pending.set(event.toolCallId, { tool: event.toolName, args });
          await this.append({ ...base, phase: 'started', arguments: args });
        } else {
          const start = this.pending.get(event.toolCallId);
          this.pending.delete(event.toolCallId);
          let files: ExecutionEvent['files'];
          if (
            !event.isError &&
            ['write', 'edit'].includes(event.toolName) &&
            typeof start?.args.path === 'string'
          ) {
            const file = await snapshotFile(this.root, start.args.path).catch(() => null);
            if (file) files = [file];
          }
          const before = this.scans.get(event.toolCallId);
          this.scans.delete(event.toolCallId);
          // Shell output files are found by comparing the workspace with the scan taken before.
          if (before) files = await captureArtifacts(this.root, await before);
          await this.append({
            ...base,
            phase: event.isError ? 'failed' : 'completed',
            durationMs: event.durationMs,
            files,
          });
        }
      })
      .catch((error) => {
        this.failure = error;
      });
  }
  private async append(event: Omit<ExecutionEvent, 'id'>) {
    await this.store.appendExecution({ ...event, id: randomUUID() });
    this.appended();
  }
  async finish() {
    await this.queue;
    for (const [callId, value] of this.pending) {
      await this.append({
        projectId: this.projectId,
        sessionId: this.sessionId,
        callId: `${this.runId}:${callId}`,
        tool: value.tool,
        phase: 'interrupted',
        createdAt: Date.now(),
      });
    }
    this.pending.clear();
    if (this.failure) throw this.failure;
  }
}
