import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { venues } from '../data/venues';
import { useI18n } from '../i18n/context';
import { ArrowIcon, CheckIcon, CupIcon, PinIcon } from './icons';
import { QrGlyph } from './QrGlyph';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

export function ForGuests() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const rotateY = useTransform(scrollYProgress, [0, 1], [-28, 28]);
  const rotateX = useTransform(scrollYProgress, [0, 1], [12, -12]);
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section id="za-goste" ref={ref} className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute top-1/3 right-[-10%] -z-10 size-[600px] rounded-full bg-accent/15 blur-[120px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            eyebrow={t.guests.eyebrow}
            title={t.guests.title}
            subtitle={t.guests.body}
          />
          <ul className="mt-10 flex flex-col gap-4">
            {t.guests.points.map((point, i) => (
              <Reveal key={point} delay={i * 0.1} y={16}>
                <li className="flex items-center gap-4 text-lg">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                    <CheckIcon className="size-4" />
                  </span>
                  {point}
                </li>
              </Reveal>
            ))}
          </ul>
        </div>

        {/* Table tent with the QR code, turning as the page scrolls. */}
        <div className="flex justify-center [perspective:1200px]">
          <motion.div
            style={{ rotateY, rotateX, y }}
            className="relative w-[min(100%,340px)] rounded-[2rem] bg-paper p-8 text-on-paper shadow-tent"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-2xl font-extrabold">qafe</span>
              <span className="rounded-full bg-canvas px-3 py-1 text-sm font-semibold text-fg">
                {t.demo.table}
              </span>
            </div>
            <QrGlyph className="mt-6 w-full" />
            <p className="mt-6 text-center font-display text-2xl leading-tight font-bold">
              {t.how.steps[0]?.title} · {t.how.steps[1]?.title}
            </p>
            <motion.span
              aria-hidden
              className="absolute -top-4 -right-4 grid size-16 place-items-center rounded-full bg-primary text-on-primary shadow-lg"
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            >
              <CupIcon className="size-7" />
            </motion.span>
          </motion.div>
        </div>
      </div>

      <div className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
        <Reveal>
          <h3 className="font-display text-3xl font-bold sm:text-4xl">{t.guests.venuesTitle}</h3>
        </Reveal>
        {venues.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((venue, i) => (
              <Reveal key={venue.slug} delay={i * 0.05}>
                <li className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
                  <PinIcon className="size-6 text-primary" />
                  <span>
                    <span className="block font-semibold">{venue.name}</span>
                    <span className="text-sm text-muted">{venue.city}</span>
                  </span>
                </li>
              </Reveal>
            ))}
          </ul>
        ) : (
          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-col items-start justify-between gap-6 rounded-3xl border border-dashed border-fg/20 p-8 sm:flex-row sm:items-center">
              <p className="flex items-center gap-4 text-lg text-muted">
                <motion.span
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <PinIcon className="size-6" />
                </motion.span>
                {t.guests.venuesEmpty}
              </p>
              <a
                href="#kontakt"
                className="group inline-flex shrink-0 items-center gap-2 font-semibold text-primary"
              >
                {t.guests.venuesOwnerCta}
                <ArrowIcon className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
