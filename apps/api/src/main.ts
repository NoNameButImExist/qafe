import 'reflect-metadata';
import { createApp } from './bootstrap.js';
import { loadConfig } from './config/config.js';

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.port, '0.0.0.0');
