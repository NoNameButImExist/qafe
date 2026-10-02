import { describe, expect, it } from 'vitest';
import { moduleOfRoute, startTelemetry } from './index.js';

describe('observability', () => {
  it('maps routes to modules', () => {
    expect(moduleOfRoute('/staff/sessions/:id/pay')).toBe('billing');
    expect(moduleOfRoute('/staff/floor')).toBe('ordering');
    expect(moduleOfRoute('/guest/menu')).toBe('ordering');
    expect(moduleOfRoute('/catalog/items/:id')).toBe('catalog');
    expect(moduleOfRoute('/admin/venues/:venueId/catalog/menu')).toBe('catalog');
    expect(moduleOfRoute('/reports/summary')).toBe('reporting');
    expect(moduleOfRoute('/admin/audit')).toBe('audit');
    expect(moduleOfRoute('/auth/staff/login')).toBe('core');
  });

  it('exports nothing without an endpoint', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const telemetry = startTelemetry('test', '0.0.0');
    telemetry.meter.createCounter('x').add(1);
    await telemetry.shutdown();
  });
});
