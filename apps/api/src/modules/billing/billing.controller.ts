import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  PayItemsRequest,
  PayRequest,
  type PaymentResult,
  type SessionPayments,
} from '@qafe/contracts';
import {
  CurrentStaff,
  RequirePermission,
  StaffGuard,
  type StaffClaims,
} from '../../common/auth/auth.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { BillingService } from './billing.service.js';

@Controller('staff')
@UseGuards(StaffGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Pays the whole table and closes it (FR-KON-19, FR-KON-21). */
  @Post('sessions/:id/pay')
  @RequirePermission('payments.process')
  pay(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(PayRequest)) body: PayRequest,
  ): Promise<PaymentResult> {
    return this.billing.pay(staff, id, body.method);
  }

  /** One guest pays some items; the table stays open until all is paid (FR-KON-20). */
  @Post('sessions/:id/pay-items')
  @RequirePermission('payments.process')
  payItems(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(PayItemsRequest)) body: PayItemsRequest,
  ): Promise<PaymentResult> {
    return this.billing.payItems(staff, id, body);
  }

  /** What partial payments covered so far, item by item. */
  @Get('sessions/:id/payments')
  @RequirePermission('orders.view')
  payments(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SessionPayments> {
    return this.billing.payments(staff, id);
  }
}
