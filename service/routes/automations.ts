import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError, requestLocale } from '../errors.js';
import { presetById } from '../connections/catalog.js';

import { id, type RouteContext } from './context.js';
export function registerAutomations(context: RouteContext) {
  const { app, store, changed } = context;
  app.post('/api/automations', async (request) => {
    const v = z
      .object({
        projectId: z.string().uuid(),
        providerId: z.string().uuid(),
        name: z.string().trim().min(1).max(100),
        prompt: z.string().trim().min(1).max(10000),
        intervalMinutes: z.number().int().min(5).max(525600),
      })
      .parse(request.body);
    await store.get('projects', v.projectId);
    if (presetById((await store.get('providers', v.providerId)).presetId)?.interactiveOnly)
      throw new DomainError('interactivePlanOnly');
    const a = await store.put('automations', {
      ...v,
      id: randomUUID(),
      enabled: true,
      locale: requestLocale(request),
      nextRunAt: Date.now() + v.intervalMinutes * 60000,
    });
    changed();
    return a;
  });
  app.patch('/api/automations/:id', async (request) => {
    const a = await store.get('automations', id(request.params));
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    if (
      enabled &&
      presetById((await store.get('providers', a.providerId)).presetId)?.interactiveOnly
    )
      throw new DomainError('interactivePlanOnly');
    await store.put('automations', {
      ...a,
      enabled,
      nextRunAt: enabled ? Date.now() + a.intervalMinutes * 60000 : a.nextRunAt,
    });
    changed();
    return { ok: true };
  });
  app.delete('/api/automations/:id', async (request) => {
    await store.remove('automations', id(request.params));
    changed();
    return { ok: true };
  });
}
