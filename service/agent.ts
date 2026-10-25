import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { type AgentSession, SessionManager } from '@earendil-works/pi-coding-agent';
import type { Conversation, SessionSnapshot } from '../shared/contracts.js';
import type { Locale } from '../shared/locale.js';
import { presentMessages } from './agent/messages.js';
import { createResearchSession } from './agent/runtime.js';
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
export class ResearchAgent {
  private live = new Map<string, LiveSession>();
  private closing = false;
  constructor(
    private store: Store,
    private jobs: Jobs,
    private secrets: SecretStore,
    private dataDir: string,
    private changed: () => void,
  ) {}
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
  async snapshot(id: string, locale: Locale = 'zh-CN'): Promise<SessionSnapshot> {
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
    return {
      conversation,
      messages: presentMessages(messages, locale),
      activeTools: [...(live?.activeTools || [])],
      queued: live?.queued || [],
    };
  }
  async prompt(
    id: string,
    text: string,
    mode: 'prompt' | 'steer' | 'followUp' = 'prompt',
    locale: Locale = 'zh-CN',
  ) {
    if (this.closing) throw new DomainError('agentClosing');
    const active = this.live.get(id);
    if (active) {
      if (!active.session || mode === 'prompt')
        throw Object.assign(new DomainError('sessionBusy'), {
          statusCode: 409,
        });
      await active.session[mode](text);
      active.queued.push(text);
      this.changed();
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
        title: record.title || text.slice(0, 44),
      });
      const session = await createResearchSession(
        this.store,
        this.jobs,
        this.secrets,
        this.dataDir,
        record,
        id,
        locale,
        text,
        this.changed,
      );
      state.session = session;
      const project = await this.store.get('projects', record.projectId);
      state.audit = new ExecutionAudit(this.store, record.projectId, id, project.path);
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
        this.changed();
      });
      state.done = this.run(id, text, session, state);
      this.changed();
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
      this.changed();
      throw error;
    } finally {
      ready();
    }
  }
  private async run(id: string, text: string, session: AgentSession, state: LiveSession) {
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
        await saveHandoff(this.store, id, text, session.messages, state.aborting || Boolean(error));
      } catch (recordError) {
        error = String(recordError);
      }
      session.dispose();
      await this.store.put('sessions', {
        ...(await this.store.get('sessions', id)),
        status: state.aborting ? 'interrupted' : error ? 'error' : 'idle',
        error: state.aborting ? undefined : error,
        errorCode: state.aborting ? 'sessionStopped' : undefined,
        updatedAt: Date.now(),
      });
      this.live.delete(id);
      this.changed();
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
    await Promise.all([...this.live.keys()].map((id) => this.abort(id)));
  }
}
