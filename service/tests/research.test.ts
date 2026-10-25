import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { Notebook } from '../research/notebook.js';
import { ExecutionAudit } from '../research/audit.js';
import { fixture, modelFixture, provider, waitFor } from './helpers.js';

test('research records verify excerpts, detect stale sources, retain revisions and survive restart', async () => {
  const f = await fixture();
  try {
    await writeFile(
      join(f.workspace, 'paper.txt'),
      'Observed accuracy was 0.82.\nControl accuracy was 0.71.',
    );
    const original = await f.call(`/projects/${f.project.id}/research`, 'POST', {
      kind: 'evidence',
      title: 'Baseline accuracy',
      content: 'Reported comparison, not independent replication.',
      sources: [{ path: 'paper.txt', quote: 'accuracy was 0.82.' }],
    });
    assert.equal(original.author, 'user');
    assert.equal(original.sources[0].verification, 'excerpt-matched');
    assert.match(original.sources[0].sha256, /^[a-f0-9]{64}$/);
    let checked = await f.call(`/research/${original.id}/sources`);
    assert.equal(checked[0].state, 'unchanged');
    await writeFile(join(f.workspace, 'paper.txt'), 'Corrected accuracy was 0.76.');
    checked = await f.call(`/research/${original.id}/sources`);
    assert.equal(checked[0].state, 'changed');
    const revision = await f.call(`/projects/${f.project.id}/research`, 'POST', {
      kind: 'evidence',
      title: 'Corrected baseline',
      content: 'Original result corrected.',
      sources: [{ path: 'paper.txt', quote: 'accuracy was 0.76.' }],
      supersedesId: original.id,
    });
    const active = await f.call(`/projects/${f.project.id}/research`);
    assert.deepEqual(
      active.entries.map((entry: any) => entry.id),
      [revision.id],
    );
    const exported = await f.call(`/projects/${f.project.id}/research/export`);
    assert.equal(exported.entries.length, 2);
    assert.equal(
      exported.entries.find((entry: any) => entry.id === original.id).sources[0].sha256,
      original.sources[0].sha256,
    );
    await f.restart();
    const restored = await f.call(`/projects/${f.project.id}/research?q=corrected`);
    assert.equal(restored.entries[0].id, revision.id);
  } finally {
    await f.close();
  }
});

test('research source and relationship validation reject fabricated quotes and cross-project references', async () => {
  const f = await fixture();
  try {
    const post = (projectId: string, body: unknown) =>
      f.server.app.inject({
        url: `/api/projects/${projectId}/research`,
        method: 'POST',
        headers: { authorization: `Bearer ${f.token}`, 'accept-language': 'en' },
        payload: body,
      });
    await writeFile(join(f.workspace, 'source.txt'), 'Real evidence.');
    const input = {
      kind: 'evidence',
      title: 'Claim',
      content: 'Check source.',
      sources: [{ path: 'source.txt', quote: 'Fabricated evidence.' }],
    };
    assert.equal((await post(f.project.id, input)).json().code, 'researchExcerptMismatch');
    assert.equal((await post(f.project.id, { ...input, sources: [] })).statusCode, 400);
    const outside = join(f.directory, 'outside.txt');
    await writeFile(outside, 'Outside');
    await symlink(outside, join(f.workspace, 'escape.txt'));
    const escaped = await post(f.project.id, { ...input, sources: [{ path: 'escape.txt' }] });
    assert.equal(escaped.statusCode, 403);
    const otherPath = join(f.directory, 'other');
    await mkdir(otherPath);
    const other = await f.call('/projects', 'POST', { path: otherPath });
    const entry = await f.call(`/projects/${other.id}/research`, 'POST', {
      kind: 'question',
      title: 'Private project question',
      content: 'Do not cross projects.',
    });
    const linked = await post(f.project.id, {
      kind: 'question',
      title: 'Invalid link',
      content: 'Invalid.',
      relatedIds: [entry.id],
    });
    assert.equal(linked.json().code, 'researchProjectMismatch');
    const notebook = new Notebook(f.server.store);
    assert.equal((await notebook.entries(f.project.id, 'Private')).length, 0);
    assert.ok(!(await notebook.context(f.project.id, 'Private')).includes('Do not cross projects'));
    await assert.rejects(
      () =>
        notebook.record(
          other.id,
          { kind: 'decision', title: 'Override', content: 'Invalid.', supersedesId: entry.id },
          'agent',
        ),
      { code: 'researchRevisionDenied' },
    );
  } finally {
    await f.close();
  }
});

