import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type BillingEvent, type PaymentResult } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { ApiException } from '../../common/errors.js';
import { VenueDirectory } from '../core/index.js';
import { SessionLedger } from '../ordering/index.js';
import { BillingDatabase } from './billing.database.js';

const fail = (status: HttpStatus, code: ErrorCode, message: string) =>
  new ApiException(status, code, message);

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

  async pay(
    staff: StaffClaims,
    sessionId: string,
    method: 'cash' | 'card',
  ): Promise<PaymentResult> {
    const settings = await this.venues.orderingSettings(staff.venueId);
    if (!settings?.paymentMethods.some((m) => m.method === method)) {
      throw fail(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.paymentMethodUnavailable,
        'The venue does not take this payment method',
      );
    }
    const bill = await this.ledger.summary(staff.venueId, sessionId);
    if (bill.blockingOrders > 0) {
      throw fail(HttpStatus.CONFLICT, ErrorCode.openOrders, 'Settle open orders first');
    }
    if (bill.total === '0.00') {
      throw fail(HttpStatus.CONFLICT, ErrorCode.invalidState, 'Nothing to pay; close the table');
    }

    const payment = await this.inVenue(staff, (trx) =>
      trx
        .insertInto('billing.payments')
        .values({
          venue_id: staff.venueId,
          session_id: sessionId,
          method,
          amount: bill.total,
          vat_amount: bill.vatAmount,
          currency: 'BAM',
          processed_by_member_id: staff.memberId,
        })
        .returning(['id', 'amount', 'vat_amount', 'method'])
        .executeTakeFirstOrThrow(),
    );

    try {
      await this.ledger.closeAfterPayment(staff, sessionId, {
        id: payment.id,
        amount: payment.amount,
        method,
      });
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
