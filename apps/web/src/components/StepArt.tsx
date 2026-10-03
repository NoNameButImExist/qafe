import { motion } from 'motion/react';
import { formatPrice } from '../format';
import { useI18n } from '../i18n/context';
import { CardIcon, CheckIcon, PlusIcon, ReceiptIcon } from './icons';
import { QrGlyph } from './QrGlyph';

// Small looping illustrations for the four "how it works" cards. They play while visible.
const loop = { repeat: Infinity, repeatDelay: 1.2 } as const;

function ScanArt() {
  return (
    <div className="relative mx-auto aspect-square w-[62%]">
      <div className="absolute inset-[12%] rounded-2xl bg-print p-3 text-on-print shadow-float">
        <QrGlyph className="w-full" />
      </div>
      {[
        'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
        'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
        'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
        'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl',
      ].map((c) => (
        <span key={c} className={`absolute size-[22%] border-primary ${c}`} />
      ))}
      <motion.span
        className="absolute inset-x-[8%] h-1 rounded-full bg-highlight shadow-scan"
        animate={{ top: ['10%', '88%', '10%'] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

function OrderArt() {
  const { t, locale } = useI18n();
  const s = t.scene;
  return (
    <div className="mx-auto flex w-[82%] flex-col gap-2">
      {s.items.slice(0, 3).map((item, i) => (
        <div
          key={item.name}
          className="flex items-center gap-3 rounded-2xl bg-surface p-2 shadow-card ring-1 ring-line"
        >
          <span
            className="size-10 shrink-0 rounded-xl"
            style={{ background: `var(--thumb-${i + 1})` }}
          />
          <span className="min-w-0 flex-1 text-sm leading-tight">
            <span className="block truncate font-semibold">{item.name}</span>
            <span className="text-bright">{formatPrice(item.price, s.currency, locale)}</span>
          </span>
          <motion.span
            className="grid size-8 place-items-center rounded-full"
            initial={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-ink)' }}
            whileInView={
              i === 1
                ? {
                    backgroundColor: [
                      'var(--color-surface-2)',
                      'var(--color-highlight)',
                      'var(--color-highlight)',
                    ],
                    scale: [1, 1.25, 1],
                  }
                : {}
            }
            transition={{ duration: 0.6, delay: 0.6, ...loop }}
          >
            {i === 1 ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4" />}
          </motion.span>
        </div>
      ))}
      <motion.div
        className="mt-1 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-surface"
        initial={{ y: 12, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 20 }}
      >
        {s.send}
        <span>{formatPrice(s.items[1]?.price ?? 0, s.currency, locale)}</span>
      </motion.div>
    </div>
  );
}

function AcceptArt() {
  const { t } = useI18n();
  const waiters = t.product.mock.waiters;
  return (
    <div className="mx-auto w-[84%]">
      <div className="rounded-2xl bg-surface-2 p-4 text-on-navy shadow-float">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{t.scene.table}</span>
          <span className="text-on-navy-muted">{t.scene.notifyTime}</span>
        </div>
        <p className="mt-1 truncate text-sm text-on-navy-muted">
          {t.scene.items[0]?.name}, {t.scene.items[2]?.name}
        </p>
        <motion.span
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-highlight px-2.5 py-1 text-sm font-bold text-on-highlight"
          initial={{ scale: 1.8, rotate: -10, opacity: 0 }}
          whileInView={{ scale: 1, rotate: -3, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 13, delay: 0.7 }}
        >
          <CheckIcon className="size-4" /> {t.how.art.claimedBy}
        </motion.span>
      </div>
      <div className="mt-5 flex justify-center gap-3">
        {waiters.map((name, i) => (
          <motion.span
            key={name}
            className={`grid size-12 place-items-center rounded-full font-display text-lg font-bold ring-4 ring-surface ${i === 0 ? 'bg-highlight text-on-highlight' : 'bg-surface-2 text-muted'}`}
            initial={{ y: 10, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: 1 + i * 0.1 }}
          >
            {name[0]}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function PayArt() {
  const { t, locale } = useI18n();
  const a = t.how.art;
  const s = t.scene;
  const total = (s.items[0]?.price ?? 0) + (s.items[2]?.price ?? 0);
  return (
    <div className="mx-auto w-[80%]">
      <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ReceiptIcon className="size-4 text-bright" /> {a.bill}
        </p>
        <div className="mt-3 flex justify-between border-t border-dashed border-line-strong pt-3 font-display text-xl font-bold">
          <span>{a.total}</span>
          <span>{formatPrice(total, s.currency, locale)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold">
          <span className="rounded-xl bg-surface-2 py-2 text-center text-muted">{a.cash}</span>
          <motion.span
            className="flex items-center justify-center gap-1.5 rounded-xl py-2"
            initial={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-muted)' }}
            whileInView={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-surface)' }}
            transition={{ delay: 0.7 }}
          >
            <CardIcon className="size-4" /> {a.card}
          </motion.span>
        </div>
      </div>
      <motion.p
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-success py-2.5 text-sm font-semibold text-on-success"
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, type: 'spring' }}
      >
        <CheckIcon className="size-4" /> {a.free}
      </motion.p>
    </div>
  );
}

const ARTS = [ScanArt, OrderArt, AcceptArt, PayArt];

export function StepArt({ step }: { step: number }) {
  const Art = ARTS[step] ?? ScanArt;
  return <Art />;
}
