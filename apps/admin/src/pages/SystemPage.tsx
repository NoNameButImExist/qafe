import type { LatencyRow, MonitoredService, MonitoringWindow } from '@qafe/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Activity, CircleAlert, ExternalLink, Gauge, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, cn, Segmented } from '@qafe/ui';
import { monitoringQuery } from '../lib/queries';

/** p95 above this is out of NFR-03 (300 ms); shown in red. */
const SLOW_SECONDS = 0.3;

/** FR-ADM-17, FR-ADM-18: services, latency and errors, read from Prometheus (NFR-22). */
export function SystemPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: '/app/system' });
  const navigate = useNavigate({ from: '/system' });
  const window: MonitoringWindow = search.window ?? '1h';
  const data = useQuery(monitoringQuery(window));
  const overview = data.data;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
            {t('system.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('system.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {overview?.grafanaUrl && (
            <a
              href={overview.grafanaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-accent hover:bg-surface-2"
            >
              Grafana <ExternalLink className="size-4" aria-hidden />
            </a>
          )}
          <Segmented<MonitoringWindow>
            label={t('system.window')}
            value={window}
            options={(['1h', '24h', '7d'] as const).map((w) => ({
              value: w,
              label: t(`system.windows.${w}`),
            }))}
            onChange={(w) => void navigate({ search: { window: w === '1h' ? undefined : w } })}
          />
        </div>
      </div>

      {overview && !overview.available ? (
        <Card className="mt-6 flex items-start gap-3 p-5 text-sm text-muted">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          {t('system.unavailable')}
        </Card>
      ) : (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {(overview?.services ?? []).map((s) => (
              <ServiceCard key={s.name} service={s} />
            ))}
          </section>

          <Card className="mt-6 overflow-hidden">
            <h2 className="flex items-center gap-2 border-b border-line px-5 py-4 font-display text-base font-semibold text-ink">
              <Gauge className="size-5 text-accent" aria-hidden />
              {t('system.modules')}
              {overview?.outboxEventsPerMinute != null && (
                <span className="ml-auto text-xs font-medium text-muted">
                  {t('system.outbox', { count: Math.round(overview.outboxEventsPerMinute) })}
                </span>
              )}
            </h2>
            <LatencyTable rows={overview?.modules ?? []} showAll />
          </Card>

          <Card className="mt-6 overflow-hidden">
            <h2 className="flex items-center gap-2 border-b border-line px-5 py-4 font-display text-base font-semibold text-ink">
              <Activity className="size-5 text-accent" aria-hidden />
              {t('system.routes')}
            </h2>
            <LatencyTable rows={overview?.routes ?? []} />
          </Card>
        </>
      )}
    </div>
  );
}

function ServiceCard({ service: s }: { service: MonitoredService }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <Server className="size-4 text-muted" aria-hidden />
          {s.name}
        </p>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-bold',
            s.up ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger',
          )}
        >
          {s.up ? t('system.up') : t('system.down')}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
        {s.version && (
          <>
            <dt className="text-muted">{t('system.version')}</dt>
            <dd className="text-right font-medium text-ink">{s.version}</dd>
          </>
        )}
        <dt className="text-muted">{t('system.instances')}</dt>
        <dd className="text-right font-medium text-ink">{s.instances}</dd>
        {s.uptimeSeconds !== null && (
          <>
            <dt className="text-muted">{t('system.uptime')}</dt>
            <dd className="text-right font-medium text-ink">{duration(s.uptimeSeconds, t)}</dd>
          </>
        )}
        {s.cpu !== null && (
          <>
            <dt className="text-muted">CPU</dt>
            <dd className="text-right font-medium text-ink">{Math.round(s.cpu * 100)} %</dd>
          </>
        )}
        {s.memoryBytes !== null && (
          <>
            <dt className="text-muted">{t('system.memory')}</dt>
            <dd className="text-right font-medium text-ink">
              {Math.round(s.memoryBytes / 1024 / 1024)} MB
            </dd>
          </>
        )}
      </dl>
    </Card>
  );
}

function LatencyTable({ rows, showAll = false }: { rows: LatencyRow[]; showAll?: boolean }) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted">{t('system.noTraffic')}</p>;
  }
  const ms = (v: number | null) => (v === null ? '—' : `${Math.round(v * 1000)} ms`);
  const slow = (v: number | null) => v !== null && v > SLOW_SECONDS && 'font-bold text-danger';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="px-5 py-2.5 font-semibold">
              {showAll ? t('system.module') : t('system.route')}
            </th>
            <th className="px-3 py-2.5 text-right font-semibold">{t('system.rps')}</th>
            {showAll && <th className="px-3 py-2.5 text-right font-semibold">p50</th>}
            <th className="px-3 py-2.5 text-right font-semibold">p95</th>
            {showAll && <th className="px-3 py-2.5 text-right font-semibold">p99</th>}
            <th className="px-5 py-2.5 text-right font-semibold">{t('system.errors')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="px-5 py-2.5 font-medium text-ink">
                {r.name}
                {!showAll && r.module && (
                  <span className="ml-2 text-xs text-muted">{r.module}</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {r.requestsPerSecond.toFixed(2)}
              </td>
              {showAll && <td className="px-3 py-2.5 text-right tabular-nums">{ms(r.p50)}</td>}
              <td className={cn('px-3 py-2.5 text-right tabular-nums', slow(r.p95))}>
                {ms(r.p95)}
              </td>
              {showAll && (
                <td className={cn('px-3 py-2.5 text-right tabular-nums', slow(r.p99))}>
                  {ms(r.p99)}
                </td>
              )}
              <td
                className={cn(
                  'px-5 py-2.5 text-right tabular-nums',
                  r.errorRate > 0.01 && 'font-bold text-danger',
                )}
              >
                {(r.errorRate * 100).toFixed(1)} %
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function duration(seconds: number, t: ReturnType<typeof useTranslation>['t']): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return t('system.durationDays', { d, h });
  if (h > 0) return t('system.durationHours', { h, m });
  return t('system.durationMinutes', { m });
}
