import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  totpUri,
  verifyTotp,
  type PlatformClaims,
} from '@qafe/auth';
import { ErrorCode, type MfaSetup, type MfaStatus } from '@qafe/contracts';
import { redisKey, type Redis } from '@qafe/redis';
import { ApiException } from '../../../common/errors.js';
import { REDIS } from '../../../common/redis/redis.module.js';
import { APP_CONFIG, type AppConfig } from '../../../config/config.js';
import { CoreDatabase } from '../core.database.js';
import { publish } from '../outbox.js';

const PLATFORM = { venueId: null, isSuperAdmin: false } as const;
/** A scanned but not yet confirmed secret waits this long. */
const SETUP_TTL_SECONDS = 10 * 60;

const invalidCode = () =>
  new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.invalidCode, 'Wrong code');

/**
 * Two-factor sign-in for platform admins (FR-ADM-01), turned on and off by each admin in
 * their account. Secrets are stored encrypted (MFA_ENCRYPTION_KEY); a code is accepted once.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly db: CoreDatabase,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async status(claims: PlatformClaims): Promise<MfaStatus> {
    const user = await this.user(claims.userId);
    return { enabled: user.mfa_enabled, available: Boolean(this.config.auth.mfaEncryptionKey) };
  }

  /** A new secret to scan. It is saved only after the first correct code (enable). */
  async setup(claims: PlatformClaims): Promise<MfaSetup> {
    const key = this.key();
    const user = await this.user(claims.userId);
    if (user.mfa_enabled) {
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.invalidState, 'Already turned on');
    }
    const secret = generateTotpSecret();
    await this.redis.set(
      redisKey('core', 'mfa-setup', claims.userId),
      encryptSecret(secret, key),
      'EX',
      SETUP_TTL_SECONDS,
    );
    return { secret, otpauthUrl: totpUri(secret, user.email ?? claims.name) };
  }

  async enable(claims: PlatformClaims, code: string): Promise<void> {
    const key = this.key();
    const pendingKey = redisKey('core', 'mfa-setup', claims.userId);
    const sealed = await this.redis.get(pendingKey);
    if (!sealed) {
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.invalidState, 'Start the setup again');
    }
    const step = verifyTotp(decryptSecret(sealed, key), code);
    if (step === null) throw invalidCode();
    await this.markUsed(claims.userId, step);
    await this.db.withTenant(PLATFORM, async (trx) => {
      await trx
        .updateTable('core.users')
        .set({ mfa_enabled: true, mfa_secret_enc: sealed })
        .where('id', '=', claims.userId)
        .execute();
      await publish(trx, {
        type: 'user.mfa_enabled',
        userId: claims.userId,
        userLabel: claims.name,
        actor: { id: claims.userId, label: claims.name },
      });
    });
    await this.redis.del(pendingKey);
  }

  /** Turning it off needs a current code, so a stolen session alone cannot do it. */
  async disable(claims: PlatformClaims, code: string): Promise<void> {
    if (!(await this.verify(claims.userId, code))) throw invalidCode();
    await this.db.withTenant(PLATFORM, async (trx) => {
      await trx
        .updateTable('core.users')
        .set({ mfa_enabled: false, mfa_secret_enc: null })
        .where('id', '=', claims.userId)
        .execute();
      await publish(trx, {
        type: 'user.mfa_disabled',
        userId: claims.userId,
        userLabel: claims.name,
        actor: { id: claims.userId, label: claims.name },
      });
    });
  }

  /** The admin's current code; each code works once (replay is refused). */
  async verify(userId: string, code: string): Promise<boolean> {
    const user = await this.user(userId);
    if (!user.mfa_enabled || !user.mfa_secret_enc) return false;
    const step = verifyTotp(decryptSecret(user.mfa_secret_enc, this.key()), code);
    if (step === null) return false;
    return this.markUsed(userId, step);
  }

  /** True the first time a step is used. */
  private async markUsed(userId: string, step: number): Promise<boolean> {
    const fresh = await this.redis.set(
      redisKey('core', 'totp-used', userId, step),
      '1',
      'EX',
      120,
      'NX',
    );
    return fresh === 'OK';
  }

  private key(): string {
    const key = this.config.auth.mfaEncryptionKey;
    if (!key) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.mfaUnavailable,
        'Two-factor sign-in is not configured on this server',
      );
    }
    return key;
  }

  private user(userId: string) {
    return this.db.withTenant(PLATFORM, (trx) =>
      trx
        .selectFrom('core.users')
        .select(['email', 'mfa_enabled', 'mfa_secret_enc'])
        .where('id', '=', userId)
        .executeTakeFirstOrThrow(),
    );
  }
}
