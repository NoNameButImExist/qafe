import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { decryptSecret, encryptSecret } from '@qafe/auth';
import {
  ErrorCode,
  PlatformTheme,
  SmtpSecurity,
  type SmtpSettings,
  type ThemeBrand,
  type UpdateSmtpInput,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import type { AccessClaims } from '../../../common/auth/auth.guard.js';
import { ApiException } from '../../../common/errors.js';
import { APP_CONFIG, type AppConfig } from '../../../config/config.js';
import { CoreDatabase } from '../core.database.js';
import { actorOf, publish } from '../outbox.js';

/** core.platform_settings has no RLS (not per venue); any context of svc_core reads it. */
const PLATFORM = { venueId: null, isSuperAdmin: false } as const;

/** The theme every app falls back to when the stored value is missing or unreadable. */
const DEFAULT_THEME: PlatformTheme = { brand: 'warm' };

/** What is stored under "smtp": the password only encrypted. */
const StoredSmtp = z.object({
  host: z.string(),
  port: z.number().int(),
  security: SmtpSecurity,
  username: z.string(),
  passwordEnc: z.string().nullable(),
  fromName: z.string(),
  fromEmail: z.string(),
});
type StoredSmtp = z.infer<typeof StoredSmtp>;

/**
 * Platform settings of the super admin (admin panel → Postavke): the colour theme of the
 * admin, panel and staff apps, and the SMTP server for e-mail.
 */
@Injectable()
export class PlatformSettingsService {
  private readonly log = new Logger(PlatformSettingsService.name);

  constructor(
    private readonly db: CoreDatabase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------- theme

  /**
   * The current theme. Never fails for the apps: a missing or broken value gives the default,
   * so a bad row cannot take the apps down.
   */
  async theme(): Promise<PlatformTheme> {
    try {
      const row = await this.db.withTenant(PLATFORM, (trx) => this.read(trx, 'theme'));
      const parsed = PlatformTheme.safeParse(row?.value);
      return parsed.success ? parsed.data : DEFAULT_THEME;
    } catch (error) {
      this.log.warn(`theme unavailable, using the default: ${String(error)}`);
      return DEFAULT_THEME;
    }
  }

  async setTheme(admin: AccessClaims, brand: ThemeBrand): Promise<PlatformTheme> {
    return this.db.withTenant(PLATFORM, async (trx) => {
      const before = PlatformTheme.safeParse((await this.read(trx, 'theme'))?.value);
      const next: PlatformTheme = { brand };
      await this.write(trx, 'theme', next, admin.userId);
      if (!before.success || before.data.brand !== brand) {
        await publish(trx, {
          type: 'platform.theme_changed',
          before: before.success ? before.data : undefined,
          after: next,
          actor: await actorOf(trx, admin.userId),
        });
      }
      return next;
    });
  }

  // ---------------------------------------------------------------- SMTP

  async smtp(): Promise<SmtpSettings> {
    const row = await this.db.withTenant(PLATFORM, (trx) => this.read(trx, 'smtp'));
    const stored = StoredSmtp.safeParse(row?.value);
    const canStorePassword = Boolean(this.config.settings.encryptionKey);
    if (!stored.success) {
      return {
        configured: false,
        host: '',
        port: 587,
        security: 'starttls',
        username: '',
        hasPassword: false,
        fromName: 'qafe.ba',
        fromEmail: '',
        updatedAt: null,
        canStorePassword,
      };
    }
    const s = stored.data;
    return {
      configured: true,
      host: s.host,
      port: s.port,
      security: s.security,
      username: s.username,
      hasPassword: s.passwordEnc !== null,
      fromName: s.fromName,
      fromEmail: s.fromEmail,
      updatedAt: row?.updated_at.toISOString() ?? null,
      canStorePassword,
    };
  }

  async setSmtp(admin: AccessClaims, input: UpdateSmtpInput): Promise<SmtpSettings> {
    const key = this.config.settings.encryptionKey;
    if (input.password && !key) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.encryptionKeyMissing,
        'SETTINGS_ENCRYPTION_KEY is not set',
      );
    }
    await this.db.withTenant(PLATFORM, async (trx) => {
      const old = StoredSmtp.safeParse((await this.read(trx, 'smtp'))?.value);
      // Omitted = keep; "" = remove; anything else = the new password, encrypted.
      const passwordEnc =
        input.password === undefined
          ? old.success
            ? old.data.passwordEnc
            : null
          : input.password === ''
            ? null
            : encryptSecret(input.password, key!);
      const next: StoredSmtp = {
        host: input.host,
        port: input.port,
        security: input.security,
        username: input.username,
        passwordEnc,
        fromName: input.fromName,
        fromEmail: input.fromEmail,
      };
      await this.write(trx, 'smtp', next, admin.userId);
      const visible = ({ passwordEnc: _secret, ...rest }: StoredSmtp) => rest;
      await publish(trx, {
        type: 'platform.smtp_updated',
        before: old.success ? visible(old.data) : undefined,
        after: { ...visible(next), passwordChanged: input.password !== undefined },
        actor: await actorOf(trx, admin.userId),
      });
    });
    return this.smtp();
  }

  /** Sends a short message with the stored settings; the error of the server is passed on. */
  async testSmtp(to: string): Promise<{ messageId: string }> {
    const row = await this.db.withTenant(PLATFORM, (trx) => this.read(trx, 'smtp'));
    const stored = StoredSmtp.safeParse(row?.value);
    if (!stored.success) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.smtpNotConfigured,
        'SMTP is not configured',
      );
    }
    const s = stored.data;
    const key = this.config.settings.encryptionKey;
    let password: string | undefined;
    if (s.passwordEnc) {
      if (!key) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.encryptionKeyMissing,
          'SETTINGS_ENCRYPTION_KEY is not set',
        );
      }
      password = decryptSecret(s.passwordEnc, key);
    }
    const transport = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.security === 'tls',
      requireTLS: s.security === 'starttls',
      ignoreTLS: s.security === 'none',
      auth: s.username ? { user: s.username, pass: password ?? '' } : undefined,
      // A wrong host must not keep the admin waiting.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    try {
      const info = await transport.sendMail({
        from: { name: s.fromName, address: s.fromEmail },
        to,
        subject: 'qafe.ba: testna poruka / test message',
        text:
          'Ovo je testna poruka iz admin panela qafe.ba. SMTP postavke rade.\n\n' +
          'This is a test message from the qafe.ba admin panel. The SMTP settings work.',
      });
      return { messageId: String(info.messageId) };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 300) : 'unknown';
      throw new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.smtpFailed, 'SMTP failed', {
        reason,
      });
    } finally {
      transport.close();
    }
  }

  // ---------------------------------------------------------------- storage

  private read(trx: Tx, key: string) {
    return trx
      .selectFrom('core.platform_settings')
      .select(['value', 'updated_at'])
      .where('key', '=', key)
      .executeTakeFirst();
  }

  private async write(trx: Tx, key: string, value: unknown, userId: string): Promise<void> {
    await trx
      .insertInto('core.platform_settings')
      .values({ key, value: JSON.stringify(value), updated_by: userId })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          value: JSON.stringify(value),
          updated_at: new Date(),
          updated_by: userId,
        }),
      )
      .execute();
  }
}
