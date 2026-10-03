import { motion } from 'motion/react';
import { config } from '../config';
import { useI18n } from '../i18n/context';
import { Button } from './Button';
import { QR_CELLS, QR_FINDERS, QR_SIZE } from '../qr';
import { QrFinder } from './QrGlyph';

const CENTER = (QR_SIZE - 1) / 2;
const MAX_DIST = Math.hypot(CENTER, CENTER);

// The code assembles from the middle outwards when it scrolls into view.
function AssemblingQr() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[380px] rounded-[2rem] bg-print p-7 text-on-print shadow-float">
      <svg viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} className="w-full" aria-hidden>
        {QR_CELLS.map(([x, y]) => (
          <motion.rect
            key={`${x}-${y}`}
            x={x + 0.08}
            y={y + 0.08}
            width={0.84}
            height={0.84}
            rx={0.22}
            fill="currentColor"
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.2 + (Math.hypot(x - CENTER, y - CENTER) / MAX_DIST) * 0.9,
              type: 'spring',
              stiffness: 400,
              damping: 18,
            }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        ))}
        {QR_FINDERS.map(([x, y], i) => (
          <motion.g
            key={`${x}-${y}`}
            initial={{ scale: 0.4, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 1.1 + i * 0.1, type: 'spring', stiffness: 300, damping: 14 }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            <QrFinder x={x} y={y} hole="var(--color-print)" eye="var(--color-primary)" />
          </motion.g>
        ))}
      </svg>
      <motion.span
        aria-hidden
        className="absolute inset-x-5 h-1 rounded-full bg-highlight shadow-scan"
        initial={{ top: '8%', opacity: 0 }}
        whileInView={{ top: ['8%', '92%', '8%'], opacity: 1 }}
        transition={{ duration: 3, delay: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

export function FinalCta() {
  const { t } = useI18n();
  const mailto = `mailto:${config.contactEmail}?subject=${encodeURIComponent(t.cta.mailSubject)}`;

  return (
    <section id="kontakt" className="px-3 pb-6 sm:px-6">
      <div className="relative isolate mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-linear-to-br from-navy-soft via-navy to-navy-deep px-6 py-16 text-on-navy ring-1 ring-line-strong sm:px-12 sm:py-24 lg:px-16">
        <div aria-hidden className="bg-dots-navy absolute inset-0 -z-10 opacity-70" />
        <div
          aria-hidden
          className="absolute bottom-[-30%] left-[-10%] -z-10 size-[600px] rounded-full bg-primary/35 blur-[140px]"
        />
        <div className="grid items-center gap-14 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <motion.p
              className="font-display text-lg font-semibold text-highlight"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              {t.cta.eyebrow}
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 font-display text-[clamp(2.8rem,7vw,5.5rem)] leading-[0.98] font-bold text-balance"
            >
              {t.cta.title}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="mt-6 max-w-lg text-lg text-on-navy-muted sm:text-xl"
            >
              {t.cta.body}
            </motion.p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button href={mailto} arrow>
                {t.cta.primary}
              </Button>
              <Button href={`mailto:${config.contactEmail}`} variant="ghost-navy">
                {config.contactEmail}
              </Button>
            </div>
          </div>
          <AssemblingQr />
        </div>
      </div>
    </section>
  );
}
