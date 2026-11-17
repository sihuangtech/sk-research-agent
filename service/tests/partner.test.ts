import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { localDate, reportTool } from '../agent/partner-tools.js';
import { fixture, provider, waitFor } from './helpers.js';
import { scriptedModel } from './scripted-model.js';

type Fixture = Awaited<ReturnType<typeof fixture>>;
const idle = (f: Fixture, id: string) =>
  waitFor(
    () => f.call(`/sessions/${id}`),
    (r) => r.conversation.status !== 'running',
  );
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

test('checkpoints restore project files, remove later files and leave protected data alone', async () => {
  const f = await fixture();
  try {
    const at = (path: string) => join(f.workspace, path);
    await mkdir(at('data'));
    await writeFile(at('analysis.py'), 'v1');
    await writeFile(at('data/raw.csv'), 'raw v1');
    const saved = await f.call(`/projects/${f.project.id}/checkpoints`, 'POST', {
      label: 'before',
    });
    assert.equal(saved.files, 2);
    await writeFile(at('analysis.py'), 'v2');
    await writeFile(at('later.txt'), 'new');
    await writeFile(at('data/raw.csv'), 'raw v2');
    // Protecting data afterwards: restoring an older checkpoint must not touch it.
    await f.call(`/projects/${f.project.id}/protected`, 'PUT', { paths: ['data'] });
    const safety = await f.call(`/checkpoints/${saved.id}/restore`, 'POST');
    assert.equal(await readFile(at('analysis.py'), 'utf8'), 'v1');
    assert.equal(await exists(at('later.txt')), false);
    assert.equal(await readFile(at('data/raw.csv'), 'utf8'), 'raw v2');
    // The restore saved the state before it, so it can be undone.
    await f.call(`/checkpoints/${safety.id}/restore`, 'POST');
    assert.equal(await readFile(at('analysis.py'), 'utf8'), 'v2');
    assert.equal(await readFile(at('later.txt'), 'utf8'), 'new');
    const { available, checkpoints } = await f.call(`/projects/${f.project.id}/checkpoints`);
    assert.equal(available, true);
    assert.ok(checkpoints.length >= 3);
    // The project's own Git directory is never created or used.
    assert.equal(await exists(at('.git')), false);
  } finally {
    await f.close();
  }
});

test('proposed memories reach the model only after the researcher confirms them', async () => {
  const f = await fixture();
  const model = await scriptedModel((n) =>
    n === 0
      ? {
          tool: 'memory_propose',
          args: { content: 'Call me Lin.', scope: 'personal', reason: 'They signed as Lin.' },
        }
      : { text: 'Noted.' },
  );
  try {
    const p = await f.call('/providers', 'POST', provider(model.baseUrl));
    const s = await f.call('/sessions', 'POST', { projectId: f.project.id, providerId: p.id });
    await f.call(`/sessions/${s.id}/messages`, 'POST', { text: 'Hi, Lin here.' });
    await idle(f, s.id);
    const proposal = (await f.call('/overview')).memories.find((m: any) => m.status === 'proposed');
    assert.equal(proposal.content, 'Call me Lin.');
    assert.equal(proposal.reason, 'They signed as Lin.');
    await f.call(`/sessions/${s.id}/messages`, 'POST', { text: 'Second turn.' });
    await idle(f, s.id);
    const system = (index: number) => JSON.stringify(model.requests[index].messages[0]);
    assert.ok(!system(model.requests.length - 1).includes('Call me Lin.'));
    await f.call(`/memories/${proposal.id}/confirm`, 'POST');
    await f.call(`/sessions/${s.id}/messages`, 'POST', { text: 'Third turn.' });
    await idle(f, s.id);
    assert.ok(system(model.requests.length - 1).includes('Call me Lin.'));
  } finally {
    await f.close();
    await model.close();
  }
});

test('reports must cite existing records and never overwrite earlier reports', async () => {
  const f = await fixture();
  try {
    const entry = await f.call(`/projects/${f.project.id}/research`, 'POST', {
      kind: 'decision',
      title: 'Use the larger cohort',
      content: 'Decided after the pilot.',
    });
    const project = await f.server.store.get('projects', f.project.id);
    const save = reportTool(f.server.store, project, 'weekly', 'en');
    const run = (content: string) =>
      save.execute('id', { content }, undefined, undefined, {} as any);
    await assert.rejects(run('We switched cohorts [#deadbeef].'), /deadbeef/);
    await assert.rejects(run('We switched cohorts.'), /cites no research records/);
    const first = JSON.parse((await run(`Switched [#${entry.id.slice(0, 8)}].`)).content[0].text);
    const second = JSON.parse((await run(`Again [#${entry.id.slice(0, 8)}].`)).content[0].text);
    assert.equal(first.path, `reports/weekly-${localDate()}.md`);
    // Half past midnight local time is still that local day, whatever the UTC date is.
    assert.equal(localDate(new Date(2026, 10, 18, 0, 30).getTime()), '2026-11-18');
    assert.notEqual(first.path, second.path);
    assert.match(await readFile(join(f.workspace, first.path), 'utf8'), /Switched/);
    const search = await f.call(`/projects/${f.project.id}/research?q=${entry.id.slice(0, 8)}`);
    assert.equal(search.entries[0].id, entry.id);
  } finally {
    await f.close();
  }
});

test('when an agent job ends, the agent returns with a read-only follow-up', async () => {
  const f = await fixture();
  const model = await scriptedModel((n, request) => {
    const event = JSON.stringify(request.messages).includes('second-moon:event');
    if (event) return { text: 'The run finished and wrote result.txt.' };
    return n === 0
      ? { tool: 'research_job', args: { command: 'sleep 0.3 && echo 7 > result.txt' } }
      : { text: 'Started the job.' };
  });
  try {
    const p = await f.call('/providers', 'POST', provider(model.baseUrl));
    const s = await f.call('/sessions', 'POST', { projectId: f.project.id, providerId: p.id });
    await f.call(`/sessions/${s.id}/messages`, 'POST', { text: 'Run it.' });
    const done = await waitFor(
      () => f.call(`/sessions/${s.id}`),
      (r) => r.conversation.status !== 'running' && r.messages.some((m: any) => m.role === 'event'),
    );
    const final = await idle(f, s.id);
    const event = final.messages.find((m: any) => m.role === 'event');
    assert.match(event.text, /sleep 0\.3/);
    assert.ok(!event.text.includes('job_status'), 'instructions stay out of the UI');
    assert.ok(done.messages.length > 0);
    const followUp = model.requests.findIndex((r) =>
      JSON.stringify(r.messages).includes('second-moon:event'),
    );
    const tools = model.toolNames(followUp);
    assert.ok(tools.includes('job_status') && tools.includes('research_record'));
    for (const name of ['bash', 'write', 'edit', 'research_job'])
      assert.ok(!tools.includes(name), name);
    const jobs = await f.call(`/projects/${f.project.id}/jobs`);
    assert.deepEqual(jobs[0].artifacts, ['result.txt']);
  } finally {
    await f.close();
    await model.close();
  }
});
