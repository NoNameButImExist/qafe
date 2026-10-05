import { Card } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/format';
import { myDayQuery } from '../lib/queries';

/** "2026-10-05" moved by whole days, without time zones getting in the way. */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** What the tables a member served paid on a business day (FR-KON-23). */
export function MyDayPage() {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState<string>();
  const day = useQuery(myDayQuery(date));
  const today = useQuery({ ...myDayQuery(), enabled: date !== undefined });
  const isToday = date === undefined || date === today.data?.date;

  if (day.isError) return <p className="p-6 text-sm text-danger">{t('myDay.error')}</p>;
  if (!day.data) return <p className="p-6 text-sm text-muted">{t('common.loading')}</p>;
  const d = day.data;
  const label = new Date(`${d.date}T12:00:00Z`).toLocaleDateString(
    i18n.language === 'bs' ? 'bs-BA' : 'en-GB',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' },
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <h1 className="font-display text-lg font-semibold text-ink">{t('myDay.title')}</h1>
          <p className="text-sm text-muted first-letter:uppercase">
            {isToday ? t('myDay.today') : label}
          </p>
        </div>
        <button
          type="button"
          aria-label={t('myDay.previous')}
          onClick={() => setDate(shiftDate(d.date, -1))}
          className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink hover:bg-canvas"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          aria-label={t('myDay.next')}
          disabled={isToday}
          onClick={() => {
            const next = shiftDate(d.date, 1);
            setDate(next === today.data?.date ? undefined : next);
          }}
          className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink hover:bg-canvas disabled:opacity-40"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="col-span-2 p-4 sm:col-span-1">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t('myDay.revenue')}
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink tabular-nums">
            {formatMoney(d.revenue)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t('myDay.orders')}
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink tabular-nums">
            {d.orders}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t('myDay.items')}
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink tabular-nums">
            {d.items}
          </p>
        </Card>
      </div>

      {d.orders === 0 ? (
        <p className="py-14 text-center text-sm text-muted">{t('myDay.empty')}</p>
      ) : (
        <>
          <h2 className="mt-6 mb-2 text-xs font-bold tracking-wide text-muted uppercase">
            {t('myDay.byMethod')}
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {d.byMethod.map((m) => (
              <li key={m.method} className="flex min-h-12 items-center px-4">
                <span className="flex-1 text-ink">
                  {t(`table.methods.${m.method}`, { defaultValue: m.method })}
                </span>
                <span className="font-semibold text-ink tabular-nums">
                  {formatMoney(m.revenue)}
                </span>
              </li>
            ))}
          </ul>

          <h2 className="mt-6 mb-2 text-xs font-bold tracking-wide text-muted uppercase">
            {t('myDay.topItems')}
          </h2>
          <ol className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {d.topItems.map((item, i) => (
              <li key={item.name} className="flex min-h-12 items-center gap-3 px-4">
                <span className="w-5 text-sm font-semibold text-muted tabular-nums">{i + 1}.</span>
                <span className="flex-1 text-ink">{item.name}</span>
                <span className="text-sm text-muted tabular-nums">× {item.quantity}</span>
                <span className="w-24 text-right font-semibold text-ink tabular-nums">
                  {formatMoney(item.revenue)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-6 text-xs text-muted">{t('myDay.hint')}</p>
    </div>
  );
}
