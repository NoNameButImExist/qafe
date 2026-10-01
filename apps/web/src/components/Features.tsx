import { AnimatePresence, motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { useEffect, useState, type ComponentType, type PointerEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import {
  BellIcon,
  ChartIcon,
  CheckIcon,
  FlameIcon,
  MenuIcon,
  QrIcon,
  ShieldIcon,
  UsersIcon,
} from './icons';
import { SectionHeading } from './SectionHeading';

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  live: BellIcon,
  claim: CheckIcon,
  menu: MenuIcon,
  tables: QrIcon,
  staff: UsersIcon,
  reports: ChartIcon,
  safety: ShieldIcon,
  kds: FlameIcon,
};

// Bento layout: the first two cards are large and carry a small live illustration.
const SPAN: Record<string, string> = {
  live: 'md:col-span-2 md:row-span-2',
  claim: 'md:col-span-2',
};

function SpotlightCard({
  children,
  className = '',
  index,
}: {
  children: ReactNode;
  className?: string;
  index: number;
}) {
  const mx = useMotionValue(-400);
  const my = useMotionValue(-400);
  const background = useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, color-mix(in oklab, var(--color-primary) 14%, transparent), transparent 70%)`;

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - rect.left);
    my.set(e.clientY - rect.top);
  }

  return (
    <motion.div
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        mx.set(-400);
        my.set(-400);
      }}
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay: (index % 4) * 0.08, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className={`group relative overflow-hidden rounded-3xl border border-line bg-surface p-7 ${className}`}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background }}
      />
      <div className="relative flex h-full flex-col">{children}</div>
    </motion.div>
  );
}

function LiveFeed() {
  const { t } = useI18n();
  const [head, setHead] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHead((h) => (h + 1) % t.ticker.length), 1800);
    return () => clearInterval(id);
  }, [t.ticker.length]);
  const visible = [0, 1, 2].map((o) => t.ticker[(head + o) % t.ticker.length] ?? '');

  return (
    <ul aria-hidden className="mt-auto flex flex-col gap-2 pt-8">
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((line, i) => (
          <motion.li
            key={line}
            layout
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1 - i * 0.28, y: 0, scale: 1 - i * 0.03 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-sm"
          >
            <span className={`size-2 shrink-0 rounded-full ${i === 0 ? 'bg-alert' : 'bg-fg/30'}`} />
            {line}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function ClaimStamp() {
  const { t } = useI18n();
  return (
    <div aria-hidden className="mt-6 flex items-center gap-3">
      {['A', 'L', 'E'].map((w, i) => (
        <motion.span
          key={w}
          className="grid size-10 place-items-center rounded-full border border-line font-bold"
          initial={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-fg)' }}
          whileInView={
            i === 0
              ? { backgroundColor: 'var(--color-success)', color: 'var(--color-on-success)' }
              : {}
          }
          viewport={{ once: true }}
          transition={{ delay: 0.8 }}
        >
          {w}
        </motion.span>
      ))}
      <motion.span
        initial={{ opacity: 0, scale: 1.8, rotate: -12 }}
        whileInView={{ opacity: 1, scale: 1, rotate: -4 }}
        viewport={{ once: true }}
        transition={{ delay: 0.8, type: 'spring', stiffness: 300, damping: 12 }}
        className="ml-2 rounded-lg border-2 border-success px-3 py-1 font-mono text-sm font-bold text-success uppercase"
      >
        {t.demo.acceptedBy}
      </motion.span>
    </div>
  );
}

export function Features() {
  const { t } = useI18n();
  return (
    <section id="za-lokale" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t.features.eyebrow}
          title={t.features.title}
          subtitle={t.features.subtitle}
        />
        <div className="mt-16 grid auto-rows-[minmax(220px,auto)] gap-4 md:grid-cols-4">
          {t.features.items.map((item, i) => {
            const Icon = ICONS[item.key] ?? BellIcon;
            return (
              <SpotlightCard key={item.key} index={i} className={SPAN[item.key] ?? ''}>
                <motion.span
                  className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"
                  whileHover={{ rotate: -10, scale: 1.1 }}
                >
                  <Icon className="size-6" />
                </motion.span>
                <h3
                  className={`mt-6 font-display font-bold ${item.key === 'live' ? 'text-3xl sm:text-4xl' : 'text-xl'}`}
                >
                  {item.title}
                </h3>
                <p className="mt-3 text-muted">{item.body}</p>
                {item.key === 'live' && <LiveFeed />}
                {item.key === 'claim' && <ClaimStamp />}
              </SpotlightCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
