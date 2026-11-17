import { randomUUID } from 'node:crypto';
import type { BeforeToolCallContext, BeforeToolCallResult } from '@earendil-works/pi-agent-core';
import type { Locale } from '../../shared/locale.js';
import type { Approval, ApprovalReason } from '../../shared/partner.js';
import type { Changed } from '../changes.js';
import { message } from '../errors.js';
import { insidePath } from '../research/workspace.js';

const shellTools = new Set(['bash', 'powershell', 'research_job']);
const fileTools = new Set(['write', 'edit']);
// Ordered by precedence. These are heuristics for commands that are hard to undo or
// leave the machine; the protected-path rule below is the hard guarantee for file tools.
const rules: [ApprovalReason, RegExp][] = [
  ['privilege', /\b(sudo|doas)\b|\|\s*(ba|z|k)?sh\b|\bsu\s+-?\w/i],
  [
    'destructive',
    /\b(rm|rmdir|unlink|shred|mkfs\S*|dd)\s|\btruncate\s+-s|\bfind\b[^|;&]*\s-delete\b|\bgit\s+(reset\s+--hard|clean\s+-\w*f|checkout\s+--\s|restore\s|branch\s+-D|push\b[^|;&]*(--force|-f\b))|\bchmod\s+-R|\bchown\b|\bRemove-Item\b|\b(del|rd)\s+\//i,
  ],
  [
    'network',
    /\b(scp|rsync|sftp|ftp)\s|\bcurl\b[^|;&]*(\s-T\s|--upload-file|\s-F\s|--data|\s-d\s|-X\s*(POST|PUT|PATCH))|\bwget\b[^|;&]*--post|\bgit\s+push\b|\bgh\s+(release|gist|repo\s+create)|\b(Invoke-WebRequest|Invoke-RestMethod)\b[^|;&]*-Method\s+(Post|Put)/i,
  ],
  [
    'environment',
    /\b(pip3?|uv\s+pip|conda|mamba|micromamba|npm|pnpm|yarn|brew|apt(-get)?|dnf|yum|gem|cargo|R\s+-e\s+["']?install\.packages)\s+(install|add|remove|uninstall|update|upgrade|i)\b|install\.packages\(|\bInstall-(Package|Module)\b/i,
  ],
];
const mutating = /(^|[^<])>|\b(mv|cp|tee|touch|rm|chmod|truncate)\b|\bsed\s+-i/;

/** Why an action needs the researcher, or `blocked` for edits inside protected paths. */
export function classify(tool: string, args: unknown, protectedPaths: string[] = []) {
  const input = (args || {}) as { path?: unknown; command?: unknown };
  if (fileTools.has(tool) && typeof input.path === 'string')
    return protectedPaths.some((p) => insidePath(input.path as string, p)) ? 'blocked' : null;
  if (!shellTools.has(tool) || typeof input.command !== 'string') return null;
  const command = input.command;
  const touchesProtected = protectedPaths.some((p) => command.includes(p.replace(/^\.\//, '')));
  if (rules[0][1].test(command)) return 'privilege';
  if (touchesProtected && mutating.test(command)) return 'protected';
  return rules.slice(1).find(([, pattern]) => pattern.test(command))?.[0] || null;
}

/** Pending approvals. Each waits until the researcher decides, the turn stops, or the app exits. */
export class Approvals {
  private pending = new Map<string, { approval: Approval; decide: (ok: boolean) => void }>();
  constructor(private changed: Changed) {}
  private notify(approval: Approval, added: boolean) {
    const { sessionId, projectId, action: subject } = approval;
    const alerts = added
      ? [{ kind: 'approvalNeeded' as const, projectId, sessionId, subject }]
      : [];
    this.changed({ sessions: [sessionId], alerts });
  }
  request(approval: Omit<Approval, 'id' | 'createdAt'>, signal?: AbortSignal) {
    const entry = { ...approval, id: randomUUID(), createdAt: Date.now() };
    return new Promise<boolean>((resolve) => {
      const finish = (ok: boolean) => {
        if (!this.pending.delete(entry.id)) return;
        signal?.removeEventListener('abort', abort);
        this.notify(entry, false);
        resolve(ok);
      };
      const abort = () => finish(false);
      this.pending.set(entry.id, { approval: entry, decide: finish });
      signal?.addEventListener('abort', abort, { once: true });
      this.notify(entry, true);
      if (signal?.aborted) abort();
    });
  }
  decide(id: string, approved: boolean) {
    const entry = this.pending.get(id);
    entry?.decide(approved);
    return Boolean(entry);
  }
  list(sessionId: string) {
    return [...this.pending.values()]
      .map(({ approval }) => approval)
      .filter((approval) => approval.sessionId === sessionId);
  }
  denyAll() {
    for (const { decide } of [...this.pending.values()]) decide(false);
  }
}

export interface GuardOptions {
  approvals: Approvals;
  sessionId: string;
  projectId: string;
  protectedPaths: string[];
  /** No one is watching (scheduled runs); risky actions are refused instead of waiting. */
  unattended: boolean;
  locale: Locale;
  /** Runs after an action is allowed, before it executes. */
  allowed?: (toolCallId: string, tool: string) => Promise<void>;
}
export function createGuard(options: GuardOptions) {
  return async (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ): Promise<BeforeToolCallResult | undefined> => {
    const tool = context.toolCall.name;
    const verdict = classify(tool, context.args, options.protectedPaths);
    const deny = (code: 'guardProtected' | 'guardDenied' | 'guardUnattended') => ({
      block: true,
      reason: message(code, options.locale),
    });
    if (verdict === 'blocked') return deny('guardProtected');
    if (verdict) {
      if (options.unattended) return deny('guardUnattended');
      const input = context.args as { command?: string; path?: string };
      const approved = await options.approvals.request(
        {
          sessionId: options.sessionId,
          projectId: options.projectId,
          tool,
          action: String(input.command ?? input.path ?? ''),
          reason: verdict,
        },
        signal,
      );
      if (!approved) return deny('guardDenied');
    }
    await options.allowed?.(context.toolCall.id, tool);
    return undefined;
  };
}
/** Runs the guard before Pi's own hooks; Pi's hooks still run for actions the guard allows. */
export function installGuard(
  agent: {
    beforeToolCall?: (
      c: BeforeToolCallContext,
      s?: AbortSignal,
    ) => Promise<BeforeToolCallResult | undefined>;
  },
  guard: ReturnType<typeof createGuard>,
) {
  const original = agent.beforeToolCall;
  agent.beforeToolCall = async (context, signal) =>
    (await guard(context, signal)) ?? original?.(context, signal);
}
