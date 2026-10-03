import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { useI18n } from '../i18n/context';
import { Button } from './Button';
import { HeroScene } from './HeroScene';
import { CheckIcon } from './icons';

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  const lines = t.hero.title;
  const last = lines.length - 1;

  return (
    <section
      id="top"
      ref={ref}
      className="relative isolate overflow-hidden pt-28 pb-16 sm:pt-32 lg:flex lg:min-h-dvh lg:items-center lg:pb-24"
    >
      <div
        aria-hidden
        className="absolute top-[-10%] right-[-10%] -z-10 size-[900px] rounded-full bg-bright/15 blur-[160px]"
      />
      <div
        aria-hidden
        className="absolute bottom-[-30%] left-[-20%] -z-10 size-[700px] rounded-full bg-navy-deep/40 blur-[160px]"
      />
      <div
        aria-hidden
        className="bg-dots absolute inset-0 -z-20 [mask-image:radial-gradient(ellipse_70%_60%_at_70%_40%,black,transparent)]"
      />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-6">
        <motion.div style={{ y: textY }}>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-medium text-muted"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            {t.hero.eyebrow}
          </motion.p>

          <h1 className="font-display text-[clamp(3.4rem,10vw,7.5rem)] leading-[0.94] font-bold">
            {lines.map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.06em]">
                <motion.span
                  className={`inline-block ${i === last ? 'text-gradient' : ''}`}
                  initial={{ y: '105%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.12, ease: EASE }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
            className="mt-8 max-w-xl text-lg text-pretty text-muted sm:text-xl"
          >
            {t.hero.subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.85, ease: EASE }}
            className="mt-9 flex flex-wrap gap-3"
          >
            <Button href="#kontakt" arrow>
              {t.hero.ctaPrimary}
            </Button>
            <Button href="#kako-radi" variant="outline">
              {t.hero.ctaSecondary}
            </Button>
          </motion.div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-muted">
            {t.hero.badges.map((badge, i) => (
              <motion.li
                key={badge}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.05 + i * 0.08 }}
                className="flex items-center gap-2"
              >
                <span className="grid size-5 place-items-center rounded-full bg-primary/20 text-bright">
                  <CheckIcon className="size-3" strokeWidth={2.6} />
                </span>
                {badge}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <motion.div style={{ y: sceneY }}>
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.3, ease: EASE }}
          >
            <HeroScene />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
