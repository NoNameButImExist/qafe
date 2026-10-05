import { AnimatePresence, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { formatPrice } from '../format';
import { useI18n } from '../i18n/context';
import { BellIcon, CheckIcon, HandIcon, LinkIcon, PlusIcon } from './icons';
import { Phone } from './Phone';
import { QrGlyph } from './QrGlyph';

// The loop: the phone points at the table tent, scans the code, opens the menu,
// adds two items and sends; the waiter gets it and accepts.
const Step = {
  Aim: 0,
  Scan: 1,
  Detected: 2,
  Menu: 3,
  AddFirst: 4,
  AddSecond: 5,
  Sending: 6,
  Accepted: 7,
} as const;

// How long each step stays on screen, indexed by step.
const DURATION_MS = [900, 1800, 1500, 1300, 900, 1000, 1500, 3200];

const PICKED = [0, 2];
const EASE = [0.22, 1, 0.36, 1] as const;
const SPRING = { type: 'spring', stiffness: 260, damping: 26 } as const;

/** A finger tap: a soft circle that lands and fades. Remount (key) to play it again. */
function Tap({ delay = 0 }: { delay?: number }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 z-20 size-[2.2em] -translate-1/2 rounded-full bg-ink/25 ring-2 ring-surface/70"
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: [0.4, 1, 1.5], opacity: [0, 0.9, 0] }}
      transition={{ duration: 0.7, delay, times: [0, 0.35, 1] }}
    />
  );
}

