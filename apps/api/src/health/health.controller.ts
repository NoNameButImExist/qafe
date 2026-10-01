import { Controller, Get, HttpCode, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Redis } from '@qafe/redis';
import type { FastifyReply } from 'fastify';
import { REDIS, redisUp } from '../common/redis/redis.module.js';
import { CoreHealth } from '../modules/core/index.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly core: CoreHealth,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** The process is up. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Dependencies answer; 503 takes the instance out of rotation. */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    const [database, redis] = await Promise.all([this.core.database(), redisUp(this.redis)]);
    const ok = database && redis;
    if (!ok) void reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'unavailable',
      checks: { database: database ? 'up' : 'down', redis: redis ? 'up' : 'down' },
    };
  }
}
