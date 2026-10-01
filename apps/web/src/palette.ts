// Palette proposals while the brand colours are being decided (see index.css).
// Remove this file, the switcher and the [data-palette] blocks once one is chosen.
export const palettes = ['espresso', 'crema'] as const;
export type Palette = (typeof palettes)[number];

const STORAGE_KEY = 'qafe:web:palette';

export function isPalette(value: unknown): value is Palette {
  return palettes.includes(value as Palette);
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// ?palette=... wins, then the last choice made in the switcher, then the default.
export function initialPalette(): Palette {
  const fromUrl = new URLSearchParams(location.search).get('palette');
  if (isPalette(fromUrl)) return fromUrl;
  const stored = readStored();
  return isPalette(stored) ? stored : 'espresso';
}

// Shown in dev, or when someone opens a shared ?palette=... link.
export const showPaletteSwitcher =
  import.meta.env.DEV || new URLSearchParams(location.search).has('palette');

export function applyPalette(palette: Palette) {
  const root = document.documentElement;
  if (palette === 'espresso') delete root.dataset.palette;
  else root.dataset.palette = palette;
}

// Called from the switcher only: remembers the choice and makes the URL shareable.
export function choosePalette(palette: Palette) {
  applyPalette(palette);
  try {
    localStorage.setItem(STORAGE_KEY, palette);
  } catch {
    // Storage blocked: the choice just is not remembered.
  }
  const url = new URL(location.href);
  url.searchParams.set('palette', palette);
  history.replaceState(null, '', url);
}
