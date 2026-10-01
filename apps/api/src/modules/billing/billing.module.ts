import { Module } from '@nestjs/common';
import { CoreModule } from '../core/index.js';
import { OrderingModule } from '../ordering/index.js';
import { BillingController } from './billing.controller.js';
import { BillingDatabase } from './billing.database.js';
import { BillingService } from './billing.service.js';

/** Payments (schema "billing"). Fiscalisation (V3) and partial payments (V2) come later. */
@Module({
  imports: [CoreModule, OrderingModule],
  controllers: [BillingController],
  providers: [BillingDatabase, BillingService],
})
export class BillingModule {}
