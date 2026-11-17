import type { Job } from '../../shared/contracts.js';
import type { Locale } from '../../shared/locale.js';
import type { ResearchAgent } from '../agent.js';
import type { Changed } from '../changes.js';
import { presetById } from '../connections/catalog.js';
import type { Jobs } from '../jobs.js';
import type { Store } from '../store.js';
import { eventMarker } from './messages.js';
import tasks from './tasks.json' with { type: 'json' };

export type TaskText = keyof (typeof tasks)['en'];
/** Internal prompt in Chinese or English; the response-language rule handles the rest. */
export function task(locale: Locale, key: TaskText, values: Record<string, string> = {}) {
  const text = (locale === 'zh-CN' ? tasks['zh-CN'] : tasks.en)[key];
  return text.replace(/{{(\w+)}}/g, (_, name: string) => values[name] ?? '');
}
/**
 * When a job the agent started ends, the agent comes back to report, the way a colleague would.
 * The follow-up can only read and record; the researcher decides the next step. Subscription
 * connections are interactive-only, so for them the researcher is only notified.
 */
export function followJobs(store: Store, jobs: Jobs, agent: ResearchAgent, changed: Changed) {
  jobs.onFinished = (job) => void followUp(store, agent, changed, job).catch(() => {});
}
async function followUp(store: Store, agent: ResearchAgent, changed: Changed, job: Job) {
  if (job.status === 'cancelled') return;
  const kind = job.status === 'completed' ? 'jobFinished' : 'jobFailed';
  const sessionId = job.sessionId || undefined;
  changed({ alerts: [{ kind, projectId: job.projectId, sessionId, subject: job.command }] });
  if (!sessionId) return;
  const session = await store.get('sessions', sessionId);
  const provider = await store.get('providers', session.providerId);
  if (presetById(provider.presetId)?.interactiveOnly) return;
  const locale = session.locale || 'zh-CN';
  const text = `${eventMarker}${task(locale, 'followUp', {
    command: job.command.slice(0, 200),
    status: task(locale, job.status === 'completed' ? 'succeeded' : 'failed'),
    exitCode: String(job.exitCode ?? '-'),
    jobId: job.id,
    artifacts: job.artifacts?.slice(0, 20).join(', ') || task(locale, 'none'),
  })}`;
  // A running turn receives it as a queued message; otherwise a read-only turn starts.
  if (agent.isRunning(sessionId)) await agent.prompt(sessionId, text, 'followUp', locale);
  else
    await agent.prompt(sessionId, text, 'prompt', locale, { profile: 'review', unattended: true });
}
