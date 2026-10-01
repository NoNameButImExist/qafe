import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  generateRefreshToken,
  hashRefreshToken,
  TokenSigner,
  verifyAgainstDummy,
  verifyPassword,
  type PlatformClaims,
  type StaffClaims,
} from '@qafe/auth';
import {
  ErrorCode,
  type AuthSession,
  type Me,
  type StaffMe,
  type StaffSession,
} from '@qafe/contracts';
import type { TenantContext, Tx } from '@qafe/db';
import { sql } from 'kysely';
import { ApiException, unauthorized } from '../../../common/errors.js';
import { APP_CONFIG, type AppConfig } from '../../../config/config.js';
import { CoreDatabase } from '../core.database.js';
import { publish, userLabel } from '../outbox.js';
import { LoginThrottle } from './login-throttle.js';

export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');

/** A refresh token reused this long after rotation is treated as a race between tabs, not theft. */
const REUSE_GRACE_MS = 30_000;

/** Platform-level rows (core.users, core.auth_sessions) need no venue context. */
const PLATFORM: TenantContext = { venueId: null, isSuperAdmin: false };
const venueContext = (venueId: string): TenantContext => ({ venueId, isSuperAdmin: false });

export type SessionKind = 'platform' | 'staff';

export interface ClientInfo {
  ip: string;
  userAgent: string | undefined;
}

export interface IssuedSession<S extends AuthSession | StaffSession = AuthSession | StaffSession> {
  session: S;
  refreshToken: string;
}

interface UserRow {
  id: string;
  email: string | null;
  full_name: string;
  platform_role: 'super_admin' | 'support' | 'none';
  preferred_language: string;
  must_change_password: boolean;
  is_active: boolean;
}

interface MemberRow {
  member_id: string;
  user_id: string;
  username: string;
  full_name: string;
  preferred_language: string;
  member_active: boolean;
  user_active: boolean;
  role_id: string;
  role: string;
  is_owner: boolean;
}

interface ResolvedVenue {
  venue_id: string;
  status: 'pending' | 'active' | 'suspended' | 'closed';
}

const invalidCredentials = () =>
  new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.invalidCredentials, 'Invalid credentials');
const accountDisabled = () =>
  new ApiException(HttpStatus.FORBIDDEN, ErrorCode.accountDisabled, 'Account is disabled');
