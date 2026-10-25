import { randomUUID } from 'node:crypto';
import type { AuthEvent, AuthPrompt } from '@earendil-works/pi-ai';
import open from 'open';
import type { Provider } from '../../shared/contracts.js';
import type { LoginState } from '../../shared/providers.js';
import { DomainError } from '../errors.js';
import type { SecretStore } from '../providers.js';
import type { Store } from '../store.js';
import { connectionRuntime } from './runtime.js';
import { credentialLock } from './credentials.js';

interface Attempt {
  state: LoginState;
  controller: AbortController;
  timer: NodeJS.Timeout;
  url?: string;
  answer?: (value: string) => void;
  done?: Promise<void>;
}
export class Logins {
  private attempts = new Map<string, Attempt>();
  constructor(
    private store: Store,
    private secrets: SecretStore,
    private changed: () => void,
  ) {}
  start(provider: Provider) {
    if (provider.authMethod !== 'oauth') throw new DomainError('authUnsupported');
    if ([...this.attempts.values()].some((a) => a.state.status === 'waiting'))
      throw new DomainError('authBusy');
    // Completed attempts contain no tokens and are kept only until the next login.
    this.attempts.clear();
    const state: LoginState = {
      id: randomUUID(),
      providerId: provider.id,
      status: 'waiting',
      expiresAt: Date.now() + 10 * 60000,
      browserReady: false,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => this.cancel(state.id), 10 * 60000);
    const attempt: Attempt = { state, controller, timer };
    this.attempts.set(state.id, attempt);
    attempt.done = this.run(provider, attempt);
    return state;
  }
  get(id: string) {
    const attempt = this.attempts.get(id);
    if (!attempt) throw new DomainError('notFound', 404);
    return attempt;
  }
  private notify(attempt: Attempt, event: AuthEvent) {
    if (attempt.controller.signal.aborted) return;
    const url =
      event.type === 'auth_url'
        ? event.url
        : event.type === 'device_code'
          ? event.verificationUri
          : undefined;
    if (url) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
        throw new DomainError('authFailed');
      attempt.url = url;
      attempt.state.browserReady = true;
    }
    if (event.type === 'device_code') attempt.state.userCode = event.userCode;
  }
  private prompt(attempt: Attempt, prompt: AuthPrompt) {
    const signal = AbortSignal.any([
      attempt.controller.signal,
      ...(prompt.signal ? [prompt.signal] : []),
    ]);
    return new Promise<string>((resolve, reject) => {
      const promptId = randomUUID();
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        if (attempt.state.prompt?.id === promptId) {
          delete attempt.state.prompt;
          delete attempt.answer;
        }
      };
      const abort = () => {
        cleanup();
        reject(new DomainError('authCancelled'));
      };
      attempt.state.prompt = {
        id: promptId,
        type: prompt.type,
        message: prompt.message,
        options: prompt.type === 'select' ? prompt.options : undefined,
      };
      attempt.answer = (value) => {
        cleanup();
        resolve(value);
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  private async run(provider: Provider, attempt: Attempt) {
    let previous: string | null = null;
    let issued: string | undefined;
    try {
      previous = await this.secrets.get(provider.id);
      const { runtime, sdkId } = await connectionRuntime(provider, this.secrets);
      const credential = await runtime.login(
        sdkId,
        'oauth',
        {
          signal: attempt.controller.signal,
          notify: (event) => this.notify(attempt, event),
          prompt: (prompt) => this.prompt(attempt, prompt),
        },
        { agentName: 'Second Moon' },
      );
      issued = JSON.stringify(credential);
      attempt.controller.signal.throwIfAborted();
      const current = await this.store.get('providers', provider.id);
      await this.store.put('providers', {
        ...current,
        hasKey: true,
        accountLabel:
          credential.type === 'oauth' && typeof credential.email === 'string'
            ? credential.email
            : undefined,
      });
      attempt.state.status = 'connected';
      this.changed();
    } catch (error) {
      if (attempt.controller.signal.aborted && issued)
        await credentialLock(this.secrets, provider.id, async () => {
          if ((await this.secrets.get(provider.id)) !== issued) return;
          if (previous) await this.secrets.set(provider.id, previous);
          else await this.secrets.remove(provider.id);
        });
      attempt.state.status = attempt.controller.signal.aborted ? 'cancelled' : 'failed';
      // Raw OAuth errors can contain responses, codes, or tokens. Never return them to the renderer.
      attempt.state.errorCode = error instanceof DomainError ? error.code : 'authFailed';
    } finally {
      clearTimeout(attempt.timer);
      delete attempt.url;
      delete attempt.answer;
      delete attempt.state.prompt;
      attempt.state.browserReady = false;
    }
  }
  async open(id: string) {
    const attempt = this.get(id);
    if (!attempt.url || attempt.state.status !== 'waiting') throw new DomainError('authFailed');
    try {
      await open(attempt.url);
    } catch {
      throw new DomainError('authFailed');
    }
  }
  answer(id: string, promptId: string, value: string) {
    const attempt = this.get(id);
    if (attempt.state.prompt?.id !== promptId || !attempt.answer)
      throw new DomainError('authFailed');
    attempt.answer(value);
  }
  cancel(id: string) {
    const attempt = this.get(id);
    if (attempt.state.status === 'waiting') {
      attempt.controller.abort();
      attempt.state.status = 'cancelled';
    }
  }
  async cancelProvider(id: string) {
    for (const attempt of this.attempts.values())
      if (attempt.state.providerId === id) {
        this.cancel(attempt.state.id);
        await attempt.done;
      }
  }
  async close() {
    for (const attempt of this.attempts.values()) this.cancel(attempt.state.id);
    await Promise.all([...this.attempts.values()].map((a) => a.done));
  }
}
