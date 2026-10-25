import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatGPTAuth, revokeChatGPT } from '../connections/chatgpt.js';
import { ConnectionCredentials } from '../connections/credentials.js';
import { connectionRuntime } from '../connections/runtime.js';
import { chatGPTPayload } from '../connections/payload.js';
import { connectionModels } from '../connections/models.js';
import { fixture, TestSecrets } from './helpers.js';
import { oauthFixture } from './oauth-fixture.js';

test('ChatGPT uses official OIDC validation, stable host and reusable client registration', async () => {
  const mock = oauthFixture();
  const secrets = new TestSecrets();
  const urls: URL[] = [];
  try {
    const auth = chatGPTAuth(secrets, 'account-a');
    const login = () =>
      auth.login({
        signal: AbortSignal.timeout(5000),
        prompt: async () => {
          throw new Error('Unexpected prompt');
        },
        notify: (event) => {
          if (event.type === 'auth_url') {
            urls.push(new URL(event.url));
            void mock.authorize(event.url);
          }
        },
      });
    const first = await login();
    assert.equal(first.subject, 'test-user');
    assert.equal(first.email, 'fixture@example.test');
    await secrets.set('account-a', JSON.stringify(first));
    const second = await login();
    assert.equal(second.clientId, first.clientId);
    assert.equal(urls[0].searchParams.get('client_id'), 'dynamic_agent_client');
    assert.equal(urls[1].searchParams.get('client_id'), 'oaiapp_test');
    assert.equal(urls[0].searchParams.get('agent_name_hint'), 'Second Moon');
    assert.equal(urls[1].searchParams.get('agent_name_hint'), null);
    assert.equal(
      urls[0].searchParams.get('ext_agent_host_id'),
      urls[1].searchParams.get('ext_agent_host_id'),
    );
    assert.notEqual(urls[0].searchParams.get('state'), urls[1].searchParams.get('state'));
    assert.equal(urls[1].searchParams.get('id_token_hint'), first.idToken);
    assert.ok(mock.requests.some((r) => r.url.endsWith('/jwks.json')));
    assert.equal(await revokeChatGPT(second), true);
    const tokenRequest = mock.requests.find(
      (r) => r.body.get('grant_type') === 'authorization_code',
    )!;
    assert.equal(tokenRequest.body.get('client_id'), 'oaiapp_test');
    assert.equal(tokenRequest.body.get('resource'), 'https://api.openai.com/v1');
    assert.ok(tokenRequest.body.get('code_verifier'));
  } finally {
    mock.close();
  }
});

test('ChatGPT rejects invalid signatures, nonces, missing plan grants and account substitution', async () => {
  for (const mode of ['nonce', 'signature', 'scope', 'identity']) {
    const mock = oauthFixture();
    const secrets = new TestSecrets();
    if (mode === 'nonce') mock.setInvalidNonce();
    if (mode === 'signature') mock.setTamperedSignature();
    if (mode === 'scope') mock.setDeniedScope();
    if (mode === 'identity')
      await secrets.set(
        'registration:test',
        JSON.stringify({ clientId: 'oaiapp_test', subject: 'original-user' }),
      );
    try {
      await assert.rejects(
        chatGPTAuth(secrets, 'test').login({
          signal: AbortSignal.timeout(5000),
          prompt: async () => '',
          notify: (event) => {
            if (event.type === 'auth_url') void mock.authorize(event.url);
          },
        }),
      );
      assert.equal(await secrets.get('test'), null);
    } finally {
      mock.close();
    }
  }
});

test('ChatGPT rejects wrong callback state and supports cancellation without leaving a listener', async () => {
  const mock = oauthFixture();
  const controller = new AbortController();
  let callbackUrl: URL | undefined;
  try {
    const pending = chatGPTAuth(new TestSecrets(), 'test').login({
      signal: controller.signal,
      prompt: async () => '',
      notify: (event) => {
        if (event.type === 'auth_url') {
          callbackUrl = new URL(new URL(event.url).searchParams.get('redirect_uri')!);
          void mock.authorize(event.url, { state: 'wrong' }).then((result) => {
            assert.equal(result.status, 400);
            controller.abort();
          });
        }
      },
    });
    await assert.rejects(pending);
    assert.ok(!mock.requests.some((r) => r.url.endsWith('/token')));
    await assert.rejects(fetch(callbackUrl!));
  } finally {
    mock.close();
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
