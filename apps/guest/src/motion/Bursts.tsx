import { AnimatePresence, m } from 'motion/react';
import { removeBurst, useBursts, type Burst } from './burst';

const COLORS = ['var(--primary)', '#F5B300', '#FF7A59', 'var(--blue-400)'];

export function Bursts() {
  const list = useBursts();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <AnimatePresence>
        {list.map((b) => (
          <Stars key={b.id} burst={b} onDone={() => removeBurst(b.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Stars({ burst: b, onDone }: { burst: Burst; onDone: () => void }) {
  return (
    <>
      {b.particles.map((p, i) => (
        <m.svg
          key={i}
          viewBox="0 0 24 24"
          width={p.size}
          height={p.size}
          className="absolute"
          style={{
            left: b.x - p.size / 2,
            top: b.y - p.size / 2,
            color: COLORS[i % COLORS.length],
          }}
          initial={{ x: 0, y: 0, scale: 0.2, opacity: 1, rotate: 0 }}
          animate={{
            x: p.dx,
            y: p.dy,
            scale: [0.2, 1.15, 0.6],
            opacity: [1, 1, 0],
            rotate: p.rotate,
          }}
          transition={{ duration: b.size === 'lg' ? 1.1 : 0.7, ease: [0.2, 0.8, 0.3, 1] }}
          onAnimationComplete={i === 0 ? onDone : undefined}
        >
          <path
            fill="currentColor"
            d="M12 2.5l2.6 6 6.4.6-4.8 4.3 1.4 6.4L12 16.5l-5.6 3.3 1.4-6.4L3 9.1l6.4-.6z"
          />
        </m.svg>
      ))}
    </>
  );
}
