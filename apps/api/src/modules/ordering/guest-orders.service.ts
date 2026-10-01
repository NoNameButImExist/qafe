import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type GuestSessionState,
  type PlaceOrderInput,
  type ResubmitOrderInput,
  type ServiceRequestBody,
  type SessionOrder,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { GuestMenuService, type PricedLine } from '../catalog/index.js';
import type { OrderingSettings } from '../core/index.js';
import type { GuestContext } from './guest.guard.js';
import {
  closedReason,
  fail,
  GuestSessionService,
  requireMembership,
  type Membership,
} from './guest-session.service.js';
import { OrderingDatabase } from './ordering.database.js';
import {
  addHistory,
  insertLines,
  isUniqueViolation,
  nextOrderNumber,
  sumLines,
  vatOf,
} from './order-writes.js';
import { guestActor, publish } from './outbox.js';
import { RealtimeGateway } from './realtime.gateway.js';
import {
  CALL_WAITER_COOLDOWN_SECONDS,
  guestOrder,
  loadOrders,
  loadSessionState,
} from './session-view.js';

/** FR-GOS-27: unconfirmed orders per device, and orders per minute per session. */
const MAX_PENDING_PER_DEVICE = 2;
const MAX_ORDERS_PER_MINUTE = 5;

/** Result of placing an order: `created` is false for a retry with the same key (NFR-06). */
export interface PlaceResult {
  order: SessionOrder;
  created: boolean;
}

