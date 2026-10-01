import { TenantDatabase } from '@qafe/db';
import { AuditWriter } from './audit-writer.js';
import { loadConfig } from './config.js';
import { createHealthServer } from './health.js';
import { OutboxRelay } from './outbox-relay.js';

const config = loadConfig();
const connection = (module: 'core' | 'catalog' | 'audit', password: string) =>
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
const audit = connection('audit', config.SVC_AUDIT_PASSWORD);

// Outboxes of ordering and billing join here when those modules start publishing.
const sources = [
  { schema: 'core', db: core },
  { schema: 'catalog', db: catalog },
];
const relay = new OutboxRelay(sources, new AuditWriter(audit).handle, {
  batchSize: 100,
  intervalMs: config.OUTBOX_POLL_MS,
  onError: (error) => console.error('[outbox] relay failed, retrying:', error),
});
relay.start();

const server = createHealthServer();
server.listen(config.PORT, '0.0.0.0');
console.log(
  `[worker] relaying ${sources.map((s) => `${s.schema}.outbox`).join(', ')} every ${config.OUTBOX_POLL_MS} ms; health on :${config.PORT}`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void (async () => {
      await relay.stop();
      await Promise.all([core.close(), catalog.close(), audit.close()]);
      server.close(() => process.exit(0));
    })();
  });
}
