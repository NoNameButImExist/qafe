import type { FloorTable } from '@qafe/contracts';
import { cn } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellRing, ClipboardList, ReceiptText, ShieldAlert, UserRoundPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/format';
import { floorQuery } from '../lib/queries';

const AREA_KEY = 'qafe.staff.area';

const TONES: Record<FloorTable['status'], string> = {
  free: 'border-line bg-surface',
  occupied: 'border-primary/40 bg-primary/6',
  needs_service: 'border-warning bg-warning/12 shadow-[0_0_0_3px] shadow-warning/15',
  bill_requested: 'border-success bg-success/12 shadow-[0_0_0_3px] shadow-success/15',
};

/** All tables at a glance (FR-KON-15), filtered by area. */
export function FloorPage() {
  const { t } = useTranslation();
  const floor = useQuery(floorQuery);
  const [area, setArea] = useState<string>(() => {
    try {
      return localStorage.getItem(AREA_KEY) ?? 'all';
    } catch {
      return 'all';
    }
  });
  const choose = (value: string) => {
    setArea(value);
    try {
      localStorage.setItem(AREA_KEY, value);
    } catch {
      // Storage blocked: the filter lasts for this page only.
    }
  };

  if (!floor.data) return <p className="p-6 text-sm text-muted">{t('common.loading')}</p>;
  const { areas, tables } = floor.data;
  if (tables.length === 0)
    return <p className="p-6 text-center text-sm text-muted">{t('floor.empty')}</p>;
  const hasNoArea = tables.some((x) => x.areaId === null);
  const shown = tables.filter(
    (x) => area === 'all' || (area === 'none' ? x.areaId === null : x.areaId === area),
  );
  const chips = [
    { id: 'all', name: t('common.all') },
    ...areas,
    ...(hasNoArea && areas.length > 0 ? [{ id: 'none', name: t('floor.noArea') }] : []),
  ];

  return (
    <div className="px-4 py-4">
      {areas.length > 0 && (
        <div
          className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4"
          role="group"
          aria-label={t('floor.title')}
        >
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={area === c.id}
              onClick={() => choose(c.id)}
              className={cn(
                'h-11 shrink-0 rounded-full border px-4 text-sm font-semibold',
                area === c.id
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-line bg-surface text-ink',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((table) => (
          <li key={table.id}>
            <TableTile table={table} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableTile({ table }: { table: FloorTable }) {
  const { t } = useTranslation();
  const s = table.session;
  const calling = s?.requests.some((r) => r.type === 'call_waiter' && r.status === 'open');
  const signals = s
    ? [
        s.newOrders > 0 && {
          icon: ClipboardList,
          text: t('floor.newOrders', { count: s.newOrders }),
          tone: 'text-danger',
        },
        calling && { icon: BellRing, text: t('floor.calling'), tone: 'text-warning' },
        s.pendingGuests > 0 && {
          icon: UserRoundPlus,
          text: t('floor.waitingDevices'),
          tone: 'text-warning',
        },
        s.disputes > 0 && { icon: ShieldAlert, text: t('floor.disputed'), tone: 'text-danger' },
        table.status === 'bill_requested' && {
          icon: ReceiptText,
          text: t('floor.status.bill_requested'),
          tone: 'text-success',
        },
      ].filter(Boolean)
    : [];

  return (
    <Link
      to="/table/$tableId"
      params={{ tableId: table.id }}
      className={cn(
        'flex min-h-32 flex-col rounded-2xl border-2 p-3.5 transition-transform active:scale-[0.98]',
        TONES[table.status],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-2xl font-bold text-ink">{table.label}</span>
        {s && (
          <span className="text-sm font-semibold text-ink tabular-nums">
            {formatMoney(s.total)}
          </span>
        )}
      </div>
      <span className="text-xs font-semibold text-muted">
        {t(`floor.status.${table.status}`)}
        {s && ` · ${t('floor.guests', { count: s.guests })}`}
        {s && !s.verified && ` · ${t('floor.notVerified')}`}
      </span>
      <ul className="mt-auto flex flex-col gap-0.5 pt-2">
        {(signals as { icon: typeof BellRing; text: string; tone: string }[]).map(
          ({ icon: Icon, text, tone }) => (
            <li key={text} className={cn('flex items-center gap-1.5 text-xs font-bold', tone)}>
              <Icon className="size-3.5 shrink-0" aria-hidden /> {text}
            </li>
          ),
        )}
      </ul>
    </Link>
  );
}
