import { motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { venues } from '../data/venues';
import { formatPrice } from '../format';
import { useI18n } from '../i18n/context';
import { ArrowIcon, CheckIcon, HandIcon, PinIcon, ReceiptIcon } from './icons';
import { Phone } from './Phone';
import { Reveal, RevealItem } from './Reveal';
import { SectionHeading } from './SectionHeading';

/** The guest's order screen, stepping through sent → accepted → served. */
function OrderStatus() {
  const { t, locale } = useI18n();
  const g = t.guests.phone;
  const s = t.scene;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [done, setDone] = useState(1);

  useEffect(() => {
    if (!inView) return;
    const id = setTimeout(() => setDone((v) => (v >= g.steps.length + 1 ? 1 : v + 1)), 1500);
    return () => clearTimeout(id);
  }, [done, inView, g.steps.length]);

  const picked = [0, 2, 3];
  const total = picked.reduce((sum, i) => sum + (s.items[i]?.price ?? 0), 0);

  return (
    <div ref={ref} className="mx-auto w-[min(100%,330px)]">
      <Phone label={g.label}>
        <div className="flex h-full flex-col px-[1em] pt-[2.6em] pb-[1.2em]">
          <p className="text-[0.75em] text-muted">
            {s.venue} · {s.table}
          </p>
          <p className="font-display text-[1.5em] leading-tight font-bold">{g.title}</p>

          <div className="mt-[1em] rounded-[1em] bg-paper p-[0.9em] ring-1 ring-line">
            <p className="text-[0.8em] font-semibold">{g.order}</p>
            <ol className="mt-[0.8em] flex flex-col">
              {g.steps.map((label, i) => {
                const reached = i < done;
                return (
                  <li
                    key={label}
                    className="relative flex items-center gap-[0.7em] pb-[0.9em] last:pb-0"
                  >
                    {i < g.steps.length - 1 && (
                      <span className="absolute top-[1.6em] left-[0.75em] h-[calc(100%-1.4em)] w-[0.14em] -translate-x-1/2 bg-line">
                        <motion.span
                          className="block w-full origin-top bg-primary"
                          initial={false}
                          animate={{ height: i + 1 < done ? '100%' : '0%' }}
                          transition={{ duration: 0.5 }}
                        />
                      </span>
                    )}
                    <motion.span
                      className="grid size-[1.5em] shrink-0 place-items-center rounded-full"
                      initial={false}
                      animate={{
                        backgroundColor: reached
                          ? 'var(--color-primary)'
                          : 'var(--color-surface-2)',
                        color: reached ? 'var(--color-on-primary)' : 'var(--color-muted)',
                        scale: i === done - 1 ? [1, 1.25, 1] : 1,
                      }}
                      transition={{ duration: 0.4 }}
                    >
                      <CheckIcon className="size-[0.9em]" strokeWidth={2.6} />
                    </motion.span>
                    <span
                      className={`text-[0.85em] font-semibold transition-colors duration-300 ${reached ? 'text-ink' : 'text-muted'}`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-[0.9em] flex items-center gap-[0.5em] border-t border-line pt-[0.8em] text-[0.75em] font-medium">
              <span className="grid size-[1.9em] place-items-center rounded-full bg-highlight font-display font-bold text-on-highlight">
                {t.product.mock.waiters[0]?.[0]}
              </span>
              {g.waiter}
            </p>
          </div>

          <ul className="mt-[1em] flex flex-col gap-[0.5em]">
            {picked.map((i) => {
              const item = s.items[i];
              return item ? (
                <li key={item.name} className="flex items-center gap-[0.6em] text-[0.8em]">
                  <span
                    className="size-[2.2em] rounded-[0.5em]"
                    style={{ background: `var(--thumb-${i + 1})` }}
                  />
                  <span className="flex-1 font-medium">{item.name}</span>
                  <span className="text-muted">{formatPrice(item.price, s.currency, locale)}</span>
                </li>
              ) : null;
            })}
          </ul>
          <p className="mt-[0.8em] flex justify-between border-t border-line pt-[0.7em] text-[0.85em] font-bold">
            <span>{t.how.art.total}</span>
            <span>{formatPrice(total, s.currency, locale)}</span>
          </p>

          <div className="mt-auto grid grid-cols-2 gap-[0.5em] text-[0.75em] font-semibold">
            <span className="flex items-center justify-center gap-[0.4em] rounded-[0.9em] bg-surface-2 py-[0.8em]">
              <HandIcon className="size-[1.2em]" /> {g.callWaiter}
            </span>
            <span className="flex items-center justify-center gap-[0.4em] rounded-[0.9em] bg-ink py-[0.8em] text-surface">
              <ReceiptIcon className="size-[1.2em]" /> {g.bill}
            </span>
          </div>
        </div>
      </Phone>
    </div>
  );
}

export function ForGuests() {
  const { t } = useI18n();
  return (
    <section
      id="za-goste"
      className="theme-sand relative overflow-hidden pt-16 pb-24 sm:pt-20 sm:pb-32"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <SectionHeading
            index="03"
            eyebrow={t.guests.eyebrow}
            title={t.guests.title}
            subtitle={t.guests.body}
          />
          <ul className="mt-10 flex flex-col">
            {t.guests.points.map((point, i) => (
              <RevealItem
                key={point}
                delay={i * 0.08}
                y={14}
                className="flex items-center gap-4 border-t border-line py-5 text-lg font-medium"
              >
                <span className="font-display text-sm font-bold text-bright">0{i + 1}</span>
                {point}
              </RevealItem>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute top-1/2 left-1/2 -z-10 size-[min(560px,90vw)] -translate-1/2 rounded-full bg-primary/30 blur-[90px]"
          />
          <Reveal y={40}>
            <OrderStatus />
          </Reveal>
        </div>
      </div>

      <div className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
        <Reveal>
          <h3 className="font-display text-3xl font-bold sm:text-4xl">{t.guests.venuesTitle}</h3>
        </Reveal>
        {venues.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((venue, i) => (
              <RevealItem
                key={venue.slug}
                delay={i * 0.05}
                className="flex items-center gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line"
              >
                <PinIcon className="size-6 text-bright" />
                <span>
                  <span className="block font-semibold">{venue.name}</span>
                  <span className="text-sm text-muted">{venue.city}</span>
                </span>
              </RevealItem>
            ))}
          </ul>
        ) : (
          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-col items-start justify-between gap-6 rounded-3xl border-2 border-dashed border-line-strong p-8 sm:flex-row sm:items-center">
              <p className="flex items-center gap-4 text-lg text-muted">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-bright ring-1 ring-line">
                  <PinIcon className="size-6" />
                </span>
                {t.guests.venuesEmpty}
              </p>
              <a
                href="#kontakt"
                className="group inline-flex shrink-0 items-center gap-2 font-semibold text-bright"
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
