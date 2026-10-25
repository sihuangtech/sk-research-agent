import { z } from 'zod';
import { Logins } from '../connections/login.js';
import { connectionRuntime } from '../connections/runtime.js';
import { revokeChatGPT } from '../connections/chatgpt.js';
import { connectionModels } from '../connections/models.js';
import { DomainError } from '../errors.js';
import { id, type RouteContext } from './context.js';

export function registerProviderAuth(context: RouteContext) {
  const { app, store, secrets, changed, agent } = context;
  const logins = new Logins(store, secrets, changed);
  app.addHook('preClose', async () => logins.close());
  app.post('/api/providers/:id/login', async (request) =>
    logins.start(await store.get('providers', id(request.params))),
  );
  app.get('/api/provider-logins/:id', async (request) => logins.get(id(request.params)).state);
  app.post('/api/provider-logins/:id/open', async (request) => {
    await logins.open(id(request.params));
    return { ok: true };
  });
  app.post('/api/provider-logins/:id/answer', async (request) => {
    const body = z
      .object({ promptId: z.string().uuid(), value: z.string().max(10000) })
      .parse(request.body);
    logins.answer(id(request.params), body.promptId, body.value);
    return { ok: true };
  });
  app.delete('/api/provider-logins/:id', async (request) => {
    logins.cancel(id(request.params));
    return { ok: true };
  });
  app.post('/api/providers/:id/logout', async (request) => {
    const provider = await store.get('providers', id(request.params));
    await logins.cancelProvider(provider.id);
    for (const session of await store.list('sessions'))
      if (session.providerId === provider.id && session.status === 'running')
        await agent.abort(session.id);
    for (const automation of await store.list('automations'))
      if (automation.providerId === provider.id)
        await store.put('automations', { ...automation, enabled: false });
    const { credentials, sdkId } = await connectionRuntime(provider, secrets);
    const value = await credentials.read(sdkId);
    const revoked =
      provider.presetId === 'chatgpt' && value?.type === 'oauth'
        ? await revokeChatGPT(value)
        : false;
    await credentials.delete(sdkId);
    await store.put('providers', { ...provider, hasKey: false });
    changed();
    return { ok: true, revoked };
  });
  app.get('/api/providers/:id/models', async (request) => {
    try {
      return await connectionModels(await store.get('providers', id(request.params)), secrets);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('modelCatalogFailed');
    }
  });
  return logins;
}
