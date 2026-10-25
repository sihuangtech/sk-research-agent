import type { ResearchAgent } from './agent.js';
import type { Store } from './store.js';
import { presetById } from './connections/catalog.js';
export function createScheduler(store: Store, agent: ResearchAgent, enabled = true) {
  let ticking = false;
  let stopping = false;
  const tick = async () => {
    if (ticking || stopping) return;
    ticking = true;
    try {
      for (const a of await store.list('automations')) {
        if (stopping) break;
        if (!a.enabled || a.nextRunAt > Date.now()) continue;
        if (presetById((await store.get('providers', a.providerId)).presetId)?.interactiveOnly) {
          await store.put('automations', { ...a, enabled: false });
          continue;
        }
        if (a.lastSessionId && (await store.get('sessions', a.lastSessionId)).status === 'running')
          continue;
        const session = await agent.create(a.projectId, a.providerId, a.name);
        // Advance before executing: restart does not silently rerun side effects.
        await store.put('automations', {
          ...a,
          lastSessionId: session.id,
          nextRunAt: Date.now() + a.intervalMinutes * 60000,
        });
        try {
          await agent.prompt(session.id, a.prompt, 'prompt', a.locale);
        } catch {
          /* session records its actual failure */
        }
      }
    } finally {
      ticking = false;
    }
  };
  const timer = !enabled
    ? undefined
    : setInterval(() => {
        void tick().catch(() => {});
      }, 10000);
  return {
    tick,
    async stop() {
      stopping = true;
      if (timer) clearInterval(timer);
      while (ticking) await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
