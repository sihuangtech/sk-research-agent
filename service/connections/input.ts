import { z } from 'zod';
import { presetById, presetModels } from './catalog.js';
import { DomainError } from '../errors.js';
import type { Provider } from '../../shared/contracts.js';

const inputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  presetId: z.string().max(80).optional(),
  baseUrl: z.url().optional(),
  api: z
    .enum([
      'openai-completions',
      'openai-responses',
      'anthropic-messages',
      'google-generative-ai',
      'mistral-conversations',
    ])
    .optional(),
  model: z.string().trim().max(200).default(''),
  contextWindow: z.number().int().min(2048).max(10000000).default(128000),
  maxTokens: z.number().int().min(128).max(2000000).default(8192),
  reasoning: z.boolean().default(false),
  vision: z.boolean().default(false),
  apiKey: z.string().max(20000).optional(),
  clearKey: z.boolean().optional(),
});
export async function providerInput(body: unknown, old?: Provider) {
  const { apiKey, clearKey, ...input } = inputSchema.parse(body);
  if (old?.presetId !== input.presetId && old) throw new DomainError('connectionTypeLocked');
  const preset = presetById(input.presetId);
  if (input.presetId && !preset) throw new DomainError('authUnsupported');
  if (preset?.authMethod === 'oauth' && (apiKey || clearKey))
    throw new DomainError('authUnsupported');
  const models = preset ? await presetModels(preset) : [];
  const selected = models.find((m) => m.id === input.model);
  const model = selected || (!input.model ? models[0] : undefined);
  const baseUrl =
    preset?.group !== 'local' && preset ? preset.baseUrl : input.baseUrl || preset?.baseUrl;
  if (!baseUrl) throw new DomainError('invalidApiUrl');
  const url = new URL(baseUrl);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new DomainError('invalidApiUrl');
  const result = {
    ...input,
    ...(model
      ? {
          model: model.id,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          reasoning: model.reasoning,
          vision: model.vision,
        }
      : {}),
    baseUrl,
    api: model?.api || preset?.api || input.api || 'openai-completions',
    authMethod: preset?.authMethod || ('api_key' as const),
    billing: preset?.billing || ('api' as const),
  };
  if (result.maxTokens > result.contextWindow) throw new DomainError('maxOutput');
  if (!result.model && preset?.authMethod !== 'oauth') throw new DomainError('invalidModel');
  return { input: result, apiKey, clearKey };
}
