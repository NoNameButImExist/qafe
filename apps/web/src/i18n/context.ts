import { createContext, useContext } from 'react';
import { bs, type Messages } from './bs';
import { en } from './en';

export const dictionaries = { bs, en } satisfies Record<string, Messages>;
export type Locale = keyof typeof dictionaries;
export const locales = Object.keys(dictionaries) as Locale[];

export interface I18n {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in dictionaries;
}

// Stored choice first, then the browser language, then Bosnian.
export function detectLocale(stored: string | null, languages: readonly string[]): Locale {
  if (isLocale(stored)) return stored;
  for (const lang of languages) {
    const base = lang.toLowerCase().split('-')[0];
    if (base === 'bs' || base === 'hr' || base === 'sr') return 'bs';
    if (isLocale(base)) return base;
  }
  return 'bs';
}
