import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bs, { type Messages } from './bs';
import en from './en';

export const LANGUAGES = ['bs', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const KEY = 'qafe.admin.lang';

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'bs' || stored === 'en') return stored;
  } catch {
    // Storage blocked: fall through to the default.
  }
  return 'bs';
}

void i18n.use(initReactI18next).init({
  resources: { bs: { translation: bs }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: 'bs',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(KEY, lng);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
});
document.documentElement.lang = i18n.language;

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: Messages };
  }
}

export default i18n;
