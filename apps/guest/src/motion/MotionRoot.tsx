import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

const loadFeatures = () => import('./features').then((r) => r.default);

/**
 * Animations with `m.*` components only (`strict`): the animation engine loads as a separate
 * chunk after the first paint, keeping the app light (NFR-01). Phones set to reduce motion get
 * fades instead of movement.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
