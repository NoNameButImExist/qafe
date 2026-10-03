import { QR_CELLS, QR_FINDERS, QR_SIZE } from '../qr';

// `hole` is the colour behind the code (the ring inside each finder square).
export function QrFinder({
  x,
  y,
  hole,
  eye,
}: {
  x: number;
  y: number;
  hole: string;
  eye?: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={7} height={7} rx={1.6} fill="currentColor" />
      <rect x={x + 1} y={y + 1} width={5} height={5} rx={1.1} fill={hole} />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.7} fill={eye ?? 'currentColor'} />
    </g>
  );
}

export function QrGlyph({
  className = '',
  hole = 'var(--color-print)',
}: {
  className?: string;
  hole?: string;
}) {
  return (
    <svg viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} className={className} aria-hidden>
      {QR_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} rx={0.2} fill="currentColor" />
      ))}
      {QR_FINDERS.map(([x, y]) => (
        <QrFinder key={`${x}-${y}`} x={x} y={y} hole={hole} />
      ))}
    </svg>
  );
}
