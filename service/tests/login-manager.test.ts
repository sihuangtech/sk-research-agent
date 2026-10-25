import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, waitFor } from './helpers.js';
import { oauthFixture } from './oauth-fixture.js';
import { connectionRuntime } from '../connections/runtime.js';
import { installationDeviceId } from '../connections/installation.js';

test('Pi performs ChatGPT browser callback exchange and persists isolated credentials', async () => {
  const f = await fixture();
  const mock = oauthFixture();
  try {
    const provider = await f.call('/providers', 'POST', { name: 'Pi login', presetId: 'chatgpt' });
    const { runtime, sdkId } = await connectionRuntime(provider, f.secrets);
    const deviceId = await installationDeviceId(f.secrets);
    let callback: Promise<Response> | undefined;
    const credential = await runtime.login(
      sdkId,
      'oauth',
      {
        signal: AbortSignal.timeout(5000),
        notify: (event) => {
          if (event.type === 'auth_url') {
            const url = new URL(event.url);
            assert.equal(url.searchParams.get('agent_name_hint'), 'Second Moon');
            assert.equal(url.searchParams.get('ext_agent_host_id'), `urn:uuid:${deviceId}`);
            callback = mock.authorize(event.url);
          }
        },
        prompt: (prompt) =>
          new Promise((_resolve, reject) => {
            prompt.signal?.addEventListener('abort', () => reject(new Error('cancelled')), {
              once: true,
            });
          }),
      },
      { agentName: 'Second Moon', getDeviceId: () => deviceId },
    );
    assert.equal((await callback)?.status, 200);
    assert.equal(credential.type, 'oauth');
    assert.equal(JSON.parse((await f.secrets.get(provider.id))!).access, 'private-access-fixture');
    assert.equal(await f.secrets.get(`registration:${provider.id}`), null);
    const logout = await f.call(`/providers/${provider.id}/logout`, 'POST');
    assert.equal(logout.revoked, false);
    assert.equal(await f.secrets.get(provider.id), null);
    assert.ok(!mock.requests.some((request) => request.url.endsWith('/revoke')));
  } finally {
    mock.close();
    await f.close();
  }
});

test('login API exposes only safe state and can cancel or reject concurrent authorization', async () => {
  const f = await fixture();
  const mock = oauthFixture();
  try {
    const provider = await f.call('/providers', 'POST', { name: 'Test', presetId: 'chatgpt' });
    const login = await f.call(`/providers/${provider.id}/login`, 'POST');
    const state = await waitFor(
      () => f.call(`/provider-logins/${login.id}`),
      (s) => s.browserReady,
    );
    assert.equal(state.status, 'waiting');
    const serialized = JSON.stringify(state);
    for (const privateField of ['https://', 'id_token_hint', 'code_verifier', 'access', 'refresh'])
      assert.ok(!serialized.includes(privateField));
    const duplicate = await f.server.app.inject({
      url: `/api/providers/${provider.id}/login`,
      method: 'POST',
      headers: { authorization: `Bearer ${f.token}` },
    });
    assert.equal(duplicate.json().code, 'authBusy');
    await f.call(`/provider-logins/${login.id}`, 'DELETE');
    assert.equal((await f.call(`/provider-logins/${login.id}`)).status, 'cancelled');
    assert.equal(await f.secrets.get(provider.id), null);
    assert.ok(!mock.requests.some((r) => r.url.endsWith('/token')));
    const invalidLink = await f.server.app.inject({
      url: '/api/provider-presets/chatgpt/open',
      method: 'POST',
      headers: { authorization: `Bearer ${f.token}` },
      payload: { link: 'file:///tmp/not-authorized' },
    });
    assert.equal(invalidLink.statusCode, 400);
  } finally {
    await f.close();
    mock.close();
  }
});