test('a new session retrieves research history and records tool events separately from agent handoffs', async () => {
  const f = await fixture();
  const model = await modelFixture();
  try {
    const p = await f.call('/providers', 'POST', provider(model.baseUrl));
    await f.call(`/projects/${f.project.id}/research`, 'POST', {
      kind: 'next_step',
      title: 'Check the held-out split',
      content: 'Seed 47 failed; investigate label leakage before another experiment.',
    });
    const session = await f.call('/sessions', 'POST', {
      projectId: f.project.id,
      providerId: p.id,
    });
    await f.call(`/sessions/${session.id}/messages`, 'POST', {
      text: 'Continue the held-out split experiment.',
    });
    await waitFor(
      () => f.call(`/sessions/${session.id}`),
      (s) => s.conversation.status !== 'running',
    );
    const request = JSON.stringify(model.requests[0]);
    assert.ok(request.includes('Seed 47 failed'));
    assert.ok(
      model.requests[0].tools.some((tool: any) => tool.function.name === 'research_search'),
    );
    assert.ok(
      model.requests[0].tools.some((tool: any) => tool.function.name === 'research_record'),
    );
    assert.ok(
      !model.requests[0].tools.some((tool: any) => tool.function.name === 'execution_write'),
    );
    const overview = await f.call(`/projects/${f.project.id}/research`);
    const completion = overview.executions.find(
      (event: any) => event.tool === 'write' && event.phase === 'completed',
    );
    assert.equal(completion.sessionId, session.id);
    assert.equal(completion.files[0].path, 'result.txt');
    assert.match(completion.files[0].sha256, /^[a-f0-9]{64}$/);
    const handoff = overview.entries.find((entry: any) => entry.kind === 'handoff');
    assert.equal(handoff.author, 'agent');
    assert.equal(handoff.status, 'open');
    assert.equal(handoff.sessionId, session.id);
    const start = overview.executions.find((event: any) => event.phase === 'started');
    assert.deepEqual(start.arguments.content, { omitted: true, characters: 26 });
    await f.restart();
    assert.equal(
      (await f.call(`/projects/${f.project.id}/research`)).executions.length,
      overview.executions.length,
    );
    assert.equal(
      await readFile(join(f.workspace, 'result.txt'), 'utf8'),
      'verified experiment output',
    );
  } finally {
    await f.close();
    await model.close();
  }
});

test('background execution records exit codes and interrupted tool calls recover without replay', async () => {
  const f = await fixture();
  try {
    const job = await f.server.jobs.start(
      f.project,
      `${JSON.stringify(process.execPath)} -e "process.exit(3)"`,
    );
    await waitFor(
      () => f.server.store.get('jobs', job.id),
      (record) => record.status === 'failed',
    );
    const events = await waitFor(
      () => f.server.store.executions(f.project.id),
      (rows) => rows.some((event) => event.jobId === job.id && event.phase === 'failed'),
    );
    assert.equal(events.find((event) => event.phase === 'failed')?.exitCode, 3);
    assert.equal(
      events.find((event) => event.phase === 'started')?.environment?.node,
      process.version,
    );
    const audit = new ExecutionAudit(f.server.store, f.project.id, randomUUID(), f.workspace);
    audit.observe({
      type: 'tool_execution_start',
      toolCallId: 'pending',
      toolName: 'bash',
      args: { command: 'not executed' },
    });
    // Simulate an abrupt process loss: persist the start without calling finish.
    await waitFor(
      () => f.server.store.executions(f.project.id),
      (rows) => rows.some((event) => event.tool === 'bash'),
    );
    await f.restart();
    const recovered = await f.server.store.executions(f.project.id);
    assert.ok(recovered.some((event) => event.tool === 'bash' && event.phase === 'interrupted'));
    const count = recovered.length;
    await f.restart();
    assert.equal((await f.server.store.executions(f.project.id)).length, count);
  } finally {
    await f.close();
  }
});
