import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createInstance } from 'i18next';
import { isLocale, resolveLocale, supportedLocales } from '../../shared/locale.js';
import en from '../../frontend/src/i18n/locales/en.json' with { type: 'json' };
import zh from '../../frontend/src/i18n/locales/zh-CN.json' with { type: 'json' };
import serviceEn from '../../shared/locales/en.json' with { type: 'json' };
import { serviceCatalogs } from '../../shared/translations.js';
import responseLanguages from '../agent/response-languages.json' with { type: 'json' };
import { settingsCatalogs } from '../../frontend/src/i18n/settings.js';
import { fixture, modelFixture, provider, waitFor } from './helpers.js';

test('Every registered language has complete UI, service and response resources', async () => {
  assert.equal(supportedLocales.length, 10);
  assert.deepEqual(Object.keys(serviceCatalogs).sort(), [...supportedLocales].sort());
  assert.deepEqual(Object.keys(responseLanguages).sort(), [...supportedLocales].sort());
  for (const locale of supportedLocales) {
    const ui = JSON.parse(
      await readFile(
        new URL(`../../frontend/src/i18n/locales/${locale}.json`, import.meta.url),
        'utf8',
      ),
    );
    for (const [left, right] of [
      [en, ui],
      [serviceEn, serviceCatalogs[locale]],
      [settingsCatalogs.en, settingsCatalogs[locale]],
    ]) {
      assert.deepEqual(Object.keys(left).sort(), Object.keys(right).sort());
      for (const key of Object.keys(left)) {
        const a = (left as Record<string, string>)[key];
        const b = (right as Record<string, string>)[key];
        assert.ok(a.trim() && b.trim(), `${locale}: ${key}`);
        assert.deepEqual(
          a.match(/{{\w+}}/g)?.sort(),
          b.match(/{{\w+}}/g)?.sort(),
          `${locale}: ${key}`,
        );
      }
    }
  }
  const i18n = createInstance();
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    fallbackLng: false,
    interpolation: { escapeValue: false },
    resources: { en: { translation: en }, 'zh-CN': { translation: zh } },
  });
  assert.equal(i18n.t('currentProjectPath', { path: '/research' }), 'Current project · /research');
  assert.equal(i18n.t('status.running'), 'Running');
  await i18n.changeLanguage('zh-CN');
  assert.equal(i18n.t('status.running'), '执行中');
  assert.equal(resolveLocale('en-US,en;q=0.9'), 'en');
  assert.equal(resolveLocale('zh-Hans-CN,en;q=0.8'), 'zh-CN');
  assert.equal(resolveLocale('zh-Hant-HK,en;q=0.8'), 'zh-TW');
  assert.equal(resolveLocale('zh-TW'), 'zh-TW');
  assert.equal(resolveLocale('ja-JP'), 'ja');
  assert.equal(resolveLocale('ko-KR'), 'ko');
  assert.equal(resolveLocale('fr-CA'), 'fr');
  assert.equal(resolveLocale('de-AT'), 'de');
  assert.equal(resolveLocale('es-MX'), 'es');
  assert.equal(resolveLocale('pt-PT'), 'pt-BR');
  assert.equal(resolveLocale('ru-RU'), 'ru');
  assert.equal(resolveLocale('en;q=0.1,ja;q=0.9'), 'ja');
  assert.equal(resolveLocale('fr;q=0,en;q=0.5'), 'en');
  assert.equal(resolveLocale('it-IT,fr;q=0.8'), 'fr');
  assert.equal(resolveLocale('it-IT'), 'zh-CN');
  assert.equal(isLocale('pt-BR'), true);
  assert.equal(isLocale('pt-PT'), false);
});

test('API errors follow each request language without affecting parallel requests', async () => {
  const f = await fixture();
  try {
    const responses = await Promise.all(
      supportedLocales.map((locale) =>
        f.server.app.inject({ url: '/api/overview', headers: { 'accept-language': locale } }),
      ),
    );
    for (const [index, response] of responses.entries()) {
      assert.equal(response.statusCode, 401);
      assert.equal(response.json().code, 'unauthenticated');
      assert.equal(response.json().error, serviceCatalogs[supportedLocales[index]].unauthenticated);
    }
    const invalid = await f.server.app.inject({
      url: '/api/providers',
      method: 'POST',
      headers: { authorization: `Bearer ${f.token}`, 'accept-language': 'en' },
      payload: {},
    });
    assert.equal(invalid.json().error, serviceEn.invalidRequest);
    assert.ok(invalid.json().issues.length);
    assert.ok(!/\p{Script=Han}/u.test(JSON.stringify(invalid.json())));
  } finally {
    await f.close();
  }
});

test('Agent turns use the selected response language and preserve user memory verbatim', async () => {
  const f = await fixture();
  const model = await modelFixture();
  try {
    const p = await f.call('/providers', 'POST', provider(model.baseUrl));
    await f.call('/memories', 'POST', { content: '用户的原始科研偏好', source: 'user' });
    for (const locale of ['en', 'ja', 'zh-TW'] as const) {
      const requestIndex = model.requests.length;
      const session = await f.call('/sessions', 'POST', {
        projectId: f.project.id,
        providerId: p.id,
      });
      assert.equal(session.title, '');
      const result = await f.server.app.inject({
        url: `/api/sessions/${session.id}/messages`,
        method: 'POST',
        headers: { authorization: `Bearer ${f.token}`, 'accept-language': locale },
        payload: { text: 'Write the result file.' },
      });
      assert.equal(result.statusCode, 200);
      await waitFor(
        () => f.call(`/sessions/${session.id}`),
        (s) => s.conversation.status === 'idle',
      );
      const request = JSON.stringify(model.requests[requestIndex]);
      assert.ok(request.includes(responseLanguages[locale]), locale);
      assert.ok(request.includes('用户的原始科研偏好'));
      if (locale !== 'en') assert.ok(!request.includes(responseLanguages.en));
    }
  } finally {
    await f.close();
    await model.close();
  }
});
