import { useSyncExternalStore } from 'react';

/**
 * Star burst: a handful of stars fly out from a point and fade. Fired when something lands
 * in the cart and when an order is sent; purely decorative (aria-hidden).
 */
interface Particle {
  dx: number;
  dy: number;
  size: number;
  rotate: number;
}

export interface Burst {
  id: number;
  x: number;
  y: number;
  size: 'sm' | 'lg';
  particles: Particle[];
}

/** Evenly spread, with a little randomness so no two bursts look the same. */
function particles(size: Burst['size']): Particle[] {
  const count = size === 'lg' ? 18 : 9;
  const reach = size === 'lg' ? 150 : 70;
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const distance = reach * (0.6 + Math.random() * 0.5);
    return {
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance + (size === 'lg' ? 40 : 10),
      size: (size === 'lg' ? 14 : 10) + Math.random() * 8,
      rotate: Math.random() > 0.5 ? 140 : -140,
    };
  });
}

let bursts: Burst[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function burst(at: { x: number; y: number } | Element, size: Burst['size'] = 'sm'): void {
  const point =
    at instanceof Element
      ? (() => {
          const r = at.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })()
      : at;
  bursts = [...bursts, { id: nextId++, ...point, size, particles: particles(size) }];
  emit();
}

export const removeBurst = (id: number) => {
  bursts = bursts.filter((b) => b.id !== id);
  emit();
};

export function useBursts(): Burst[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => bursts,
  );
}
