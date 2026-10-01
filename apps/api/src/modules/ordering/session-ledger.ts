import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@qafe/contracts';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { fail } from './guest-session.service.js';
import { OrderingDatabase } from './ordering.database.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { blockingOrders, buildBill, loadOrders } from './session-view.js';
import { activeSession, closeSession } from './staff-sessions.service.js';

export interface SessionBillSummary {
  tableLabel: string;
  total: string;
  vatAmount: string;
  /** Orders not accepted yet or with an open dispute: they block payment. */
  blockingOrders: number;
}

/** What billing may ask of ordering (public interface): a table's bill, and closing it. */
@Injectable()
export class SessionLedger {
  constructor(
    private readonly db: OrderingDatabase,
    private readonly realtime: RealtimeGateway,
  ) {}

  async summary(venueId: string, sessionId: string): Promise<SessionBillSummary> {
    return this.db.withTenant({ venueId, isSuperAdmin: false }, async (trx) => {
      const session = await trx
        .selectFrom('ordering.table_sessions')
        .select('table_label')
        .where('id', '=', sessionId)
        .where('status', 'in', ['open', 'bill_requested'])
        .executeTakeFirst();
      if (!session) throw fail(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Session not found');
      const orders = await loadOrders(trx, sessionId);
      const bill = buildBill(orders);
      return {
        tableLabel: session.table_label,
        total: bill.total,
        vatAmount: bill.vatAmount,
        blockingOrders: blockingOrders(orders),
      };
    });
  }

  /**
   * Closes the table after its payment (FR-KON-21). The bill is checked again under the
   * session lock: if a guest ordered in the meantime, nothing closes (bill_changed).
   */
  async closeAfterPayment(
    staff: StaffClaims,
    sessionId: string,
    payment: { id: string; amount: string; method: string },
  ): Promise<void> {
    await this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, async (trx) => {
      const session = await activeSession(trx, sessionId);
      const orders = await loadOrders(trx, sessionId);
      if (blockingOrders(orders) > 0) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.openOrders, 'Settle open orders first');
      }
      if (buildBill(orders).total !== payment.amount) {
        throw fail(HttpStatus.CONFLICT, ErrorCode.billChanged, 'The bill changed; check it again');
      }
      await closeSession(trx, staff, session, payment);
    });
    this.realtime.sessionChanged(staff.venueId, sessionId, 'session.closed');
  }
}
