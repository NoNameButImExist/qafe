import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { PayRequest, type PaymentResult } from '@qafe/contracts';
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
}
