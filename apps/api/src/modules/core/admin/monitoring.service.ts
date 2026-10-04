import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  LatencyRow,
  MonitoredService,
  MonitoringOverview,
  MonitoringWindow,
} from '@qafe/contracts';
import { APP_CONFIG, type AppConfig } from '../../../config/config.js';

interface Sample {
  metric: Record<string, string>;
  value: [number, string];
}

const HTTP = 'http_server_request_duration_seconds';
/** Services that report their own metrics, and infrastructure Prometheus scrapes directly. */
const APP_SERVICES = ['qafe-api', 'qafe-worker'];
const SCRAPED = ['traefik', 'otel-collector', 'prometheus'];

/**
 * The admin monitoring screen (FR-ADM-17, FR-ADM-18). Reads only from Prometheus, never from
 * the services themselves, so it keeps working when one of them is down (NFR-21, NFR-22).
 */
@Injectable()
export class MonitoringService {
  private readonly log = new Logger(MonitoringService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async overview(window: MonitoringWindow): Promise<MonitoringOverview> {
    const empty: MonitoringOverview = {
      available: false,
      window,
      services: [],
      modules: [],
      routes: [],
      outboxEventsPerMinute: null,
      grafanaUrl: this.config.monitoring.grafanaUrl,
    };
    if (!this.config.monitoring.prometheusUrl) return empty;
    try {
      const w = window;
      const quantile = (q: number, by: string) =>
        `histogram_quantile(${q}, sum by (le, ${by}) (rate(${HTTP}_bucket[${w}])))`;
      const rate = (by: string) => `sum by (${by}) (rate(${HTTP}_count[${w}]))`;
      const errors = (by: string) =>
        `sum by (${by}) (rate(${HTTP}_count{http_response_status_code=~"5.."}[${w}]))`;

      const [
        starts,
        cpu,
        memory,
        up,
        moduleRate,
        moduleErrors,
        p50,
        p95,
        p99,
        routeRate,
        routeErrors,
        routeP95,
        outbox,
      ] = await Promise.all([
        this.query('qafe_process_start_time_seconds'),
        this.query('sum by (service_name) (rate(process_cpu_time_seconds_total[5m]))'),
        this.query('sum by (service_name) (process_memory_usage)'),
        this.query('up'),
        this.query(rate('module')),
        this.query(errors('module')),
        this.query(quantile(0.5, 'module')),
        this.query(quantile(0.95, 'module')),
        this.query(quantile(0.99, 'module')),
        this.query(rate('http_request_method, http_route, module')),
        this.query(errors('http_request_method, http_route, module')),
        this.query(quantile(0.95, 'http_request_method, http_route, module')),
        this.query(`sum(rate(qafe_outbox_events_total[${w}])) * 60`),
      ]);

      const now = Date.now() / 1000;
      const services: MonitoredService[] = APP_SERVICES.map((name) => {
        const mine = starts.filter((s) => s.metric.service_name === name);
        const youngest = mine.length ? Math.max(...mine.map((s) => num(s))) : null;
        return {
          name,
          up: mine.length > 0,
          version: mine[0]?.metric.service_version ?? null,
          instances: mine.length,
          uptimeSeconds: youngest === null ? null : Math.max(0, now - youngest),
          cpu: valueOf(cpu, (m) => m.service_name === name),
          memoryBytes: valueOf(memory, (m) => m.service_name === name),
        };
      });
      for (const job of SCRAPED) {
        const targets = up.filter((s) => s.metric.job === job);
        services.push({
          name: job,
          up: targets.some((s) => num(s) === 1),
          version: null,
          instances: targets.length,
          uptimeSeconds: null,
          cpu: null,
          memoryBytes: null,
        });
      }

      const modules: LatencyRow[] = moduleRate
        .map((r) => {
          const module = r.metric.module ?? 'unknown';
          const match = (m: Record<string, string>) => m.module === module;
          const rps = num(r);
          return {
            name: module,
            module,
            requestsPerSecond: rps,
            p50: valueOf(p50, match),
            p95: valueOf(p95, match),
            p99: valueOf(p99, match),
            errorRate: rps > 0 ? (valueOf(moduleErrors, match) ?? 0) / rps : 0,
          };
        })
        .filter((m) => m.module !== 'health')
        .sort((a, b) => b.requestsPerSecond - a.requestsPerSecond);

      const routes: LatencyRow[] = routeP95
        .filter((r) => Number.isFinite(num(r)) && r.metric.module !== 'health')
        .map((r) => {
          const key = (m: Record<string, string>) =>
            m.http_route === r.metric.http_route &&
            m.http_request_method === r.metric.http_request_method;
          const rps = valueOf(routeRate, key) ?? 0;
          return {
            name: `${r.metric.http_request_method} ${r.metric.http_route}`,
            module: r.metric.module ?? null,
            requestsPerSecond: rps,
            p50: null,
            p95: num(r),
            p99: null,
            errorRate: rps > 0 ? (valueOf(routeErrors, key) ?? 0) / rps : 0,
          };
        })
        .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0))
        .slice(0, 15);

      return {
        ...empty,
        available: true,
        services,
        modules,
        routes,
        outboxEventsPerMinute: outbox[0] ? num(outbox[0]) : 0,
      };
    } catch (error) {
      this.log.warn(`Prometheus unavailable: ${String(error)}`);
      return empty;
    }
  }

  private async query(promql: string): Promise<Sample[]> {
    const url = new URL('/api/v1/query', this.config.monitoring.prometheusUrl!);
    url.searchParams.set('query', promql);
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`Prometheus ${res.status}`);
    const body = (await res.json()) as { data?: { result?: Sample[] } };
    return body.data?.result ?? [];
  }
}

const num = (s: Sample): number => Number(s.value[1]);

function valueOf(samples: Sample[], match: (m: Record<string, string>) => boolean): number | null {
  const found = samples.find((s) => match(s.metric));
  if (!found) return null;
  const v = num(found);
  return Number.isFinite(v) ? v : null;
}
