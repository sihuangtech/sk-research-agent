import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import { z } from 'zod';
import { eventMarker } from '../agent/messages.js';
import { task } from '../agent/followups.js';
import { localDate } from '../agent/partner-tools.js';
import { presetById } from '../connections/catalog.js';
import { DomainError, requestLocale } from '../errors.js';
import { projectPath } from '../files.js';
import { Notebook } from '../research/notebook.js';
import { toPosix } from '../research/workspace.js';
import { id, type RouteContext } from './context.js';

/** Next 08:00 local time, when the daily brief is ready before the day starts. */
function nextMorning(now = new Date()) {
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}
export function registerPartner({ app, store, agent, changed }: RouteContext) {
  app.post('/api/approvals/:id', async (request) => {
    const { approved } = z.object({ approved: z.boolean() }).parse(request.body);
    if (!agent.approvals.decide(id(request.params), approved))
      throw new DomainError('notFound', 404);
    return { ok: true };
  });
  app.put('/api/projects/:id/protected', async (request) => {
    const project = await store.get('projects', id(request.params));
    const { paths } = z
      .object({ paths: z.array(z.string().min(1).max(1000)).max(50) })
      .parse(request.body);
    const root = await projectPath(project.path);
    const normalized = new Set<string>();
    for (const path of paths) {
      const full = await projectPath(project.path, path).catch(() => {
        throw new DomainError('protectedPathInvalid');
      });
      const rel = toPosix(relative(root, full));
      if (!rel) throw new DomainError('protectedPathInvalid');
      normalized.add(rel);
    }
    const saved = await store.put('projects', { ...project, protectedPaths: [...normalized] });
    changed();
    return saved;
  });
  app.get('/api/projects/:id/checkpoints', async (request) => {
    const project = await store.get('projects', id(request.params));
    return {
      available: await agent.checkpoints.isAvailable(),
      checkpoints: await agent.checkpoints.list(project.id),
    };
  });
  app.post('/api/projects/:id/checkpoints', async (request) => {
    const project = await store.get('projects', id(request.params));
    const { label } = z.object({ label: z.string().trim().min(1).max(200) }).parse(request.body);
    const checkpoint = await agent.checkpoints.create(project, null, label);
    if (!checkpoint) throw new DomainError('checkpointUnavailable');
    changed({ files: [project.id] });
    return checkpoint;
  });
  app.post('/api/checkpoints/:id/restore', async (request) => {
    const checkpoint = await store.get('checkpoints', id(request.params));
    const safety = await agent.checkpoints.restore(
      checkpoint.id,
      task(requestLocale(request), 'restoreLabel'),
    );
    changed({ files: [checkpoint.projectId] });
    return safety;
  });
  app.post('/api/memories/:id/confirm', async (request) => {
    const memory = await store.get('memories', id(request.params));
    const { status: _status, reason: _reason, ...confirmed } = memory;
    await store.put('memories', { ...confirmed, updatedAt: Date.now() });
    changed();
    return { ok: true };
  });
  app.post('/api/projects/:id/brief', async (request) => {
    const project = await store.get('projects', id(request.params));
    const { providerId } = z.object({ providerId: z.string().uuid() }).parse(request.body);
    if (presetById((await store.get('providers', providerId)).presetId)?.interactiveOnly)
      throw new DomainError('interactivePlanOnly');
    const locale = requestLocale(request);
    const automation = await store.put('automations', {
      id: randomUUID(),
      projectId: project.id,
      providerId,
      name: task(locale, 'briefName'),
      prompt: task(locale, 'brief'),
      intervalMinutes: 1440,
      nextRunAt: nextMorning(),
      enabled: true,
      profile: 'review',
      locale,
    });
    changed();
    return automation;
  });
  app.post('/api/projects/:id/reports', async (request) => {
    const project = await store.get('projects', id(request.params));
    const input = z
      .object({
        providerId: z.string().uuid(),
        kind: z.enum(['weekly', 'groupMeeting']),
        days: z.number().int().min(1).max(90).default(7),
      })
      .parse(request.body);
    const locale = requestLocale(request);
    const since = Date.now() - input.days * 86_400_000;
    const records = (await new Notebook(store).entries(project.id))
      .filter((entry) => entry.createdAt >= since)
      .map((entry) => ({
        id: entry.id.slice(0, 8),
        kind: entry.kind,
        status: entry.status,
        author: entry.author,
        date: localDate(entry.createdAt),
        title: entry.title,
        content: entry.content.slice(0, 1200),
        sources: entry.sources.map((source) => source.path || source.url),
      }));
    if (!records.length) throw new DomainError('reportNoRecords');
    const kindName = task(locale, input.kind);
    const title = `${kindName} · ${localDate()}`;
    const prompt = task(locale, 'report', {
      title,
      kind: kindName,
      days: String(input.days),
      outline: task(locale, input.kind === 'weekly' ? 'weeklyOutline' : 'groupMeetingOutline'),
      records: JSON.stringify(records).slice(0, 60_000),
    });
    const session = await agent.create(project.id, input.providerId, title);
    await agent.prompt(session.id, `${eventMarker}${prompt}`, 'prompt', locale, {
      profile: 'report',
      reportKind: input.kind,
    });
    return session;
  });
}
