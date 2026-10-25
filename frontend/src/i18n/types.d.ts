import 'i18next';
import type service from '../../../shared/locales/zh-CN.json';
import type zh from './locales/zh-CN.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    keySeparator: false;
    resources: {
      translation: typeof zh;
      service: typeof service;
      settings: typeof import('./settings/zh-CN.json');
    };
  }
}
