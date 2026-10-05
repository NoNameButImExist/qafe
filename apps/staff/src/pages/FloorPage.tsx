import type { FloorTable } from '@qafe/contracts';
import { cn } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { m } from 'motion/react';
import {
  BellRing,
  ClipboardList,
  Clock,
  ReceiptText,
  ShieldAlert,
  UserRoundPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney, minutesSince } from '../lib/format';
import { floorQuery } from '../lib/queries';

const AREA_KEY = 'qafe.staff.area';

const TONES: Record<FloorTable['status'], { tile: string; strip: string; dot: string }> = {
  free: {
    tile: 'border-dashed border-line-strong/70 bg-surface/60',
    strip: 'bg-transparent',
    dot: 'bg-line-strong',
  },
  occupied: { tile: 'border-line bg-surface shadow-card', strip: 'bg-primary', dot: 'bg-primary' },
  needs_service: {
    tile: 'border-warning/60 bg-surface shadow-lg shadow-warning/15',
    strip: 'bg-warning',
    dot: 'bg-warning',
  },
  bill_requested: {
    tile: 'border-success/60 bg-surface shadow-lg shadow-success/15',
    strip: 'bg-success',
    dot: 'bg-success',
  },
};

/** The order of the summary: what needs someone first. */
const SUMMARY = ['needs_service', 'bill_requested', 'occupied', 'free'] as const;

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
    <div className="px-4 py-5 lg:px-4">
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SUMMARY.map((status) => {
          const count = shown.filter((x) => x.status === status).length;
          return (
            <div
              key={status}
              className={cn(
                'flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-card',
                count === 0 && 'opacity-60',
              )}
            >
              <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted">
                <span className={cn('size-2 shrink-0 rounded-full', TONES[status].dot)} />
                <span className="truncate">{t(`floor.status.${status}`)}</span>
              </p>
              <p className="font-display text-2xl leading-none font-semibold text-ink tabular-nums">
                {count}
              </p>
            </div>
          );
        })}
      </div>
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
                'relative h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors',
                area === c.id ? 'text-on-primary' : 'bg-surface text-ink ring-1 ring-line',
              )}
            >
              {area === c.id && (
                <m.span
                  layoutId="area"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {shown.map((table, index) => (
          <m.li
            key={table.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index, 12) * 0.025 }}
          >
            <TableTile table={table} />
          </m.li>
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

  const urgent = table.status === 'needs_service' || table.status === 'bill_requested';
  const tone = TONES[table.status];

  return (
    <Link
      to="/table/$tableId"
      params={{ tableId: table.id }}
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-[22px] border-2 p-4 transition-transform active:scale-[0.97]',
        s ? 'min-h-36' : 'min-h-24',
        tone.tile,
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-1.5', tone.strip)} aria-hidden />
      {urgent && (
        // A soft pulse around tables that need someone.
        <m.span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 rounded-[20px] border-2',
            table.status === 'needs_service' ? 'border-warning' : 'border-success',
          )}
          animate={{ opacity: [0.9, 0, 0.9] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'font-display text-[28px] leading-none font-bold',
            s ? 'text-ink' : 'text-muted',
          )}
        >
          {table.label}
        </span>
        {s && (
          <span className="rounded-lg bg-surface-2 px-2 py-1 font-display text-sm font-semibold text-ink tabular-nums">
            {formatMoney(s.total)}
          </span>
        )}
      </div>
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
        <span className={cn('size-2 rounded-full', tone.dot)} aria-hidden />
        {t(`floor.status.${table.status}`)}
        {s && !s.verified && (
          <span className="rounded-md bg-warning/12 px-1.5 py-px text-[10px] font-bold text-warning uppercase">
            {t('floor.notVerified')}
          </span>
        )}
      </span>
      {s && (
        <span className="mt-1 flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {s.guests}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {t('floor.openFor', { count: minutesSince(s.openedAt) })}
          </span>
        </span>
      )}
      <ul className="mt-auto flex flex-col gap-1 pt-3">
        {(signals as { icon: typeof BellRing; text: string; tone: string }[]).map(
          ({ icon: Icon, text, tone: color }) => (
            <li
              key={text}
              className={cn(
                'flex items-center gap-1.5 rounded-lg bg-current/8 px-2 py-1 text-xs font-bold',
                color,
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{text}</span>
            </li>
          ),
        )}
      </ul>
    </Link>
  );
}
