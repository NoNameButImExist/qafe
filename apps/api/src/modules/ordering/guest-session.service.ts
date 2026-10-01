import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type GuestSessionState,
  type GuestVenue,
  type JoinTableRequest,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { hitRateLimit, redisKey, type Redis } from '@qafe/redis';
import { randomInt } from 'node:crypto';
import { ApiException } from '../../common/errors.js';
import { REDIS } from '../../common/redis/redis.module.js';
import { VenueDirectory, type OrderingSettings } from '../core/index.js';
import type { GuestContext } from './guest.guard.js';
import { OrderingDatabase } from './ordering.database.js';
import { guestActor, publish } from './outbox.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { loadSessionState } from './session-view.js';

/** A session nobody has ordered in and nobody has looked at for this long is abandoned. */
const STALE_SESSION_MINUTES = 30;
/** PIN attempts per session (FR-GOS-21) before a pause. */
const PIN_ATTEMPTS = 5;
const PIN_WINDOW_SECONDS = 10 * 60;

export const fail = (status: HttpStatus, code: ErrorCode, message: string, details?: unknown) =>
  new ApiException(status, code, message, details);

/** The device's active place in a session (one per venue, FR-GOS-23). */
export interface Membership {
  guestId: string;
  nickname: string;
  status: 'pending_approval' | 'approved';
  sessionId: string;
  sessionStatus: 'open' | 'bill_requested' | 'closed' | 'abandoned';
  tableId: string;
  tableLabel: string;
  hostGuestId: string | null;
  verified: boolean;
  verificationCode: string | null;
}

export async function findMembership(trx: Tx, deviceHash: string): Promise<Membership | null> {
  const row = await trx
    .selectFrom('ordering.session_guests as g')
    .innerJoin('ordering.table_sessions as s', 's.id', 'g.session_id')
    .select([
      'g.id as guest_id',
      'g.nickname',
      'g.status',
      's.id as session_id',
      's.status as session_status',
      's.table_id',
      's.table_label',
      's.host_guest_id',
      's.verified_at',
      's.verification_code',
    ])
    .where('g.device_hash', '=', deviceHash)
    .where('g.status', 'in', ['pending_approval', 'approved'])
    .executeTakeFirst();
  if (!row) return null;
  return {
    guestId: row.guest_id,
    nickname: row.nickname,
    status: row.status as Membership['status'],
    sessionId: row.session_id,
    sessionStatus: row.session_status,
    tableId: row.table_id,
    tableLabel: row.table_label,
    hostGuestId: row.host_guest_id,
    verified: row.verified_at !== null,
    verificationCode: row.verification_code,
  };
}

/** Active membership or 404 no_session (403 device_blocked when the device is blocked). */
export async function requireMembership(trx: Tx, deviceHash: string): Promise<Membership> {
  const membership = await findMembership(trx, deviceHash);
  if (membership) return membership;
  await assertNotBlocked(trx, deviceHash);
  throw fail(HttpStatus.NOT_FOUND, ErrorCode.noSession, 'This device has no active table session');
}

async function assertNotBlocked(trx: Tx, deviceHash: string): Promise<void> {
  const block = await trx
    .selectFrom('ordering.device_blocks')
    .select('blocked_until')
    .where('device_hash', '=', deviceHash)
    .where('blocked_until', '>', new Date())
    .orderBy('blocked_until', 'desc')
    .executeTakeFirst();
  if (block) {
    throw fail(HttpStatus.FORBIDDEN, ErrorCode.deviceBlocked, 'This device is blocked', {
      until: block.blocked_until.toISOString(),
    });
  }
}

/** Ordering is possible only for an active venue with guest ordering on (FR-GOS-03). */
export function closedReason(settings: OrderingSettings): GuestVenue['closedReason'] {
  if (settings.status === 'suspended') return 'suspended';
  if (settings.status !== 'active') return 'closed';
  if (!settings.guestOrderingEnabled) return 'ordering_disabled';
  return null;
}

/**
 * Table sessions from the guest's side (FR-GOS-01, 20..24): joining a table by QR, the host
 * device, approval of new devices, the PIN and leaving. Tenant = the subdomain's venue.
 */
