import { HttpStatus, Injectable } from '@nestjs/common';
import { hashPassword, type StaffClaims } from '@qafe/auth';
import {
  ErrorCode,
  type CreateStaffRequest,
  type StaffEvent,
  type UpdateStaffRequest,
  type VenueStaff,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { randomBytes } from 'node:crypto';
import { ApiException, forbidden, notFound } from '../../../common/errors.js';
import { CoreDatabase } from '../core.database.js';
import { publish } from '../outbox.js';

const usernameTaken = () =>
  new ApiException(
    HttpStatus.CONFLICT,
    ErrorCode.usernameTaken,
    'This username is already used in the venue',
  );
const lastOwner = () =>
  new ApiException(
    HttpStatus.CONFLICT,
    ErrorCode.lastOwner,
    'The venue must keep at least one active owner',
  );
const notYourself = () =>
  new ApiException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.cannotModifySelf,
    'You cannot change your own role or status',
  );

interface MemberRow {
  member_id: string;
  user_id: string;
  username: string;
  full_name: string;
  role_id: string;
  is_owner: boolean;
  is_active: boolean;
}

/** The venue's staff accounts, managed by the owner (FR-SEF-08, FR-SEF-09). */
@Injectable()
export class StaffService {
  constructor(private readonly db: CoreDatabase) {}

  get(venueId: string): Promise<VenueStaff> {
    return this.inVenue(venueId, (trx) => this.load(trx, venueId));
  }

