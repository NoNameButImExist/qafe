import { animate, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useI18n } from '../i18n/context';
import { BoltIcon, ClockIcon, CopyIcon, PhoneIcon } from './icons';

// Counts up to the value; a zero counts down from 12 instead, which reads better.
function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const from = value === 0 ? 12 : 0;
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(from, value, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, from, value]);

  return <span ref={ref}>{display}</span>;
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  speed: BoltIcon,
  duplicates: CopyIcon,
  start: ClockIcon,
  devices: PhoneIcon,
};

export function Stats() {
  const { t } = useI18n();
  return (
    <section className="theme-sand relative isolate px-4 pt-20 pb-6 sm:px-6 sm:pt-28 sm:pb-8">
      <dl className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {t.stats.items.map((item, i) => {
          const Icon = ICONS[item.key] ?? BoltIcon;
          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -4 }}
              className="group glass relative flex flex-col overflow-hidden rounded-3xl p-7"
            >
              <div
                aria-hidden
                className="absolute -top-16 -right-16 size-40 rounded-full bg-primary/0 blur-[50px] transition-colors duration-500 group-hover:bg-primary/30"
              />
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-bright ring-1 ring-primary/30">
                <Icon className="size-5" />
              </span>
              <dd className="order-2 mt-8">
                <span className="block text-sm font-medium tracking-wide text-muted uppercase">
                  {item.prefix}
                </span>
                <span className="text-gradient mt-1 block font-display text-6xl leading-none font-bold tabular-nums">
                  <Counter value={item.value} />
                  {item.suffix}
                </span>
              </dd>
              <dt className="order-3 mt-4 mb-7 text-muted">{item.label}</dt>
              <motion.span
                aria-hidden
                className="order-4 mt-auto block h-0.5 origin-left rounded-full bg-linear-to-r from-primary to-highlight"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.1, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              />
            </motion.div>
          );
        })}
      </dl>
    </section>
  );
}
