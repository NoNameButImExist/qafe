import { motion, type HTMLMotionProps } from 'motion/react';

interface RevealOptions {
  delay?: number;
  y?: number;
}

function revealProps(delay: number, y: number) {
  return {
    initial: { opacity: 0, y },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] },
  } as const;
}

// Fades and lifts its children in the first time they scroll into view.
export function Reveal({
  delay = 0,
  y = 32,
  children,
  ...props
}: RevealOptions & HTMLMotionProps<'div'>) {
  return (
    <motion.div {...revealProps(delay, y)} {...props}>
      {children}
    </motion.div>
  );
}

// The same as a list item, so lists keep valid markup.
export function RevealItem({
  delay = 0,
  y = 32,
  children,
  ...props
}: RevealOptions & HTMLMotionProps<'li'>) {
  return (
    <motion.li {...revealProps(delay, y)} {...props}>
      {children}
    </motion.li>
  );
}
