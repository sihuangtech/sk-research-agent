import { z } from 'zod';
import { Notebook } from '../research/notebook.js';
import { checkSources } from '../research/sources.js';
import { id, type RouteContext } from './context.js';

export function registerResearch({ app, store, changed }: RouteContext) {
  const notebook = new Notebook(store);
  app.get('/api/projects/:id/research', async (request) => {
    const projectId = id(request.params);
    await store.get('projects', projectId);
    const query = z.object({ q: z.string().max(1000).default('') }).parse(request.query);
    return {
      entries: (await notebook.entries(projectId, query.q)).slice(0, 100),
      executions: (await store.executions(projectId)).slice(0, 100),
    };
  });
  app.post('/api/projects/:id/research', async (request) => {
    const entry = await notebook.record(id(request.params), request.body, 'user');
    changed();
    return entry;
  });
  app.get('/api/projects/:id/research/export', async (request, reply) => {
    const projectId = id(request.params);
    await store.get('projects', projectId);
    reply.header('Content-Disposition', 'attachment; filename="research-records.json"');
    return {
      schemaVersion: 1,
      exportedAt: Date.now(),
      projectId,
      entries: await notebook.entries(projectId, '', true),
      executions: await store.executions(projectId),
    };
  });
  app.get('/api/research/:id/sources', async (request) => {
    const entry = await store.get('research', id(request.params));
    const project = await store.get('projects', entry.projectId);
    return checkSources(project.path, entry.sources);
  });
}
