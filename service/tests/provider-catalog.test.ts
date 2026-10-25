import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupProviderPresets, searchProviderGroups } from '../../shared/provider-catalog.js';
import { presets } from '../connections/catalog.js';
import { connectionRuntime } from '../connections/runtime.js';
import { TestSecrets } from './helpers.js';

test('provider-first catalog groups all choices exactly once without treating plans as authentication', () => {
  const groups = groupProviderPresets(presets);
  const ids = groups.flatMap((g) => g.presets.map((p) => p.id));
  assert.deepEqual(ids.slice().sort(), presets.map((p) => p.id).sort());
  assert.equal(new Set(ids).size, presets.length);
  assert.ok(groups.length < presets.length);
  const openai = groups.find((g) => g.id === 'openai')!;
  assert.deepEqual(
    openai.presets.map((p) => p.authMethod),
    ['oauth', 'api_key'],
  );
  const kimi = groups.find((g) => g.id === 'kimi')!;
  assert.ok(kimi.presets.some((p) => p.authMethod === 'oauth'));
  assert.ok(kimi.presets.some((p) => p.authMethod === 'api_key' && p.billing === 'coding-plan'));
  assert.ok(kimi.presets.some((p) => p.authMethod === 'api_key' && p.billing === 'api'));
  const minimax = groups.find((g) => g.id === 'minimax')!;
  assert.ok(minimax.presets.every((p) => p.authMethod === 'api_key'));
});

test('search finds provider aliases, regional plans and account names without hiding sibling choices', () => {
  const groups = groupProviderPresets(presets);
  for (const [query, brand] of [
    [' ChatGPT ', 'openai'],
    ['月之暗面', 'kimi'],
    ['GLM', 'zai'],
    ['token plan', 'qwen'],
  ]) {
    const found = searchProviderGroups(groups, query);
    assert.ok(found.some((g) => g.id === brand));
    assert.deepEqual(
      found.find((g) => g.id === brand),
      groups.find((g) => g.id === brand),
    );
  }
  assert.deepEqual(searchProviderGroups(groups, 'unknown-provider'), []);
  assert.deepEqual(searchProviderGroups(groups, ''), groups);
});

test('every offered OAuth connection resolves to Pi authentication without API-key fallback', async () => {
  for (const preset of presets.filter((p) => p.authMethod === 'oauth')) {
    const { runtime, sdkId } = await connectionRuntime(
      {
        id: `test-${preset.id}`,
        name: preset.name,
        presetId: preset.id,
        authMethod: preset.authMethod,
        billing: preset.billing,
        baseUrl: preset.baseUrl,
        api: preset.api,
        model: '',
        hasKey: false,
        contextWindow: 128000,
        maxTokens: 8192,
      },
      new TestSecrets(),
    );
    const native = runtime.getProvider(sdkId)!;
    assert.equal(typeof native.auth.oauth?.login, 'function');
    assert.equal(typeof native.auth.oauth?.refresh, 'function');
    assert.equal(native.auth.apiKey, undefined);
    assert.equal(await runtime.getAuth(sdkId), undefined);
  }
});
