/**
 * The platform colour theme on the landing page (the super admin switches it in the admin
 * panel; admin, panel and staff follow the same setting). Same rules as @qafe/ui: the last
 * known theme from localStorage before the first render, the server asked in the background
 * with a timeout, and anything unknown or unreachable leaves the page as it is.
 * "warm" is the page's own teal and sand (no attribute needed), "ice" switches the tokens
 * in index.css.
 */
const BRANDS = ['warm', 'ice'] as const;
type Brand = (typeof BRANDS)[number];
const KEY = 'qafe.brand';
/** Browser bar colour per theme (the dark sections' colour). */
const THEME_COLOR: Record<Brand, string> = { warm: '#004643', ice: '#082c47' };

const isBrand = (value: unknown): value is Brand =>
  typeof value === 'string' && (BRANDS as readonly string[]).includes(value);

export function applyBrand(brand: unknown, animate = false): void {
  if (!isBrand(brand)) return;
  const root = document.documentElement;
  if (root.dataset.brand !== brand) {
    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('brand-switching');
      window.setTimeout(() => root.classList.remove('brand-switching'), 400);
    }
    root.dataset.brand = brand;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[brand]);
  }
  try {
    localStorage.setItem(KEY, brand);
  } catch {
    // Storage blocked: the next visit starts from the default and asks again.
  }
}

export function applyStoredBrand(): void {
  try {
    applyBrand(localStorage.getItem(KEY));
  } catch {
    // Storage blocked: the default colours stay.
  }
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
    applyBrand(body.brand, true);
  } catch {
    // No API (e.g. the page served on its own): keep the colours already shown.
  }
}

/** Once now, when the tab gets focus again and every 5 minutes. */
export function syncPlatformBrand(url = '/api/platform/theme'): void {
  void fetchBrand(url);
  window.addEventListener('focus', () => void fetchBrand(url));
  window.setInterval(() => void fetchBrand(url), 5 * 60_000);
}
