import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@qafe/contracts';
import { ApiException } from '../../../common/errors.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 20;

interface Bucket {
  failures: number;
  resetAt: number;
}

/**
 * Brute-force protection for login (OWASP ASVS L1): after 5 failed attempts per account+IP,
 * or 20 per IP, further attempts are refused for 15 minutes.
 * In-memory for now (one api instance); moves to Redis with the redis package in phase 4.
 */
@Injectable()
export class LoginThrottle {
  private readonly buckets = new Map<string, Bucket>();

  assertAllowed(ip: string, account: string, now = Date.now()): void {
    if (
      this.failures(`acct:${ip}:${account}`, now) >= MAX_FAILURES_PER_ACCOUNT ||
      this.failures(`ip:${ip}`, now) >= MAX_FAILURES_PER_IP
    ) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.tooManyAttempts,
        'Too many failed attempts, try again later',
      );
    }
  }

  recordFailure(ip: string, account: string, now = Date.now()): void {
    for (const key of [`acct:${ip}:${account}`, `ip:${ip}`]) {
      const bucket = this.current(key, now) ?? { failures: 0, resetAt: now + WINDOW_MS };
      bucket.failures += 1;
      this.buckets.set(key, bucket);
    }
  }

  recordSuccess(ip: string, account: string): void {
    this.buckets.delete(`acct:${ip}:${account}`);
  }

  private failures(key: string, now: number): number {
    return this.current(key, now)?.failures ?? 0;
  }

  private current(key: string, now: number): Bucket | undefined {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt <= now) {
      this.buckets.delete(key);
      return undefined;
    }
    return bucket;
  }
}
