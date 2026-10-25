import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { presentMessages } from '../agent/messages.js';
import type { Store } from '../store.js';
import { Notebook } from './notebook.js';

export async function saveHandoff(
  store: Store,
  sessionId: string,
  task: string,
  messages: AgentMessage[],
  interrupted: boolean,
) {
  const session = await store.get('sessions', sessionId);
  const report = presentMessages(messages)
    .filter((message) => message.role === 'assistant')
    .at(-1)?.text;
  await new Notebook(store).record(
    session.projectId,
    {
      kind: 'handoff',
      status: interrupted ? 'inconclusive' : 'open',
      sessionId,
      title: task.slice(0, 200),
      content: (report || task).slice(0, 6000),
    },
    'agent',
  );
}
