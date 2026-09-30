import type { VenueStatus } from '@qafe/contracts';
import { Ban, CircleCheck, Clock, Ellipsis, Pause } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { VENUE_STATUSES } from '../lib/venuesSearch';
import { cn, Menu, MenuItem } from '@qafe/ui';

const STATUS_ICONS: Record<VenueStatus, ReactNode> = {
  active: <CircleCheck className="size-4 text-success" />,
  pending: <Clock className="size-4 text-warning" />,
  suspended: <Pause className="size-4 text-danger" />,
  closed: <Ban className="size-4 text-muted" />,
};

interface Props {
  venue: { name: string; status: VenueStatus };
  onChange: (status: VenueStatus) => void;
  /** Show a labelled button instead of the "…" icon. */
  labelled?: boolean;
}

/** FR-ADM-04: move a venue between pending, active, suspended and closed. */
export function VenueStatusMenu({ venue, onChange, labelled = false }: Props) {
  const { t } = useTranslation();
  return (
    <Menu
      label={`${t('venues.changeStatus')}: ${venue.name}`}
      className={cn(
        labelled
          ? 'inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:border-line-strong'
          : 'grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink',
      )}
      trigger={labelled ? t('venues.changeStatus') : <Ellipsis className="size-4" />}
    >
      {(close) => (
        <>
          <p className="px-4 pt-1 pb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t('venues.changeStatus')}
          </p>
          {VENUE_STATUSES.filter((s) => s !== venue.status).map((status) => (
            <MenuItem
              key={status}
              icon={STATUS_ICONS[status]}
              tone={status === 'closed' ? 'danger' : 'default'}
              onSelect={() => {
                close();
                onChange(status);
              }}
            >
              {t(`venues.statusAction.${status}`)}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}
