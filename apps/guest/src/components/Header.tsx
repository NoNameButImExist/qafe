import type { GuestVenue } from '@qafe/contracts';
import { LanguageSwitch } from '@qafe/ui';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function Header({
  venue,
  tableLabel,
  onTable,
}: {
  venue: GuestVenue;
  tableLabel?: string;
  onTable?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-2xl items-center gap-3 px-4">
        {venue.logoUrl ? (
          <img src={venue.logoUrl} alt="" className="size-10 rounded-xl object-cover" />
        ) : (
          <div className="grid size-10 place-items-center rounded-xl bg-navy-900 font-display text-lg font-bold text-white">
            {venue.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-semibold text-ink">{venue.name}</h1>
          {tableLabel && (
            <p className="text-xs font-medium text-muted">
              {t('venue.table', { label: tableLabel })}
            </p>
          )}
        </div>
        {onTable && (
          <button
            type="button"
            onClick={onTable}
            aria-label={t('table.open')}
            className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink"
          >
            <Users className="size-[18px]" />
          </button>
        )}
        <LanguageSwitch />
      </div>
    </header>
  );
}
