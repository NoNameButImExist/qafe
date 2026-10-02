import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type KdsOrder, type KdsView } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { sql } from 'kysely';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { VenueDirectory } from '../core/index.js';
import { fail } from './guest-session.service.js';
import { addHistory } from './order-writes.js';
import { OrderingDatabase } from './ordering.database.js';
import { publish, staffActor } from './outbox.js';
import { RealtimeGateway } from './realtime.gateway.js';

/** Orders a station still works on. */
const IN_WORK = ['accepted', 'preparing', 'ready'] as const;
/** "Spremno" can be taken back this long after the tap (FR-KON-27; the app shows 10 s). */
const UNDO_SECONDS = 15;

interface ItemRow {
  id: string;
  order_id: string;
  item_name: string;
  quantity: number;
  note: string | null;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'removed' | 'cancelled';
  prep_station_id: string | null;
  updated_at: Date;
  order_number: number;
  guest_note: string | null;
  accepted_at: Date | null;
  created_at: Date;
  table_label: string;
}

/**
 * Kitchen and bar screens (KDS module, FR-KON-24..29): items of accepted orders per station,
 * one tap marks an item ready, the last tap can be undone, and the waiter is told when the
 * whole order is ready. Every call checks that the admin turned the module on.
 */
@Injectable()
export class KdsService {
  constructor(
    private readonly db: OrderingDatabase,
    private readonly venues: VenueDirectory,
    private readonly realtime: RealtimeGateway,
  ) {}

  async view(staff: StaffClaims, stationId?: string): Promise<KdsView> {
    await this.requireModule(staff);
    const settings = await this.venues.kdsSettings(staff.venueId);
    const { open, done } = await this.inVenue(staff, async (trx) => {
      const base = (statuses: string[]) =>
        sql<ItemRow>`
          select i.id, i.order_id, i.item_name, i.quantity, i.note, i.status, i.prep_station_id,
                 i.updated_at, o.order_number, o.guest_note, o.accepted_at, o.created_at,
                 s.table_label
            from ordering.order_items i
            join ordering.orders o on o.id = i.order_id
            join ordering.table_sessions s on s.id = o.session_id
           where i.status = any(${statuses}::app.order_item_status[])
             and o.status = any(${[...IN_WORK, 'served']}::app.order_status[])
             ${stationId ? sql`and i.prep_station_id = ${stationId}` : sql``}
        `;
      const openRows = (
        await sql<ItemRow>`${base(['pending', 'preparing'])} order by coalesce(o.accepted_at, o.created_at), i.created_at`.execute(
          trx,
        )
      ).rows;
      const doneRows = (
        await sql<ItemRow>`${base(['ready', 'served'])} and i.updated_at > now() - interval '60 minutes'
                     order by i.updated_at desc`.execute(trx)
      ).rows;
      const modifiers = await this.modifiers(
        trx,
        [...openRows, ...doneRows].map((r) => r.id),
      );
      return {
        open: group(openRows, modifiers),
        done: group(doneRows, modifiers),
      };
    });
    return {
      stations: settings.stations.filter((s) => s.isActive),
      warningMinutes: settings.warningMinutes,
      criticalMinutes: settings.criticalMinutes,
      open,
      done,
    };
  }

  /** One tap (FR-KON-26). When every item of the order is ready, the order is too. */
  async ready(staff: StaffClaims, itemId: string): Promise<void> {
    await this.requireModule(staff);
    await this.changeItem(staff, itemId, ['pending', 'preparing'], 'ready');
  }

  /** Takes a "ready" back within a few seconds (FR-KON-27). */
  async undo(staff: StaffClaims, itemId: string): Promise<void> {
    await this.requireModule(staff);
    await this.changeItem(staff, itemId, ['ready'], 'preparing');
  }

