import { useCallback, useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'qafe.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();
/** Fallback when localStorage is blocked: the choice lasts until reload. */
let memory: ThemePreference = 'system';

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return memory;
  }
}

/** Applies the class on <html>. Called before the first render to avoid a flash. */
export function applyTheme(preference = read()): void {
  const dark = preference === 'dark' || (preference === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
}

media.addEventListener('change', () => {
  applyTheme();
  listeners.forEach((l) => l());
});

export function useTheme() {
  const preference = useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, read);
  const isDark = preference === 'dark' || (preference === 'system' && media.matches);

  const setPreference = useCallback((next: ThemePreference) => {
    memory = next;
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
    applyTheme(next);
    listeners.forEach((l) => l());
  }, []);

  return {
    preference,
    isDark,
    setPreference,
    toggle: () => setPreference(isDark ? 'light' : 'dark'),
  };
}
