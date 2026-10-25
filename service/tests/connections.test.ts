import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { presets, presetModels } from '../connections/catalog.js';
import { connectionRuntime, createModelRuntime } from '../connections/runtime.js';
import { fixture } from './helpers.js';
import { oauthFixture } from './oauth-fixture.js';

test('provider catalog separates subscription, dedicated plan endpoints, API billing and local servers', async () => {
  assert.ok(presets.length >= 30);
  assert.equal(new Set(presets.map((p) => p.id)).size, presets.length);
  for (const p of presets) {
    assert.ok(new URL(p.docsUrl).protocol === 'https:');
    if (p.authMethod === 'oauth') assert.ok(p.sdkProvider);
    if (p.billing === 'coding-plan') assert.equal(p.interactiveOnly, true);
    const models = await presetModels(p);
    assert.equal(new Set(models.map((m) => m.id)).size, models.length);
  }
  assert.notEqual(
    presets.find((p) => p.id === 'glm-plan-cn')?.baseUrl,
    presets.find((p) => p.id === 'glm-api-cn')?.baseUrl,
  );
  assert.ok(
    (await presetModels(presets.find((p) => p.id === 'openai-api')!)).some(
      (m) => m.reasoning && m.vision,
    ),
  );
});

test('plan endpoints are immutable, credentials are isolated and automated plan usage is blocked', async () => {
  const f = await fixture();
  try {
    const p = await f.call('/providers', 'POST', {
      name: 'GLM plan',
      presetId: 'glm-plan-cn',
      apiKey: 'plan-key-fixture',
      baseUrl: 'https://wrong.example',
    });
    assert.equal(p.baseUrl, 'https://open.bigmodel.cn/api/coding/paas/v4');
    assert.equal(p.billing, 'coding-plan');
    assert.equal(p.authMethod, 'api_key');
    assert.equal(p.reasoning, true);
    const { runtime, model } = await createModelRuntime(p, f.secrets);
    assert.equal(model.baseUrl, p.baseUrl);
    assert.equal((await runtime.getAuth(model))?.auth.apiKey, 'plan-key-fixture');
    const another = await f.call('/providers', 'POST', {
      name: 'Other plan',
      presetId: 'glm-plan-cn',
    });
    const { runtime: isolated } = await connectionRuntime(another, f.secrets);
    assert.equal(await isolated.getAuth('zai-coding-cn'), undefined);
    for (const [path, body] of [
      [`/providers/${p.id}`, { ...p, presetId: 'glm-api-cn' }],
      [
        '/automations',
        {
          projectId: f.project.id,
          providerId: p.id,
          name: 'Disallowed',
          prompt: 'Run',
          intervalMinutes: 5,
        },
      ],
    ] as const) {
      const r = await f.server.app.inject({
        url: `/api${path}`,
        method: path === '/automations' ? 'POST' : 'PUT',
        headers: { authorization: `Bearer ${f.token}` },
        payload: body,
      });
      assert.equal(r.statusCode, 400);
    }
    await f.restart();
    assert.ok(
      !(await readFile(join(f.options.dataDir, 'research.sqlite'))).includes(
        Buffer.from('plan-key-fixture'),
      ),
    );
  } finally {
    await f.close();
  }
});

test('OAuth connections reject pasted API keys and sign-out revokes only the selected account', async () => {
  const f = await fixture();
  const mock = oauthFixture();
  try {
    const invalid = await f.server.app.inject({
      url: '/api/providers',
      method: 'POST',
      headers: { authorization: `Bearer ${f.token}` },
      payload: { name: 'Wrong', presetId: 'chatgpt', apiKey: 'not-a-login' },
    });
    assert.equal(invalid.statusCode, 400);
    const a = await f.call('/providers', 'POST', {
      name: 'Account A',
      presetId: 'chatgpt',
      model: 'gpt-6.1-sol',
    });
    const b = await f.call('/providers', 'POST', {
      name: 'Account B',
      presetId: 'chatgpt',
      model: 'gpt-6.1-sol',
    });
    for (const p of [a, b]) {
      await f.secrets.set(
        p.id,
        JSON.stringify({
          type: 'oauth',
          access: `access-${p.id}`,
          refresh: `refresh-${p.id}`,
          expires: Date.now() + 3600000,
          clientId: 'oaiapp_test',
          subject: p.id,
        }),
      );
      await f.secrets.set(
        `registration:${p.id}`,
        JSON.stringify({ clientId: 'oaiapp_test', subject: p.id }),
      );
      await f.server.store.put('providers', { ...p, hasKey: true });
    }
    const result = await f.call(`/providers/${a.id}/logout`, 'POST');
    assert.equal(result.revoked, true);
    assert.equal(await f.secrets.get(a.id), null);
    assert.ok(await f.secrets.get(b.id));
    assert.ok(await f.secrets.get(`registration:${a.id}`));
    const overview = await f.call('/overview');
    assert.equal(overview.providers.find((p: { id: string }) => p.id === a.id).hasKey, false);
    assert.ok(!JSON.stringify(overview).includes('refresh-'));
    const request = mock.requests.find((r) => r.url.endsWith('/revoke'))!;
    assert.equal(request.body.get('token'), `refresh-${a.id}`);
    assert.equal(request.body.get('token_type_hint'), 'refresh_token');
  } finally {
    mock.close();
    await f.close();
  }
});
