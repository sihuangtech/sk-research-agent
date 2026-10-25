import { serviceCatalogs } from '../../../shared/translations';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import pt from './locales/pt-BR.json';
import ru from './locales/ru.json';
import zh from './locales/zh-CN.json';
import tw from './locales/zh-TW.json';
import { settingsCatalogs } from './settings';

export const uiCatalogs = {
  'zh-CN': zh,
  'zh-TW': tw,
  en,
  ja,
  ko,
  fr,
  de,
  es,
  'pt-BR': pt,
  ru,
};
export const resources = Object.fromEntries(
  Object.entries(uiCatalogs).map(([locale, translation]) => [
    locale,
    {
      translation,
      service: serviceCatalogs[locale as keyof typeof serviceCatalogs],
      settings: settingsCatalogs[locale as keyof typeof settingsCatalogs],
    },
  ]),
);
