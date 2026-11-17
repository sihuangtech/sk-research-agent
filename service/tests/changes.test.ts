import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChangeNotice, SessionSnapshot } from '../../shared/contracts.js';
import { mergeSnapshot, snapshotQuery } from '../../shared/snapshot.js';
import { createChangeFeed } from '../changes.js';
import { fixture, modelFixture, provider, waitFor } from './helpers.js';

test('change feed merges a window into one notice and ignores changes after close', async () => {
  const notices: ChangeNotice[] = [];
  const feed = createChangeFeed((notice) => notices.push(notice), 20);
  feed.changed({ sessions: ['a'] });
  feed.changed({ sessions: ['a', 'b'], files: ['p'] });
  feed.changed();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(notices, [
    { overview: true, sessions: ['a', 'b'], files: ['p'], research: [], jobs: [] },
  ]);
  feed.changed({ research: ['p'] });
  feed.close();
  feed.changed({ jobs: ['p'] });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(notices.length, 1);
});

async function collectNotices(address: string, token: string) {
  const notices: ChangeNotice[] = [];
  const response = await fetch(`${address}/api/events`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const reading = (async () => {
    let pending = '';
    for (;;) {
      const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (chunk.done) return;
      pending += decoder.decode(chunk.value, { stream: true });
      const blocks = pending.split('\n\n');
      pending = blocks.pop() || '';
      for (const block of blocks)
        if (block.startsWith('data: ')) notices.push(JSON.parse(block.slice(6)));
    }
  })();
  return {
    notices,
    async stop() {
      await reader.cancel();
      await reading;
    },
  };
}

test('a turn notifies its session separately and snapshots resend only changed messages', async () => {
  const f = await fixture();
  // Delayed model replies separate the turn start, the tool round and the final answer.
  const model = await modelFixture(300);
  try {
    const address = await f.server.app.listen({ host: '127.0.0.1', port: 0 });
    const feed = await collectNotices(address, f.token);
    const p = await f.call('/providers', 'POST', provider(model.baseUrl));
    const s = await f.call('/sessions', 'POST', { projectId: f.project.id, providerId: p.id });
    await f.call(`/sessions/${s.id}/messages`, 'POST', { text: 'Write the result file.' });
    const full: SessionSnapshot = await waitFor(
      () => f.call(`/sessions/${s.id}`),
      (r) => r.conversation.status !== 'running',
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    await feed.stop();

    const project = f.project.id;
    // Streaming and tool updates leave the overview alone; the finished write marks files.
    assert.ok(
      feed.notices.some(
        (n) => !n.overview && n.sessions.includes(s.id) && n.files.includes(project),
      ),
      JSON.stringify(feed.notices),
    );
    const union = (area: 'files' | 'research' | 'jobs') => feed.notices.flatMap((n) => n[area]);
    assert.ok(union('research').includes(project), 'handoff and execution events');
    assert.deepEqual(union('jobs'), []);

    assert.equal(full.from, 0);
    assert.ok(full.messages.length >= 3);
    const keys = full.messages.map((m) => m.key);
    assert.equal(new Set(keys).size, keys.length);
    const delta: SessionSnapshot = await f.call(`/sessions/${s.id}${snapshotQuery(full, s.id)}`);
    assert.equal(delta.from, full.messages.length - 1);
    assert.deepEqual(delta.messages, full.messages.slice(-1));
    assert.deepEqual(mergeSnapshot(full, delta), full);
    for (const query of ['?after=1&anchor=moved', `?after=${keys.length + 1}&anchor=${keys[0]}`])
      assert.deepEqual(await f.call(`/sessions/${s.id}${query}`), full);
    assert.equal(mergeSnapshot(null, delta), null);
    assert.equal(snapshotQuery(full, 'another-session'), '');
  } finally {
    await f.close();
    await model.close();
  }
});

test('the overview leaves out job logs, which load per project', async () => {
  const f = await fixture();
  try {
    const job = await f.call(`/projects/${f.project.id}/jobs`, 'POST', {
      command: 'node -e "console.log(\'job output\')"',
    });
    await waitFor(
      () => f.server.store.get('jobs', job.id),
      (j) => j.status !== 'running',
    );
    const overview = await f.call('/overview');
    assert.equal('jobs' in overview, false);
    assert.ok(!JSON.stringify(overview).includes('job output'));
    const jobs = await f.call(`/projects/${f.project.id}/jobs`);
    assert.deepEqual(
      jobs.map((j: { id: string }) => j.id),
      [job.id],
    );
    assert.match(jobs[0].log, /job output/);
  } finally {
    await f.close();
  }
});
