import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GuestMenu } from '@qafe/contracts';
import { redisKey, type Redis } from '@qafe/redis';
import { REDIS } from '../../common/redis/redis.module.js';

/** Upper bound for a stale menu if an invalidation is ever lost. */
const TTL_SECONDS = 300;

/**
 * Guest menu cache in Redis. Postgres stays the source of truth: when Redis is down the
 * menu is read from the database, and orders are always priced from the database.
 */
@Injectable()
export class MenuCache {
  private readonly logger = new Logger(MenuCache.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async get(venueId: string): Promise<GuestMenu | null> {
    try {
      const cached = await this.redis.get(this.key(venueId));
      return cached ? (JSON.parse(cached) as GuestMenu) : null;
    } catch (error) {
      this.logger.warn(`menu cache read failed: ${String(error)}`);
      return null;
    }
  }

  async set(venueId: string, menu: GuestMenu): Promise<void> {
    try {
      await this.redis.set(this.key(venueId), JSON.stringify(menu), 'EX', TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`menu cache write failed: ${String(error)}`);
    }
  }

  /** Called after every committed menu change. */
  async invalidate(venueId: string): Promise<void> {
    try {
      await this.redis.del(this.key(venueId));
    } catch (error) {
      this.logger.warn(`menu cache invalidation failed: ${String(error)}`);
    }
  }

  private key(venueId: string) {
    return redisKey('catalog', 'guest-menu', venueId);
  }
}
