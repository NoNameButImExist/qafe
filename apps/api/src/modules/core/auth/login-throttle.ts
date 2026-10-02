import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@qafe/contracts';
import { redisKey, type Redis } from '@qafe/redis';
import { ApiException } from '../../../common/errors.js';
import { REDIS } from '../../../common/redis/redis.module.js';

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 20;

/**
 * Brute-force protection for login (OWASP ASVS L1): after 5 failed attempts per account+IP,
 * or 20 per IP, further attempts are refused for 15 minutes. Counters live in Redis, so every
 * api instance sees the same ones. If Redis is down, sign-in still works (logged): Redis is
 * never a source of truth, and locking everyone out would be worse.
 */
@Injectable()
export class LoginThrottle {
  private readonly logger = new Logger(LoginThrottle.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async assertAllowed(ip: string, account: string): Promise<void> {
    let counts: (string | null)[];
    try {
      counts = await this.redis.mget(this.accountKey(ip, account), this.ipKey(ip));
    } catch (error) {
      this.logger.warn(`login throttle unavailable: ${String(error)}`);
      return;
    }
    if (
      Number(counts[0] ?? 0) >= MAX_FAILURES_PER_ACCOUNT ||
      Number(counts[1] ?? 0) >= MAX_FAILURES_PER_IP
    ) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.tooManyAttempts,
        'Too many failed attempts, try again later',
      );
    }
  }

  async recordFailure(ip: string, account: string): Promise<void> {
    try {
      const multi = this.redis.multi();
      for (const key of [this.accountKey(ip, account), this.ipKey(ip)]) {
        // The window starts with the first failure and does not grow with later ones.
        multi.incr(key).expire(key, WINDOW_SECONDS, 'NX');
      }
      await multi.exec();
    } catch (error) {
      this.logger.warn(`login throttle unavailable: ${String(error)}`);
    }
  }

  async recordSuccess(ip: string, account: string): Promise<void> {
    try {
      await this.redis.del(this.accountKey(ip, account));
    } catch (error) {
      this.logger.warn(`login throttle unavailable: ${String(error)}`);
    }
  }

  private accountKey(ip: string, account: string) {
    return redisKey('core', 'login-fail', 'acct', ip, account);
  }

  private ipKey(ip: string) {
    return redisKey('core', 'login-fail', 'ip', ip);
  }
}
