import { AnimatePresence, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { formatPrice } from '../format';
import { useI18n } from '../i18n/context';
import { BellIcon, CheckIcon, HandIcon, PlusIcon } from './icons';
import { Phone } from './Phone';

// The demo loops through the core flow: pick items, send, waiter gets it, accepts it.
const Step = {
  Menu: 0,
  AddFirst: 1,
  AddSecond: 2,
  Sent: 3,
  Received: 4,
  Accepted: 5,
} as const;

// How long each step stays on screen, indexed by step.
const DURATION_MS = [1400, 1000, 1100, 1000, 1600, 3000];

const PICKED = [0, 2];

export function HeroDemo() {
  const { t, locale } = useI18n();
  const d = t.demo;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [step, setStep] = useState<number>(Step.Menu);

  useEffect(() => {
    if (!inView) return;
    const id = setTimeout(
      () => setStep((s) => (s === Step.Accepted ? Step.Menu : s + 1)),
      DURATION_MS[step],
    );
    return () => clearTimeout(id);
  }, [step, inView]);

  const picked = PICKED.filter((_, i) => step >= Step.AddFirst + i);
  const total = picked.reduce((sum, i) => sum + (d.items[i]?.price ?? 0), 0);
  const orderNames = PICKED.map((i) => d.items[i]?.name).join(', ');

  return (
    <div ref={ref} className="relative mx-auto aspect-[10/11] w-full max-w-[560px]">
      {/* Guest phone */}
      <motion.div
        className="absolute top-[8%] left-0 w-[52%]"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Phone label={d.guestPhone}>
          <div className="flex h-full flex-col px-3 text-[10px] sm:text-xs">
            <div className="flex items-center justify-between pb-3">
              <span className="font-display text-sm font-bold sm:text-base">{d.venue}</span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-semibold text-primary sm:text-[10px]">
                {d.table}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {d.items.map((item, i) => {
                const added = picked.includes(i);
                return (
                  <li
                    key={item.name}
                    className={`flex items-center gap-2 rounded-xl p-1.5 transition-colors duration-300 ${added ? 'bg-primary/12' : 'bg-fg/[0.04]'}`}
                  >
                    <span
                      className="size-7 shrink-0 rounded-lg sm:size-8"
                      style={{
                        background: `var(--thumb-${i + 1})`,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.name}</span>
                      <span className="text-muted">
                        {formatPrice(item.price, d.currency, locale)}
                      </span>
                    </span>
                    <motion.span
                      key={added ? 'added' : 'add'}
                      initial={{ scale: 0.4 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                      className={`grid size-6 place-items-center rounded-full ${added ? 'bg-primary text-on-primary' : 'border border-line text-muted'}`}
                    >
                      {added ? (
                        <CheckIcon className="size-3.5" />
                      ) : (
                        <PlusIcon className="size-3.5" />
                      )}
                    </motion.span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-auto pb-3">
              <div className="mb-2 flex items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-muted">
                <HandIcon className="size-3.5" />
                {d.callWaiter}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {step < Step.Sent ? (
                  <motion.div
                    key="cart"
                    exit={{ opacity: 0, y: 10 }}
                    animate={{ scale: step === Step.AddSecond ? [1, 1.05, 1] : 1 }}
                    className="flex items-center justify-between gap-2 rounded-xl bg-primary px-3 py-2.5 font-semibold text-on-primary"
                  >
                    <span className="truncate">{d.send}</span>
                    <span className="shrink-0">{formatPrice(total, d.currency, locale)}</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="status"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-semibold transition-colors duration-500 ${step === Step.Accepted ? 'bg-success text-on-success' : 'bg-fg/10 text-fg'}`}
                  >
                    {step === Step.Accepted ? (
                      <>
                        <CheckIcon className="size-4" /> {d.accepted}
                      </>
                    ) : (
                      <>
                        <span className="flex gap-0.5">
                          {[0, 1, 2].map((i) => (
                            <motion.span
                              key={i}
                              className="size-1 rounded-full bg-fg"
                              animate={{ opacity: [0.2, 1, 0.2] }}
                              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                            />
                          ))}
                        </span>
                        {d.sent}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Phone>
      </motion.div>

      {/* Waiter phone */}
      <motion.div
        className="absolute top-0 right-0 w-[52%]"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Phone label={d.staffPhone}>
          <div className="flex h-full flex-col px-3 text-[10px] sm:text-xs">
            <div className="flex items-center justify-between pb-3">
              <span className="font-display text-sm font-bold sm:text-base">{d.staffTitle}</span>
              <motion.span
                animate={
                  step === Step.Received ? { rotate: [0, -18, 16, -12, 8, 0] } : { rotate: 0 }
                }
                transition={{ duration: 0.8 }}
                className={`grid size-7 place-items-center rounded-full ${step === Step.Received ? 'bg-alert text-on-alert' : 'bg-fg/10'}`}
              >
                <BellIcon className="size-3.5" />
              </motion.span>
            </div>
            <span className="mb-2 w-fit rounded-full border border-line px-2 py-0.5 text-muted">
              {d.staffZone}
            </span>
            <motion.ul layout className="flex flex-col gap-1.5">
              <AnimatePresence initial={false}>
                {step >= Step.Received && (
                  <motion.li
                    key="new"
                    layout
                    initial={{ opacity: 0, y: -30, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 60 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                    className={`relative rounded-xl border p-2 transition-colors duration-500 ${step === Step.Accepted ? 'border-success/50 bg-success/10' : 'border-alert/60 bg-alert/10'}`}
                  >
                    {step === Step.Received && (
                      <motion.span
                        className="absolute -inset-px rounded-xl border-2 border-alert"
                        animate={{ opacity: [0.9, 0], scale: [1, 1.08] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    )}
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{d.table}</span>
                      <span className="text-muted">{d.waitingFor}</span>
                    </div>
                    <p className="truncate text-muted">{orderNames}</p>
                    <AnimatePresence mode="wait" initial={false}>
                      {step === Step.Accepted ? (
                        <motion.div
                          key="by"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="mt-1.5 flex items-center justify-center gap-1 rounded-lg bg-success py-1.5 font-semibold text-on-success"
                        >
                          <CheckIcon className="size-3.5" /> {d.acceptedBy}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="accept"
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="relative mt-1.5 flex items-center justify-center overflow-hidden rounded-lg bg-primary py-1.5 font-semibold text-on-primary"
                        >
                          {d.accept}
                          {/* Finger tap right before the step flips to Accepted. */}
                          <motion.span
                            className="absolute size-6 rounded-full bg-canvas/30"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: [0, 0, 3], opacity: [0, 0.8, 0] }}
                            transition={{ duration: 1.6, times: [0, 0.7, 1] }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                )}
                {[t.ticker[0], t.ticker[5]].map((line) => (
                  <motion.li
                    key={line}
                    layout
                    className="rounded-xl border border-line bg-fg/[0.03] p-2 text-muted"
                  >
                    <span className="line-clamp-2">{line}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          </div>
        </Phone>
      </motion.div>

      {/* The order flying from the guest to the waiter. */}
      <AnimatePresence>
        {step === Step.Sent && (
          <motion.div
            key="flight"
            className="absolute z-30 grid size-10 place-items-center rounded-2xl bg-primary text-on-primary shadow-glow-strong"
            initial={{ left: '18%', top: '78%', scale: 0.4, opacity: 0, rotate: 0 }}
            animate={{
              left: ['18%', '46%', '70%'],
              top: ['78%', '8%', '30%'],
              scale: [0.4, 1.2, 0.6],
              opacity: [0, 1, 1],
              rotate: [0, 180, 360],
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.95, ease: 'easeInOut' }}
          >
            <BellIcon className="size-5" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Latency badge */}
      <motion.div
        className="absolute top-[-2%] left-[4%] z-20 flex items-center gap-2 rounded-full border border-line bg-canvas/80 px-4 py-2 text-xs backdrop-blur-md sm:text-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4 }}
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        <span className="font-mono">&lt; 2 s</span>
      </motion.div>
    </div>
  );
}