/** Orders, "Nije naše" and service requests from the guest's side (FR-GOS-09..16, 25, 27). */
@Injectable()
export class GuestOrdersService {
  constructor(
    private readonly db: OrderingDatabase,
    private readonly sessions: GuestSessionService,
    private readonly menu: GuestMenuService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async place(ctx: GuestContext, input: PlaceOrderInput): Promise<PlaceResult> {
    const settings = await this.sessions.settings(ctx);

    // A retry of an order that already exists returns it before any other check.
    const existing = await this.inVenue(ctx, (trx) => this.byKey(trx, ctx, input.idempotencyKey));
    if (existing) return { order: existing, created: false };

    this.assertOpen(settings);
    const lines = await this.price(ctx, input.items);

    try {
      const order = await this.inVenue(ctx, async (trx) => {
        const me = await this.orderingMember(trx, ctx, settings);
        await this.assertLimits(trx, me);

        const total = sumLines(lines);
        const { businessDate, orderNumber } = await nextOrderNumber(
          trx,
          ctx.venue.venueId,
          settings,
        );

        const order = await trx
          .insertInto('ordering.orders')
          .values({
            venue_id: ctx.venue.venueId,
            session_id: me.sessionId,
            table_id: me.tableId,
            business_date: businessDate,
            order_number: orderNumber,
            source: 'guest_qr',
            idempotency_key: input.idempotencyKey,
            guest_id: me.guestId,
            guest_note: input.note ?? null,
            total,
            vat_rate: settings.vatRate,
            vat_amount: vatOf(total, settings.vatRate),
          })
          .returning(['id', 'order_number'])
          .executeTakeFirstOrThrow();
        await insertLines(trx, ctx.venue.venueId, order.id, lines);
        await addHistory(trx, ctx.venue.venueId, order.id, null, 'new');
        await publish(trx, {
          type: 'order.created',
          venueId: ctx.venue.venueId,
          sessionId: me.sessionId,
          tableId: me.tableId,
          tableLabel: me.tableLabel,
          entityId: order.id,
          orderNumber: order.order_number,
          total,
          ...guestActor(me.guestId, me.nickname, me.tableLabel),
        });
        const [view] = await loadOrders(trx, me.sessionId, [order.id]);
        return { view: guestOrder(view!), sessionId: me.sessionId };
      });
      this.realtime.sessionChanged(ctx.venue.venueId, order.sessionId, 'order.created');
      return { order: order.view, created: true };
    } catch (error) {
      // Two requests with the same key at once: the loser returns the winner's order.
      if (isUniqueViolation(error)) {
        const winner = await this.inVenue(ctx, (trx) => this.byKey(trx, ctx, input.idempotencyKey));
        if (winner) return { order: winner, created: false };
      }
      throw error;
    }
  }

  /** A returned order, corrected and sent again (FR-GOS-12). */
  async resubmit(
    ctx: GuestContext,
    orderId: string,
    input: ResubmitOrderInput,
  ): Promise<GuestSessionState> {
    const settings = await this.sessions.settings(ctx);
    this.assertOpen(settings);
    const lines = await this.price(ctx, input.items);
    return this.onOwnReturnedOrder(ctx, settings, orderId, 'order.resubmitted', async (trx, me) => {
      const total = sumLines(lines);
      // Staff notes about the old items stay (as text); the items themselves are replaced.
      await trx
        .updateTable('ordering.order_changes')
        .set({ order_item_id: null })
        .where('order_id', '=', orderId)
        .execute();
      await trx.deleteFrom('ordering.order_items').where('order_id', '=', orderId).execute();
      await insertLines(trx, ctx.venue.venueId, orderId, lines);
      await trx
        .updateTable('ordering.orders')
        .set({
          status: 'new',
          guest_note: input.note ?? null,
          total,
          vat_amount: vatOf(total, settings.vatRate),
        })
        .where('id', '=', orderId)
        .execute();
      await addHistory(trx, ctx.venue.venueId, orderId, 'returned', 'new');
      return { total, me };
    });
  }

  /** The guest drops a returned order instead of correcting it (FR-GOS-12). */
  async withdraw(ctx: GuestContext, orderId: string): Promise<GuestSessionState> {
    const settings = await this.sessions.settings(ctx);
    return this.onOwnReturnedOrder(ctx, settings, orderId, 'order.withdrawn', async (trx, me) => {
      await trx
        .updateTable('ordering.orders')
        .set({ status: 'withdrawn' })
        .where('id', '=', orderId)
        .execute();
      await addHistory(trx, ctx.venue.venueId, orderId, 'returned', 'withdrawn');
      return { me };
    });
  }

  /**
   * "Nije naše" (FR-GOS-25): any device at the table can flag an order. The waiter gets a
   * warning and the order stays off the bill until staff confirm or cancel it.
   */
  async dispute(ctx: GuestContext, orderId: string): Promise<GuestSessionState> {
    const settings = await this.sessions.settings(ctx);
    const state = await this.inVenue(ctx, async (trx) => {
      const me = await requireMembership(trx, ctx.deviceHash);
      if (me.status !== 'approved') throw approvalRequired();
      const order = await trx
        .selectFrom('ordering.orders')
        .select(['id', 'order_number', 'status', 'dispute_status'])
        .where('id', '=', orderId)
        .where('session_id', '=', me.sessionId)
        .forUpdate()
        .executeTakeFirst();
      if (!order) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Order not found');
      if (['cancelled', 'rejected', 'withdrawn'].includes(order.status)) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, 'Order is no longer active');
      }
      if (order.dispute_status === null) {
        await trx
          .updateTable('ordering.orders')
          .set({
            dispute_status: 'open',
            disputed_by_guest_id: me.guestId,
            disputed_at: new Date(),
          })
          .where('id', '=', orderId)
          .execute();
        await publish(trx, {
          type: 'order.disputed',
          venueId: ctx.venue.venueId,
          sessionId: me.sessionId,
          tableId: me.tableId,
          tableLabel: me.tableLabel,
          entityId: orderId,
          orderNumber: order.order_number,
          ...guestActor(me.guestId, me.nickname, me.tableLabel),
        });
      }
      return loadSessionState(trx, me.sessionId, me.guestId, settings.verificationMode);
    });
    this.realtime.sessionChanged(ctx.venue.venueId, state.session.id, 'order.disputed');
    return state;
  }

  /** "Pozovi konobara" (FR-GOS-14) and "Zatraži račun" (FR-GOS-15). */
  async request(ctx: GuestContext, body: ServiceRequestBody): Promise<GuestSessionState> {
    const settings = await this.sessions.settings(ctx);
    const state = await this.inVenue(ctx, async (trx) => {
      const me = await requireMembership(trx, ctx.deviceHash);
      // One request at a time per table, so the cooldown holds under double taps.
      await trx
        .selectFrom('ordering.table_sessions')
        .select('id')
        .where('id', '=', me.sessionId)
        .forUpdate()
        .execute();

      if (body.type === 'call_waiter') {
        const last = await trx
          .selectFrom('ordering.service_requests')
          .select('created_at')
          .where('session_id', '=', me.sessionId)
          .where('type', '=', 'call_waiter')
          .orderBy('created_at', 'desc')
          .limit(1)
          .executeTakeFirst();
        const availableAt = last
          ? new Date(last.created_at.getTime() + CALL_WAITER_COOLDOWN_SECONDS * 1000)
          : null;
        if (availableAt && availableAt > new Date()) {
          throw fail(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.cooldown, 'Waiter already called', {
            availableAt: availableAt.toISOString(),
          });
        }
        await this.insertRequest(trx, ctx, me, 'call_waiter', null);
      } else {
        if (me.status !== 'approved') throw approvalRequired();
        if (!settings.paymentMethods.some((m) => m.method === body.paymentMethod)) {
          throw fail(
            HttpStatus.UNPROCESSABLE_ENTITY,
            ErrorCode.paymentMethodUnavailable,
            'The venue does not take this payment method',
          );
        }
        const open = await trx
          .selectFrom('ordering.service_requests')
          .select('id')
          .where('session_id', '=', me.sessionId)
          .where('type', '=', 'request_bill')
          .where('status', 'in', ['open', 'acknowledged'])
          .executeTakeFirst();
        if (open) {
          await trx
            .updateTable('ordering.service_requests')
            .set({ requested_payment_method: body.paymentMethod })
            .where('id', '=', open.id)
            .execute();
        } else {
          await this.insertRequest(trx, ctx, me, 'request_bill', body.paymentMethod);
        }
        await trx
          .updateTable('ordering.table_sessions')
          .set({
            status: 'bill_requested',
            bill_requested_at: new Date(),
            requested_payment_method: body.paymentMethod,
          })
          .where('id', '=', me.sessionId)
          .execute();
        await publish(trx, {
          type: 'session.bill_requested',
          venueId: ctx.venue.venueId,
          sessionId: me.sessionId,
          tableId: me.tableId,
          tableLabel: me.tableLabel,
          entityId: me.sessionId,
          details: { paymentMethod: body.paymentMethod },
          ...guestActor(me.guestId, me.nickname, me.tableLabel),
        });
      }
      return loadSessionState(trx, me.sessionId, me.guestId, settings.verificationMode);
    });
    this.realtime.sessionChanged(ctx.venue.venueId, state.session.id, body.type);
    return state;
  }

  private async insertRequest(
    trx: Tx,
    ctx: GuestContext,
    me: Membership,
    type: 'call_waiter' | 'request_bill',
    paymentMethod: 'cash' | 'card' | null,
  ): Promise<void> {
    const request = await trx
      .insertInto('ordering.service_requests')
      .values({
        venue_id: ctx.venue.venueId,
        session_id: me.sessionId,
        table_id: me.tableId,
        guest_id: me.guestId,
        type,
        requested_payment_method: paymentMethod,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    if (type === 'call_waiter') {
      await publish(trx, {
        type: 'service.requested',
        venueId: ctx.venue.venueId,
        sessionId: me.sessionId,
        tableId: me.tableId,
        tableLabel: me.tableLabel,
        entityId: request.id,
        details: { request: type },
        ...guestActor(me.guestId, me.nickname, me.tableLabel),
      });
    }
  }

  /** Only the device that ordered (or the host) changes a returned order. */
  private async onOwnReturnedOrder(
    ctx: GuestContext,
    settings: OrderingSettings,
    orderId: string,
    eventType: 'order.resubmitted' | 'order.withdrawn',
    fn: (trx: Tx, me: Membership) => Promise<{ total?: string; me: Membership }>,
  ): Promise<GuestSessionState> {
    const state = await this.inVenue(ctx, async (trx) => {
      const me = await requireMembership(trx, ctx.deviceHash);
      if (me.status !== 'approved') throw approvalRequired();
      const order = await trx
        .selectFrom('ordering.orders')
        .select(['id', 'order_number', 'status', 'guest_id'])
        .where('id', '=', orderId)
        .where('session_id', '=', me.sessionId)
        .forUpdate()
        .executeTakeFirst();
      if (!order) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Order not found');
      if (order.guest_id !== me.guestId && me.hostGuestId !== me.guestId) {
        throw fail(HttpStatus.FORBIDDEN, ErrorCode.forbidden, 'Not your order');
      }
      if (order.status !== 'returned') {
        throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, 'Order is not waiting for changes');
      }
      const { total } = await fn(trx, me);
      await publish(trx, {
        type: eventType,
        venueId: ctx.venue.venueId,
        sessionId: me.sessionId,
        tableId: me.tableId,
        tableLabel: me.tableLabel,
        entityId: orderId,
        orderNumber: order.order_number,
        ...(total ? { total } : {}),
        ...guestActor(me.guestId, me.nickname, me.tableLabel),
      });
      return loadSessionState(trx, me.sessionId, me.guestId, settings.verificationMode);
    });
    this.realtime.sessionChanged(ctx.venue.venueId, state.session.id, eventType);
    return state;
  }

  /** The device may order: approved, session open, PIN entered in PIN mode (FR-GOS-21, 22). */
  private async orderingMember(
    trx: Tx,
    ctx: GuestContext,
    settings: OrderingSettings,
  ): Promise<Membership> {
    const me = await requireMembership(trx, ctx.deviceHash);
    if (me.status !== 'approved') throw approvalRequired();
    if (me.sessionStatus !== 'open' && me.sessionStatus !== 'bill_requested') {
      throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, 'The table session is closed');
    }
    if (settings.verificationMode === 'pin' && !me.verified) {
      throw fail(
        HttpStatus.FORBIDDEN,
        ErrorCode.verificationRequired,
        'Enter the code from the waiter first',
      );
    }
    return me;
  }

  /** FR-GOS-27. The session row lock serialises orders of one table. */
  private async assertLimits(trx: Tx, me: Membership): Promise<void> {
    await trx
      .selectFrom('ordering.table_sessions')
      .select('id')
      .where('id', '=', me.sessionId)
      .forUpdate()
      .execute();
    const { pending } = await trx
      .selectFrom('ordering.orders')
      .select((eb) => eb.fn.countAll<string>().as('pending'))
      .where('guest_id', '=', me.guestId)
      .where('status', 'in', ['new', 'returned'])
      .executeTakeFirstOrThrow();
    if (Number(pending) >= MAX_PENDING_PER_DEVICE) {
      throw fail(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.tooManyPending,
        'Wait until the waiter confirms your orders',
      );
    }
    const { recent } = await trx
      .selectFrom('ordering.orders')
      .select((eb) => eb.fn.countAll<string>().as('recent'))
      .where('session_id', '=', me.sessionId)
      .where('created_at', '>', new Date(Date.now() - 60_000))
      .executeTakeFirstOrThrow();
    if (Number(recent) >= MAX_ORDERS_PER_MINUTE) {
      throw fail(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.rateLimited, 'Too many orders', {
        retryAfter: 60,
      });
    }
  }

  private assertOpen(settings: OrderingSettings): void {
    const reason = closedReason(settings);
    if (reason) {
      throw fail(HttpStatus.CONFLICT, ErrorCode.orderingClosed, 'The venue is not taking orders', {
        reason,
      });
    }
  }

  private async price(ctx: GuestContext, items: PlaceOrderInput['items']): Promise<PricedLine[]> {
    const quote = await this.menu.quote(ctx.venue.venueId, items);
    if (!quote.ok) {
      throw fail(
        HttpStatus.UNPROCESSABLE_ENTITY,
        quote.code === 'item_unavailable' ? ErrorCode.itemUnavailable : ErrorCode.invalidModifiers,
        quote.code === 'item_unavailable' ? 'Item is not available' : 'Invalid item options',
        { itemId: quote.itemId },
      );
    }
    return quote.lines;
  }

  /** The order with this idempotency key, if it exists and belongs to this device. */
  private async byKey(trx: Tx, ctx: GuestContext, key: string): Promise<SessionOrder | null> {
    const order = await trx
      .selectFrom('ordering.orders as o')
      .innerJoin('ordering.session_guests as g', 'g.id', 'o.guest_id')
      .select(['o.id', 'o.session_id', 'g.device_hash'])
      .where('o.idempotency_key', '=', key)
      .executeTakeFirst();
    if (!order) return null;
    if (order.device_hash !== ctx.deviceHash) {
      throw fail(HttpStatus.CONFLICT, ErrorCode.idempotencyConflict, 'Key already used');
    }
    const [view] = await loadOrders(trx, order.session_id, [order.id]);
    return guestOrder(view!);
  }

  private inVenue<T>(ctx: GuestContext, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId: ctx.venue.venueId, isSuperAdmin: false }, fn);
  }
}

const approvalRequired = () =>
  fail(
    HttpStatus.FORBIDDEN,
    ErrorCode.approvalRequired,
    'The host or the waiter has to approve this device first',
  );
