import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Redis } from '@qafe/redis';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { RedisIoAdapter } from './common/redis/redis-io.adapter.js';
import { REDIS } from './common/redis/redis.module.js';
import type { AppConfig } from './config/config.js';

/** Builds the Nest app; used by main.ts and by integration tests. */
export async function createApp(config: AppConfig): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config),
    // Behind Traefik in production: take the client IP from X-Forwarded-For.
    new FastifyAdapter({ trustProxy: config.env === 'production' }),
    { logger: config.env === 'test' ? ['error', 'warn'] : undefined },
  );
  await app.register(fastifyCookie);
  // Image uploads (menu items, logo); size is checked again per route.
  await app.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  // Socket.IO (live order status) fans out across instances through Redis.
  app.useWebSocketAdapter(new RedisIoAdapter(app, app.get<Redis>(REDIS), config.corsOrigins));
  app.enableShutdownHooks();
  return app;
}
