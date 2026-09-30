import type { VenueStatus } from '@qafe/contracts';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

const styles: Record<VenueStatus, string> = {
  active: 'bg-success/12 text-success',
  pending: 'bg-warning/12 text-warning',
  suspended: 'bg-danger/12 text-danger',
  closed: 'bg-muted/15 text-muted',
};

export function StatusBadge({ status }: { status: VenueStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        styles[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {t(`venues.status.${status}`)}
    </span>
  );
}