@Injectable()
export class GuestSessionService {
  constructor(
    private readonly db: OrderingDatabase,
    private readonly venues: VenueDirectory,
    private readonly realtime: RealtimeGateway,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async venue(ctx: GuestContext): Promise<GuestVenue> {
    const settings = await this.settings(ctx);
    const reason = closedReason(settings);
    return {
      slug: ctx.venue.slug,
      name: ctx.venue.name,
      logoUrl: ctx.venue.logoUrl,
      primaryColor: ctx.venue.primaryColor,
      currency: ctx.venue.currency,
      defaultLanguage: ctx.venue.defaultLanguage,
      orderingOpen: reason === null,
      closedReason: reason,
      paymentMethods: settings.paymentMethods.filter((m) => m.method !== 'online'),
    };
  }

  /**
   * Scanning a table's QR code. The first device opens the session and becomes its host;
   * later devices join it, waiting for approval if the venue asks for it.
   */
  async join(
    ctx: GuestContext,
    token: string,
    input: JoinTableRequest,
  ): Promise<GuestSessionState> {
    const table = await this.venues.resolveTable(token);
    if (!table || table.venueId !== ctx.venue.venueId) {
      throw fail(HttpStatus.NOT_FOUND, ErrorCode.tableNotFound, 'This QR code is not valid');
    }
    const settings = await this.settings(ctx);
    const changed = new Set<string>();

    const state = await this.inVenue(ctx, async (trx) => {
      await assertNotBlocked(trx, ctx.deviceHash);

      const current = await findMembership(trx, ctx.deviceHash);
      if (current && current.tableId === table.tableId) {
        if (input.nickname && input.nickname !== current.nickname) {
          await trx
            .updateTable('ordering.session_guests')
            .set({ nickname: input.nickname })
            .where('id', '=', current.guestId)
            .execute();
          changed.add(current.sessionId);
        }
        return loadSessionState(trx, current.sessionId, current.guestId, settings.verificationMode);
      }
      if (current) {
        if (!input.leaveCurrent) {
          throw fail(
            HttpStatus.CONFLICT,
            ErrorCode.activeElsewhere,
            'This device is already at another table',
            { tableLabel: current.tableLabel },
          );
        }
        await this.leaveSession(trx, ctx, current);
        changed.add(current.sessionId);
      }

      let session = await this.activeSession(trx, table.tableId);
      if (session && (await this.isStale(trx, session.id))) {
        await trx
          .updateTable('ordering.table_sessions')
          .set({ status: 'abandoned', closed_at: new Date() })
          .where('id', '=', session.id)
          .execute();
        session = undefined;
      }

      let opened = false;
      if (!session) {
        const inserted = await trx
          .insertInto('ordering.table_sessions')
          .values({
            venue_id: ctx.venue.venueId,
            table_id: table.tableId,
            table_label: table.tableLabel,
            verification_code: String(randomInt(0, 10_000)).padStart(4, '0'),
          })
          .onConflict((oc) =>
            oc.column('table_id').where('status', 'in', ['open', 'bill_requested']).doNothing(),
          )
          .returning(['id', 'host_guest_id'])
          .executeTakeFirst();
        // Another device opened it at the same moment: join that one.
        session = inserted ?? (await this.activeSession(trx, table.tableId));
        opened = inserted !== undefined;
      }
      if (!session) throw new Error('Table session could not be opened');

      const becomesHost = session.host_guest_id === null;
      const status =
        becomesHost || !settings.deviceApprovalRequired ? 'approved' : 'pending_approval';
      const nickname =
        input.nickname ?? (await this.defaultNickname(trx, session.id, input.locale));
      const now = new Date();
      const guest = await trx
        .insertInto('ordering.session_guests')
        .values({
          venue_id: ctx.venue.venueId,
          session_id: session.id,
          device_hash: ctx.deviceHash,
          nickname,
          locale: input.locale ?? null,
          status,
          approved_at: status === 'approved' ? now : null,
        })
        // A device that left this session earlier comes back to its old row.
        .onConflict((oc) =>
          oc.columns(['session_id', 'device_hash']).doUpdateSet({
            nickname,
            status,
            approved_at: status === 'approved' ? now : null,
            approved_by_guest_id: null,
            approved_by_member_id: null,
            last_seen_at: now,
          }),
        )
        .returning(['id', 'nickname'])
        .executeTakeFirstOrThrow();
      if (becomesHost) {
        await trx
          .updateTable('ordering.table_sessions')
          .set({ host_guest_id: guest.id })
          .where('id', '=', session.id)
          .execute();
      }

      const actor = guestActor(guest.id, guest.nickname, table.tableLabel);
      const base = {
        venueId: ctx.venue.venueId,
        sessionId: session.id,
        tableId: table.tableId,
        tableLabel: table.tableLabel,
        ...actor,
      };
      if (opened) await publish(trx, { ...base, type: 'session.opened', entityId: session.id });
      await publish(trx, {
        ...base,
        type: 'guest.joined',
        entityId: guest.id,
        details: { status, host: becomesHost },
      });
      changed.add(session.id);
      return loadSessionState(trx, session.id, guest.id, settings.verificationMode);
    });

    for (const sessionId of changed)
      this.realtime.sessionChanged(ctx.venue.venueId, sessionId, 'guest');
    return state;
  }

  async state(ctx: GuestContext): Promise<GuestSessionState> {
    const settings = await this.settings(ctx);
    return this.inVenue(ctx, async (trx) => {
      const me = await requireMembership(trx, ctx.deviceHash);
      // Marks the device as present; written at most once a minute.
      await trx
        .updateTable('ordering.session_guests')
        .set({ last_seen_at: new Date() })
        .where('id', '=', me.guestId)
        .where('last_seen_at', '<', new Date(Date.now() - 60_000))
        .execute();
      return loadSessionState(trx, me.sessionId, me.guestId, settings.verificationMode);
    });
  }

  /** PIN mode: the code the waiter told the table (FR-GOS-21). */
  async verify(ctx: GuestContext, code: string): Promise<GuestSessionState> {
    const settings = await this.settings(ctx);
    const state = await this.inVenue(ctx, async (trx) => {
      const me = await requireMembership(trx, ctx.deviceHash);
      if (!me.verified) {
        const limit = await hitRateLimit(
          this.redis,
          redisKey('ordering', 'pin', me.sessionId),
          PIN_ATTEMPTS,
          PIN_WINDOW_SECONDS,
        );
        if (!limit.allowed) {
          throw fail(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.tooManyAttempts, 'Too many attempts', {
            retryAfter: limit.retryAfter,
          });
        }
        if (code !== me.verificationCode) {
          throw fail(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.invalidCode, 'Wrong code');
        }
        await trx
          .updateTable('ordering.table_sessions')
          .set({ verified_at: new Date() })
          .where('id', '=', me.sessionId)
          .execute();
        await publish(trx, {
          type: 'session.verified',
          venueId: ctx.venue.venueId,
          sessionId: me.sessionId,
          tableId: me.tableId,
          tableLabel: me.tableLabel,
          entityId: me.sessionId,
          details: { by: 'pin' },
          ...guestActor(me.guestId, me.nickname, me.tableLabel),
        });
      }
      return loadSessionState(trx, me.sessionId, me.guestId, settings.verificationMode);
    });
    this.realtime.sessionChanged(ctx.venue.venueId, state.session.id, 'verified');
    return state;
  }

  /** The host lets a new device order (FR-GOS-22). */
  approve(ctx: GuestContext, guestId: string): Promise<GuestSessionState> {
    return this.asHost(ctx, guestId, 'approved', async (trx, me, target) => {
      await trx
        .updateTable('ordering.session_guests')
        .set({ status: 'approved', approved_at: new Date(), approved_by_guest_id: me.guestId })
        .where('id', '=', target)
        .where('status', '=', 'pending_approval')
        .execute();
      await publish(trx, {
        type: 'guest.approved',
        venueId: ctx.venue.venueId,
        sessionId: me.sessionId,
        tableId: me.tableId,
        tableLabel: me.tableLabel,
        entityId: target,
        details: { by: 'host' },
        ...guestActor(me.guestId, me.nickname, me.tableLabel),
      });
    });
  }

  /** The host turns a waiting device away; it can still view the menu after rescanning. */
  decline(ctx: GuestContext, guestId: string): Promise<GuestSessionState> {
    return this.asHost(ctx, guestId, 'declined', async (trx, _me, target) => {
      await trx
        .updateTable('ordering.session_guests')
        .set({ status: 'left' })
        .where('id', '=', target)
        .where('status', '=', 'pending_approval')
        .execute();
    });
  }

  /** Hands the host role to another approved device (FR-GOS-20). */
  transferHost(ctx: GuestContext, guestId: string): Promise<GuestSessionState> {
    return this.asHost(ctx, guestId, 'host', async (trx, me, target) => {
      const ok = await trx
        .selectFrom('ordering.session_guests')
        .select('id')
        .where('id', '=', target)
        .where('status', '=', 'approved')
        .executeTakeFirst();
      if (!ok) throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, 'Device is not approved');
      await trx
        .updateTable('ordering.table_sessions')
        .set({ host_guest_id: target })
        .where('id', '=', me.sessionId)
        .execute();
    });
  }