  /** The station starts an order: its items and the order become "u pripremi". */
  async start(staff: StaffClaims, orderId: string, stationId?: string): Promise<void> {
    await this.requireModule(staff);
    const sessionId = await this.inVenue(staff, async (trx) => {
      const order = await this.lockOrder(trx, orderId);
      await trx
        .updateTable('ordering.order_items')
        .set({ status: 'preparing' })
        .where('order_id', '=', orderId)
        .where('status', '=', 'pending')
        .$if(Boolean(stationId), (q) => q.where('prep_station_id', '=', stationId!))
        .execute();
      if (order.status === 'accepted') {
        await trx
          .updateTable('ordering.orders')
          .set({ status: 'preparing' })
          .where('id', '=', orderId)
          .execute();
        await addHistory(trx, staff.venueId, orderId, 'accepted', 'preparing', staff.memberId);
      }
      return order.session_id;
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'order.preparing');
  }

  private async changeItem(
    staff: StaffClaims,
    itemId: string,
    from: ('pending' | 'preparing' | 'ready')[],
    to: 'ready' | 'preparing',
  ): Promise<void> {
    const result = await this.inVenue(staff, async (trx) => {
      const item = await trx
        .selectFrom('ordering.order_items')
        .select(['id', 'order_id', 'status', 'updated_at'])
        .where('id', '=', itemId)
        .forUpdate()
        .executeTakeFirst();
      if (!item) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Item not found');
      const order = await this.lockOrder(trx, item.order_id);
      if (!(from as string[]).includes(item.status)) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, `Item is ${item.status}`);
      }
      if (to === 'preparing' && item.updated_at.getTime() < Date.now() - UNDO_SECONDS * 1000) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.undoExpired, 'Too late to undo');
      }
      await trx
        .updateTable('ordering.order_items')
        .set({ status: to })
        .where('id', '=', itemId)
        .execute();

      // The order follows its items: all live items ready → ready; otherwise in work.
      const live = await trx
        .selectFrom('ordering.order_items')
        .select('status')
        .where('order_id', '=', order.id)
        .where('status', 'in', ['pending', 'preparing', 'ready', 'served'])
        .execute();
      const allReady =
        live.length > 0 && live.every((i) => i.status === 'ready' || i.status === 'served');
      const next = allReady ? 'ready' : 'preparing';
      let becameReady = false;
      if (order.status !== next && order.status !== 'served') {
        await trx
          .updateTable('ordering.orders')
          .set({ status: next, ...(next === 'ready' ? { ready_at: new Date() } : {}) })
          .where('id', '=', order.id)
          .execute();
        await addHistory(trx, staff.venueId, order.id, order.status, next, staff.memberId);
        if (next === 'ready') {
          becameReady = true;
          await publish(trx, {
            type: 'order.ready',
            venueId: staff.venueId,
            sessionId: order.session_id,
            tableId: order.table_id,
            tableLabel: order.table_label,
            entityId: order.id,
            orderNumber: order.order_number,
            ...staffActor(staff.memberId, staff.name),
          });
        }
      }
      return { sessionId: order.session_id, becameReady };
    });
    this.realtime.sessionChanged(
      staff.venueId,
      result.sessionId,
      result.becameReady ? 'order.ready' : 'item.changed',
    );
  }

  private async lockOrder(trx: Tx, orderId: string) {
    const order = await trx
      .selectFrom('ordering.orders as o')
      .innerJoin('ordering.table_sessions as s', 's.id', 'o.session_id')
      .select(['o.id', 'o.status', 'o.session_id', 'o.table_id', 'o.order_number', 's.table_label'])
      .where('o.id', '=', orderId)
      .forUpdate('o')
      .executeTakeFirst();
    if (!order) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Order not found');
    if (!(IN_WORK as readonly string[]).includes(order.status)) {
      throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, `Order is ${order.status}`);
    }
    return order;
  }

  private async modifiers(trx: Tx, itemIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (itemIds.length === 0) return map;
    const rows = await trx
      .selectFrom('ordering.order_item_modifiers')
      .select(['order_item_id', 'option_name'])
      .where('order_item_id', 'in', itemIds)
      .execute();
    for (const r of rows)
      map.set(r.order_item_id, [...(map.get(r.order_item_id) ?? []), r.option_name]);
    return map;
  }

  private async requireModule(staff: StaffClaims): Promise<void> {
    if (!(await this.venues.hasModule(staff.venueId, 'kds'))) {
      throw fail(HttpStatus.FORBIDDEN, ErrorCode.moduleDisabled, 'The KDS module is not enabled');
    }
  }

  private inVenue<T>(staff: StaffClaims, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, fn);
  }
}

/** Items grouped by order, in the order the rows came. */
function group(rows: ItemRow[], modifiers: Map<string, string[]>): KdsOrder[] {
  const orders = new Map<string, KdsOrder>();
  for (const r of rows) {
    let order = orders.get(r.order_id);
    if (!order) {
      order = {
        orderId: r.order_id,
        number: r.order_number,
        tableLabel: r.table_label,
        acceptedAt: (r.accepted_at ?? r.created_at).toISOString(),
        note: r.guest_note,
        items: [],
      };
      orders.set(r.order_id, order);
    }
    order.items.push({
      id: r.id,
      name: r.item_name,
      quantity: r.quantity,
      note: r.note,
      modifiers: modifiers.get(r.id) ?? [],
      status: r.status,
      stationId: r.prep_station_id,
      readyAt: r.status === 'ready' || r.status === 'served' ? r.updated_at.toISOString() : null,
    });
  }
  return [...orders.values()];
}
