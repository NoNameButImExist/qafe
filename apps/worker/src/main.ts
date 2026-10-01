import { TenantDatabase } from '@qafe/db';
import webpush from 'web-push';
import { AuditWriter } from './audit-writer.js';
import { loadConfig } from './config.js';
import { createHealthServer } from './health.js';
import { OutboxRelay, type OutboxEvent } from './outbox-relay.js';
import { PushNotifier } from './push-notifier.js';
import { ReportingWriter } from './reporting-writer.js';

const config = loadConfig();
const connection = (
  module: 'core' | 'catalog' | 'ordering' | 'billing' | 'audit' | 'reporting',
  password: string,
) =>
  new TenantDatabase({
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    database: config.POSTGRES_DB,
    user: `svc_${module}`,
    password,
    max: 2,
    applicationName: `qafe-worker:${module}`,
  });

const core = connection('core', config.SVC_CORE_PASSWORD);
const catalog = connection('catalog', config.SVC_CATALOG_PASSWORD);
const ordering = connection('ordering', config.SVC_ORDERING_PASSWORD);
const billing = connection('billing', config.SVC_BILLING_PASSWORD);
const audit = connection('audit', config.SVC_AUDIT_PASSWORD);
const reporting = connection('reporting', config.SVC_REPORTING_PASSWORD);

const sources = [
  { schema: 'core', db: core },
  { schema: 'catalog', db: catalog },
  { schema: 'ordering', db: ordering },
  { schema: 'billing', db: billing },
];

const auditWriter = new AuditWriter(audit);
const reportingWriter = new ReportingWriter(reporting);
const push =
  config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
    ? new PushNotifier(
        ordering,
        (target, payload) =>
          webpush.sendNotification(target, payload, {
            vapidDetails: {
              subject: config.VAPID_SUBJECT,
              publicKey: config.VAPID_PUBLIC_KEY!,
              privateKey: config.VAPID_PRIVATE_KEY!,
            },
            TTL: 300,
            urgency: 'high',
          }),
        (error) => console.error('[push] send failed:', error),
      )
    : null;

// Audit log and report facts first (a failure retries the batch), then notifications
// (best effort).
const handle = async (events: OutboxEvent[]) => {
  await auditWriter.handle(events);
  await reportingWriter.handle(events);
  await push?.handle(events);
};

const relay = new OutboxRelay(sources, handle, {
  batchSize: 100,
  intervalMs: config.OUTBOX_POLL_MS,
  onError: (error) => console.error('[outbox] relay failed, retrying:', error),
});
relay.start();

const server = createHealthServer();
server.listen(config.PORT, '0.0.0.0');
console.log(
  `[worker] relaying ${sources.map((s) => `${s.schema}.outbox`).join(', ')} every ${config.OUTBOX_POLL_MS} ms; web push ${push ? 'on' : 'off (no VAPID keys)'}; health on :${config.PORT}`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void (async () => {
      await relay.stop();
      await Promise.all([
        core.close(),
        catalog.close(),
        ordering.close(),
        billing.close(),
        audit.close(),
      ]);
      server.close(() => process.exit(0));
    })();
  });
}
