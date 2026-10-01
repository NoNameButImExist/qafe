import { cn } from '@qafe/ui';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../lib/format';
import { percentChange, shortDate } from '../../lib/periods';

/** A headline figure with its change against the previous period (never color alone). */
export function StatTile({
  label,
  value,
  current,
  previous,
  previousLabel,
  hint,
}: {
  label: string;
  value: string;
  current: string | number;
  previous: string | number;
  previousLabel: { from: string; to: string };
  hint?: string;
}) {
  const { t, i18n } = useTranslation();
  const change = percentChange(current, previous);
  const Icon = change === null || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-[28px] leading-tight font-bold text-ink tabular-nums">
        {value}
      </p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <p
        className={cn(
          'mt-2 flex items-center gap-1 text-xs font-semibold',
          change === null || change === 0
            ? 'text-muted'
            : change > 0
              ? 'text-success'
              : 'text-danger',
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {change === null
          ? t('reports.noPrevious')
          : t('reports.vsPrevious', {
              change: `${change > 0 ? '+' : ''}${change} %`,
              from: shortDate(previousLabel.from, i18n.language),
              to: shortDate(previousLabel.to, i18n.language),
            })}
      </p>
    </div>
  );
}

interface Point {
  label: string;
  /** Full label for the tooltip and the table ("Ponedjeljak", "7. 10. 2026."). */
  title: string;
  revenue: number;
  orders: number;
}

/**
 * One series of revenue as columns (FR-SEF-24): thin bars with rounded tops, hairline grid,
 * a tooltip per bar and the same numbers as a table for screen readers and checking.
 */
export function RevenueChart({ title, points }: { title: string; points: Point[] }) {
  const { t, i18n } = useTranslation();
  const [table, setTable] = useState(false);
  const id = useId();
  const money = (v: number) => formatMoney(v.toFixed(2), 'BAM', i18n.language);
  return (
    <section
      className="rounded-2xl border border-line bg-surface p-5 shadow-card"
      aria-labelledby={id}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="font-display text-base font-semibold text-ink">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => setTable((v) => !v)}
          aria-pressed={table}
          className="text-xs font-semibold text-accent hover:underline"
        >
          {t('reports.showTable')}
        </button>
      </div>
      {table ? (
        <DataTable
          columns={[title, t('reports.orders'), t('reports.revenue')]}
          rows={points.map((p) => [p.title, String(p.orders), money(p.revenue)])}
        />
      ) : (
        <div className="h-56" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: 'var(--line)' }}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                      <p className="font-semibold text-ink">{p.title}</p>
                      <p className="mt-0.5 text-ink tabular-nums">{money(p.revenue)}</p>
                      <p className="text-muted">
                        {t('reports.orders')}: {p.orders}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="revenue"
                fill="var(--chart-bar)"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/** A ranked table with a share bar beside the revenue (items, categories, waiters). */
export function RankTable({
  title,
  columns,
  rows,
  total,
}: {
  title: string;
  columns: string[];
  rows: { cells: ReactNode[]; revenue: number }[];
  total: number;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 className="mb-3 font-display text-base font-semibold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t('reports.none')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                {columns.map((c) => (
                  <th key={c} className="py-2 pr-3 font-medium">
                    {c}
                  </th>
                ))}
                <th className="py-2 pr-3 text-right font-medium">{t('reports.revenue')}</th>
                <th className="w-28 py-2 font-medium">{t('reports.share')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const share = total > 0 ? row.revenue / total : 0;
                return (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    {row.cells.map((cell, j) => (
                      <td
                        key={j}
                        className={cn(
                          'py-2 pr-3',
                          j === 0 ? 'font-medium text-ink' : 'text-muted tabular-nums',
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                    <td className="py-2 pr-3 text-right font-semibold text-ink tabular-nums">
                      {formatMoney(row.revenue.toFixed(2), 'BAM', i18n.language)}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-[var(--chart-bar)]"
                            style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                        <span className="w-9 text-right text-xs text-muted tabular-nums">
                          {Math.round(share * 100)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="max-h-56 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-left text-xs text-muted">
            {columns.map((c, i) => (
              <th key={c} className={cn('py-1.5 pr-3 font-medium', i > 0 && 'text-right')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={cn('py-1.5 pr-3', j > 0 ? 'text-right tabular-nums' : 'text-ink')}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
