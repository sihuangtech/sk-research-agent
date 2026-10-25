import type { ProviderPreset } from './providers.js';

export interface ProviderGroup {
  id: string;
  name: string;
  presets: ProviderPreset[];
}

// Brands own connection choices; authentication and billing remain independent.
const brands: [string, string, string[]][] = [
  ['openai', 'OpenAI', ['chatgpt', 'openai-api']],
  ['kimi', 'Kimi / Moonshot', ['kimi-login', 'kimi-plan', 'moonshot-api', 'moonshot-api-cn']],
  ['zai', 'Z.AI / 智谱', ['zai-plan', 'glm-plan-cn', 'glm-api-cn']],
  ['minimax', 'MiniMax', ['minimax-plan', 'minimax-plan-cn', 'minimax-api']],
  [
    'qwen',
    'Qwen / 阿里云百炼',
    ['qwen-plan', 'qwen-plan-cn', 'qwen-token', 'qwen-token-cn', 'qwen-api-cn'],
  ],
  ['mimo', 'Xiaomi MiMo', ['mimo-plan-cn', 'mimo-api']],
];

export function groupProviderPresets(presets: ProviderPreset[]): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>();
  for (const preset of presets) {
    const brand = brands.find(([, , ids]) => ids.includes(preset.id));
    const id = brand?.[0] || preset.id;
    const group = groups.get(id) || { id, name: brand?.[1] || preset.name, presets: [] };
    group.presets.push(preset);
    groups.set(id, group);
  }
  return [...groups.values()];
}

export function searchProviderGroups(groups: ProviderGroup[], query: string) {
  const term = query.trim().toLocaleLowerCase();
  return groups.filter((group) =>
    [group.name, ...group.presets.map((p) => `${p.id} ${p.name}`)]
      .join(' ')
      .toLocaleLowerCase()
      .includes(term),
  );
}
