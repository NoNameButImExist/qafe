import 'reflect-metadata';
import { packageVersion, startTelemetry } from '@qafe/observability';
import { createApp } from './bootstrap.js';
import { loadConfig } from './config/config.js';

// Before the app, so its meters report to the collector (no-op without the endpoint).
const telemetry = startTelemetry('qafe-api', packageVersion(import.meta.url));
process.once('beforeExit', () => void telemetry.shutdown());

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.port, '0.0.0.0');
