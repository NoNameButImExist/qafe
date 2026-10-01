import { Redis, type RedisOptions } from 'ioredis';

export { Redis };

/** Modules that own Redis keys. Every key starts with `qafe:<module>:`. */
export type KeyModule = 'core' | 'catalog' | 'ordering' | 'billing' | 'realtime';

/** `qafe:<module>:<parts...>`. Redis is a cache in front of Postgres, never the source of truth. */
export function redisKey(module: KeyModule, ...parts: (string | number)[]): string {
  return ['qafe', module, ...parts].join(':');
}

export interface RedisConnection {
  host: string;
  port: number;
  password?: string | undefined;
}

/** A client with sane defaults: reconnects forever, fails commands fast while disconnected. */
export function createRedis(connection: RedisConnection, options: RedisOptions = {}): Redis {
  return new Redis({
    host: connection.host,
    port: connection.port,
    password: connection.password || undefined,
    maxRetriesPerRequest: 2,
    connectTimeout: 5_000,
    lazyConnect: false,
    ...options,
  });
}

export interface RateLimitResult {
  allowed: boolean;
  /** Hits in the current window, including this one. */
  count: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

/**
 * Fixed-window counter: at most `limit` hits per `windowSeconds` for one key. The first hit
 * of a window sets its expiry, so the window starts with the first request.
 */
export async function hitRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const [[, count], [, ttl]] = (await redis.multi().incr(key).ttl(key).exec()) as [
    [null, number],
    [null, number],
  ];
  let retryAfter = ttl;
  if (ttl < 0) {
    await redis.expire(key, windowSeconds);
    retryAfter = windowSeconds;
  }
  return { allowed: count <= limit, count, retryAfter };
}
