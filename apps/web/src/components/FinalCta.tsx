import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { config } from '../config';
import { useI18n } from '../i18n/context';
import { ArrowIcon } from './icons';
import { MagneticButton } from './MagneticButton';

export function FinalCta() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.85, 1]);
  const radius = useTransform(scrollYProgress, [0, 1], [120, 40]);

  const mailto = `mailto:${config.contactEmail}?subject=${encodeURIComponent(t.cta.mailSubject)}`;

  return (
    <section id="kontakt" ref={ref} className="px-3 py-12 sm:px-6">
      <motion.div
        style={{ scale, borderRadius: radius }}
        className="relative mx-auto max-w-7xl overflow-hidden bg-primary px-6 py-24 text-center text-on-primary sm:py-32"
      >
        <motion.div
          aria-hidden
          className="absolute -inset-1/2 opacity-60"
          style={{
            background:
              'conic-gradient(from 0deg, transparent, var(--color-accent), transparent 30%, var(--color-accent-2), transparent 60%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
        <div
          className="absolute inset-[2px] rounded-[inherit] bg-primary/80 backdrop-blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <motion.h2
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-4xl font-display text-[clamp(2.75rem,8vw,6rem)] leading-[0.95] font-extrabold text-balance"
          >
            {t.cta.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mx-auto mt-6 max-w-xl text-lg text-on-primary/75 sm:text-xl"
          >
            {t.cta.body}
          </motion.p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <MagneticButton href={mailto} variant="dark">
              {t.cta.primary}
              <ArrowIcon className="size-4 transition-transform group-hover:translate-x-1" />
            </MagneticButton>
            <a
              href={`mailto:${config.contactEmail}`}
              className="font-semibold underline decoration-2 underline-offset-4 hover:decoration-accent"
            >
              {t.cta.secondary}: {config.contactEmail}
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