  async rename(ctx: GuestContext, nickname: string): Promise<GuestSessionState> {
    const settings = await this.settings(ctx);
    const state = await this.inVenue(ctx, async (trx) => {
      const me = await requireMembership(trx, ctx.deviceHash);
      await trx
        .updateTable('ordering.session_guests')
        .set({ nickname })
        .where('id', '=', me.guestId)
        .execute();
      return loadSessionState(trx, me.sessionId, me.guestId, settings.verificationMode);
    });
    this.realtime.sessionChanged(ctx.venue.venueId, state.session.id, 'guest');
    return state;
  }

  /** Leaves the table (FR-GOS-23: needed before joining another one). */
  async leave(ctx: GuestContext): Promise<void> {
    const sessionId = await this.inVenue(ctx, async (trx) => {
      const me = await findMembership(trx, ctx.deviceHash);
      if (!me) return null;
      await this.leaveSession(trx, ctx, me);
      return me.sessionId;
    });
    if (sessionId) this.realtime.sessionChanged(ctx.venue.venueId, sessionId, 'guest');
  }

  private async leaveSession(trx: Tx, ctx: GuestContext, me: Membership): Promise<void> {
    await trx
      .updateTable('ordering.session_guests')
      .set({ status: 'left' })
      .where('id', '=', me.guestId)
      .execute();
    const others = await trx
      .selectFrom('ordering.session_guests')
      .select('id')
      .where('session_id', '=', me.sessionId)
      .where('status', '=', 'approved')
      .orderBy('approved_at')
      .execute();
    if (me.hostGuestId === me.guestId) {
      await trx
        .updateTable('ordering.table_sessions')
        .set({ host_guest_id: others[0]?.id ?? null })
        .where('id', '=', me.sessionId)
        .execute();
    }
    // Nobody left and nothing ordered: the table is free again.
    const anyOrder = await trx
      .selectFrom('ordering.orders')
      .select('id')
      .where('session_id', '=', me.sessionId)
      .executeTakeFirst();
    if (others.length === 0 && !anyOrder) {
      await trx
        .updateTable('ordering.table_sessions')
        .set({ status: 'abandoned', closed_at: new Date() })
        .where('id', '=', me.sessionId)
        .where('status', 'in', ['open', 'bill_requested'])
        .execute();
    }
    await publish(trx, {
      type: 'guest.left',
      venueId: ctx.venue.venueId,
      sessionId: me.sessionId,
      tableId: me.tableId,
      tableLabel: me.tableLabel,
      entityId: me.guestId,
      ...guestActor(me.guestId, me.nickname, me.tableLabel),
    });
  }

