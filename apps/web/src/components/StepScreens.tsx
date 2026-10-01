import { AnimatePresence, motion } from 'motion/react';
import { formatPrice } from '../format';
import { useI18n } from '../i18n/context';
import { CheckIcon, ReceiptIcon } from './icons';
import { QrGlyph } from './QrGlyph';

const fade = {
  initial: { opacity: 0, y: 24, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -24, filter: 'blur(8px)' },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
} as const;

function ScanScreen() {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-black/60 px-6">
      <div className="relative w-3/4">
        {/* Viewfinder corners */}
        {[
          'top-0 left-0 border-t-4 border-l-4',
          'top-0 right-0 border-t-4 border-r-4',
          'bottom-0 left-0 border-b-4 border-l-4',
          'right-0 bottom-0 border-r-4 border-b-4',
        ].map((c) => (
          <span key={c} className={`absolute size-8 rounded-sm border-primary ${c}`} />
        ))}
        <div className="p-5">
          <div className="rounded-xl bg-paper p-3 text-on-paper">
            <QrGlyph className="w-full" />
          </div>
        </div>
        <motion.span
          className="absolute inset-x-2 h-0.5 bg-primary shadow-scanline"
          animate={{ top: ['8%', '92%', '8%'] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <p className="text-center text-sm text-muted">{t.how.screens.scanHint}</p>
    </div>
  );
}

function OrderScreen() {
  const { t, locale } = useI18n();
  const d = t.demo;
  return (
    <div className="flex h-full flex-col px-4 text-sm">
      <div className="flex items-center justify-between pb-4">
        <span className="font-display text-lg font-bold">{d.venue}</span>
        <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {d.table}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {d.items.map((item, i) => (
          <motion.li
            key={item.name}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className={`flex items-center gap-3 rounded-2xl p-2 ${i === 1 ? 'bg-primary/12' : 'bg-fg/[0.04]'}`}
          >
            <span
              className="size-10 rounded-xl"
              style={{
                background: `var(--thumb-${i + 1})`,
              }}
            />
            <span className="flex-1">
              <span className="block font-medium">{item.name}</span>
              <span className="text-xs text-muted">
                {formatPrice(item.price, d.currency, locale)}
              </span>
            </span>
            {i === 1 && (
              <span className="grid size-7 place-items-center rounded-full bg-primary text-on-primary">
                <CheckIcon className="size-4" />
              </span>
            )}
          </motion.li>
        ))}
      </ul>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 260, damping: 22 }}
        className="mt-auto mb-4 flex items-center justify-center gap-2 rounded-2xl bg-success py-3 font-semibold text-on-success"
      >
        <CheckIcon className="size-4" /> {t.how.screens.orderSent}
      </motion.div>
    </div>
  );
}

function AcceptScreen() {
  const { t } = useI18n();
  const d = t.demo;
  const waiters = ['A', 'L', 'E'];
  return (
    <div className="flex h-full flex-col px-4 text-sm">
      <span className="pb-4 font-display text-lg font-bold">{d.staffTitle}</span>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-2xl border border-success/50 bg-success/10 p-3"
      >
        <div className="flex justify-between font-bold">
          <span>{d.table}</span>
          <span className="font-normal text-muted">{d.waitingFor}</span>
        </div>
        <p className="mt-1 text-muted">
          {d.items
            .map((i) => i.name)
            .slice(0, 2)
            .join(', ')}
        </p>
        <motion.div
          initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 400, damping: 14 }}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-success py-2 font-semibold text-on-success"
        >
          <CheckIcon className="size-4" /> {t.how.screens.acceptedBy}
        </motion.div>
      </motion.div>
      <div className="mt-6 flex items-center justify-center -space-x-2">
        {waiters.map((w, i) => (
          <motion.span
            key={w}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + i * 0.12 }}
            className={`relative grid size-11 place-items-center rounded-full border-2 border-surface font-bold ${i === 0 ? 'bg-success text-on-success' : 'bg-fg/15'}`}
          >
            {w}
            <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-success text-on-success">
              <CheckIcon className="size-2.5" />
            </span>
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function PayScreen() {
  const { t } = useI18n();
  const tables = Array.from({ length: 9 }, (_, i) => i + 1);
  return (
    <div className="flex h-full flex-col px-4 text-sm">
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-2 rounded-2xl bg-fg/10 p-3"
      >
        <span className="grid size-8 place-items-center rounded-full bg-primary text-on-primary">
          <ReceiptIcon className="size-4" />
        </span>
        {t.how.screens.billRequested}
      </motion.div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {tables.map((n) =>
          n === 7 ? (
            // The table that just paid turns from "needs attention" to "free".
            <span
              key={n}
              className="relative grid aspect-square place-items-center rounded-xl border border-alert/60 bg-alert/25 font-display text-lg font-bold"
            >
              <motion.span
                aria-hidden
                className="absolute -inset-px rounded-xl border border-success/70 bg-success/20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.6 }}
              />
              <span className="relative">{n}</span>
            </span>
          ) : (
            <span
              key={n}
              className={`grid aspect-square place-items-center rounded-xl border border-line font-display text-lg font-bold ${n % 3 === 0 ? 'opacity-90' : 'opacity-45'}`}
            >
              {n}
            </span>
          ),
        )}
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.1, type: 'spring' }}
        className="mt-auto mb-4 flex items-center justify-center gap-2 rounded-2xl bg-success py-3 font-semibold text-on-success"
      >
        <CheckIcon className="size-4" /> {t.how.screens.paid} · {t.how.screens.tableFree}
      </motion.div>
    </div>
  );
}

const SCREENS = [ScanScreen, OrderScreen, AcceptScreen, PayScreen];

export function StepScreen({ step }: { step: number }) {
  const Screen = SCREENS[step] ?? ScanScreen;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={step} className="h-full" {...fade}>
        <Screen />
      </motion.div>
    </AnimatePresence>
  );
}
