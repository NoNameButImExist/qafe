import { createHealthServer } from './health.js';

const port = Number(process.env.PORT ?? 3001);

// Outbox relay and BullMQ processors are added in phase 4.
const server = createHealthServer();
server.listen(port, '0.0.0.0');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
