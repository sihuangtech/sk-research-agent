import { randomUUID } from 'node:crypto';
import type { SecretStore } from '../providers.js';
import { credentialLock } from './credentials.js';

// Pi owns OAuth; the application supplies only its stable installation identity.
export function installationDeviceId(secrets: SecretStore): Promise<string> {
  return credentialLock(secrets, 'installation', async () => {
    const stored = await secrets.get('installation');
    if (stored) return stored.replace(/^urn:uuid:/, '');
    const id = randomUUID();
    await secrets.set('installation', id);
    return id;
  });
}
