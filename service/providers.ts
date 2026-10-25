import { AsyncEntry } from '@napi-rs/keyring';
export { createModelRuntime } from './connections/runtime.js';

export interface SecretStore {
  get(id: string): Promise<string | null>;
  set(id: string, key: string): Promise<void>;
  remove(id: string): Promise<void>;
}
export class KeychainSecrets implements SecretStore {
  private entry(id: string) {
    return new AsyncEntry('cn.skstudio.agentic-research', id);
  }
  get(id: string) {
    return this.entry(id).getPassword();
  }
  set(id: string, key: string) {
    return this.entry(id).setPassword(key);
  }
  async remove(id: string) {
    await this.entry(id).deleteCredential();
  }
}
