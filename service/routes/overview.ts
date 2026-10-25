import { type RouteContext } from './context.js';
import packageInfo from '../../package.json' with { type: 'json' };
export function registerOverview(context: RouteContext) {
  const { app, store } = context;
  app.get('/api/health', async () => ({ ok: true, runtime: 'pi', version: packageInfo.version }));
  app.get('/api/overview', async () => ({
    projects: await store.list('projects'),
    providers: await store.list('providers'),
    sessions: (await store.list('sessions')).sort((a, b) => b.updatedAt - a.updatedAt),
    memories: await store.list('memories'),
    jobs: (await store.list('jobs')).sort((a, b) => b.createdAt - a.createdAt),
    automations: await store.list('automations'),
  }));
}