  private async asHost(
    ctx: GuestContext,
    targetGuestId: string,
    reason: string,
    fn: (trx: Tx, me: Membership, target: string) => Promise<void>,
  ): Promise<GuestSessionState> {
    const settings = await this.settings(ctx);
    const state = await this.inVenue(ctx, async (trx) => {
      const me = await requireMembership(trx, ctx.deviceHash);
      if (me.hostGuestId !== me.guestId) {
        throw fail(HttpStatus.FORBIDDEN, ErrorCode.hostOnly, 'Only the host device can do this');
      }
      const target = await trx
        .selectFrom('ordering.session_guests')
        .select('id')
        .where('id', '=', targetGuestId)
        .where('session_id', '=', me.sessionId)
        .executeTakeFirst();
      if (!target || target.id === me.guestId) {
        throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Device not found');
      }
      await fn(trx, me, target.id);
      return loadSessionState(trx, me.sessionId, me.guestId, settings.verificationMode);
    });
    this.realtime.sessionChanged(ctx.venue.venueId, state.session.id, reason);
    return state;
  }

  private activeSession(trx: Tx, tableId: string) {
    return trx
      .selectFrom('ordering.table_sessions')
      .select(['id', 'host_guest_id'])
      .where('table_id', '=', tableId)
      .where('status', 'in', ['open', 'bill_requested'])
      .forUpdate()
      .executeTakeFirst();
  }

  /** Someone scanned and walked away: no orders and no device seen for a while. */
  private async isStale(trx: Tx, sessionId: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - STALE_SESSION_MINUTES * 60_000);
    const order = await trx
      .selectFrom('ordering.orders')
      .select('id')
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    if (order) return false;
    const recent = await trx
      .selectFrom('ordering.session_guests')
      .select('id')
      .where('session_id', '=', sessionId)
      .where('status', 'in', ['pending_approval', 'approved'])
      .where('last_seen_at', '>', cutoff)
      .executeTakeFirst();
    return !recent;
  }

  private async defaultNickname(trx: Tx, sessionId: string, locale?: string): Promise<string> {
    const { count } = await trx
      .selectFrom('ordering.session_guests')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('session_id', '=', sessionId)
      .executeTakeFirstOrThrow();
    return `${locale === 'en' ? 'Guest' : 'Gost'} ${Number(count) + 1}`;
  }

  async settings(ctx: GuestContext): Promise<OrderingSettings> {
    const settings = await this.venues.orderingSettings(ctx.venue.venueId);
    if (!settings) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Venue not found');
    return settings;
  }

  private inVenue<T>(ctx: GuestContext, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId: ctx.venue.venueId, isSuperAdmin: false }, fn);
  }
}
