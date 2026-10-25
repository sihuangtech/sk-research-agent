import type { Api, Model } from '@earendil-works/pi-ai';
import type { ApiMode, Provider } from '../../shared/contracts.js';
import type { ModelChoice } from '../../shared/providers.js';
import { DomainError } from '../errors.js';
import type { SecretStore } from '../providers.js';
import { presetById, presetModels } from './catalog.js';
import { connectionRuntime } from './runtime.js';

export function choice(model: Model<Api>): ModelChoice {
  return {
    id: model.id,
    name: model.name,
    api: model.api as ApiMode,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    reasoning: model.reasoning,
    vision: model.input.includes('image'),
  };
}
export async function connectionModels(provider: Provider, secrets: SecretStore) {
  const preset = presetById(provider.presetId);
  if (preset?.id === 'chatgpt') {
    const { runtime, sdkId, credentials } = await connectionRuntime(provider, secrets);
    const auth = await runtime.getAuth(sdkId);
    if (!auth?.auth.apiKey) throw new DomainError('keyMissing');
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${auth.auth.apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new DomainError('modelCatalogFailed');
    const body = (await response.json()) as {
      models?: {
        slug: string;
        display_name: string;
        visibility: string;
        context_window?: number;
        max_output_tokens?: number;
      }[];
    };
    if (!Array.isArray(body.models)) throw new DomainError('modelCatalogFailed');
    const available = body.models.filter(
      (m) => m.visibility === 'list' && typeof m.slug === 'string',
    );
    const models = available.map((m): ModelChoice => {
      const known = runtime.getModel(sdkId, m.slug);
      return known
        ? { ...choice(known), name: m.display_name || known.name }
        : {
            id: m.slug,
            name: m.display_name || m.slug,
            api: 'openai-responses',
            contextWindow: m.context_window || 128000,
            maxTokens: m.max_output_tokens || 8192,
            reasoning: false,
            vision: false,
          };
    });
    await credentials.modify(sdkId, async (current) =>
      current?.type === 'oauth' ? { ...current, accountModels: models } : undefined,
    );
    return models;
  }
  if (preset?.authMethod === 'oauth') {
    const { runtime, sdkId } = await connectionRuntime(provider, secrets);
    return (await runtime.getAvailable(sdkId)).map(choice);
  }
  if (preset?.sdkProvider || preset?.models) return presetModels(preset);
  if (provider.api !== 'openai-completions' && provider.api !== 'openai-responses')
    throw new DomainError('modelCatalogFailed');
  const key = await secrets.get(provider.id);
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new DomainError('modelCatalogFailed');
  const body = (await response.json()) as { data?: { id: string }[] };
  if (!Array.isArray(body.data)) throw new DomainError('modelCatalogFailed');
  return body.data
    .filter((m) => typeof m.id === 'string')
    .slice(0, 2000)
    .map(
      (m): ModelChoice => ({
        id: m.id,
        name: m.id,
        api: provider.api,
        contextWindow: provider.contextWindow,
        maxTokens: provider.maxTokens,
        reasoning: provider.reasoning || false,
        vision: provider.vision || false,
      }),
    );
}
