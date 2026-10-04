import { metrics, type Attributes, type Histogram, type Meter } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';

/**
 * OpenTelemetry metrics for the api and the worker. They go over OTLP to the collector
 * (Docker: otel-collector), which Prometheus scrapes; Grafana shows them. Every measurement
 * of a module carries the attribute `module` (core, catalog, ordering, ...).
 * Without OTEL_EXPORTER_OTLP_ENDPOINT nothing is exported (tests, plain local runs).
 */
export interface Telemetry {
  meter: Meter;
  shutdown: () => Promise<void>;
}

export function startTelemetry(serviceName: string, version: string): Telemetry {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return { meter: metrics.getMeter(serviceName), shutdown: () => Promise.resolve() };

  const provider = new MeterProvider({
    resource: resourceFromAttributes({
      'service.name': serviceName,
      'service.version': version,
      // One per process: several api replicas must not overwrite each other's counters.
      'service.instance.id': `${hostname()}-${process.pid}`,
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/metrics` }),
        exportIntervalMillis: 15_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(provider);
  // CPU, memory and event loop of the process.
  new HostMetrics({ meterProvider: provider, name: serviceName }).start();
  // When the process started, for the uptime on the admin monitoring screen (FR-ADM-17).
  const startedAt = Date.now() / 1000 - process.uptime();
  provider
    .getMeter(serviceName)
    .createObservableGauge('qafe.process.start_time', { unit: 's' })
    .addCallback((result) => result.observe(startedAt));
  return { meter: provider.getMeter(serviceName), shutdown: () => provider.shutdown() };
}

/** Which module a route belongs to, for the `module` attribute. */
export function moduleOfRoute(route: string): string {
  if (route.startsWith('/staff/sessions/') && route.endsWith('/pay')) return 'billing';
  if (route.startsWith('/catalog') || route.startsWith('/admin/venues/:venueId/catalog'))
    return 'catalog';
  if (route.startsWith('/guest') || route.startsWith('/staff')) return 'ordering';
  if (route.startsWith('/reports')) return 'reporting';
  if (route.startsWith('/admin/audit')) return 'audit';
  if (route.startsWith('/health')) return 'health';
  return 'core';
}

/** Duration of HTTP requests, in seconds (OpenTelemetry semantic convention name). */
export function httpServerDuration(meter: Meter): Histogram<Attributes> {
  return meter.createHistogram('http.server.request.duration', {
    description: 'Duration of HTTP requests handled by the api',
    unit: 's',
    advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
  });
}

/** The meter of a service (works before and after startTelemetry; no-op without it). */
export const meterOf = (serviceName: string): Meter => metrics.getMeter(serviceName);

/** The version from the app's package.json next to dist/ (works in Docker, where npm sets nothing). */
export function packageVersion(mainUrl: string): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', mainUrl), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
