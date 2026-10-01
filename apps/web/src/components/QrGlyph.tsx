// Decorative QR-like pattern: fixed finder squares plus a deterministic pseudo-random grid.
const SIZE = 21;

function cells(): [number, number][] {
  const out: [number, number][] = [];
  let seed = 7;
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > SIZE - 9 && y < 8) || (x < 8 && y > SIZE - 9);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      seed = (seed * 16807) % 2147483647;
      if (!inFinder(x, y) && seed % 100 < 48) out.push([x, y]);
    }
  }
  return out;
}

const CELLS = cells();

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={7} height={7} rx={1.4} fill="currentColor" />
      <rect x={x + 1} y={y + 1} width={5} height={5} rx={1} fill="var(--color-paper)" />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.6} fill="currentColor" />
    </g>
  );
}

export function QrGlyph({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      aria-hidden
      shapeRendering="crispEdges"
    >
      {CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
      <Finder x={0} y={0} />
      <Finder x={SIZE - 7} y={0} />
      <Finder x={0} y={SIZE - 7} />
    </svg>
  );
}
