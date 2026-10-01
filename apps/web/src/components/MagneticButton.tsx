import { motion, useMotionValue, useSpring } from 'motion/react';
import type { PointerEvent, ReactNode } from 'react';

interface MagneticButtonProps {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'dark';
  className?: string;
}

// A link that leans toward the pointer and springs back when it leaves.
export function MagneticButton({
  href,
  children,
  variant = 'primary',
  className = '',
}: MagneticButtonProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 250, damping: 18, mass: 0.4 });

  function onPointerMove(e: PointerEvent<HTMLAnchorElement>) {
    if (e.pointerType !== 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * 0.3);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.4);
  }

  function reset() {
    x.set(0);
    y.set(0);
  }

  const styles = {
    primary: 'bg-primary text-on-primary hover:shadow-glow',
    dark: 'bg-canvas text-fg hover:shadow-glow-dark',
    ghost: 'border border-line bg-fg/5 text-fg backdrop-blur hover:bg-fg/10',
  }[variant];

  return (
    <motion.a
      href={href}
      style={{ x: sx, y: sy }}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      whileTap={{ scale: 0.96 }}
      className={`group relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-full px-7 py-3.5 font-semibold transition-[box-shadow,background-color] duration-300 ${styles} ${className}`}
    >
      {variant !== 'ghost' && (
        <span
          aria-hidden
          className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
      )}
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </motion.a>
  );
}
