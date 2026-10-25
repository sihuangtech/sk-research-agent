import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import packageInfo from '../../package.json' with { type: 'json' };
import frontend from '../../frontend/package.json' with { type: 'json' };
import tauri from '../../src-tauri/tauri.conf.json' with { type: 'json' };
import { fixture } from './helpers.js';

test('desktop, frontend, service and package versions agree', async () => {
  assert.equal(tauri.productName, 'Second Moon');
  assert.equal(tauri.identifier, 'cn.skstudio.agenticresearch');
  assert.equal(frontend.version, packageInfo.version);
  assert.equal(tauri.version, packageInfo.version);
  const cargo = await readFile(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  assert.equal(cargo.match(/^version = "([^"]+)"/m)?.[1], packageInfo.version);
  const f = await fixture();
  try {
    assert.equal((await f.call('/health')).version, packageInfo.version);
  } finally {
    await f.close();
  }
});
