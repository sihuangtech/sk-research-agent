import { EventEmitter } from 'node:events';
import Fastify from 'fastify';
import { ResearchAgent } from './agent.js';
import { DomainError } from './errors.js';
import { registerEvents } from './http/events.js';
import { registerSecurity } from './http/security.js';
import { Jobs } from './jobs.js';
import { KeychainSecrets, type SecretStore } from './providers.js';
import { registerAutomations } from './routes/automations.js';
import { registerFiles } from './routes/files.js';
import { registerJobs } from './routes/jobs.js';
import { registerMemories } from './routes/memories.js';
import { registerOverview } from './routes/overview.js';
import { registerProjects } from './routes/projects.js';
import { registerProviders } from './routes/providers.js';
import { registerSessions } from './routes/sessions.js';
import { registerResearch } from './routes/research.js';
import { createScheduler } from './scheduler.js';
import { Store } from './store.js';
import { recoverExecutionEvents } from './research/recovery.js';
export async function createServer(options: {
  dataDir: string;
  token: string;
  secrets?: SecretStore;
  scheduler?: boolean;
}) {
  if (options.token.length < 24) throw new DomainError('tokenTooShort');
  const app = Fastify({ logger: false, bodyLimit: 3_000_000 });
  const store = await Store.open(options.dataDir);
  const secrets = options.secrets || new KeychainSecrets();
  const events = new EventEmitter();
  events.setMaxListeners(50);
  let changeTimer: NodeJS.Timeout | undefined;
  const changed = () => {
    if (!changeTimer)
      changeTimer = setTimeout(() => {
        changeTimer = undefined;
        events.emit('change');
      }, 100);
  };
  const jobs = new Jobs(store, changed);
  const agent = new ResearchAgent(store, jobs, secrets, options.dataDir, changed);
  await jobs.recover();
  await agent.recover();
  await recoverExecutionEvents(store);
  await registerSecurity(app, options.token);
  registerEvents(app, events);
  const context = { app, store, jobs, agent, secrets, changed };
  registerOverview(context);
  registerProjects(context);
  registerProviders(context);
  registerSessions(context);
  registerFiles(context);
  registerJobs(context);
  registerMemories(context);
  registerAutomations(context);
  registerResearch(context);
  const scheduler = createScheduler(store, agent, options.scheduler !== false);
  app.addHook('preClose', async () => {
    if (changeTimer) clearTimeout(changeTimer);
    events.emit('shutdown');
    await scheduler.stop();
    await agent.stop();
    await jobs.stop();
  });
  app.addHook('onClose', async () => {
    store.close();
  });
  return { app, store, agent, jobs, tick: scheduler.tick };
}
