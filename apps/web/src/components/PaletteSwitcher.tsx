import { motion } from 'motion/react';
import { useState } from 'react';
import { useI18n } from '../i18n/context';
import {
  choosePalette,
  initialPalette,
  palettes,
  showPaletteSwitcher,
  type Palette,
} from '../palette';

export function PaletteSwitcher() {
  const { t } = useI18n();
  const [current, setCurrent] = useState<Palette>(initialPalette);

  if (!showPaletteSwitcher) return null;

  return (
    <motion.div
      role="group"
      aria-label={t.nav.palette}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 1.5 }}
      className="fixed right-4 bottom-4 z-70 flex items-center gap-1 rounded-full border border-line bg-surface/90 p-1.5 shadow-lg backdrop-blur-xl"
    >
      {palettes.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={current === p}
          onClick={() => {
            choosePalette(p);
            setCurrent(p);
          }}
          className={`flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold capitalize transition-colors ${current === p ? 'bg-fg text-canvas' : 'text-muted hover:text-fg'}`}
        >
          <span
            className="size-3.5 rounded-full ring-1 ring-fg/20"
            style={{ background: `var(--swatch-${p})` }}
          />
          {p}
        </button>
      ))}
    </motion.div>
  );
}