const venueClosed = () =>
  new ApiException(HttpStatus.FORBIDDEN, ErrorCode.venueClosed, 'This venue is closed');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: CoreDatabase,
    private readonly throttle: LoginThrottle,
    @Inject(TOKEN_SIGNER) private readonly signer: TokenSigner,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Platform admin login (FR-ADM-01). */
  async adminLogin(
    email: string,
    password: string,
    client: ClientInfo,
  ): Promise<IssuedSession<AuthSession>> {
    const account = email.toLowerCase();
    this.throttle.assertAllowed(client.ip, account);

    const user = await this.db.withTenant(PLATFORM, (trx) =>
      this.userQuery(trx)
        .where('email', '=', account)
        .where('deleted_at', 'is', null)
        .executeTakeFirst(),
    );

    const passwordOk = user
      ? await verifyPassword(await this.passwordHash(user.id), password)
      : await verifyAgainstDummy(password);

    if (!user || !passwordOk || user.platform_role === 'none') {
      this.throttle.recordFailure(client.ip, account);
      throw invalidCredentials();
    }
    if (!user.is_active) throw accountDisabled();
    // FR-ADM-01 TOTP is not built yet. When it is required, refuse rather than skip it.
    if (this.config.auth.adminMfaRequired) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        ErrorCode.mfaRequired,
        'Two-factor authentication is required but not available yet',
      );
    }
    this.throttle.recordSuccess(client.ip, account);

    return this.db.withTenant(PLATFORM, async (trx) => {
      const issued = await this.startPlatformSession(trx, user, client);
      await trx
        .updateTable('core.users')
        .set({ last_login_at: new Date() })
        .where('id', '=', user.id)
        .execute();
      await publish(trx, {
        type: 'user.logged_in',
        userId: user.id,
        sessionId: issued.sessionId,
        ip: client.ip,
        actor: { id: user.id, label: userLabel(user.full_name, user.email) },
      });
      return issued;
    });
  }

  /**
   * Venue staff login (FR-SEF-01, FR-KON-01): venue slug + username + password.
   * The venue is found through core.resolve_venue, since RLS hides it until venue_id is known.
   * The temporary password works like a normal one for now (forced change is postponed).
   */
  async staffLogin(
    venueSlug: string,
    username: string,
    password: string,
    client: ClientInfo,
  ): Promise<IssuedSession<StaffSession>> {
    const account = `${venueSlug}/${username.toLowerCase()}`;
    this.throttle.assertAllowed(client.ip, account);

    const venue = await this.db.withTenant(PLATFORM, async (trx) => {
      const { rows } = await sql<ResolvedVenue>`
        select venue_id, status from core.resolve_venue(${venueSlug})
      `.execute(trx);
      return rows[0];
    });
    const member = venue
      ? await this.db.withTenant(venueContext(venue.venue_id), (trx) =>
          this.memberQuery(trx).where('m.username', '=', username).executeTakeFirst(),
        )
      : undefined;

    const passwordOk = member
      ? await verifyPassword(await this.passwordHash(member.user_id), password)
      : await verifyAgainstDummy(password);

    if (!venue || !member || !passwordOk) {
      this.throttle.recordFailure(client.ip, account);
      throw invalidCredentials();
    }
    if (!member.member_active || !member.user_active) throw accountDisabled();
    if (venue.status === 'closed') throw venueClosed();
    this.throttle.recordSuccess(client.ip, account);

    return this.db.withTenant(venueContext(venue.venue_id), async (trx) => {
      const issued = await this.startStaffSession(trx, venue.venue_id, member, client);
      await trx
        .updateTable('core.users')
        .set({ last_login_at: new Date() })
        .where('id', '=', member.user_id)
        .execute();
      await publish(trx, {
        type: 'user.logged_in',
        userId: member.user_id,
        sessionId: issued.sessionId,
        ip: client.ip,
        venueId: venue.venue_id,
        venueName: issued.session.user.venue.name,
        actor: { id: member.user_id, label: staffLabel(member) },
      });
      return issued;
    });
  }

  /**
   * Rotates the refresh token: the old one is revoked, a new one is issued (NFR-08).
   * Admin and staff sessions use separate cookies and endpoints; `kind` must match the session.
   */
  async refresh(
    refreshToken: string,
    client: ClientInfo,
    kind: SessionKind,
  ): Promise<IssuedSession> {
    const tokenHash = hashRefreshToken(refreshToken);
    const found = await this.db.withTenant(PLATFORM, (trx) =>
      trx
        .selectFrom('core.auth_sessions')
        .select(['venue_id', 'member_id'])
        .where('refresh_token_hash', '=', tokenHash)
        .executeTakeFirst(),
    );
    if (!found || (kind === 'staff') !== (found.member_id !== null))
      throw unauthorized('Invalid refresh token');

    // Staff sessions run in their venue's RLS context, so the membership is visible.
    const context = found.venue_id ? venueContext(found.venue_id) : PLATFORM;

    // Revocations must be committed even when the request is refused, so the transaction
    // returns the refusal instead of throwing (a throw would roll the revocation back).
    const result = await this.db.withTenant(
      context,
      async (trx): Promise<IssuedSession | { refused: string }> => {
        const current = await trx
          .selectFrom('core.auth_sessions')
          .select(['id', 'user_id', 'member_id', 'venue_id', 'expires_at', 'revoked_at'])
          .where('refresh_token_hash', '=', tokenHash)
          .forUpdate()
          .executeTakeFirst();
        if (!current) return { refused: 'Invalid refresh token' };

        if (current.revoked_at) {
          if (Date.now() - current.revoked_at.getTime() > REUSE_GRACE_MS) {
            // An old token came back: assume it was stolen and end every session of this user.
            this.logger.warn(
              `Refresh token reuse for user ${current.user_id}; revoking all sessions`,
            );
            await this.revokeAll(trx, current.user_id);
          }
          return { refused: 'Refresh token was already used' };
        }
        if (current.expires_at.getTime() <= Date.now()) return { refused: 'Refresh token expired' };

        const revokeCurrent = () =>
          trx
            .updateTable('core.auth_sessions')
            .set({ revoked_at: new Date() })
            .where('id', '=', current.id)
            .execute();

        if (current.member_id && current.venue_id) {
          const member = await this.memberQuery(trx)
            .where('m.id', '=', current.member_id)
            .executeTakeFirst();
          const status = await this.venueStatus(trx, current.venue_id);
          if (!member?.member_active || !member.user_active || !status || status === 'closed') {
            await this.revokeAll(trx, current.user_id);
            return { refused: 'Account is no longer allowed to sign in' };
          }
          await revokeCurrent();
          return this.startStaffSession(trx, current.venue_id, member, client);
        }

        const user = await this.userQuery(trx)
          .where('id', '=', current.user_id)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (!user?.is_active || user.platform_role === 'none') {
          await this.revokeAll(trx, current.user_id);
          return { refused: 'Account is no longer allowed to sign in' };
        }
        await revokeCurrent();
        return this.startPlatformSession(trx, user, client);
      },
    );
    if ('refused' in result) throw unauthorized(result.refused);
    return result;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.db.withTenant(PLATFORM, (trx) =>
      trx
        .updateTable('core.auth_sessions')
        .set({ revoked_at: new Date() })
        .where('refresh_token_hash', '=', hashRefreshToken(refreshToken))
        .where('revoked_at', 'is', null)
        .execute(),
    );
  }

  async me(claims: PlatformClaims): Promise<Me> {
    const user = await this.db.withTenant(PLATFORM, (trx) =>
      this.userQuery(trx)
        .where('id', '=', claims.userId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst(),
    );
    if (!user?.is_active || user.platform_role === 'none') throw unauthorized();
    return toMe(user);
  }

  async staffMe(claims: StaffClaims): Promise<StaffMe> {
    return this.db.withTenant(venueContext(claims.venueId), async (trx) => {
      const member = await this.memberQuery(trx)
        .where('m.id', '=', claims.memberId)
        .executeTakeFirst();
      if (!member?.member_active || !member.user_active) throw unauthorized();
      return this.staffMeOf(trx, claims.venueId, member);
    });
  }

  private userQuery(trx: Tx) {
    return trx
      .selectFrom('core.users')
      .select([
        'id',
        'email',
        'full_name',
        'platform_role',
        'preferred_language',
        'must_change_password',
        'is_active',
      ]);
  }

  /** Memberships of the venue in the transaction's RLS context, with user and role. */
  private memberQuery(trx: Tx) {
    return trx
      .selectFrom('core.venue_members as m')
      .innerJoin('core.users as u', 'u.id', 'm.user_id')
      .innerJoin('core.venue_roles as r', 'r.id', 'm.role_id')
      .select([
        'm.id as member_id',
        'u.id as user_id',
        'm.username',
        'u.full_name',
        'u.preferred_language',
        'm.is_active as member_active',
        'u.is_active as user_active',
        'r.id as role_id',
        'r.name as role',
        'r.is_owner',
      ])
      .where('u.deleted_at', 'is', null);
  }

  private async venueStatus(trx: Tx, venueId: string) {
    const venue = await trx
      .selectFrom('core.venues')
      .select('status')
      .where('id', '=', venueId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return venue?.status;
  }

  /** Loaded separately so the hash never travels further than the password check. */
  private async passwordHash(userId: string): Promise<string> {
    const row = await this.db.withTenant(PLATFORM, (trx) =>
      trx
        .selectFrom('core.users')
        .select('password_hash')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow(),
    );
    return row.password_hash;
  }

  private async insertSession(
    trx: Tx,
    userId: string,
    client: ClientInfo,
    membership?: { venueId: string; memberId: string },
  ): Promise<{ id: string; refreshToken: string }> {
    const refreshToken = generateRefreshToken();
    const session = await trx
      .insertInto('core.auth_sessions')
      .values({
        user_id: userId,
        venue_id: membership?.venueId ?? null,
        member_id: membership?.memberId ?? null,
        refresh_token_hash: hashRefreshToken(refreshToken),
        user_agent: client.userAgent?.slice(0, 500) ?? null,
        ip_address: client.ip,
        expires_at: new Date(Date.now() + this.config.auth.refreshTokenTtlDays * 86_400_000),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { id: session.id, refreshToken };
  }

  private async startPlatformSession(
    trx: Tx,
    user: UserRow,
    client: ClientInfo,
  ): Promise<IssuedSession<AuthSession> & { sessionId: string }> {
    const { id, refreshToken } = await this.insertSession(trx, user.id, client);
    const role = user.platform_role === 'none' ? 'support' : user.platform_role;
    const ttl = this.config.auth.accessTokenTtlSeconds;
    const accessToken = await this.signer.sign(
      {
        kind: 'platform',
        userId: user.id,
        sessionId: id,
        name: userLabel(user.full_name, user.email),
        role,
      },
      ttl,
    );
    return {
      sessionId: id,
      refreshToken,
      session: { accessToken, expiresIn: ttl, user: toMe(user) },
    };
  }

  private async startStaffSession(
    trx: Tx,
    venueId: string,
    member: MemberRow,
    client: ClientInfo,
  ): Promise<IssuedSession<StaffSession> & { sessionId: string }> {
    const { id, refreshToken } = await this.insertSession(trx, member.user_id, client, {
      venueId,
      memberId: member.member_id,
    });
    const me = await this.staffMeOf(trx, venueId, member);
    const ttl = this.config.auth.accessTokenTtlSeconds;
    const accessToken = await this.signer.sign(
      {
        kind: 'staff',
        userId: member.user_id,
        sessionId: id,
        name: staffLabel(member),
        venueId,
        memberId: member.member_id,
        permissions: me.permissions,
      },
      ttl,
    );
    return { sessionId: id, refreshToken, session: { accessToken, expiresIn: ttl, user: me } };
  }

  private async staffMeOf(trx: Tx, venueId: string, member: MemberRow): Promise<StaffMe> {
    const venue = await trx
      .selectFrom('core.venues')
      .select(['id', 'slug', 'name', 'status', 'currency'])
      .where('id', '=', venueId)
      .executeTakeFirstOrThrow();
    const permissions = await trx
      .selectFrom('core.role_permissions')
      .select('permission_code')
      .where('role_id', '=', member.role_id)
      .orderBy('permission_code')
      .execute();
    const modules = await trx
      .selectFrom('core.venue_modules')
      .select('module_code')
      .where('venue_id', '=', venueId)
      .orderBy('module_code')
      .execute();
    return {
      id: member.user_id,
      kind: 'staff',
      memberId: member.member_id,
      fullName: member.full_name,
      username: member.username,
      role: member.role,
      isOwner: member.is_owner,
      permissions: permissions.map((p) => p.permission_code),
      venue: {
        id: venue.id,
        slug: venue.slug,
        name: venue.name,
        status: venue.status,
        currency: venue.currency.trim(),
      },
      modules: modules.map((m) => m.module_code),
      preferredLanguage: member.preferred_language,
    };
  }

  private async revokeAll(trx: Tx, userId: string): Promise<void> {
    await trx
      .updateTable('core.auth_sessions')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }
}

function staffLabel(member: { full_name: string; username: string }): string {
  return `${member.full_name} (@${member.username})`;
}

function toMe(user: UserRow): Me {
  if (!user.email || user.platform_role === 'none') throw unauthorized();
  return {
    id: user.id,
    kind: 'platform',
    email: user.email,
    fullName: user.full_name,
    role: user.platform_role,
    preferredLanguage: user.preferred_language,
    mustChangePassword: user.must_change_password,
  };
}
