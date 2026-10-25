import { generateKeyPairSync, sign } from 'node:crypto';

export function oauthFixture() {
  const original = globalThis.fetch;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const requests: { url: string; body: URLSearchParams }[] = [];
  let authorize: URL | undefined;
  let identity = 'test-user';
  let invalidNonce = false;
  let deniedScope = false;
  let tamperedSignature = false;
  let refreshes = 0;
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  const jwt = () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const content = `${encode({ alg: 'RS256', kid: 'test-key' })}.${encode({
      iss: 'https://auth.openai.com',
      aud: 'oaiapp_test',
      sub: identity,
      email: 'fixture@example.test',
      nonce: invalidNonce ? 'wrong' : authorize?.searchParams.get('nonce'),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}`;
    const signature = sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url');
    return `${content}.${tamperedSignature ? 'invalid' : signature}`;
  };
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (!url.startsWith('https://auth.openai.com') && !url.startsWith('https://api.openai.com'))
      return original(input, options);
    const body = new URLSearchParams(String(options?.body || ''));
    requests.push({ url, body });
    if (url.includes('openid-configuration'))
      return json({
        issuer: 'https://auth.openai.com',
        authorization_endpoint: 'https://auth.openai.com/api/accounts/authorize',
        token_endpoint: 'https://auth.openai.com/api/accounts/oauth/token',
        jwks_uri: 'https://auth.openai.com/.well-known/jwks.json',
        revocation_endpoint: 'https://auth.openai.com/api/accounts/oauth/revoke',
        id_token_signing_alg_values_supported: ['RS256'],
        response_types_supported: ['code'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    if (url.endsWith('/jwks.json')) return json({ keys: [jwk] });
    if (url.endsWith('/revoke')) return new Response(null, { status: 200 });
    if (url.endsWith('/models'))
      return json({
        models: [
          { slug: 'gpt-6.1-sol', display_name: 'Test account model', visibility: 'list' },
          { slug: 'hidden-model', display_name: 'Hidden', visibility: 'hidden' },
        ],
      });
    if (url.endsWith('/token')) {
      const refreshing = body.get('grant_type') === 'refresh_token';
      if (refreshing) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return json({
        access_token: refreshing ? `refreshed-${refreshes}` : 'private-access-fixture',
        refresh_token: refreshing ? `rotated-${refreshes}` : 'private-refresh-fixture',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: deniedScope
          ? 'openid profile email'
          : 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
        ...(refreshing ? {} : { id_token: jwt() }),
      });
    }
    throw new Error('Unexpected fixture request');
  };
  return {
    requests,
    get refreshes() {
      return refreshes;
    },
    setIdentity(value: string) {
      identity = value;
    },
    setInvalidNonce() {
      invalidNonce = true;
    },
    setDeniedScope() {
      deniedScope = true;
    },
    setTamperedSignature() {
      tamperedSignature = true;
    },
    async authorize(value: string, params: Record<string, string> = {}) {
      authorize = new URL(value);
      const callback = new URL(authorize.searchParams.get('redirect_uri')!);
      callback.search = new URLSearchParams({
        code: 'test-code',
        state: authorize.searchParams.get('state')!,
        client_id: 'oaiapp_test',
        ...params,
      }).toString();
      return original(callback);
    },
    close() {
      globalThis.fetch = original;
    },
  };
}
