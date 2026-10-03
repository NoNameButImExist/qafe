import { AnimatePresence, animate, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { formatPrice } from '../format';
import { useI18n } from '../i18n/context';
import { BellIcon, CheckIcon } from './icons';

// Light "app window" mocks shown next to the feature tabs. Each one loops on its own.

function useTicker(ms: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}

function Window({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.6rem] bg-paper text-ink shadow-float ring-1 ring-line-strong">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <span className="font-display text-lg font-bold">{title}</span>
        {aside && (
          <span className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted">
            {aside}
          </span>
        )}
      </div>
      <div className="relative flex-1 overflow-hidden p-5">{children}</div>
    </div>
  );
}

export function LiveMock() {
  const { t } = useI18n();
  const m = t.product.mock;
  const tick = useTicker(1900);
  const visible = [0, 1, 2, 3].map((o) => {
    const i = (tick + m.feed.length - o) % m.feed.length;
    return { key: tick - o, line: m.feed[i] ?? '' };
  });

  return (
    <Window title={m.orders} aside={m.allZones}>
      <ul className="flex flex-col gap-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map(({ key, line }, i) => (
            <motion.li
              key={key}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1 - i * 0.18, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className={`flex items-center gap-3 rounded-2xl p-3.5 ${i === 0 ? 'bg-primary/8 ring-2 ring-primary' : 'bg-paper ring-1 ring-line'}`}
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl ${i === 0 ? 'bg-primary text-on-primary' : 'bg-surface-2 text-muted'}`}
              >
                <BellIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{line}</span>
                {i === 0 && <span className="text-sm text-muted">{m.now}</span>}
              </span>
              {i === 0 && (
                <span className="rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-surface">
                  {m.accept}
                </span>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Window>
  );
}

export function ClaimMock() {
  const { t } = useI18n();
  const m = t.product.mock;
  const claimed = useTicker(2400) % 2 === 1;
  const order = `${t.scene.table} · ${t.scene.items[1]?.name ?? ''}`;

  return (
    <Window title={m.orders}>
      <div className="grid h-full grid-cols-3 gap-3">
        {m.waiters.map((name, i) => (
          <div key={name} className="flex flex-col rounded-2xl bg-paper p-3 ring-1 ring-line">
            <div className="flex items-center gap-2">
              <span
                className={`grid size-8 place-items-center rounded-full font-display text-sm font-bold ${i === 0 ? 'bg-highlight text-on-highlight' : 'bg-surface-2 text-muted'}`}
              >
                {name[0]}
              </span>
              <span className="truncate text-sm font-semibold">{name}</span>
            </div>
            <div className="mt-4 rounded-xl bg-surface p-2.5 ring-1 ring-line">
              <p className="text-sm leading-snug font-semibold">{order}</p>
              <AnimatePresence mode="wait" initial={false}>
                {claimed ? (
                  <motion.span
                    key="claimed"
                    initial={{ scale: 1.5, opacity: 0, rotate: -6 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 16, delay: i * 0.08 }}
                    className={`mt-2 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold ${i === 0 ? 'bg-highlight text-on-highlight' : 'bg-surface-2 text-ink'}`}
                  >
                    <CheckIcon className="size-3.5" />
                    {i === 0 ? m.claimedBy : `${m.seesIt}: ${m.waiters[0]}`}
                  </motion.span>
                ) : (
                  <motion.span
                    key="accept"
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="mt-2 block rounded-lg bg-ink py-1.5 text-center text-xs font-semibold text-surface"
                  >
                    {m.accept}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </Window>
  );
}

export function MenuMock() {
  const { t, locale } = useI18n();
  const m = t.product.mock;
  const s = t.scene;
  const soldOut = useTicker(2200) % 2 === 1;

  return (
    <Window title={m.menuTitle}>
      <ul className="flex flex-col divide-y divide-line">
        {s.items.map((item, i) => {
          const off = i === 3 && soldOut;
          return (
            <li key={item.name} className="flex items-center gap-3 py-3">
              <span
                className={`size-11 shrink-0 rounded-xl transition-[filter,opacity] duration-500 ${off ? 'opacity-50 grayscale' : ''}`}
                style={{ background: `var(--thumb-${i + 1})` }}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate font-semibold ${off ? 'text-muted line-through' : ''}`}
                >
                  {item.name}
                </span>
                <span className="text-sm text-muted">
                  {formatPrice(item.price, s.currency, locale)}
                </span>
              </span>
              <span
                className={`hidden text-sm font-medium sm:block ${off ? 'text-alert' : 'text-success'}`}
              >
                {off ? m.soldOut : m.available}
              </span>
              <span
                className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors duration-300 ${off ? 'bg-line-strong' : 'bg-primary'}`}
              >
                <motion.span
                  className="size-5 rounded-full bg-surface shadow"
                  animate={{ x: off ? 0 : 20 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </Window>
  );
}

const BARS = [46, 58, 52, 70, 88, 100, 64];

export function ReportsMock() {
  const { t, locale } = useI18n();
  const m = t.product.mock;
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    const controls = animate(0, 4862.5, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setRevenue,
    });
    return () => controls.stop();
  }, []);

  return (
    <Window title={m.revenue} aside={m.export}>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-end gap-3">
          <span className="font-display text-4xl font-bold tabular-nums">
            {formatPrice(revenue, t.scene.currency, locale)}
          </span>
          <span className="mb-1 rounded-full bg-highlight px-2.5 py-0.5 text-sm font-bold text-on-highlight">
            +12%
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">{m.vsLast}</p>
        <div className="mt-6 flex flex-1 items-end gap-2.5">
          {BARS.map((h, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <motion.div
                className={`w-full rounded-t-lg ${i === 5 ? 'bg-primary' : 'bg-primary/25'}`}
                initial={{ height: '0%' }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              />
              <span className="text-xs text-muted">{m.days[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
}
