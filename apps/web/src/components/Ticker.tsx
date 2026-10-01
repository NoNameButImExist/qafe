import { motion } from 'motion/react';
import { useI18n } from '../i18n/context';

function Row({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  // Two copies side by side; sliding by half the width loops seamlessly.
  return (
    <div className="flex overflow-hidden">
      <motion.div
        className="flex shrink-0 gap-10 pr-10"
        animate={{ x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      >
        {[...items, ...items].map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex shrink-0 items-center gap-3 font-display text-xl font-semibold whitespace-nowrap sm:text-2xl"
          >
            <span className="size-2.5 rounded-full bg-current" />
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export function Ticker() {
  const { t } = useI18n();
  const half = Math.ceil(t.ticker.length / 2);
  return (
    <div aria-hidden className="relative z-10 -my-4 overflow-x-clip py-10">
      <div className="-rotate-2 scale-105 bg-primary py-4 text-on-primary shadow-band">
        <Row items={t.ticker} />
      </div>
      <div className="mt-[-6px] rotate-1 scale-105 border-y border-line bg-surface py-3 text-fg/70">
        <Row items={[...t.ticker.slice(half), ...t.ticker.slice(0, half)]} reverse />
      </div>
    </div>
  );
}
