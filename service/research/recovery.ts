import { randomUUID } from 'node:crypto';
import type { Store } from '../store.js';

export async function recoverExecutionEvents(store: Store) {
  for (const project of await store.list('projects')) {
    const events = await store.executions(project.id);
    const finished = new Set(
      events.filter((event) => event.phase !== 'started').map((event) => event.callId),
    );
    for (const event of events) {
      if (event.phase !== 'started' || finished.has(event.callId)) continue;
      await store.appendExecution({
        ...event,
        id: randomUUID(),
        phase: 'interrupted',
        createdAt: Date.now(),
      });
      finished.add(event.callId);
    }
  }
}
