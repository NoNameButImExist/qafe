// Decorative QR-like pattern: fixed finder squares plus a deterministic pseudo-random grid.
export const QR_SIZE = 21;

function cells(): [number, number][] {
  const out: [number, number][] = [];
  let seed = 7;
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > QR_SIZE - 9 && y < 8) || (x < 8 && y > QR_SIZE - 9);
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      seed = (seed * 16807) % 2147483647;
      if (!inFinder(x, y) && seed % 100 < 48) out.push([x, y]);
    }
  }
  return out;
}

export const QR_CELLS = cells();
export const QR_FINDERS: [number, number][] = [
  [0, 0],
  [QR_SIZE - 7, 0],
  [0, QR_SIZE - 7],
];
