import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { useI18n } from '../i18n/context';
import { CheckIcon, CloseIcon } from './icons';

const EASE = [0.22, 1, 0.36, 1] as const;

interface SideProps {
  label: string;
  time: string;
  steps: string[];
  bar: string;
  done?: string;
  good: boolean;
  play: boolean;
}

// One side of the comparison: what happens, how long it takes, and a bar that fills
// slowly (without qafe) or almost at once (with qafe).
function Side({ label, time, steps, bar, done, good, play }: SideProps) {
  const Icon = good ? CheckIcon : CloseIcon;
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-[2rem] p-7 sm:p-9 ${good ? 'bg-linear-to-b from-navy-soft to-surface shadow-blue ring-1 ring-primary/50' : 'bg-surface/50 ring-1 ring-line'}`}
    >
      {good && (
        <div
          aria-hidden
          className="absolute -top-24 -right-24 size-72 rounded-full bg-primary/30 blur-[90px]"
        />
      )}
      <div className="relative flex items-start justify-between gap-4">
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${good ? 'bg-primary text-on-primary' : 'bg-surface-2 text-muted'}`}
        >
          {label}
        </span>
        <span
          className={`font-display text-4xl leading-none font-bold sm:text-5xl ${good ? 'text-gradient' : 'text-muted/70'}`}
        >
          {time}
        </span>
      </div>

      <ol className="relative mt-9 flex flex-col gap-4">
        {steps.map((step, i) => (
          <motion.li
            key={step}
            className="flex items-center gap-4"
            initial={{ opacity: 0, x: good ? 16 : -16 }}
            animate={play ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 + i * (good ? 0.12 : 0.3), ease: EASE }}
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${good ? 'bg-primary/20 text-bright ring-1 ring-primary/40' : 'bg-alert/10 text-alert/80'}`}
            >
              <Icon className="size-4" strokeWidth={2.4} />
            </span>
            <span className={`text-lg ${good ? 'text-ink' : 'text-muted'}`}>{step}</span>
          </motion.li>
        ))}
      </ol>

      <div className="relative mt-auto pt-10">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted">{bar}</span>
          {done && (
            <motion.span
              className="inline-flex items-center gap-1.5 font-semibold text-bright"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={play ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 1.3, type: 'spring', stiffness: 400, damping: 16 }}
            >
              <CheckIcon className="size-4" strokeWidth={2.4} /> {done}
            </motion.span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className={`h-full origin-left rounded-full ${good ? 'bg-linear-to-r from-primary to-highlight shadow-[0_0_14px_var(--color-bright)]' : 'bg-muted/40'}`}
            initial={{ scaleX: 0 }}
            animate={play ? { scaleX: 1 } : {}}
            transition={
              good
                ? { duration: 0.7, delay: 0.7, ease: EASE }
                : { duration: 7, delay: 0.4, ease: 'linear' }
            }
          />
        </div>
      </div>
    </div>
  );
}

export function Compare() {
  const { t } = useI18n();
  const c = t.compare;
  const ref = useRef<HTMLDivElement>(null);
  const play = useInView(ref, { once: true, amount: 0.35 });

  return (
    <section className="relative isolate px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          <h2 className="font-display text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.05] font-bold text-balance">
            {c.title}
          </h2>
          <p className="mt-4 text-lg text-muted sm:text-xl">{c.subtitle}</p>
        </motion.div>

        <div ref={ref} className="mt-14 grid gap-5 md:grid-cols-2 md:gap-6">
          <Side {...c.before} good={false} play={play} />
          <Side {...c.after} good play={play} />
        </div>
      </div>
    </section>
  );
}
