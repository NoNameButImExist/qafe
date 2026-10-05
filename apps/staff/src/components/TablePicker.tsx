import type { FloorTable } from '@qafe/contracts';
import { cn, Sheet } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/format';
import { floorQuery } from '../lib/queries';

/**
 * Picks the table an order or a whole table moves to (FR-KON-14). Free tables take the
 * guests as they are; an occupied one means merging into it, so it says so.
 */
export function TablePicker({
  open,
  title,
  hint,
  excludeTableId,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  hint: string;
  excludeTableId: string;
  busy: boolean;
  onClose: () => void;
  onPick: (table: FloorTable) => void;
}) {
  const { t } = useTranslation();
  const floor = useQuery({ ...floorQuery, enabled: open });
  const tables = (floor.data?.tables ?? []).filter((x) => x.id !== excludeTableId);
  return (
    <Sheet open={open} onClose={onClose} title={title} description={hint}>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {tables.map((table) => {
          const occupied = table.session !== null;
          return (
            <li key={table.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(table)}
                className={cn(
                  'flex min-h-20 w-full flex-col items-start rounded-2xl border-2 p-3 text-left transition-transform active:scale-[0.97] disabled:opacity-50',
                  occupied
                    ? 'border-warning/50 bg-warning/8'
                    : 'border-dashed border-line-strong bg-surface',
                )}
              >
                <span className="font-display text-xl font-bold text-ink">{table.label}</span>
                <span className="text-xs font-semibold text-muted">
                  {occupied
                    ? `${t('move.mergeHere')} · ${formatMoney(table.session!.total)}`
                    : t('floor.status.free')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
