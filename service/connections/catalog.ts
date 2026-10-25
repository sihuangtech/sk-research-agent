import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { ModelChoice, ProviderPreset } from '../../shared/providers.js';
import catalog from './presets.json' with { type: 'json' };
import apiCatalog from './api-presets.json' with { type: 'json' };

export const presets = [...catalog, ...apiCatalog] as ProviderPreset[];
const catalogRuntime = ModelRuntime.create({
  credentials: new InMemoryCredentialStore(),
  modelsPath: null,
  refreshOnCreate: false,
});
export const presetById = (id?: string) => presets.find((p) => p.id === id);
export async function presetModels(preset: ProviderPreset): Promise<ModelChoice[]> {
  const runtime = await catalogRuntime;
  const models = preset.sdkProvider ? runtime.getModels(preset.sdkProvider) : [];
  return (preset.models || models.map((m) => m.id)).map((id) => {
    const model = models.find((m) => m.id === id);
    return {
      id,
      name: model?.name || id,
      api: (model?.api as ModelChoice['api']) || preset.api,
      contextWindow: model?.contextWindow || 128000,
      maxTokens: model?.maxTokens || 8192,
      reasoning: model?.reasoning || false,
      vision: model?.input.includes('image') || false,
    };
  });
}
