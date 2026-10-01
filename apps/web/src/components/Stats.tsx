import { animate, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { Reveal } from './Reveal';

// Counts up to the value; a zero counts down from 12 instead, which reads better.
function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });
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

export function Stats() {
  const { t } = useI18n();
  return (
    <section className="relative border-y border-line bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <h2 className="max-w-2xl font-display text-4xl font-bold text-balance sm:text-5xl">
            {t.stats.title}
          </h2>
        </Reveal>
        <dl className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {t.stats.items.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="group relative flex flex-col justify-between gap-10 overflow-hidden bg-surface p-8"
            >
              <div className="absolute inset-0 bg-linear-to-br from-primary/0 to-accent/0 transition-colors duration-500 group-hover:from-primary/10 group-hover:to-accent/5" />
              <dt className="relative order-2 text-muted">{item.label}</dt>
              <dd className="relative order-1 font-display text-6xl font-extrabold tabular-nums xl:text-7xl">
                <span className="text-primary">{item.prefix}</span>
                <Counter value={item.value} />
                <span className="text-primary">{item.suffix}</span>
              </dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}
