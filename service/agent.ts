import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { type AgentSession, SessionManager } from '@earendil-works/pi-coding-agent';
import type { Conversation, SessionSnapshot } from '../shared/contracts.js';
import type { Locale } from '../shared/locale.js';
import type { ReportKind, ToolProfile } from '../shared/partner.js';
import { Approvals, createGuard, installGuard } from './agent/guard.js';
import { eventSummary, presentMessages } from './agent/messages.js';
import { createResearchSession } from './agent/runtime.js';
import type { Changed } from './changes.js';
import { Checkpoints } from './checkpoints.js';
import { DomainError } from './errors.js';
import type { Jobs } from './jobs.js';
import { type SecretStore } from './providers.js';
import type { Store } from './store.js';
import { ExecutionAudit } from './research/audit.js';
import { saveHandoff } from './research/handoff.js';

export { presentMessages } from './agent/messages.js';

interface LiveSession {
  session?: AgentSession;
  partial?: AgentMessage;
  activeTools: Set<string>;
  queued: string[];
  done?: Promise<void>;
  ready: Promise<void>;
  aborting: boolean;
  audit?: ExecutionAudit;
}
export interface TurnOptions {
  profile?: ToolProfile;
  reportKind?: ReportKind;
  /** Scheduled or follow-up turns: risky actions are refused instead of waiting for approval. */
  unattended?: boolean;
}
export class ResearchAgent {
  private live = new Map<string, LiveSession>();
  private closing = false;
  readonly approvals: Approvals;
  readonly checkpoints: Checkpoints;
  constructor(
    private store: Store,
    private jobs: Jobs,
    private secrets: SecretStore,
    private dataDir: string,
    private changed: Changed,
  ) {
    this.approvals = new Approvals(changed);
    this.checkpoints = new Checkpoints(store, dataDir);
  }
  isRunning(id: string) {
    return this.live.has(id);
  }
  async recover() {
    for (const session of await this.store.list('sessions'))
      if (session.status === 'running') {
        await this.store.put('sessions', {
          ...session,
          status: 'interrupted',
          errorCode: 'sessionInterrupted',
          error: undefined,
        });
      }
  }
  async create(projectId: string, providerId: string, title = '') {
    const project = await this.store.get('projects', projectId);
    await this.store.get('providers', providerId);
    const directory = join(this.dataDir, 'sessions');
    await mkdir(directory, { recursive: true });
    const manager = SessionManager.create(project.path, directory);
    const conversation: Conversation = {
      id: randomUUID(),
      projectId,
      providerId,
      title,
      sessionFile: manager.getSessionFile()!,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'idle',
    };
    await this.store.put('sessions', conversation);
    this.changed();
    return conversation;
  }
  /** `after` and `anchor` let a client that already holds earlier messages receive only the rest. */
  async snapshot(
    id: string,
    locale: Locale = 'zh-CN',
    after = 0,
    anchor = '',
  ): Promise<SessionSnapshot> {
    const conversation = await this.store.get('sessions', id);
    const live = this.live.get(id);
    let messages = live?.session
      ? [...live.session.messages]
      : existsSync(conversation.sessionFile)
        ? SessionManager.open(conversation.sessionFile).buildSessionContext().messages
        : [];
    if (live?.partial) {
      const last = messages.at(-1) as { timestamp?: number } | undefined;
      const partial = live.partial as { timestamp?: number };
      if (last?.timestamp === partial.timestamp)
        messages = [...messages.slice(0, -1), live.partial];
      else messages.push(live.partial);
    }
    const presented = presentMessages(messages, locale);
    // Send everything again when the anchor moved, e.g. after compaction or a language change.
    const from = after > 0 && presented[after - 1]?.key === anchor ? after : 0;
    return {
      conversation,
      from,
      messages: presented.slice(from),
      activeTools: [...(live?.activeTools || [])],
      queued: live?.queued || [],
      approvals: this.approvals.list(id),
    };
  }
  async prompt(
    id: string,
    text: string,
    mode: 'prompt' | 'steer' | 'followUp' = 'prompt',
    locale: Locale = 'zh-CN',
    options: TurnOptions = {},
  ) {
    const visible = eventSummary(text) ?? text;
    if (this.closing) throw new DomainError('agentClosing');
    const active = this.live.get(id);
    if (active) {
      if (!active.session || mode === 'prompt')
        throw Object.assign(new DomainError('sessionBusy'), {
          statusCode: 409,
        });
      await active.session[mode](text);
      active.queued.push(visible);
      this.changed({ sessions: [id] });
      return;
    }
    let ready!: () => void;
    const state: LiveSession = {
      activeTools: new Set(),
      queued: [],
      aborting: false,
      ready: new Promise((resolve) => {
        ready = resolve;
      }),
    };
    // Claim the session synchronously, before the first database or model await.
    this.live.set(id, state);
    let record: Conversation | undefined;
    try {
      record = await this.store.get('sessions', id);
      await this.store.put('sessions', {
        ...record,
        status: 'running',
        error: undefined,
        errorCode: undefined,
        updatedAt: Date.now(),
        locale,
        title: record.title || visible.slice(0, 44),
      });
      const { projectId } = record;
      const project = await this.store.get('projects', projectId);
      const profile = options.profile || 'full';
      // Turns that can change files start from a checkpoint the researcher can restore.
      if (profile === 'full') await this.checkpoints.create(project, id, visible).catch(() => null);
      const session = await createResearchSession(
        this.store,
        this.jobs,
        this.secrets,
        this.dataDir,
        record,
        id,
        locale,
        visible,
        this.changed,
        { profile, reportKind: options.reportKind },
      );
      state.session = session;
      const audit = new ExecutionAudit(this.store, projectId, id, project.path, () =>
        this.changed({ research: [projectId] }),
      );
      state.audit = audit;
      installGuard(
        session.agent,
        createGuard({
          approvals: this.approvals,
          sessionId: id,
          projectId,
          protectedPaths: project.protectedPaths || [],
          unattended: Boolean(options.unattended),
          locale,
          allowed: (callId, tool) => audit.prepare(callId, tool),
        }),
      );
      await this.store.put('sessions', {
        ...(await this.store.get('sessions', id)),
        sessionFile: session.sessionFile!,
      });
      session.subscribe((event) => {
        state.audit?.observe(event);
        if (event.type === 'message_update') state.partial = event.message;
        if (event.type === 'message_end') {
          state.partial = undefined;
          if (event.message.role === 'user') state.queued.shift();
        }
        if (event.type === 'tool_execution_start') state.activeTools.add(event.toolName);
        if (event.type === 'tool_execution_end') state.activeTools.delete(event.toolName);
        // Streaming updates touch only this session; finished tools may also have changed files.
        const files = event.type === 'tool_execution_end' ? [projectId] : [];
        this.changed({ sessions: [id], files });
      });
      state.done = this.run(id, text, visible, session, state);
      this.changed({ overview: true, sessions: [id] });
    } catch (error) {
      state.session?.dispose();
      if (record)
        await this.store.put('sessions', {
          ...(await this.store.get('sessions', id)),
          status: 'error',
          error: String(error),
          errorCode: error instanceof DomainError ? error.code : undefined,
          updatedAt: Date.now(),
        });
      this.live.delete(id);
      this.changed({ overview: true, sessions: [id] });
      throw error;
    } finally {
      ready();
    }
  }
  private async run(
    id: string,
    text: string,
    visible: string,
    session: AgentSession,
    state: LiveSession,
  ) {
    let error: string | undefined;
    try {
      if (!state.aborting) await session.prompt(text);
      const last = session.messages.at(-1) as { errorMessage?: string } | undefined;
      error = last?.errorMessage;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      try {
        await state.audit?.finish();
        await saveHandoff(
          this.store,
          id,
          visible,
          session.messages,
          state.aborting || Boolean(error),
        );
      } catch (recordError) {
        error = String(recordError);
      }
      session.dispose();
      const finished = await this.store.get('sessions', id);
      await this.store.put('sessions', {
        ...finished,
        status: state.aborting ? 'interrupted' : error ? 'error' : 'idle',
        error: state.aborting ? undefined : error,
        errorCode: state.aborting ? 'sessionStopped' : undefined,
        updatedAt: Date.now(),
      });
      this.live.delete(id);
      // The handoff is a research record; the turn may have written files.
      const project = [finished.projectId];
      const kind = error && !state.aborting ? 'turnFailed' : 'turnFinished';
      const subject = finished.title || visible;
      const alerts = state.aborting
        ? []
        : [{ kind, projectId: finished.projectId, sessionId: id, subject } as const];
      this.changed({ overview: true, sessions: [id], files: project, research: project, alerts });
    }
  }
  async abort(id: string) {
    const state = this.live.get(id);
    if (!state) return;
    state.aborting = true;
    await state.ready;
    await state.session?.abort();
    await state.done;
  }
  async stop() {
    this.closing = true;
    this.approvals.denyAll();
    await Promise.all([...this.live.keys()].map((id) => this.abort(id)));
  }
}
