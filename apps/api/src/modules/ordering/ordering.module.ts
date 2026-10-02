import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/index.js';
import { CoreModule } from '../core/index.js';
import { KdsService } from './kds.service.js';
import { GuestOrdersService } from './guest-orders.service.js';
import { GuestSessionService } from './guest-session.service.js';
import { GuestController } from './guest.controller.js';
import { GuestGuard } from './guest.guard.js';
import { OrderingDatabase } from './ordering.database.js';
import { PushService } from './push.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { SessionLedger } from './session-ledger.js';
import { StaffOrdersService } from './staff-orders.service.js';
import { StaffSessionsService } from './staff-sessions.service.js';
import { StaffController } from './staff.controller.js';

/** Table sessions, orders and service requests (schema "ordering"). */
@Module({
  imports: [CoreModule, CatalogModule],
  controllers: [GuestController, StaffController],
  providers: [
    OrderingDatabase,
    GuestGuard,
    RealtimeGateway,
    GuestSessionService,
    GuestOrdersService,
    StaffSessionsService,
    StaffOrdersService,
    PushService,
    KdsService,
    SessionLedger,
  ],
  exports: [SessionLedger],
})
export class OrderingModule {}
