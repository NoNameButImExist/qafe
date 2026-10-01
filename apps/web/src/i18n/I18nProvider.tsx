import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectLocale, dictionaries, I18nContext, type Locale } from './context';

const STORAGE_KEY = 'qafe:web:locale';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    detectLocale(readStored(), navigator.languages),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = dictionaries[locale].meta.title;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      t: dictionaries[locale],
      setLocale: (next: Locale) => {
        setLocaleState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Private mode or blocked storage: the choice just is not remembered.
        }
      },
    }),
    [locale],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}
