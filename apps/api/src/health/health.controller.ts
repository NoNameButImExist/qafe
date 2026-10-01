import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CoreHealth } from '../modules/core/index.js';

@Controller('health')
export class HealthController {
  constructor(private readonly core: CoreHealth) {}

  /** The process is up. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Dependencies answer; 503 takes the instance out of rotation. Redis joins in phase 4. */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    const database = await this.core.database();
    if (!database) void reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: database ? 'ok' : 'unavailable',
      checks: { database: database ? 'up' : 'down' },
    };
  }
}
