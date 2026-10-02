import type { GuestVenue } from '@qafe/contracts';
import { m } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Greeting by the time of day, so the menu does not open on a bare list. */
function greeting(): 'morning' | 'day' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 18) return 'day';
  return 'evening';
}

export function Hero({ venue, tableLabel }: { venue: GuestVenue; tableLabel?: string }) {
  const { t } = useTranslation();
  const tint = venue.primaryColor ?? 'var(--primary)';
  return (
    <m.section
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.3, 1] }}
      className="relative mx-4 mt-4 overflow-hidden rounded-[26px] bg-navy-900 px-5 py-6 text-white"
    >
      {/* Slowly drifting light behind the text. */}
      <m.div
        aria-hidden
        className="absolute -top-16 -right-10 size-56 rounded-full opacity-60 blur-3xl"
        style={{ background: tint }}
        animate={{ x: [0, -24, 0], y: [0, 18, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <m.div
        aria-hidden
        className="absolute -bottom-20 -left-12 size-48 rounded-full bg-blue-bright opacity-30 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, -10, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-white/70">
          <Sparkles className="size-4 text-amber-300" aria-hidden />
          {t(`hero.${greeting()}`)}
        </p>
        <h2 className="mt-1.5 font-display text-[26px] leading-tight font-semibold">
          {venue.name}
        </h2>
        <p className="mt-2 max-w-xs text-sm text-white/75">
          {tableLabel ? t('hero.atTable', { label: tableLabel }) : t('hero.browse')}
        </p>
      </div>
    </m.section>
  );
}
