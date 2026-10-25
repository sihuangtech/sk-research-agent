import { randomUUID } from 'node:crypto';
import type { OAuthAuth, OAuthCredential } from '@earendil-works/pi-ai';
import * as oidc from 'openid-client';
import { DomainError } from '../errors.js';
import type { SecretStore } from '../providers.js';
import { listenForOAuth } from './callback.js';
import { credentialLock } from './credentials.js';

const issuer = new URL('https://auth.openai.com');
const resource = 'https://api.openai.com/v1';
const planScope = 'chatgpt.tokens.use.direct';
interface Registration {
  clientId: string;
  subject?: string;
  email?: string;
}
type Tokens = Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
async function configuration(clientId: string, signal: AbortSignal) {
  const config = await oidc.discovery(
    issuer,
    clientId,
    { token_endpoint_auth_method: 'none' },
    oidc.None(),
    {
      execute: [oidc.enableNonRepudiationChecks],
      [oidc.customFetch]: (url, options) =>
        fetch(url, {
          ...options,
          body: options.body as BodyInit,
          signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        }),
    },
  );
  config.timeout = 30;
  return config;
}
function credential(
  tokens: Tokens,
  registration: Registration,
  previous?: OAuthCredential,
): OAuthCredential {
  const scopes = tokens.scope?.split(/\s+/) || (previous?.scopes as string[]) || [];
  if (
    !scopes.includes(planScope) ||
    !tokens.access_token ||
    !(tokens.refresh_token || previous?.refresh)
  )
    throw new DomainError('authScopeMissing');
  return {
    ...previous,
    type: 'oauth',
    access: tokens.access_token,
    refresh: tokens.refresh_token || previous!.refresh,
    expires: Date.now() + (tokens.expires_in || 3600) * 1000,
    clientId: registration.clientId,
    subject: registration.subject,
    email: registration.email,
    idToken: tokens.id_token || previous?.idToken,
    scopes,
  };
}
export function chatGPTAuth(secrets: SecretStore, id: string): OAuthAuth {
  return {
    name: 'ChatGPT',
    isSubscription: true,
    async login(interaction) {
      const stored = await secrets.get(`registration:${id}`);
      const registration: Registration | undefined = stored ? JSON.parse(stored) : undefined;
      const hostId = await credentialLock(secrets, 'installation', async () => {
        const old = await secrets.get('installation');
        if (old) return old;
        const next = `urn:uuid:${randomUUID()}`;
        await secrets.set('installation', next);
        return next;
      });
      const config = await configuration(
        registration?.clientId || 'dynamic_agent_client',
        interaction.signal,
      );
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const verifier = oidc.randomPKCECodeVerifier();
      const callback = await listenForOAuth(state, interaction.signal);
      try {
        const params: Record<string, string> = {
          response_type: 'code',
          redirect_uri: callback.redirectUri,
          resource,
          scope: `openid profile email offline_access resource.invoke ${planScope}`,
          ext_agent_host_id: hostId,
          state,
          nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
          code_challenge_method: 'S256',
        };
        if (!registration) params.agent_name_hint = 'Second Moon';
        else if (registration.email) params.login_hint = registration.email;
        const raw = await secrets.get(id);
        if (raw) {
          const previous = JSON.parse(raw);
          if (previous.idToken && registration) params.id_token_hint = previous.idToken;
        }
        interaction.notify({
          type: 'auth_url',
          url: oidc.buildAuthorizationUrl(config, params).href,
        });
        const returned = await callback.result;
        if (returned.searchParams.has('error')) throw new DomainError('authDenied');
        const clientId = returned.searchParams.get('client_id') || registration?.clientId;
        if (
          !clientId ||
          clientId === 'dynamic_agent_client' ||
          (registration && clientId !== registration.clientId)
        )
          throw new DomainError('authIdentityMismatch');
        // Keep the issued registration through a failed exchange; a retry must not create a new client.
        await secrets.set(`registration:${id}`, JSON.stringify({ ...registration, clientId }));
        const issued = new oidc.Configuration(
          config.serverMetadata(),
          clientId,
          { token_endpoint_auth_method: 'none' },
          oidc.None(),
        );
        issued[oidc.customFetch] = config[oidc.customFetch]!;
        oidc.enableNonRepudiationChecks(issued);
        const tokens = await oidc.authorizationCodeGrant(
          issued,
          returned,
          {
            expectedState: state,
            expectedNonce: nonce,
            pkceCodeVerifier: verifier,
            idTokenExpected: true,
          },
          { resource },
        );
        const claims = tokens.claims();
        if (!claims?.sub || (registration?.subject && registration.subject !== claims.sub))
          throw new DomainError('authIdentityMismatch');
        const identity = {
          clientId,
          subject: claims.sub,
          email: typeof claims.email === 'string' ? claims.email : undefined,
        };
        const result = credential(tokens, identity);
        interaction.signal.throwIfAborted();
        await secrets.set(`registration:${id}`, JSON.stringify(identity));
        return result;
      } finally {
        callback.close();
      }
    },
    async refresh(previous, signal) {
      const config = await configuration(String(previous.clientId), signal);
      const tokens = await oidc.refreshTokenGrant(config, previous.refresh, { resource });
      const claims = tokens.claims();
      if (claims && claims.sub !== previous.subject) throw new DomainError('authIdentityMismatch');
      return credential(
        tokens,
        {
          clientId: String(previous.clientId),
          subject: String(previous.subject),
          email: previous.email as string | undefined,
        },
        previous,
      );
    },
    async toAuth(value) {
      return { apiKey: value.access };
    },
  };
}
export async function revokeChatGPT(value: OAuthCredential) {
  try {
    const config = await configuration(String(value.clientId), AbortSignal.timeout(15000));
    await oidc.tokenRevocation(config, value.refresh, { token_type_hint: 'refresh_token' });
    return true;
  } catch {
    return false;
  }
}
