import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { fixture } from './helpers.js';

test('loopback API requires a token and rejects foreign origins', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.server.app.inject('/api/overview')).statusCode, 401);
    assert.equal(
      (
        await f.server.app.inject({
          url: '/api/overview',
          headers: { authorization: `Bearer ${f.token}`, origin: 'https://untrusted.invalid' },
        })
      ).statusCode,
      403,
    );
    assert.equal((await f.call('/health')).runtime, 'pi');
  } finally {
    await f.close();
  }
});

test('desktop cross-origin preflights allow authenticated mutations but not foreign origins', async () => {
  const f = await fixture();
  try {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const response = await f.server.app.inject({
        url: `/api/projects/${f.project.id}/file`,
        method: 'OPTIONS',
        headers: {
          origin: 'tauri://localhost',
          'access-control-request-method': method,
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      assert.equal(response.statusCode, 204);
      assert.equal(response.headers['access-control-allow-origin'], 'tauri://localhost');
      assert.ok(
        String(response.headers['access-control-allow-methods'])
          .split(',')
          .map((value) => value.trim())
          .includes(method),
      );
      assert.match(String(response.headers['access-control-allow-headers']), /Authorization/i);
    }
    const foreign = await f.server.app.inject({
      url: '/api/overview',
      method: 'OPTIONS',
      headers: {
        origin: 'https://untrusted.invalid',
        'access-control-request-method': 'DELETE',
      },
    });
    assert.equal(foreign.headers['access-control-allow-origin'], undefined);
    await writeFile(join(f.workspace, 'desktop.md'), 'before');
    const saved = await f.server.app.inject({
      url: `/api/projects/${f.project.id}/file`,
      method: 'PUT',
      headers: { origin: 'tauri://localhost', authorization: `Bearer ${f.token}` },
      payload: { path: 'desktop.md', original: 'before', content: 'after' },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.headers['access-control-allow-origin'], 'tauri://localhost');
    assert.equal(await readFile(join(f.workspace, 'desktop.md'), 'utf8'), 'after');
  } finally {
    await f.close();
  }
});

test('authenticated SSE connects, sends scoped change notices and closes cleanly', async () => {
  const f = await fixture();
  try {
    const address = await f.server.app.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(`${address}/api/events`, {
      headers: { authorization: `Bearer ${f.token}`, origin: 'tauri://localhost' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'tauri://localhost');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    assert.match(decoder.decode((await reader.read()).value), /^: connected/);
    await f.call('/memories', 'POST', { content: 'Prefer SI units.' });
    const notice = decoder.decode((await reader.read()).value);
    assert.deepEqual(JSON.parse(notice.replace(/^data: /, '')), {
      overview: true,
      sessions: [],
      files: [],
      research: [],
      jobs: [],
      alerts: [],
    });
    await reader.cancel();
  } finally {
    await f.close();
  }
});
