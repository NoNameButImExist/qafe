import { z } from 'zod';

/** GET /admin/monitoring?window= (FR-ADM-17, FR-ADM-18). */
export const MonitoringWindow = z.enum(['1h', '24h', '7d']);
export type MonitoringWindow = z.infer<typeof MonitoringWindow>;

export const MonitoringQuery = z.object({ window: MonitoringWindow.default('1h') });
export type MonitoringQuery = z.input<typeof MonitoringQuery>;

const nullableNumber = z.number().nullable();

export const MonitoredService = z.object({
  name: z.string(),
  up: z.boolean(),
  version: z.string().nullable(),
  instances: z.number().int(),
  /** Of the youngest instance (a restart shows up here). */
  uptimeSeconds: nullableNumber,
  /** CPU cores in use, all instances together. */
  cpu: nullableNumber,
  memoryBytes: nullableNumber,
});
export type MonitoredService = z.infer<typeof MonitoredService>;

export const LatencyRow = z.object({
  /** The module (core, catalog, ordering, ...) or the route, e.g. "POST /guest/orders". */
  name: z.string(),
  module: z.string().nullable(),
  requestsPerSecond: z.number(),
  p50: nullableNumber,
  p95: nullableNumber,
  p99: nullableNumber,
  /** Share of 5xx answers, 0..1. */
  errorRate: z.number(),
});
export type LatencyRow = z.infer<typeof LatencyRow>;

export const MonitoringOverview = z.object({
  /** False when Prometheus is not configured or does not answer: nothing else is filled. */
  available: z.boolean(),
  window: MonitoringWindow,
  services: z.array(MonitoredService),
  modules: z.array(LatencyRow),
  /** The slowest routes by p95. */
  routes: z.array(LatencyRow),
  outboxEventsPerMinute: nullableNumber,
  grafanaUrl: z.string().nullable(),
});
export type MonitoringOverview = z.infer<typeof MonitoringOverview>;
