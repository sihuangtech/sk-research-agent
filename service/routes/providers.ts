import { randomUUID } from 'node:crypto';
import open from 'open';
import { DomainError } from '../errors.js';
import { createModelRuntime } from '../providers.js';
import { providerInput } from '../connections/input.js';
import { presets, presetById, presetModels } from '../connections/catalog.js';
import { credentialLock } from '../connections/credentials.js';
import { registerProviderAuth } from './provider-auth.js';
import { z } from 'zod';

import { id, type RouteContext } from './context.js';

export function registerProviders(context: RouteContext) {
  const { app, store, secrets, changed } = context;
  const logins = registerProviderAuth(context);
  app.get('/api/provider-presets', async () => presets);
  app.post('/api/provider-presets/:preset/open', async (request) => {
    const { preset: presetId } = z.object({ preset: z.string() }).parse(request.params);
    const { link } = z.object({ link: z.enum(['documentation', 'usage']) }).parse(request.body);
    const preset = presetById(presetId);
    const url = link === 'usage' ? preset?.usageUrl : preset?.docsUrl;
    if (!url || new URL(url).protocol !== 'https:') throw new DomainError('notFound', 404);
    // Only fixed catalog links are accepted, never renderer-supplied URLs or file paths.
    try {
      await open(url);
    } catch {
      throw new DomainError('authFailed');
    }
    return { ok: true };
  });
  app.get('/api/provider-presets/:preset/models', async (request) => {
    const { preset: presetId } = z.object({ preset: z.string() }).parse(request.params);
    const preset = presetById(presetId);
    if (!preset) throw new DomainError('notFound', 404);
    return presetModels(preset);
  });
  app.post('/api/providers', async (request) => {
    const { apiKey, input } = await providerInput(request.body);
    const providerId = randomUUID();
    if (apiKey) await secrets.set(providerId, apiKey);
    const provider = await store.put('providers', {
      ...input,
      id: providerId,
      hasKey: Boolean(apiKey),
    });
    changed();
    return provider;
  });
  app.put('/api/providers/:id', async (request) => {
    const old = await store.get('providers', id(request.params));
    const { apiKey, clearKey, input } = await providerInput(request.body, old);
    if (apiKey || clearKey)
      await credentialLock(secrets, old.id, async () => {
        if (apiKey) await secrets.set(old.id, apiKey);
        else await secrets.remove(old.id);
      });
    const provider = await store.put('providers', {
      ...input,
      id: old.id,
      hasKey: apiKey ? true : clearKey ? false : old.hasKey,
      accountLabel: old.accountLabel,
    });
    changed();
    return provider;
  });
  app.delete('/api/providers/:id', async (request) => {
    const providerId = id(request.params);
    if (
      (await store.list('sessions')).some((s) => s.providerId === providerId) ||
      (await store.list('automations')).some((a) => a.providerId === providerId)
    )
      throw new DomainError('providerInUse');
    const provider = await store.get('providers', providerId);
    if (provider.authMethod === 'oauth' && provider.hasKey) throw new DomainError('signOutFirst');
    await logins.cancelProvider(providerId);
    await credentialLock(secrets, providerId, () => secrets.remove(providerId));
    if (await secrets.get(`registration:${providerId}`))
      await secrets.remove(`registration:${providerId}`);
    await store.remove('providers', providerId);
    changed();
    return { ok: true };
  });
  app.post('/api/providers/:id/test', async (request) => {
    const provider = await store.get('providers', id(request.params));
    const { runtime, model } = await createModelRuntime(provider, secrets);
    const start = Date.now();
    const response = await runtime.completeSimple(
      model,
      { messages: [{ role: 'user', content: 'Reply with OK.', timestamp: Date.now() }] },
      { maxTokens: 32, signal: AbortSignal.timeout(30000) },
    );
    if (
      response.stopReason === 'error' ||
      response.stopReason === 'aborted' ||
      response.errorMessage
    )
      throw new DomainError('connectionTestFailed');
    return { ok: true, latencyMs: Date.now() - start };
  });
}
