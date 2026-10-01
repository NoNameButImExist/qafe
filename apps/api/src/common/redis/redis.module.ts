import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { createRedis, type Redis } from '@qafe/redis';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

export const REDIS = Symbol('REDIS');

/** Closes the shared client on shutdown. */
@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

/** One Redis client for cache and rate limits. Redis is never a source of truth. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => createRedis(c.redis),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}

/** True when Redis answers PING, for /health/ready. */
export async function redisUp(redis: Redis): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}
