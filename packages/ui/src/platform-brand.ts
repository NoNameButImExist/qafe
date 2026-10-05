import type { ThemeBrand } from '@qafe/contracts';
import { useSyncExternalStore } from 'react';

/**
 * The platform colour theme ("warm", "ice"; see theme.css). The super admin picks it for the
 * whole platform; every app shows it on <html data-brand>. Built so that nothing can break a
 * page: the last known theme comes from localStorage before the first render, the server is
 * asked in the background (with a timeout), and an unknown or missing value is ignored, so the
 * page keeps the colours it already has. Switching is only a change of CSS variables: no
 * reload, no layout change.
 */
const KEY = 'qafe.brand';
/**
 * The same list as THEME_BRANDS in @qafe/contracts, kept here as plain data: importing Zod at
 * runtime would put it into every app that uses @qafe/ui, the guest app too (NFR-01). The
 * check below fails the type check if the two lists ever differ.
 */
const BRANDS = ['warm', 'ice'] as const satisfies readonly ThemeBrand[];
type Missing = Exclude<ThemeBrand, (typeof BRANDS)[number]>;
const allBrandsListed: Missing extends never ? true : false = true;
void allBrandsListed;

const isBrand = (value: unknown): value is ThemeBrand =>
  typeof value === 'string' && (BRANDS as readonly string[]).includes(value);
const DEFAULT_BRAND: ThemeBrand = 'warm';
const listeners = new Set<() => void>();

function stored(): ThemeBrand | null {
  try {
    const value = localStorage.getItem(KEY);
    return isBrand(value) ? value : null;
  } catch {
    return null;
  }
}

/** The theme shown now. */
export function currentBrand(): ThemeBrand {
  const value = document.documentElement.dataset.brand;
  return isBrand(value) ? value : DEFAULT_BRAND;
}

/**
 * Shows a theme. Unknown values are ignored. With `animate` the colours fade over 0.35 s
 * (the admin's switch); at start-up they apply at once.
 */
export function applyBrand(brand: unknown, { animate = false } = {}): void {
  if (!isBrand(brand)) return;
  const root = document.documentElement;
  if (root.dataset.brand !== brand) {
    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('brand-switching');
      window.setTimeout(() => root.classList.remove('brand-switching'), 400);
    }
    root.dataset.brand = brand;
    listeners.forEach((l) => l());
  }
  try {
    localStorage.setItem(KEY, brand);
  } catch {
    // Storage blocked: the next load starts from the default and asks the server again.
  }
}

/** Before the first render: the last known theme, so the page does not flash. */
export function applyStoredBrand(): void {
  applyBrand(stored() ?? DEFAULT_BRAND);
}

async function fetchBrand(url: string): Promise<void> {
  try {
    const res = await fetch(url, {
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { brand?: unknown };
    applyBrand(body.brand, { animate: true });
  } catch {
    // Offline or the API is down: keep the colours already shown.
  }
}

/**
 * Keeps the theme in step with the platform setting: once now, when the window gets focus
 * again and every 5 minutes. Returns the stop function.
 */
export function syncPlatformBrand(url = '/api/platform/theme'): () => void {
  void fetchBrand(url);
  const onFocus = () => void fetchBrand(url);
  window.addEventListener('focus', onFocus);
  const timer = window.setInterval(() => void fetchBrand(url), 5 * 60_000);
  return () => {
    window.removeEventListener('focus', onFocus);
    window.clearInterval(timer);
  };
}

export function useBrand(): ThemeBrand {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, currentBrand);
}