/** Viewfinder brackets that close in on the code once it is recognised. */
function Viewfinder({ locked }: { locked: boolean }) {
  const corners = [
    'top-0 left-0 border-t-[0.28em] border-l-[0.28em] rounded-tl-[0.7em]',
    'top-0 right-0 border-t-[0.28em] border-r-[0.28em] rounded-tr-[0.7em]',
    'bottom-0 left-0 border-b-[0.28em] border-l-[0.28em] rounded-bl-[0.7em]',
    'right-0 bottom-0 border-r-[0.28em] border-b-[0.28em] rounded-br-[0.7em]',
  ];
  return (
    <motion.div
      className="absolute top-1/2 left-1/2 aspect-square -translate-1/2"
      initial={false}
      animate={{ width: locked ? '66%' : '86%' }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
    >
      {corners.map((c) => (
        <span
          key={c}
          className={`absolute size-[22%] transition-colors duration-300 ${locked ? 'border-highlight' : 'border-on-navy/80'} ${c}`}
        />
      ))}
    </motion.div>
  );
}

function CameraScreen({ step }: { step: number }) {
  const { t } = useI18n();
  const s = t.scene;
  const locked = step >= Step.Detected;
  return (
    <div className="relative h-full overflow-hidden bg-navy-deep">
      {/* What the camera sees: a blurry table and the tent close up. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_100%,#3b2a1f_0%,transparent_60%),radial-gradient(90%_60%_at_20%_10%,var(--color-surface)_0%,transparent_70%)]" />
      <motion.div
        className="absolute top-[44%] left-1/2 w-[64%] -translate-1/2"
        initial={false}
        animate={{ rotate: locked ? 0 : 4, scale: locked ? 1 : 1.06 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <div className="rounded-[0.9em] bg-print p-[0.7em] text-on-print shadow-float">
          <QrGlyph className="w-full" />
        </div>
      </motion.div>

      <div className="absolute inset-x-0 top-[44%] -translate-y-1/2">
        <div className="relative mx-auto aspect-square w-full">
          <Viewfinder locked={locked} />
          {step === Step.Scan && (
            <motion.span
              className="absolute inset-x-[16%] h-[0.18em] rounded-full bg-highlight shadow-scan"
              initial={{ top: '14%' }}
              animate={{ top: ['14%', '84%', '14%'] }}
              transition={{ duration: 1.6, ease: 'easeInOut' }}
            />
          )}
        </div>
      </div>

      {/* The link chip a phone camera shows for a recognised code. */}
      <AnimatePresence>
        {locked && (
          <motion.div
            key="chip"
            className="absolute inset-x-[7%] bottom-[9%] flex items-center gap-[0.55em] rounded-[1.1em] bg-surface/95 p-[0.55em] pl-[0.7em] shadow-float"
            initial={{ y: '140%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
          >
            <span className="grid size-[2.1em] shrink-0 place-items-center rounded-[0.6em] bg-primary text-on-primary">
              <LinkIcon className="size-[1.1em]" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[0.66em] text-muted">{s.detected}</span>
              <span className="block truncate text-[0.8em] font-semibold">{s.link}</span>
            </span>
            <span className="relative shrink-0 rounded-full bg-ink px-[0.8em] py-[0.4em] text-[0.72em] font-semibold text-surface">
              {s.open}
              <Tap delay={1.05} />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuScreen({ step }: { step: number }) {
  const { t, locale } = useI18n();
  const s = t.scene;
  const picked = PICKED.filter((_, i) => step >= Step.AddFirst + i);
  const total = picked.reduce((sum, i) => sum + (s.items[i]?.price ?? 0), 0);

  return (
    <div className="relative flex h-full flex-col bg-surface">
      {/* Venue cover */}
      <div
        className="relative h-[24%] shrink-0 overflow-hidden"
        style={{ background: 'var(--cover)' }}
      >
        <div className="bg-dots-navy absolute inset-0 opacity-40" />
        <div className="absolute inset-x-[0.9em] bottom-[0.8em] flex items-end justify-between text-on-navy">
          <span>
            <span className="block text-[0.62em] opacity-75">{s.link}</span>
            <span className="block font-display text-[1.25em] leading-tight font-bold">
              {s.venue}
            </span>
          </span>
          <span className="rounded-full bg-highlight px-[0.6em] py-[0.2em] text-[0.66em] font-bold text-on-highlight">
            {s.table}
          </span>
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-[0.4em] px-[0.9em] pt-[0.8em] pb-[0.5em]">
        {s.categories.map((c, i) => (
          <span
            key={c}
            className={`rounded-full px-[0.75em] py-[0.32em] text-[0.68em] font-semibold ${i === 0 ? 'bg-ink text-surface' : 'bg-surface-2 text-muted'}`}
          >
            {c}
          </span>
        ))}
      </div>

      <ul className="flex flex-col gap-[0.45em] px-[0.9em]">
        {s.items.map((item, i) => {
          const added = picked.includes(i);
          return (
            <motion.li
              key={item.name}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.08, duration: 0.5, ease: EASE }}
              className={`flex items-center gap-[0.6em] rounded-[0.8em] p-[0.4em] transition-colors duration-300 ${added ? 'bg-primary/8 ring-1 ring-primary/30' : ''}`}
            >
              <span
                className="size-[2.6em] shrink-0 rounded-[0.6em]"
                style={{ background: `var(--thumb-${i + 1})` }}
              />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[0.8em] font-semibold">{item.name}</span>
                <span className="block truncate text-[0.62em] text-muted">{item.note}</span>
                <span className="block text-[0.7em] font-semibold text-bright">
                  {formatPrice(item.price, s.currency, locale)}
                </span>
              </span>
              <span className="relative">
                <motion.span
                  key={added ? 'added' : 'add'}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                  className={`grid size-[1.9em] place-items-center rounded-full ${added ? 'bg-highlight text-on-highlight' : 'bg-surface-2 text-ink'}`}
                >
                  {added ? (
                    <CheckIcon className="size-[1em]" />
                  ) : (
                    <PlusIcon className="size-[1em]" />
                  )}
                </motion.span>
                {/* Tap on the button just before the step that adds this item. */}
                {PICKED.indexOf(i) === step - Step.Menu && <Tap delay={0.55} />}
              </span>
            </motion.li>
          );
        })}
      </ul>

      <motion.p
        className="mx-[0.9em] mt-[0.8em] flex items-center justify-center gap-[0.4em] rounded-[0.8em] border border-line py-[0.6em] text-[0.7em] font-semibold text-muted"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <HandIcon className="size-[1.2em]" /> {s.callWaiter}
      </motion.p>

      {/* Cart bar: count and total, then sending, then accepted. */}
      <AnimatePresence>
        {step >= Step.AddFirst && (
          <motion.div
            key="cart"
            className="absolute inset-x-[0.9em] bottom-[1.1em]"
            initial={{ y: '160%' }}
            animate={{ y: 0 }}
            exit={{ y: '160%' }}
            transition={SPRING}
          >
            <AnimatePresence mode="wait" initial={false}>
              {step < Step.Sending ? (
                <motion.div
                  key="cart"
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="relative flex items-center gap-[0.6em] rounded-[1em] bg-ink p-[0.45em] pl-[0.6em] text-surface"
                >
                  <motion.span
                    key={picked.length}
                    initial={{ scale: 1.6 }}
                    animate={{ scale: 1 }}
                    className="grid size-[1.7em] place-items-center rounded-full bg-highlight text-[0.72em] font-bold text-on-highlight"
                  >
                    {picked.length}
                  </motion.span>
                  <span className="flex-1 leading-tight">
                    <span className="block text-[0.6em] opacity-70">{s.cart}</span>
                    <span className="block text-[0.8em] font-semibold">
                      {formatPrice(total, s.currency, locale)}
                    </span>
                  </span>
                  <span className="relative rounded-[0.7em] bg-primary px-[0.9em] py-[0.5em] text-[0.74em] font-semibold text-on-primary">
                    {s.send}
                    {step === Step.AddSecond && <Tap delay={0.75} />}
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key="status"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`relative overflow-hidden rounded-[1em] p-[0.75em] text-center text-[0.78em] font-semibold transition-colors duration-500 ${step === Step.Accepted ? 'bg-success text-on-success' : 'bg-ink text-surface'}`}
                >
                  {step === Step.Accepted ? (
                    <span className="inline-flex items-center gap-[0.4em]">
                      <CheckIcon className="size-[1.1em]" /> {s.acceptedBy}
                    </span>
                  ) : (
                    <>
                      {s.sending}
                      <motion.span
                        className="absolute bottom-0 left-0 h-[0.2em] bg-highlight"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 1.3, ease: 'easeInOut' }}
                      />
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The printed stand on the table, with the code the phone scans. */
function TableTent() {
  const { t } = useI18n();
  return (
    <div className="relative">
      <div className="relative rounded-[1.4em] bg-print p-[1em] pb-[1.1em] text-on-print shadow-float">
        <div className="flex items-center justify-between">
          <span className="font-display text-[1em] font-bold">
            qafe<span className="text-on-print/55">.ba</span>
          </span>
          <span className="rounded-full bg-on-print px-[0.6em] py-[0.15em] text-[0.7em] font-semibold text-print">
            {t.scene.table}
          </span>
        </div>
        <QrGlyph className="mt-[0.8em] w-full" />
        <p className="mt-[0.7em] text-center font-display text-[1.05em] leading-tight font-bold">
          {t.scene.tent}
        </p>
      </div>
      {/* Stand foot */}
      <div className="mx-auto h-[0.9em] w-[70%] rounded-b-[0.8em] bg-on-print/30" />
    </div>
  );
}

export function HeroScene() {
  const { t } = useI18n();
  const s = t.scene;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [step, setStep] = useState<number>(Step.Aim);

  useEffect(() => {
    if (!inView) return;
    const id = setTimeout(
      () => setStep((v) => (v === Step.Accepted ? Step.Aim : v + 1)),
      DURATION_MS[step],
    );
    return () => clearTimeout(id);
  }, [step, inView]);

  const menuOpen = step >= Step.Menu;
  const notified = step >= Step.Sending;
  const orderNames = PICKED.map((i) => s.items[i]?.name).join(', ');

  return (
    <div
      ref={ref}
      role="img"
      aria-label={s.label}
      className="relative mx-auto aspect-[1/1.05] w-full max-w-[620px] [container-type:inline-size]"
    >
      <div aria-hidden className="absolute inset-0" style={{ fontSize: '2.6cqw' }}>
        {/* Glow and table top */}
        <div className="absolute top-[8%] left-[18%] size-[76%] rounded-full bg-bright/20 blur-[70px]" />
        <div className="absolute right-[2%] bottom-[2%] left-[0%] h-[20%] rounded-[50%] bg-surface-2 ring-1 ring-line" />

        {/* Table tent */}
        <motion.div
          className="absolute bottom-[9%] left-[4%] w-[40%]"
          initial={false}
          animate={
            menuOpen
              ? { x: '-6%', scale: 0.9, opacity: 0.55, filter: 'blur(1.5px)' }
              : { x: '0%', scale: 1, opacity: 1, filter: 'blur(0px)' }
          }
          transition={{ duration: 0.9, ease: EASE }}
        >
          <TableTent />
        </motion.div>

        {/* Phone */}
        <motion.div
          className="absolute top-[1%] left-[46%] z-10 w-[46%]"
          initial={false}
          animate={
            menuOpen
              ? { x: '6%', y: '0%', rotate: 0, scale: 1.02 }
              : step === Step.Aim
                ? { x: '18%', y: '8%', rotate: -9, scale: 0.96 }
                : { x: '-10%', y: '7%', rotate: -6, scale: 0.98 }
          }
          transition={{ type: 'spring', stiffness: 70, damping: 16 }}
        >
          <Phone>
            <div className="relative h-full">
              <CameraScreen step={step} />
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    key="menu"
                    className="absolute inset-0 z-10"
                    initial={{ y: '100%', borderRadius: '2em' }}
                    animate={{ y: '0%', borderRadius: '0em' }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 160, damping: 24 }}
                  >
                    <MenuScreen step={step} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Phone>
        </motion.div>

        {/* The order leaving the phone for the waiter. */}
        <AnimatePresence>
          {step === Step.Sending && (
            <motion.span
              key="flight"
              className="absolute z-30 grid size-[2.6em] place-items-center rounded-full bg-highlight text-on-highlight shadow-float"
              initial={{ left: '66%', top: '82%', scale: 0.3, opacity: 0 }}
              animate={{
                left: ['66%', '40%', '22%'],
                top: ['82%', '26%', '14%'],
                scale: [0.3, 1.1, 0.5],
                opacity: [0, 1, 0],
              }}
              transition={{ duration: 0.8, ease: 'easeInOut' }}
            >
              <BellIcon className="size-[1.2em]" />
            </motion.span>
          )}
        </AnimatePresence>

        {/* What the waiter's phone shows. */}
        <AnimatePresence>
          {notified && (
            <motion.div
              key="notify"
              className="glass absolute top-[6%] left-[0%] z-20 w-[44%] rounded-[1.2em] p-[0.9em] text-on-navy shadow-float"
              initial={{ opacity: 0, y: -16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ ...SPRING, delay: 0.55 }}
            >
              <div className="flex items-center gap-[0.6em]">
                <motion.span
                  className="grid size-[2.1em] shrink-0 place-items-center rounded-[0.6em] bg-primary text-on-primary"
                  animate={{ rotate: [0, -16, 14, -10, 6, 0] }}
                  transition={{ duration: 0.8, delay: 0.75 }}
                >
                  <BellIcon className="size-[1.1em]" />
                </motion.span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[0.95em] font-semibold">{s.notifyTitle}</span>
                    <span className="shrink-0 text-[0.75em] text-on-navy-muted">
                      {s.notifyTime}
                    </span>
                  </span>
                  <span className="block truncate text-[0.8em] text-on-navy-muted">
                    {s.table} · {orderNames}
                  </span>
                </span>
              </div>
              <AnimatePresence initial={false}>
                {step === Step.Accepted && (
                  <motion.div
                    key="claimed"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <motion.span
                      initial={{ scale: 1.6, rotate: -8, opacity: 0 }}
                      animate={{ scale: 1, rotate: -2, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.1 }}
                      className="mt-[0.7em] inline-flex items-center gap-[0.35em] rounded-[0.5em] bg-highlight px-[0.6em] py-[0.25em] text-[0.8em] font-bold text-on-highlight"
                    >
                      <CheckIcon className="size-[1em]" /> {s.acceptedBy}
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Latency chip */}
        <AnimatePresence>
          {notified && (
            <motion.span
              key="latency"
              className="absolute top-[0%] left-[30%] z-30 inline-flex items-center gap-[0.4em] rounded-full bg-surface px-[0.75em] py-[0.3em] text-[0.85em] font-semibold shadow-card ring-1 ring-line"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ ...SPRING, delay: 0.9 }}
            >
              <span className="size-[0.55em] rounded-full bg-success" />
              {s.latency}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
