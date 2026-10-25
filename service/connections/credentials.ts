import type { Credential, CredentialStore } from '@earendil-works/pi-ai';
import type { SecretStore } from '../providers.js';
import { DomainError } from '../errors.js';

const locks = new WeakMap<SecretStore, Map<string, Promise<unknown>>>();
export async function credentialLock<T>(secrets: SecretStore, id: string, work: () => Promise<T>) {
  let map = locks.get(secrets);
  if (!map) locks.set(secrets, (map = new Map()));
  const task = (map.get(id) || Promise.resolve()).catch(() => {}).then(work);
  map.set(id, task);
  try {
    return await task;
  } finally {
    if (map.get(id) === task) map.delete(id);
  }
}
export class ConnectionCredentials implements CredentialStore {
  constructor(
    private secrets: SecretStore,
    readonly id: string,
    readonly sdkId: string,
  ) {}
  async read(providerId: string): Promise<Credential | undefined> {
    if (providerId !== this.sdkId) return;
    const raw = await this.secrets.get(this.id);
    if (!raw) return;
    try {
      const value = JSON.parse(raw);
      if (value.type === 'oauth' || value.type === 'api_key') return value;
    } catch {
      /* Existing API keys are stored verbatim. */
    }
    return { type: 'api_key', key: raw };
  }
  async list() {
    const credential = await this.read(this.sdkId);
    return credential ? [{ providerId: this.sdkId, type: credential.type }] : [];
  }
  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: { signal?: AbortSignal },
  ) {
    if (providerId !== this.sdkId) throw new Error('Credential scope mismatch');
    return credentialLock(this.secrets, this.id, async () => {
      options?.signal?.throwIfAborted();
      const current = await this.read(providerId);
      let next: Credential | undefined;
      try {
        next = await fn(current);
      } catch (error) {
        if (error instanceof DomainError || options?.signal?.aborted) throw error;
        throw new DomainError('authFailed');
      }
      options?.signal?.throwIfAborted();
      if (next) await this.secrets.set(this.id, JSON.stringify(next));
      return next || current;
    });
  }
  async delete(providerId: string) {
    if (providerId !== this.sdkId) throw new Error('Credential scope mismatch');
    await credentialLock(this.secrets, this.id, () => this.secrets.remove(this.id));
  }
}
