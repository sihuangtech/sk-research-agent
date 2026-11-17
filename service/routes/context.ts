import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ResearchAgent } from '../agent.js';
import type { Changed } from '../changes.js';
import type { Jobs } from '../jobs.js';
import type { SecretStore } from '../providers.js';
import type { Store } from '../store.js';
export interface RouteContext {
  app: FastifyInstance;
  store: Store;
  jobs: Jobs;
  agent: ResearchAgent;
  secrets: SecretStore;
  changed: Changed;
}
export const id = (params: unknown) => z.object({ id: z.string().uuid() }).parse(params).id;
