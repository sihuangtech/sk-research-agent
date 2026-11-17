import type { FastifyRequest } from 'fastify';
import { createInstance } from 'i18next';
import { z } from 'zod';
import { type Locale, resolveLocale } from '../shared/locale.js';
import zh from '../shared/locales/zh-CN.json' with { type: 'json' };
import { serviceCatalogs } from '../shared/translations.js';

export type MessageCode = keyof typeof zh;
const translations = createInstance();
void translations.init({
  initAsync: false,
  fallbackLng: false,
  resources: Object.fromEntries(
    Object.entries(serviceCatalogs).map(([locale, translation]) => [locale, { translation }]),
  ),
  interpolation: { escapeValue: false },
});
export function message(
  code: MessageCode,
  locale: Locale = 'zh-CN',
  values: Record<string, string> = {},
) {
  return String(translations.t(code, { lng: locale, ...values }));
}
export function requestLocale(request: FastifyRequest) {
  return resolveLocale(request.headers['accept-language']);
}
export class DomainError extends Error {
  constructor(
    readonly code: MessageCode,
    readonly statusCode = 400,
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
export function errorPayload(error: unknown, locale: Locale) {
  if (error instanceof DomainError) return { error: message(error.code, locale), code: error.code };
  if (error instanceof z.ZodError)
    return {
      error: message('invalidRequest', locale),
      code: 'invalidRequest',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: Object.hasOwn(zh, issue.message)
          ? message(issue.message as MessageCode, locale)
          : message('invalidRequest', locale),
      })),
    };
  return { error: error instanceof Error ? error.message : String(error) };
}
