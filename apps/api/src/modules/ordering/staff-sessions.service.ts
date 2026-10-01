import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type Floor,
  type FloorTable,
  type RemoveGuestInput,
  type ServiceRequestView,
  type StaffSessionDetail,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { VenueDirectory, type OrderingSettings } from '../core/index.js';
import { fail } from './guest-session.service.js';
import { addHistory } from './order-writes.js';
import { OrderingDatabase } from './ordering.database.js';
import { publish, staffActor } from './outbox.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { blockingOrders, buildBill, loadOrders, staffOrder } from './session-view.js';

const ACTIVE_SESSION = ['open', 'bill_requested'] as const;
const OPEN_ORDER = ['new', 'returned', 'accepted', 'preparing', 'ready'] as const;
const OPEN_REQUEST = ['open', 'acknowledged'] as const;

const cents = (value: string) => Math.round(Number(value) * 100);
const fromCents = (value: number) => (value / 100).toFixed(2);

export type ActiveSession = {
  id: string;
  table_id: string;
  table_label: string;
  verified_at: Date | null;
};

/**
 * Tables and sessions from the staff side (FR-KON-15..18, FR-GOS-21, 22): the floor, one
 * table in detail, confirming tables and devices, removing devices, handling requests.
 */
@Injectable()
export class StaffSessionsService {
  constructor(
    private readonly db: OrderingDatabase,
    private readonly venues: VenueDirectory,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Every active table with its status; the client filters by area. */
  async floor(staff: StaffClaims): Promise<Floor> {
    const plan = await this.venues.floorPlan(staff.venueId);
    const sessions = await this.inVenue(staff, async (trx) => {
      const rows = await trx
        .selectFrom('ordering.table_sessions')
        .select(['id', 'table_id', 'status', 'opened_at', 'verified_at'])
        .where('status', 'in', [...ACTIVE_SESSION])
        .execute();
      if (rows.length === 0) return [];
      const ids = rows.map((s) => s.id);
      const guests = await trx
        .selectFrom('ordering.session_guests')
        .select(['session_id', 'status'])
        .where('session_id', 'in', ids)
        .where('status', 'in', ['pending_approval', 'approved'])
        .execute();
      const orders = await trx
        .selectFrom('ordering.orders')
        .select(['session_id', 'status', 'dispute_status', 'total'])
        .where('session_id', 'in', ids)
        .execute();
      const requests = await this.requests(trx, ids);
      return rows.map((s) => {
        const own = orders.filter((o) => o.session_id === s.id);
        const live = own.filter((o) => !['cancelled', 'rejected', 'withdrawn'].includes(o.status));
        const billed = live.filter(
          (o) => !['new', 'returned'].includes(o.status) && o.dispute_status !== 'open',
        );
        return {
          tableId: s.table_id,
          session: {
            id: s.id,
            status: s.status,
            openedAt: s.opened_at.toISOString(),
            verified: s.verified_at !== null,
            guests: guests.filter((g) => g.session_id === s.id && g.status === 'approved').length,
            pendingGuests: guests.filter(
              (g) => g.session_id === s.id && g.status === 'pending_approval',
            ).length,
            newOrders: own.filter((o) => o.status === 'new').length,
            openOrders: own.filter((o) => (OPEN_ORDER as readonly string[]).includes(o.status))
              .length,
            disputes: live.filter((o) => o.dispute_status === 'open').length,
            total: fromCents(billed.reduce((sum, o) => sum + cents(o.total), 0)),
            requests: requests.filter((r) => r.sessionId === s.id).map((r) => r.view),
          },
        };
      });
    });

    const tables: FloorTable[] = plan.tables.map((t) => {
      const session = sessions.find((s) => s.tableId === t.id)?.session ?? null;
      return { ...t, status: tableStatus(session), session };
    });
    return { areas: plan.areas, tables };
  }

  async detail(staff: StaffClaims, sessionId: string): Promise<StaffSessionDetail> {
    const settings = await this.settings(staff);
    return this.inVenue(staff, async (trx) => {
      const session = await trx
        .selectFrom('ordering.table_sessions')
        .select([
          'id',
          'table_id',
          'table_label',
          'status',
          'verified_at',
          'verification_code',
          'opened_at',
          'host_guest_id',
        ])
        .where('id', '=', sessionId)
        .executeTakeFirst();
      if (!session) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Session not found');
      const guests = await trx
        .selectFrom('ordering.session_guests')
        .select(['id', 'nickname', 'status', 'last_seen_at'])
        .where('session_id', '=', sessionId)
        .where('status', 'in', ['pending_approval', 'approved'])
        .orderBy('created_at')
        .execute();
      const orders = await loadOrders(trx, sessionId);
      const requests = await this.requests(trx, [sessionId]);
      return {
        id: session.id,
        tableId: session.table_id,
        tableLabel: session.table_label,
        status: session.status,
        verified: session.verified_at !== null,
        verificationCode: session.verified_at === null ? session.verification_code : null,
        verificationMode: settings.verificationMode,
        openedAt: session.opened_at.toISOString(),
        guests: guests.map((g) => ({
          id: g.id,
          nickname: g.nickname,
          status: g.status,
          isHost: g.id === session.host_guest_id,
          lastSeenAt: g.last_seen_at.toISOString(),
        })),
        orders: orders.map(staffOrder),
        requests: requests.map((r) => r.view),
        bill: buildBill(orders),
        blockingOrders: blockingOrders(orders),
        paymentMethods: settings.paymentMethods.filter((m) => m.method !== 'online'),
        orderRejectionEnabled: settings.orderRejectionEnabled,
      };
    });
  }

  /** The waiter saw someone really sits at the table (FR-GOS-21, waiter mode). */
  async verify(staff: StaffClaims, sessionId: string): Promise<void> {
    await this.inVenue(staff, async (trx) => {
      const session = await activeSession(trx, sessionId);
      if (session.verified_at) return;
      await markVerified(trx, staff, session);
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'verified');
  }

  /** The waiter lets a waiting device order (FR-GOS-22). */
  async approveGuest(staff: StaffClaims, sessionId: string, guestId: string): Promise<void> {
    await this.inVenue(staff, async (trx) => {
      const session = await activeSession(trx, sessionId);
      const updated = await trx
        .updateTable('ordering.session_guests')
        .set({
          status: 'approved',
          approved_at: new Date(),
          approved_by_member_id: staff.memberId,
        })
        .where('id', '=', guestId)
        .where('session_id', '=', sessionId)
        .where('status', '=', 'pending_approval')
        .returning('id')
        .executeTakeFirst();
      if (!updated) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Device not waiting');
      await publish(trx, {
        type: 'guest.approved',
        venueId: staff.venueId,
        sessionId,
        tableId: session.table_id,
        tableLabel: session.table_label,
        entityId: guestId,
        details: { by: 'staff' },
        ...staffActor(staff.memberId, staff.name),
      });
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'guest');
  }

  /**
   * Removes a device from the table (FR-KON-17, FR-GOS-26): its unconfirmed orders are
   * cancelled and, unless told otherwise, the device is blocked for the venue's block hours.
   */
  async removeGuest(
    staff: StaffClaims,
    sessionId: string,
    guestId: string,
    input: RemoveGuestInput,
  ): Promise<void> {
    const settings = await this.settings(staff);
    await this.inVenue(staff, async (trx) => {
      const session = await activeSession(trx, sessionId);
      const guest = await trx
        .selectFrom('ordering.session_guests')
        .select(['id', 'device_hash', 'nickname'])
        .where('id', '=', guestId)
        .where('session_id', '=', sessionId)
        .where('status', 'in', ['pending_approval', 'approved'])
        .executeTakeFirst();
      if (!guest) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Device not found');

      const now = new Date();
      await trx
        .updateTable('ordering.session_guests')
        .set({ status: 'removed', removed_at: now, removed_by_member_id: staff.memberId })
        .where('id', '=', guestId)
        .execute();
      const pending = await trx
        .selectFrom('ordering.orders')
        .select(['id', 'status'])
        .where('guest_id', '=', guestId)
        .where('status', 'in', ['new', 'returned'])
        .forUpdate()
        .execute();
      for (const order of pending) {
        await trx
          .updateTable('ordering.orders')
          .set({ status: 'cancelled', cancelled_at: now, cancel_reason: 'device_removed' })
          .where('id', '=', order.id)
          .execute();
        await addHistory(trx, staff.venueId, order.id, order.status, 'cancelled', staff.memberId);
      }
      // The host role moves to the longest-approved device left.
      const host = await trx
        .selectFrom('ordering.table_sessions')
        .select('host_guest_id')
        .where('id', '=', sessionId)
        .executeTakeFirstOrThrow();
      if (host.host_guest_id === guestId) {
        const next = await trx
          .selectFrom('ordering.session_guests')
          .select('id')
          .where('session_id', '=', sessionId)
          .where('status', '=', 'approved')
          .orderBy('approved_at')
          .executeTakeFirst();
        await trx
          .updateTable('ordering.table_sessions')
          .set({ host_guest_id: next?.id ?? null })
          .where('id', '=', sessionId)
          .execute();
      }
      if (input.block) {
        await trx
          .insertInto('ordering.device_blocks')
          .values({
            venue_id: staff.venueId,
            device_hash: guest.device_hash,
            session_id: sessionId,
            blocked_by_member_id: staff.memberId,
            reason: input.reason ?? null,
            blocked_until: new Date(now.getTime() + settings.deviceBlockHours * 3_600_000),
          })
          .execute();
      }
      await publish(trx, {
        type: 'guest.removed',
        venueId: staff.venueId,
        sessionId,
        tableId: session.table_id,
        tableLabel: session.table_label,
        entityId: guestId,
        details: {
          nickname: guest.nickname,
          blocked: input.block,
          cancelledOrders: pending.length,
          ...(input.reason ? { reason: input.reason } : {}),
        },
        ...staffActor(staff.memberId, staff.name),
      });
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'guest');
  }

  /** "Vidio sam" and "Riješeno" for a waiter call or bill request (FR-KON-18). */
  async handleRequest(
    staff: StaffClaims,
    requestId: string,
    action: 'acknowledge' | 'done',
  ): Promise<void> {
    const sessionId = await this.inVenue(staff, async (trx) => {
      const request = await trx
        .updateTable('ordering.service_requests')
        .set(
          action === 'done'
            ? { status: 'done', handled_at: new Date(), handled_by_member_id: staff.memberId }
            : { status: 'acknowledged', handled_by_member_id: staff.memberId },
        )
        .where('id', '=', requestId)
        .where('status', 'in', [...OPEN_REQUEST])
        .returning(['session_id', 'table_id', 'type'])
        .executeTakeFirst();
      if (!request) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Request not open');
      if (action === 'done') {
        const session = await trx
          .selectFrom('ordering.table_sessions')
          .select('table_label')
          .where('id', '=', request.session_id)
          .executeTakeFirstOrThrow();
        await publish(trx, {
          type: 'service.handled',
          venueId: staff.venueId,
          sessionId: request.session_id,
          tableId: request.table_id,
          tableLabel: session.table_label,
          entityId: requestId,
          details: { request: request.type },
          ...staffActor(staff.memberId, staff.name),
        });
      }
      return request.session_id;
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'request');
  }

  /**
   * Closes a table with nothing to pay (e.g. guests left without ordering). A table with a
   * bill is closed by its payment (billing).
   */
  async closeEmpty(staff: StaffClaims, sessionId: string): Promise<void> {
    await this.inVenue(staff, async (trx) => {
      const session = await activeSession(trx, sessionId);
      const orders = await loadOrders(trx, sessionId);
      if (blockingOrders(orders) > 0) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.openOrders, 'Settle open orders first');
      }
      if (buildBill(orders).total !== '0.00') {
        throw fail(HttpStatus.CONFLICT, ErrorCode.billUnpaid, 'The table has an unpaid bill');
      }
      await closeSession(trx, staff, session, null);
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'session.closed');
  }

  private async requests(trx: Tx, sessionIds: string[]) {
    const rows = await trx
      .selectFrom('ordering.service_requests as r')
      .leftJoin('ordering.session_guests as g', 'g.id', 'r.guest_id')
      .select([
        'r.id',
        'r.session_id',
        'r.type',
        'r.status',
        'r.requested_payment_method',
        'r.created_at',
        'g.nickname',
      ])
      .where('r.session_id', 'in', sessionIds)
      .where('r.status', 'in', [...OPEN_REQUEST])
      .orderBy('r.created_at')
      .execute();
    return rows.map((r) => ({
      sessionId: r.session_id,
      view: {
        id: r.id,
        type: r.type,
        status: r.status,
        paymentMethod: r.requested_payment_method,
        createdAt: r.created_at.toISOString(),
        nickname: r.nickname,
      } satisfies ServiceRequestView,
    }));
  }

  private async settings(staff: StaffClaims): Promise<OrderingSettings> {
    const settings = await this.venues.orderingSettings(staff.venueId);
    if (!settings) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Venue not found');
    return settings;
  }

  private inVenue<T>(staff: StaffClaims, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, fn);
  }
}

function tableStatus(session: FloorTable['session']): FloorTable['status'] {
  if (!session) return 'free';
  const billRequested =
    session.status === 'bill_requested' || session.requests.some((r) => r.type === 'request_bill');
  if (billRequested) return 'bill_requested';
  const needs =
    session.newOrders > 0 ||
    session.pendingGuests > 0 ||
    session.disputes > 0 ||
    session.requests.some((r) => r.type === 'call_waiter' && r.status === 'open');
  return needs ? 'needs_service' : 'occupied';
}

/** The session row, locked, if it is still active. */
export async function activeSession(trx: Tx, sessionId: string): Promise<ActiveSession> {
  const session = await trx
    .selectFrom('ordering.table_sessions')
    .select(['id', 'table_id', 'table_label', 'verified_at'])
    .where('id', '=', sessionId)
    .where('status', 'in', [...ACTIVE_SESSION])
    .forUpdate()
    .executeTakeFirst();
  if (!session) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Session not found');
  return session;
}

export async function markVerified(
  trx: Tx,
  staff: StaffClaims,
  session: ActiveSession,
): Promise<void> {
  await trx
    .updateTable('ordering.table_sessions')
    .set({ verified_at: new Date(), verified_by_member_id: staff.memberId })
    .where('id', '=', session.id)
    .execute();
  await publish(trx, {
    type: 'session.verified',
    venueId: staff.venueId,
    sessionId: session.id,
    tableId: session.table_id,
    tableLabel: session.table_label,
    entityId: session.id,
    details: { by: 'staff' },
    ...staffActor(staff.memberId, staff.name),
  });
}

/** Closes the table: guests are released (trigger), open requests are done (FR-KON-21). */
export async function closeSession(
  trx: Tx,
  staff: StaffClaims,
  session: ActiveSession,
  payment: { id: string; amount: string; method: string } | null,
): Promise<void> {
  const now = new Date();
  await trx
    .updateTable('ordering.table_sessions')
    .set({ status: 'closed', closed_at: now, closed_by_member_id: staff.memberId })
    .where('id', '=', session.id)
    .execute();
  await trx
    .updateTable('ordering.service_requests')
    .set({ status: 'done', handled_at: now, handled_by_member_id: staff.memberId })
    .where('session_id', '=', session.id)
    .where('status', 'in', [...OPEN_REQUEST])
    .execute();
  await publish(trx, {
    type: 'session.closed',
    venueId: staff.venueId,
    sessionId: session.id,
    tableId: session.table_id,
    tableLabel: session.table_label,
    entityId: session.id,
    ...(payment
      ? { total: payment.amount, details: { paymentId: payment.id, method: payment.method } }
      : {}),
    ...staffActor(staff.memberId, staff.name),
  });
}
