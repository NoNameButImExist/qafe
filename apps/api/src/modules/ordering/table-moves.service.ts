import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type MoveSessionResult } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { VenueDirectory } from '../core/index.js';
import { fail } from './guest-session.service.js';
import { OrderingDatabase } from './ordering.database.js';
import { publish, staffActor } from './outbox.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { openStaffSession } from './staff-orders.service.js';

const ACTIVE = ['open', 'bill_requested'] as const;
const FINAL_ORDER = ['cancelled', 'rejected', 'withdrawn'];

interface LockedSession {
  id: string;
  table_id: string;
  table_label: string;
  verified_at: Date | null;
  paid_amount: string;
}

/**
 * Moving at the table (FR-KON-14): one order to another table (it was entered at the wrong
 * one, or the guests split up), or the whole table to another one (the guests moved, or two
 * tables sit together). A table with partial payments stays put: its payments belong to it.
 */
@Injectable()
export class TableMovesService {
  constructor(
    private readonly db: OrderingDatabase,
    private readonly venues: VenueDirectory,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** The order goes to the other table's open session, or opens (and verifies) one there. */
  async moveOrder(staff: StaffClaims, orderId: string, tableId: string): Promise<void> {
    const table = await this.venues.table(staff.venueId, tableId);
    if (!table) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Table not found');
    const moved = await this.inVenue(staff, async (trx) => {
      const order = await trx
        .selectFrom('ordering.orders')
        .select(['id', 'session_id', 'table_id', 'status', 'order_number', 'total'])
        .where('id', '=', orderId)
        .forUpdate()
        .executeTakeFirst();
      if (!order) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Order not found');
      if (FINAL_ORDER.includes(order.status)) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, 'This order is closed');
      }
      if (order.table_id === tableId) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.sameTable, 'The order is already at this table');
      }
      const source = await this.lock(trx, order.session_id);
      assertUnpaid(source);
      const target = await openStaffSession(trx, staff, table);
      await trx
        .updateTable('ordering.orders')
        .set({ session_id: target.id, table_id: table.id })
        .where('id', '=', order.id)
        .execute();
      await publish(trx, {
        type: 'order.moved',
        venueId: staff.venueId,
        sessionId: source.id,
        tableId: source.table_id,
        tableLabel: source.table_label,
        entityId: order.id,
        orderNumber: order.order_number,
        total: order.total,
        details: { to: table.label, toSessionId: target.id },
        ...staffActor(staff.memberId, staff.name),
      });
      return { from: source.id, to: target.id };
    });
    this.realtime.sessionChanged(staff.venueId, moved.from, 'order.moved');
    this.realtime.sessionChanged(staff.venueId, moved.to, 'order.moved');
  }

  /**
   * The whole table goes to another table. Onto a free table the session simply moves (same
   * guests, orders and bill); onto an occupied one the two are merged: orders, devices and
   * requests join that table and this one closes, pointing to it.
   */
  async moveSession(
    staff: StaffClaims,
    sessionId: string,
    tableId: string,
  ): Promise<MoveSessionResult> {
    const table = await this.venues.table(staff.venueId, tableId);
    if (!table) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Table not found');
    const result = await this.inVenue(staff, async (trx) => {
      const source = await this.lock(trx, sessionId);
      if (source.table_id === tableId) {
        throw fail(
          HttpStatus.CONFLICT,
          ErrorCode.sameTable,
          'The guests are already at this table',
        );
      }
      assertUnpaid(source);
      const occupied = await trx
        .selectFrom('ordering.table_sessions')
        .select(['id', 'table_id', 'table_label', 'verified_at', 'paid_amount'])
        .where('table_id', '=', tableId)
        .where('status', 'in', [...ACTIVE])
        .forUpdate()
        .executeTakeFirst();

      if (!occupied) {
        await trx
          .updateTable('ordering.table_sessions')
          .set({ table_id: table.id, table_label: table.label })
          .where('id', '=', source.id)
          .execute();
        await trx
          .updateTable('ordering.orders')
          .set({ table_id: table.id })
          .where('session_id', '=', source.id)
          .execute();
        await trx
          .updateTable('ordering.service_requests')
          .set({ table_id: table.id })
          .where('session_id', '=', source.id)
          .execute();
        await publish(trx, {
          type: 'session.moved',
          venueId: staff.venueId,
          sessionId: source.id,
          tableId: table.id,
          tableLabel: table.label,
          entityId: source.id,
          details: { from: source.table_label, to: table.label },
          ...staffActor(staff.memberId, staff.name),
        });
        return { sessionId: source.id, merged: false, notify: [source.id] };
      }

      assertUnpaid(occupied);
      await this.mergeInto(trx, staff, source, occupied);
      return { sessionId: occupied.id, merged: true, notify: [source.id, occupied.id] };
    });
    for (const id of result.notify) {
      this.realtime.sessionChanged(
        staff.venueId,
        id,
        result.merged ? 'session.merged' : 'session.moved',
      );
    }
    return { sessionId: result.sessionId, merged: result.merged };
  }

  private async mergeInto(
    trx: Tx,
    staff: StaffClaims,
    source: LockedSession,
    target: LockedSession,
  ): Promise<void> {
    await trx
      .updateTable('ordering.orders')
      .set({ session_id: target.id, table_id: target.table_id })
      .where('session_id', '=', source.id)
      .execute();
    await trx
      .updateTable('ordering.service_requests')
      .set({ session_id: target.id, table_id: target.table_id })
      .where('session_id', '=', source.id)
      .execute();
    // Devices join the other table; one already there keeps its place there.
    const there = await trx
      .selectFrom('ordering.session_guests')
      .select('device_hash')
      .where('session_id', '=', target.id)
      .execute();
    const known = new Set(there.map((g) => g.device_hash));
    const guests = await trx
      .selectFrom('ordering.session_guests')
      .select(['id', 'device_hash'])
      .where('session_id', '=', source.id)
      .where('status', 'in', ['pending_approval', 'approved'])
      .execute();
    for (const g of guests) {
      if (known.has(g.device_hash)) {
        await trx
          .updateTable('ordering.session_guests')
          .set({ status: 'left' })
          .where('id', '=', g.id)
          .execute();
      } else {
        await trx
          .updateTable('ordering.session_guests')
          .set({ session_id: target.id })
          .where('id', '=', g.id)
          .execute();
      }
    }
    // A verified table stays verified after the merge (the waiter saw both).
    if (source.verified_at && !target.verified_at) {
      await trx
        .updateTable('ordering.table_sessions')
        .set({ verified_at: new Date(), verified_by_member_id: staff.memberId })
        .where('id', '=', target.id)
        .execute();
    }
    await trx
      .updateTable('ordering.table_sessions')
      .set({
        status: 'closed',
        closed_at: new Date(),
        closed_by_member_id: staff.memberId,
        merged_into_session_id: target.id,
        host_guest_id: null,
      })
      .where('id', '=', source.id)
      .execute();
    await publish(trx, {
      type: 'session.merged',
      venueId: staff.venueId,
      sessionId: source.id,
      tableId: source.table_id,
      tableLabel: source.table_label,
      entityId: source.id,
      details: { into: target.table_label, intoSessionId: target.id },
      ...staffActor(staff.memberId, staff.name),
    });
  }

  private async lock(trx: Tx, sessionId: string): Promise<LockedSession> {
    const session = await trx
      .selectFrom('ordering.table_sessions')
      .select(['id', 'table_id', 'table_label', 'verified_at', 'paid_amount'])
      .where('id', '=', sessionId)
      .where('status', 'in', [...ACTIVE])
      .forUpdate()
      .executeTakeFirst();
    if (!session) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Session not found');
    return session;
  }

  private inVenue<T>(staff: StaffClaims, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, fn);
  }
}

function assertUnpaid(session: { paid_amount: string }): void {
  if (Number(session.paid_amount) > 0) {
    throw fail(
      HttpStatus.CONFLICT,
      ErrorCode.partiallyPaid,
      'This table has partial payments; settle it first',
    );
  }
}
