import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConnectionCredentials } from '../connections/credentials.js';
import { connectionRuntime } from '../connections/runtime.js';
import { installationDeviceId } from '../connections/installation.js';
import { chatGPTPayload } from '../connections/payload.js';
import { connectionModels } from '../connections/models.js';
import { fixture, TestSecrets } from './helpers.js';
import { oauthFixture } from './oauth-fixture.js';

test('installation identity is stable, serialized and accepts existing host IDs', async () => {
  const secrets = new TestSecrets();
  const ids = await Promise.all(Array.from({ length: 5 }, () => installationDeviceId(secrets)));
  assert.equal(new Set(ids).size, 1);
  assert.match(ids[0], /^[0-9a-f-]{36}$/);
  await secrets.set('installation', `urn:uuid:${ids[0]}`);
  assert.equal(await installationDeviceId(secrets), ids[0]);
});

test('all account presets expose Pi builtin OAuth methods and metadata', async () => {
  const f = await fixture();
  try {
    for (const presetId of ['chatgpt', 'copilot', 'kimi-login']) {
      const p = await f.call('/providers', 'POST', { name: presetId, presetId });
      const { runtime, sdkId } = await connectionRuntime(p, f.secrets);
      const { ModelRuntime } = await import('@earendil-works/pi-coding-agent');
      const { InMemoryCredentialStore } = await import('@earendil-works/pi-ai');
      const builtin = await ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsPath: null,
        refreshOnCreate: false,
      });
      const actual = runtime.getProvider(sdkId)?.auth.oauth;
      const expected = builtin.getProvider(sdkId)?.auth.oauth;
      assert.ok(actual && expected);
      assert.equal(actual.name, expected.name);
      assert.equal(actual.loginLabel, expected.loginLabel);
      for (const method of ['login', 'refresh', 'toAuth'] as const)
        assert.equal(actual[method].toString(), expected[method].toString());
    }
  } finally {
    await f.close();
  }
});

test('subscription refreshes are serialized across runtimes and never use ambient API keys', async () => {
  const f = await fixture();
  const mock = oauthFixture();
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'must-not-be-used';
  try {
    const p = await f.call('/providers', 'POST', {
      presetId: 'chatgpt',
      name: 'Personal',
      model: 'gpt-6.1-sol',
    });
    const missing = await connectionRuntime(p, f.secrets);
    assert.equal(await missing.runtime.getAuth('openai'), undefined);
    await f.secrets.set(
      p.id,
      JSON.stringify({
        type: 'oauth',
        access: 'expired',
        refresh: 'refresh',
        expires: 0,
        clientId: 'oaiapp_test',
        subject: 'test-user',
        scopes: ['chatgpt.tokens.use.direct'],
      }),
    );
    const a = await connectionRuntime(p, f.secrets);
    const b = await connectionRuntime(p, f.secrets);
    const resolved = await Promise.all([a.runtime.getAuth('openai'), b.runtime.getAuth('openai')]);
    assert.equal(mock.refreshes, 1);
    assert.equal(resolved[0]?.auth.apiKey, 'refreshed-1');
    assert.equal(resolved[1]?.auth.apiKey, 'refreshed-1');
    const models = await connectionModels(p, f.secrets);
    assert.deepEqual(
      models.map((m) => m.id),
      ['gpt-6.1-sol'],
    );
    assert.ok(!JSON.stringify(await f.call('/overview')).includes('refreshed-1'));
    const second = new ConnectionCredentials(f.secrets, 'other-account', 'openai');
    assert.equal(await second.read('openai'), undefined);
    assert.equal(await a.credentials.read('anthropic'), undefined);
    await a.credentials.delete('openai');
    assert.equal(await b.runtime.getAuth('openai'), undefined);
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    mock.close();
    await f.close();
  }
});

test('SIWC request boundary removes unsupported fields and namespaces research tools', () => {
  const body = chatGPTPayload({
    store: true,
    stream: false,
    max_output_tokens: 100,
    temperature: 0.5,
    previous_response_id: 'old',
    input: [{ role: 'system', content: 'Research' }],
    tools: [{ type: 'function', name: 'read' }],
  });
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.max_output_tokens, undefined);
  assert.equal(body.temperature, undefined);
  assert.equal(body.previous_response_id, undefined);
  assert.deepEqual(body.input, [{ role: 'developer', content: 'Research' }]);
  assert.equal((body.tools as { type: string }[])[0].type, 'namespace');
});
