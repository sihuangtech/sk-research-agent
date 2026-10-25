import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, waitFor } from './helpers.js';
import { oauthFixture } from './oauth-fixture.js';

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
