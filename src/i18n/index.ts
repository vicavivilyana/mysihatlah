import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import ms from './ms.json';
import zh from './zh.json';

/** Display order in the toggle: English first (and the app default). */
export const SUPPORTED_LANGS = ['en', 'ms', 'zh'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  ms: 'Bahasa Malaysia',
  zh: '中文',
};

/** Short labels for the compact toggle. */
export const LANG_SHORT: Record<Lang, string> = { en: 'EN', ms: 'BM', zh: '中文' };

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ms: { translation: ms },
      zh: { translation: zh },
    },
    lng: undefined, // resolved by the detector below
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      // localStorage only — the app always OPENS IN ENGLISH unless the user
      // has explicitly chosen a language before (no browser-locale guessing).
      order: ['localStorage'],
      lookupLocalStorage: 'healthgo.lang',
      caches: ['localStorage'],
    },
  });

export function setLanguage(lang: Lang) {
  void i18n.changeLanguage(lang);
}

export default i18n;
