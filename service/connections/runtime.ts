import {
  InMemoryCredentialStore,
  type Provider as NativeProvider,
  type Model,
} from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Provider } from '../../shared/contracts.js';
import { DomainError } from '../errors.js';
import type { SecretStore } from '../providers.js';
import { presetById } from './catalog.js';
import { chatGPTAuth } from './chatgpt.js';
import { ConnectionCredentials } from './credentials.js';
import { chatGPTPayload } from './payload.js';
import type { ModelChoice } from '../../shared/providers.js';

export async function connectionRuntime(provider: Provider, secrets: SecretStore) {
  const preset = presetById(provider.presetId);
  const sdkId = preset?.sdkProvider || provider.id;
  const credentials = new ConnectionCredentials(secrets, provider.id, sdkId);
  const runtime = await ModelRuntime.create({
    credentials,
    modelsPath: null,
    refreshOnCreate: false,
  });
  const builtin = preset?.sdkProvider ? runtime.getProvider(sdkId) : undefined;
  if (builtin) {
    const native: NativeProvider = {
      ...builtin,
      // Never fall through to environment credentials or to another billing method.
      auth:
        provider.authMethod === 'oauth'
          ? {
              oauth:
                preset?.id === 'chatgpt' ? chatGPTAuth(secrets, provider.id) : builtin.auth.oauth,
            }
          : {
              apiKey: {
                name: 'Connection key',
                resolve: async ({ credential }) =>
                  credential?.key ? { auth: { apiKey: credential.key } } : undefined,
              },
            },
    };
    if (preset?.id === 'chatgpt') {
      const saved = await credentials.read(sdkId);
      const accountModels =
        saved?.type === 'oauth' ? (saved.accountModels as ModelChoice[] | undefined) : undefined;
      if (accountModels)
        native.getModels = () =>
          accountModels.map((m) => ({
            ...(builtin.getModels().find((known) => known.id === m.id) || {
              id: m.id,
              name: m.name,
              provider: sdkId,
              api: 'openai-responses' as const,
              baseUrl: preset.baseUrl,
              reasoning: m.reasoning,
              input: ['text' as const],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: m.contextWindow,
              maxTokens: m.maxTokens,
            }),
          }));
      native.getAllModels = native.getModels;
      const openai = builtin as NativeProvider<'openai-responses'>;
      native.stream = (model, context, options) =>
        openai.stream(model as Model<'openai-responses'>, context, {
          ...options,
          onPayload: chatGPTPayload,
        } as Parameters<typeof openai.stream>[2]);
      native.streamSimple = (model, context, options) =>
        builtin.streamSimple(model, context, { ...options, onPayload: chatGPTPayload });
    }
    runtime.registerNativeProvider(native);
  } else {
    const key = await secrets.get(provider.id);
    const custom = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
    });
    custom.registerProvider(provider.id, {
      baseUrl: provider.baseUrl,
      api: provider.api,
      authHeader: Boolean(key),
      models: [
        {
          id: provider.model,
          name: provider.model,
          api: provider.api,
          reasoning: provider.reasoning || false,
          input: provider.vision ? ['text', 'image'] : ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: provider.contextWindow,
          maxTokens: provider.maxTokens,
        },
      ],
    });
    await custom.setRuntimeApiKey(provider.id, key || 'local-no-key');
    return { runtime: custom, credentials, sdkId };
  }
  return { runtime, credentials, sdkId };
}
export async function createModelRuntime(provider: Provider, secrets: SecretStore) {
  if ((provider.authMethod === 'oauth' || provider.hasKey) && !(await secrets.get(provider.id)))
    throw new DomainError('keyMissing');
  const { runtime, sdkId, credentials } = await connectionRuntime(provider, secrets);
  if (provider.authMethod === 'oauth' && (await credentials.read(sdkId))?.type !== 'oauth')
    throw new DomainError('keyMissing');
  const model = runtime.getModel(sdkId, provider.model);
  if (!model) throw new DomainError('invalidModel');
  return { runtime, model };
}
