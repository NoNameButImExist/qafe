import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react';
import { useRef, type PointerEvent } from 'react';
import { useI18n } from '../i18n/context';
import { HeroDemo } from './HeroDemo';
import { ArrowIcon, CheckIcon } from './icons';
import { MagneticButton } from './MagneticButton';

const EASE = [0.22, 1, 0.36, 1] as const;

function Blob({ className, delay }: { className: string; delay: number }) {
  return (
    <motion.div
      aria-hidden
      className={`absolute rounded-full blur-[110px] ${className}`}
      animate={{ x: [0, 60, -40, 0], y: [0, -50, 30, 0], scale: [1, 1.15, 0.9, 1] }}
      transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

export function Hero() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const demoY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  // Pointer tilt for the demo phones.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-10, 10]), {
    stiffness: 120,
    damping: 20,
  });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [8, -8]), {
    stiffness: 120,
    damping: 20,
  });

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width - 0.5);
    py.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  const titleA = t.hero.titleA.split(' ');
  const titleB = t.hero.titleB.split(' ');

  return (
    <section
      id="top"
      ref={ref}
      onPointerMove={onPointerMove}
      className="relative isolate overflow-hidden pt-28 pb-20 sm:pt-36 lg:min-h-dvh"
    >
      <div className="absolute inset-0 -z-10">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        <Blob className="top-[-10%] left-[-10%] size-[520px] bg-accent/30" delay={0} />
        <Blob className="top-[20%] right-[-15%] size-[600px] bg-primary/25" delay={3} />
        <Blob className="bottom-[-20%] left-[30%] size-[480px] bg-glow/20" delay={6} />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
        <motion.div style={{ y: contentY, opacity: contentOpacity }}>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-line bg-fg/5 px-4 py-1.5 text-sm text-muted backdrop-blur"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            {t.hero.eyebrow}
          </motion.p>

          <h1 className="font-display text-[clamp(3rem,9vw,6.75rem)] leading-[0.92] font-extrabold">
            <span className="block">
              {titleA.map((word, i) => (
                <span
                  key={`a-${word}-${i}`}
                  className="mr-[0.22em] inline-block overflow-hidden pb-[0.06em] align-bottom"
                >
                  <motion.span
                    className="inline-block"
                    initial={{ y: '110%', rotate: 6 }}
                    animate={{ y: 0, rotate: 0 }}
                    transition={{ duration: 0.9, delay: 0.3 + i * 0.08, ease: EASE }}
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
            </span>
            <span className="relative block">
              {titleB.map((word, i) => (
                <span
                  key={`b-${word}-${i}`}
                  className="mr-[0.22em] inline-block overflow-hidden pb-[0.1em] align-bottom"
                >
                  <motion.span
                    className="text-gradient inline-block"
                    initial={{ y: '110%', rotate: 6 }}
                    animate={{ y: 0, rotate: 0 }}
                    transition={{
                      duration: 0.9,
                      delay: 0.3 + (titleA.length + i) * 0.08,
                      ease: EASE,
                    }}
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
              <svg
                viewBox="0 0 400 20"
                preserveAspectRatio="none"
                className="absolute -bottom-2 left-0 h-3 w-[min(100%,9.5em)] sm:h-4"
                aria-hidden
              >
                <motion.path
                  d="M2 14 C 80 2, 160 2, 220 10 S 340 18, 398 6"
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.1, delay: 1.2, ease: 'easeInOut' }}
                />
              </svg>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9, ease: EASE }}
            className="mt-10 max-w-xl text-lg text-pretty text-muted sm:text-xl"
          >
            {t.hero.subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.05, ease: EASE }}
            className="mt-10 flex flex-wrap gap-3"
          >
            <MagneticButton href="#kontakt">
              {t.hero.ctaPrimary}
              <ArrowIcon className="size-4 transition-transform group-hover:translate-x-1" />
            </MagneticButton>
            <MagneticButton href="#kako-radi" variant="ghost">
              {t.hero.ctaSecondary}
            </MagneticButton>
          </motion.div>

          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted">
            {t.hero.badges.map((badge, i) => (
              <motion.li
                key={badge}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.25 + i * 0.1 }}
                className="flex items-center gap-2"
              >
                <span className="grid size-5 place-items-center rounded-full bg-success/15 text-success">
                  <CheckIcon className="size-3" />
                </span>
                {badge}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <motion.div style={{ y: demoY, rotateX, rotateY, transformPerspective: 1200 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.5, ease: EASE }}
          >
            <HeroDemo />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
