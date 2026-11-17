import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { DomainError } from '../errors.js';
import { listFiles, projectPath, readText, saveText } from '../files.js';

import { id, type RouteContext } from './context.js';
export function registerFiles(context: RouteContext) {
  const { app, store, changed } = context;
  app.get('/api/projects/:id/files', async (request) => {
    const project = await store.get('projects', id(request.params));
    const { path } = z.object({ path: z.string().default('.') }).parse(request.query);
    return listFiles(project.path, path);
  });
  app.get('/api/projects/:id/file', async (request, reply) => {
    const project = await store.get('projects', id(request.params));
    const { path, raw } = z
      .object({ path: z.string(), raw: z.string().optional() })
      .parse(request.query);
    if (raw) {
      const full = await projectPath(project.path, path);
      if (!(await stat(full)).isFile()) throw new DomainError('notFile');
      const ext = path.split('.').at(-1)?.toLowerCase();
      const mime: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
      };
      reply.header('X-Content-Type-Options', 'nosniff');
      return reply.type(mime[ext || ''] || 'application/octet-stream').send(createReadStream(full));
    }
    return { content: await readText(project.path, path) };
  });
  app.put('/api/projects/:id/file', async (request) => {
    const p = await store.get('projects', id(request.params));
    const v = z
      .object({ path: z.string(), content: z.string().max(2000000), original: z.string() })
      .parse(request.body);
    await saveText(p.path, v.path, v.content, v.original);
    changed({ files: [p.id] });
    return { ok: true };
  });
}
