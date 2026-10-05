import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type BillingEvent,
  type PayItemsRequest,
  type PaymentResult,
  type SessionPayments,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { ApiException } from '../../common/errors.js';
import { VenueDirectory } from '../core/index.js';
import { SessionLedger } from '../ordering/index.js';
import { BillingDatabase } from './billing.database.js';

const fail = (status: HttpStatus, code: ErrorCode, message: string) =>
  new ApiException(status, code, message);

const cents = (value: string) => Math.round(Number(value) * 100);
const fromCents = (value: number) => (value / 100).toFixed(2);
/** VAT inside a gross amount at a percentage rate. */
const vatCents = (grossCents: number, rate: string) =>
  Math.round((grossCents * Number(rate)) / (100 + Number(rate)));

/**
 * Paying a whole table (FR-KON-19) and closing it (FR-KON-21). Payment and session live in
 * different schemas, so the steps are: payment "pending" → ordering closes the table after
 * checking the bill again → payment "completed". If closing fails the payment is marked
 * "failed", so the record always says what happened.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly db: BillingDatabase,
    private readonly venues: VenueDirectory,
    private readonly ledger: SessionLedger,
  ) {}

  /**
   * Pays what is left of the table (all of it without partial payments) and closes it.
   */
  async pay(
    staff: StaffClaims,
    sessionId: string,
    method: 'cash' | 'card',
  ): Promise<PaymentResult> {
    await this.assertMethod(staff, method);
    const bill = await this.ledger.summary(staff.venueId, sessionId);
    if (bill.blockingOrders > 0) {
      throw fail(HttpStatus.CONFLICT, ErrorCode.openOrders, 'Settle open orders first');
    }
    if (bill.remaining === '0.00') {
      throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, 'Nothing to pay; close the table');
    }
    // VAT of the remainder: the whole bill's VAT minus what partial payments carried.
    const vatPaid = await this.vatPaid(staff, sessionId);
    return this.payAndClose(staff, sessionId, method, bill, {
      amount: bill.remaining,
      vat: fromCents(Math.max(0, cents(bill.vatAmount) - vatPaid)),
      items: [],
    });
  }

  /**
   * One guest pays some items (FR-KON-20). The table stays open, unless these were the last
   * unpaid items: then this is the final payment and the table closes.
   */
  async payItems(
    staff: StaffClaims,
    sessionId: string,
    input: PayItemsRequest,
  ): Promise<PaymentResult> {
    await this.assertMethod(staff, input.method);
    const bill = await this.ledger.summary(staff.venueId, sessionId);
    const paidQty = await this.paidQuantities(staff, sessionId);
    const byId = new Map(bill.items.map((i) => [i.orderItemId, i]));

    let amount = 0;
    let vat = 0;
    const lines: { orderItemId: string; quantity: number; amount: number }[] = [];
    for (const wanted of input.items) {
      const item = byId.get(wanted.orderItemId);
      const left = item ? item.quantity - (paidQty.get(item.orderItemId) ?? 0) : 0;
      if (!item || wanted.quantity > left) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.billChanged, 'The bill changed; check it again');
      }
      // A share of the line, by quantity; the last share gets the rounding remainder.
      const lineCents = cents(item.lineTotal);
      const share =
        wanted.quantity === left
          ? lineCents - Math.round((lineCents * (item.quantity - left)) / item.quantity)
          : Math.round((lineCents * wanted.quantity) / item.quantity);
      amount += share;
      vat += vatCents(share, item.vatRate);
      lines.push({ orderItemId: item.orderItemId, quantity: wanted.quantity, amount: share });
    }

    const everythingPaid = bill.items.every((i) => {
      const now = lines.find((l) => l.orderItemId === i.orderItemId)?.quantity ?? 0;
      return (paidQty.get(i.orderItemId) ?? 0) + now >= i.quantity;
    });
    if (everythingPaid) {
      if (bill.blockingOrders > 0) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.openOrders, 'Settle open orders first');
      }
      // The last guest pays exactly the remainder (no cent lost to rounding) and the table closes.
      const vatPaid = await this.vatPaid(staff, sessionId);
      return this.payAndClose(staff, sessionId, input.method, bill, {
        amount: bill.remaining,
        vat: fromCents(Math.max(0, cents(bill.vatAmount) - vatPaid)),
        items: lines,
      });
    }

    const payment = await this.insertPayment(staff, sessionId, input.method, {
      amount: fromCents(amount),
      vat: fromCents(vat),
      items: lines,
    });
    try {
      await this.ledger.recordPartialPayment(staff, sessionId, {
        id: payment.id,
        amount: payment.amount,
        method: input.method,
      });
    } catch (error) {
      await this.finish(
        staff,
        payment.id,
        sessionId,
        bill.tableLabel,
        input.method,
        payment.amount,
        'failed',
      );
      throw error;
    }
    await this.finish(
      staff,
      payment.id,
      sessionId,
      bill.tableLabel,
      input.method,
      payment.amount,
      'completed',
    );
    return {
      id: payment.id,
      amount: payment.amount,
      vatAmount: payment.vat_amount,
      method: payment.method,
    };
  }

  /** What partial payments covered so far, item by item (for the payment dialog). */
  async payments(staff: StaffClaims, sessionId: string): Promise<SessionPayments> {
    return this.inVenue(staff, async (trx) => {
      const payments = await trx
        .selectFrom('billing.payments')
        .select(['id', 'method', 'amount', 'created_at', 'processed_by_member_id'])
        .where('session_id', '=', sessionId)
        .where('status', '=', 'completed')
        .orderBy('created_at')
        .execute();
      const items = payments.length
        ? await trx
            .selectFrom('billing.payment_items')
            .select(['payment_id', 'order_item_id', 'quantity'])
            .where(
              'payment_id',
              'in',
              payments.map((p) => p.id),
            )
            .execute()
        : [];
      const names = await this.venues.memberNames(staff.venueId, [
        ...new Set(payments.map((p) => p.processed_by_member_id).filter((id) => id !== null)),
      ]);
      const paidQuantities: Record<string, number> = {};
      for (const i of items)
        paidQuantities[i.order_item_id] = (paidQuantities[i.order_item_id] ?? 0) + i.quantity;
      return {
        payments: payments.map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
          createdAt: p.created_at.toISOString(),
          memberName: p.processed_by_member_id
            ? (names.get(p.processed_by_member_id) ?? null)
            : null,
          items: items
            .filter((i) => i.payment_id === p.id)
            .map((i) => ({ orderItemId: i.order_item_id, quantity: i.quantity })),
        })),
        paidQuantities,
        paid: fromCents(payments.reduce((sum, p) => sum + cents(p.amount), 0)),
      };
    });
  }

  private async payAndClose(
    staff: StaffClaims,
    sessionId: string,
    method: 'cash' | 'card',
    bill: { tableLabel: string },
    charge: {
      amount: string;
      vat: string;
      items: { orderItemId: string; quantity: number; amount: number }[];
    },
  ): Promise<PaymentResult> {
    const methodsByItem = await this.methodsByItem(staff, sessionId);
    const payment = await this.insertPayment(staff, sessionId, method, charge);
    try {
      await this.ledger.closeAfterPayment(
        staff,
        sessionId,
        { id: payment.id, amount: payment.amount, method },
        methodsByItem,
      );
    } catch (error) {
      await this.finish(
        staff,
        payment.id,
        sessionId,
        bill.tableLabel,
        method,
        payment.amount,
        'failed',
      );
      throw error;
    }
    await this.finish(
      staff,
      payment.id,
      sessionId,
      bill.tableLabel,
      method,
      payment.amount,
      'completed',
    );
    return {
      id: payment.id,
      amount: payment.amount,
      vatAmount: payment.vat_amount,
      method: payment.method,
    };
  }

  private async assertMethod(staff: StaffClaims, method: 'cash' | 'card'): Promise<void> {
    const settings = await this.venues.orderingSettings(staff.venueId);
    if (!settings?.paymentMethods.some((m) => m.method === method)) {
      throw fail(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.paymentMethodUnavailable,
        'The venue does not take this payment method',
      );
    }
  }

  private insertPayment(
    staff: StaffClaims,
    sessionId: string,
    method: 'cash' | 'card',
    charge: {
      amount: string;
      vat: string;
      items: { orderItemId: string; quantity: number; amount: number }[];
    },
  ) {
    return this.inVenue(staff, async (trx) => {
      const payment = await trx
        .insertInto('billing.payments')
        .values({
          venue_id: staff.venueId,
          session_id: sessionId,
          method,
          amount: charge.amount,
          vat_amount: charge.vat,
          currency: 'BAM',
          processed_by_member_id: staff.memberId,
        })
        .returning(['id', 'amount', 'vat_amount', 'method'])
        .executeTakeFirstOrThrow();
      if (charge.items.length) {
        await trx
          .insertInto('billing.payment_items')
          .values(
            charge.items.map((i) => ({
              venue_id: staff.venueId,
              payment_id: payment.id,
              order_item_id: i.orderItemId,
              quantity: i.quantity,
              amount: fromCents(i.amount),
            })),
          )
          .execute();
      }
      return payment;
    });
  }

  /** Paid quantity per order item, from completed payments of this table. */
  private async paidQuantities(
    staff: StaffClaims,
    sessionId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.inVenue(staff, (trx) =>
      trx
        .selectFrom('billing.payment_items as pi')
        .innerJoin('billing.payments as p', 'p.id', 'pi.payment_id')
        .select(['pi.order_item_id', 'pi.quantity'])
        .where('p.session_id', '=', sessionId)
        .where('p.status', '=', 'completed')
        .execute(),
    );
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.order_item_id, (map.get(r.order_item_id) ?? 0) + r.quantity);
    return map;
  }

  /** VAT carried by completed partial payments of this table, in cents. */
  private async vatPaid(staff: StaffClaims, sessionId: string): Promise<number> {
    const rows = await this.inVenue(staff, (trx) =>
      trx
        .selectFrom('billing.payments')
        .select('vat_amount')
        .where('session_id', '=', sessionId)
        .where('status', '=', 'completed')
        .execute(),
    );
    return rows.reduce((sum, r) => sum + cents(r.vat_amount), 0);
  }

  /** For reports: the method that paid most of each partially paid item. */
  private async methodsByItem(staff: StaffClaims, sessionId: string): Promise<Map<string, string>> {
    const rows = await this.inVenue(staff, (trx) =>
      trx
        .selectFrom('billing.payment_items as pi')
        .innerJoin('billing.payments as p', 'p.id', 'pi.payment_id')
        .select(['pi.order_item_id', 'pi.quantity', 'p.method'])
        .where('p.session_id', '=', sessionId)
        .where('p.status', '=', 'completed')
        .execute(),
    );
    const best = new Map<string, { method: string; quantity: number }>();
    for (const r of rows) {
      const seen = best.get(r.order_item_id);
      if (!seen || r.quantity > seen.quantity)
        best.set(r.order_item_id, { method: r.method, quantity: r.quantity });
    }
    return new Map([...best].map(([id, v]) => [id, v.method]));
  }

  private async finish(
    staff: StaffClaims,
    paymentId: string,
    sessionId: string,
    tableLabel: string,
    method: 'cash' | 'card',
    amount: string,
    status: 'completed' | 'failed',
  ): Promise<void> {
    await this.inVenue(staff, async (trx) => {
      await trx
        .updateTable('billing.payments')
        .set({ status, ...(status === 'completed' ? { completed_at: new Date() } : {}) })
        .where('id', '=', paymentId)
        .execute();
      const event: BillingEvent = {
        type: status === 'completed' ? 'payment.completed' : 'payment.failed',
        venueId: staff.venueId,
        sessionId,
        tableLabel,
        entityId: paymentId,
        method,
        amount,
        actor: { id: staff.memberId, label: staff.name },
      };
      await trx
        .insertInto('billing.outbox')
        .values({
          venue_id: staff.venueId,
          event_type: event.type,
          aggregate_id: paymentId,
          payload: JSON.stringify(event),
        })
        .execute();
    });
  }

  private inVenue<T>(staff: StaffClaims, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, fn);
  }
}
