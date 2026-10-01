import { HttpStatus, Injectable } from '@nestjs/common';
import { hashPassword } from '@qafe/auth';
import {
  ErrorCode,
  type AdminUser,
  type AdminUserList,
  type AdminUserListParams,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { ApiException, notFound } from '../../../common/errors.js';
import { CoreDatabase } from '../core.database.js';
import { actorOf, escapeLike, publish, SUPER_ADMIN, userLabel } from '../outbox.js';

/** FR-ADM-09: every account on the platform, blocking and password reset. */
@Injectable()
export class AdminUsersService {
  constructor(private readonly db: CoreDatabase) {}

  async list(query: AdminUserListParams): Promise<AdminUserList> {
    return this.db.withTenant(SUPER_ADMIN, async (trx) => {
      let base = trx.selectFrom('core.users as u').where('u.deleted_at', 'is', null);
      if (query.search) {
        const pattern = `%${escapeLike(query.search)}%`;
        base = base.where((eb) =>
          eb.or([
            eb('u.full_name', 'ilike', pattern),
            eb('u.email', 'ilike', pattern),
            eb.exists(
              eb
                .selectFrom('core.venue_members as m')
                .select('m.id')
                .whereRef('m.user_id', '=', 'u.id')
                .where('m.username', 'ilike', pattern),
            ),
          ]),
        );
      }
      if (query.kind === 'platform') base = base.where('u.platform_role', '!=', 'none');
      if (query.kind === 'staff') base = base.where('u.platform_role', '=', 'none');
      if (query.status) base = base.where('u.is_active', '=', query.status === 'active');

      const { total } = await base
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirstOrThrow();
      const users = await base
        .select([
          'u.id',
          'u.full_name',
          'u.email',
          'u.platform_role',
          'u.is_active',
          'u.must_change_password',
          'u.last_login_at',
          'u.created_at',
        ])
        .orderBy('u.created_at', 'desc')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute();

      const memberships = users.length
        ? await trx
            .selectFrom('core.venue_members as m')
            .innerJoin('core.venues as v', 'v.id', 'm.venue_id')
            .innerJoin('core.venue_roles as r', 'r.id', 'm.role_id')
            .select([
              'm.user_id',
              'v.id as venue_id',
              'v.name',
              'v.slug',
              'm.username',
              'r.name as role',
              'm.is_active',
            ])
            .where(
              'm.user_id',
              'in',
              users.map((u) => u.id),
            )
            .orderBy('v.name')
            .execute()
        : [];

      const items: AdminUser[] = users.map((u) => ({
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        kind: u.platform_role === 'none' ? 'staff' : 'platform',
        platformRole: u.platform_role === 'none' ? null : u.platform_role,
        memberships: memberships
          .filter((m) => m.user_id === u.id)
          .map((m) => ({
            venueId: m.venue_id,
            venueName: m.name,
            venueSlug: m.slug,
            username: m.username,
            role: m.role,
            isActive: m.is_active,
          })),
        isActive: u.is_active,
        mustChangePassword: u.must_change_password,
        lastLoginAt: u.last_login_at?.toISOString() ?? null,
        createdAt: u.created_at.toISOString(),
      }));
      return { items, total: Number(total), page: query.page, pageSize: query.pageSize };
    });
  }

  /** Blocking signs the user out everywhere: every refresh token is revoked. */
  async setActive(userId: string, active: boolean, actorId: string): Promise<void> {
    if (userId === actorId) throw cannotModifySelf();
    await this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const user = await this.target(trx, userId);
      if (user.is_active === active) return;
      await trx
        .updateTable('core.users')
        .set({ is_active: active })
        .where('id', '=', userId)
        .execute();
      if (!active) await revokeSessions(trx, userId);
      await publish(trx, {
        type: active ? 'user.unblocked' : 'user.blocked',
        userId,
        userLabel: userLabel(user.full_name, user.email),
        actor: await actorOf(trx, actorId),
      });
    });
  }

  /** Sets a temporary password; the user must change it at the next sign-in. */
  async resetPassword(userId: string, temporaryPassword: string, actorId: string): Promise<void> {
    if (userId === actorId) throw cannotModifySelf();
    const passwordHash = await hashPassword(temporaryPassword);
    await this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const user = await this.target(trx, userId);
      await trx
        .updateTable('core.users')
        .set({ password_hash: passwordHash, must_change_password: true })
        .where('id', '=', userId)
        .execute();
      await revokeSessions(trx, userId);
      await publish(trx, {
        type: 'user.password_reset',
        userId,
        userLabel: userLabel(user.full_name, user.email),
        actor: await actorOf(trx, actorId),
      });
    });
  }

  private async target(trx: Tx, userId: string) {
    const user = await trx
      .selectFrom('core.users')
      .select(['full_name', 'email', 'is_active'])
      .where('id', '=', userId)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (!user) throw notFound('User not found');
    return user;
  }
}

async function revokeSessions(trx: Tx, userId: string): Promise<void> {
  await trx
    .updateTable('core.auth_sessions')
    .set({ revoked_at: new Date() })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .execute();
}

function cannotModifySelf() {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.cannotModifySelf,
    'Use your own profile to change your account',
  );
}