  /** Accounts have no email (FR-SEF-08): sign-in is venue slug + username, or a PIN. */
  async create(staff: StaffClaims, input: CreateStaffRequest): Promise<VenueStaff> {
    // Without a password the account signs in with the PIN only; store an unusable random hash.
    const passwordHash = await hashPassword(
      input.password ?? randomBytes(32).toString('base64url'),
    );
    const pinHash = input.pin ? await hashPassword(input.pin) : null;

    return this.inVenue(staff.venueId, async (trx) => {
      const role = await this.role(trx, input.roleId);
      if (role.is_owner) await this.requireOwner(trx, staff);
      const taken = await trx
        .selectFrom('core.venue_members')
        .select('id')
        .where('username', '=', input.username)
        .executeTakeFirst();
      if (taken) throw usernameTaken();

      const user = await trx
        .insertInto('core.users')
        .values({
          password_hash: passwordHash,
          full_name: input.fullName,
          must_change_password: true,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const member = await trx
        .insertInto('core.venue_members')
        .values({
          venue_id: staff.venueId,
          user_id: user.id,
          role_id: input.roleId,
          username: input.username,
          display_name: input.fullName.split(' ')[0] ?? input.fullName,
          pin_hash: pinHash,
          created_by: staff.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch((error: unknown) => {
          throw (error as { code?: string }).code === '23505' ? usernameTaken() : error;
        });

      await this.event(trx, staff, {
        type: 'staff.created',
        memberId: member.id,
        userId: user.id,
        memberLabel: `${input.fullName} (@${input.username})`,
        after: { role: role.name, pin: Boolean(pinHash) },
      });
      return this.load(trx, staff.venueId);
    });
  }

  async update(
    staff: StaffClaims,
    memberId: string,
    input: UpdateStaffRequest,
  ): Promise<VenueStaff> {
    return this.inVenue(staff.venueId, async (trx) => {
      const member = await this.member(trx, memberId);
      const self = memberId === staff.memberId;
      const roleChanges = input.roleId !== undefined && input.roleId !== member.role_id;
      const statusChanges = input.isActive !== undefined && input.isActive !== member.is_active;
      if (self && (roleChanges || statusChanges)) throw notYourself();

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      if (roleChanges) {
        const role = await this.role(trx, input.roleId!);
        // Only an owner hands out or takes away the owner role.
        if (role.is_owner || member.is_owner) await this.requireOwner(trx, staff);
        if (member.is_owner && !role.is_owner) await this.keepAnOwner(trx, memberId);
        await trx
          .updateTable('core.venue_members')
          .set({ role_id: role.id })
          .where('id', '=', memberId)
          .execute();
        before.role = (await this.role(trx, member.role_id)).name;
        after.role = role.name;
      }
      if (statusChanges) {
        if (member.is_owner) await this.requireOwner(trx, staff);
        if (member.is_owner && !input.isActive) await this.keepAnOwner(trx, memberId);
        await trx
          .updateTable('core.venue_members')
          .set({ is_active: input.isActive! })
          .where('id', '=', memberId)
          .execute();
        // A deactivated member is signed out of this venue at once.
        if (!input.isActive) await revokeMemberSessions(trx, memberId);
        before.is_active = member.is_active;
        after.is_active = input.isActive;
      }
      if (input.fullName !== undefined && input.fullName !== member.full_name) {
        await trx
          .updateTable('core.users')
          .set({ full_name: input.fullName })
          .where('id', '=', member.user_id)
          .execute();
        before.full_name = member.full_name;
        after.full_name = input.fullName;
      }

      if (Object.keys(after).length) {
        await this.event(trx, staff, {
          type: 'staff.updated',
          memberId,
          userId: member.user_id,
          memberLabel: `${input.fullName ?? member.full_name} (@${member.username})`,
          before,
          after,
        });
      }
      return this.load(trx, staff.venueId);
    });
  }

  /** Sets a new password; the member's other sessions end (FR-SEF-09). */
  async setPassword(staff: StaffClaims, memberId: string, password: string): Promise<VenueStaff> {
    const passwordHash = await hashPassword(password);
    return this.inVenue(staff.venueId, async (trx) => {
      const member = await this.member(trx, memberId);
      if (member.is_owner && memberId !== staff.memberId) await this.requireOwner(trx, staff);
      await trx
        .updateTable('core.users')
        .set({ password_hash: passwordHash, must_change_password: memberId !== staff.memberId })
        .where('id', '=', member.user_id)
        .execute();
      await revokeMemberSessions(trx, memberId, staff.sessionId);
      await this.event(trx, staff, {
        type: 'staff.password_reset',
        memberId,
        userId: member.user_id,
        memberLabel: `${member.full_name} (@${member.username})`,
      });
      return this.load(trx, staff.venueId);
    });
  }

  /** PIN for signing in on a shared device (FR-KON-01); null removes it. */
  async setPin(staff: StaffClaims, memberId: string, pin: string | null): Promise<VenueStaff> {
    const pinHash = pin ? await hashPassword(pin) : null;
    return this.inVenue(staff.venueId, async (trx) => {
      const member = await this.member(trx, memberId);
      if (member.is_owner && memberId !== staff.memberId) await this.requireOwner(trx, staff);
      await trx
        .updateTable('core.venue_members')
        .set({ pin_hash: pinHash })
        .where('id', '=', memberId)
        .execute();
      await this.event(trx, staff, {
        type: 'staff.pin_changed',
        memberId,
        userId: member.user_id,
        memberLabel: `${member.full_name} (@${member.username})`,
        after: { pin: Boolean(pinHash) },
      });
      return this.load(trx, staff.venueId);
    });
  }

  private inVenue<T>(venueId: string, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId, isSuperAdmin: false }, fn);
  }

  private async member(trx: Tx, memberId: string): Promise<MemberRow> {
    const member = await trx
      .selectFrom('core.venue_members as m')
      .innerJoin('core.users as u', 'u.id', 'm.user_id')
      .innerJoin('core.venue_roles as r', 'r.id', 'm.role_id')
      .select([
        'm.id as member_id',
        'u.id as user_id',
        'm.username',
        'u.full_name',
        'r.id as role_id',
        'r.is_owner',
        'm.is_active',
      ])
      .where('m.id', '=', memberId)
      .forUpdate()
      .executeTakeFirst();
    if (!member) throw notFound('Staff member not found');
    return member;
  }

  private async role(trx: Tx, roleId: string) {
    const role = await trx
      .selectFrom('core.venue_roles')
      .select(['id', 'name', 'is_owner'])
      .where('id', '=', roleId)
      .executeTakeFirst();
    if (!role) throw notFound('Role not found');
    return role;
  }

  private async requireOwner(trx: Tx, staff: StaffClaims): Promise<void> {
    const me = await trx
      .selectFrom('core.venue_members as m')
      .innerJoin('core.venue_roles as r', 'r.id', 'm.role_id')
      .select('r.is_owner')
      .where('m.id', '=', staff.memberId)
      .executeTakeFirst();
    if (!me?.is_owner) throw forbidden('Only an owner can do this');
  }

  /** Refuses when `memberId` is the venue's last active owner. */
  private async keepAnOwner(trx: Tx, memberId: string): Promise<void> {
    const { n } = await trx
      .selectFrom('core.venue_members as m')
      .innerJoin('core.venue_roles as r', 'r.id', 'm.role_id')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('r.is_owner', '=', true)
      .where('m.is_active', '=', true)
      .where('m.id', '!=', memberId)
      .executeTakeFirstOrThrow();
    if (Number(n) === 0) throw lastOwner();
  }

  private async event(
    trx: Tx,
    staff: StaffClaims,
    event: Omit<StaffEvent, 'venueId' | 'venueName' | 'actor'>,
  ): Promise<void> {
    const venue = await trx
      .selectFrom('core.venues')
      .select('name')
      .where('id', '=', staff.venueId)
      .executeTakeFirstOrThrow();
    await publish(trx, {
      ...event,
      venueId: staff.venueId,
      venueName: venue.name,
      actor: { id: staff.userId, label: staff.name },
    });
  }

  private async load(trx: Tx, venueId: string): Promise<VenueStaff> {
    const members = await trx
      .selectFrom('core.venue_members as m')
      .innerJoin('core.users as u', 'u.id', 'm.user_id')
      .innerJoin('core.venue_roles as r', 'r.id', 'm.role_id')
      .select([
        'm.id as member_id',
        'u.id as user_id',
        'u.full_name',
        'm.username',
        'r.id as role_id',
        'r.name as role',
        'r.is_owner',
        'm.is_active',
        'u.is_active as user_active',
        'm.pin_hash',
        'u.last_login_at',
        'm.created_at',
      ])
      .where('m.venue_id', '=', venueId)
      .where('u.deleted_at', 'is', null)
      .orderBy('r.is_owner', 'desc')
      .orderBy('u.full_name')
      .execute();
    const roles = await trx
      .selectFrom('core.venue_roles')
      .select(['id', 'name', 'is_owner'])
      .where('venue_id', '=', venueId)
      .orderBy('is_owner', 'desc')
      .orderBy('name')
      .execute();
    const permissions = await trx
      .selectFrom('core.role_permissions')
      .select(['role_id', 'permission_code'])
      .where(
        'role_id',
        'in',
        roles.map((r) => r.id),
      )
      .execute();

    return {
      members: members.map((m) => ({
        memberId: m.member_id,
        userId: m.user_id,
        fullName: m.full_name,
        username: m.username,
        roleId: m.role_id,
        role: m.role,
        isOwner: m.is_owner,
        isActive: m.is_active,
        userActive: m.user_active,
        hasPin: m.pin_hash !== null,
        lastLoginAt: m.last_login_at?.toISOString() ?? null,
        createdAt: m.created_at.toISOString(),
      })),
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        isOwner: r.is_owner,
        permissions: permissions.filter((p) => p.role_id === r.id).map((p) => p.permission_code),
      })),
    };
  }
}

/** Ends the member's sessions in this venue, except `keepSessionId` (the caller's own). */
async function revokeMemberSessions(
  trx: Tx,
  memberId: string,
  keepSessionId?: string,
): Promise<void> {
  let query = trx
    .updateTable('core.auth_sessions')
    .set({ revoked_at: new Date() })
    .where('member_id', '=', memberId)
    .where('revoked_at', 'is', null);
  if (keepSessionId) query = query.where('id', '!=', keepSessionId);
  await query.execute();
}
