import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDIS } from '../common/redis/redis.module.js';
import { CoreHealth } from '../modules/core/index.js';
import { HealthController } from './health.controller.js';

describe('health endpoints', () => {
  let app: NestFastifyApplication;
  let databaseUp = true;
  let redisUp = true;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: CoreHealth, useValue: { database: () => Promise.resolve(databaseUp) } },
        {
          provide: REDIS,
          useValue: {
            ping: () => (redisUp ? Promise.resolve('PONG') : Promise.reject(new Error('down'))),
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready is 200 when the database and Redis answer', async () => {
    databaseUp = true;
    redisUp = true;
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ checks: { database: 'up', redis: 'up' } });
  });

  it('GET /health/ready is 503 when Redis is down', async () => {
    databaseUp = true;
    redisUp = false;
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ checks: { database: 'up', redis: 'down' } });
  });

  it('GET /health/ready is 503 when the database is down', async () => {
    databaseUp = false;
    redisUp = true;
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'unavailable', checks: { database: 'down' } });
  });
});
