import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AddItemsRequest,
  ManualOrderRequest,
  PushSubscriptionRequest,
  PushUnsubscribeRequest,
  ReasonRequest,
  RejectRequest,
  RemoveGuestRequest,
  RemoveItemRequest,
  ReplaceItemRequest,
  ResolveDisputeRequest,
  StaffMessageRequest,
  type AddItemsInput,
  type Floor,
  type PlaceOrderInput,
  type PushConfig,
  type RemoveGuestInput,
  type ReplaceItemInput,
  type StaffOrder,
  type StaffOrderList,
  type StaffSessionDetail,
} from '@qafe/contracts';
import {
  CurrentStaff,
  RequirePermission,
  StaffGuard,
  type StaffClaims,
} from '../../common/auth/auth.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { PushService } from './push.service.js';
import { StaffOrdersService } from './staff-orders.service.js';
import { StaffSessionsService } from './staff-sessions.service.js';

const uuid = new ParseUUIDPipe();

/** The waiter app's API (FR-KON-04..18, FR-GOS-21, 22, 25). Tenant = the token's venue. */
@Controller('staff')
@UseGuards(StaffGuard)
export class StaffController {
  constructor(
    private readonly sessions: StaffSessionsService,
    private readonly orders: StaffOrdersService,
    private readonly push: PushService,
  ) {}

  // ---------- Tables and sessions ----------

  @Get('floor')
  @RequirePermission('orders.view')
  floor(@CurrentStaff() staff: StaffClaims): Promise<Floor> {
    return this.sessions.floor(staff);
  }

  @Get('sessions/:id')
  @RequirePermission('orders.view')
  session(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
  ): Promise<StaffSessionDetail> {
    return this.sessions.detail(staff, id);
  }

  @Post('sessions/:id/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sessions.verify')
  verify(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<void> {
    return this.sessions.verify(staff, id);
  }

  @Post('sessions/:id/guests/:guestId/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sessions.verify')
  approve(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Param('guestId', uuid) guestId: string,
  ): Promise<void> {
    return this.sessions.approveGuest(staff, id, guestId);
  }

  @Post('sessions/:id/guests/:guestId/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sessions.remove')
  removeGuest(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Param('guestId', uuid) guestId: string,
    @Body(new ZodPipe(RemoveGuestRequest)) body: RemoveGuestInput,
  ): Promise<void> {
    return this.sessions.removeGuest(staff, id, guestId, body);
  }

  /** Closes a table with nothing to pay; tables with a bill close through payment. */
  @Post('sessions/:id/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sessions.close')
  close(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<void> {
    return this.sessions.closeEmpty(staff, id);
  }

  @Post('requests/:id/acknowledge')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.view')
  acknowledge(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<void> {
    return this.sessions.handleRequest(staff, id, 'acknowledge');
  }

  @Post('requests/:id/done')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.view')
  done(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<void> {
    return this.sessions.handleRequest(staff, id, 'done');
  }

  // ---------- Orders ----------

  @Get('orders')
  @RequirePermission('orders.view')
  list(@CurrentStaff() staff: StaffClaims): Promise<StaffOrderList> {
    return this.orders.list(staff);
  }

  @Post('tables/:tableId/orders')
  @RequirePermission('orders.create')
  manual(
    @CurrentStaff() staff: StaffClaims,
    @Param('tableId', uuid) tableId: string,
    @Body(new ZodPipe(ManualOrderRequest)) body: PlaceOrderInput,
  ): Promise<StaffOrder> {
    return this.orders.manual(staff, tableId, body);
  }

  @Post('orders/:id/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.update')
  accept(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<void> {
    return this.orders.accept(staff, id);
  }

  @Post('orders/:id/serve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.update')
  serve(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<void> {
    return this.orders.serve(staff, id);
  }

  @Post('orders/:id/return')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.return')
  returnToGuest(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(StaffMessageRequest)) body: StaffMessageRequest,
  ): Promise<void> {
    return this.orders.returnToGuest(staff, id, body.message);
  }

  @Post('orders/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.reject')
  reject(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(RejectRequest)) body: RejectRequest,
  ): Promise<void> {
    return this.orders.reject(staff, id, body.reason);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.cancel')
  cancel(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(ReasonRequest)) body: { reason?: string },
  ): Promise<void> {
    return this.orders.cancel(staff, id, body.reason);
  }

  @Post('orders/:id/items')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.add_items')
  addItems(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(AddItemsRequest)) body: AddItemsInput,
  ): Promise<void> {
    return this.orders.addItems(staff, id, body);
  }

  @Post('orders/:id/items/:itemId/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.update')
  removeItem(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Param('itemId', uuid) itemId: string,
    @Body(new ZodPipe(RemoveItemRequest)) body: { message?: string },
  ): Promise<void> {
    return this.orders.removeItem(staff, id, itemId, body.message);
  }

  @Post('orders/:id/items/:itemId/replace')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.update')
  replaceItem(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Param('itemId', uuid) itemId: string,
    @Body(new ZodPipe(ReplaceItemRequest)) body: ReplaceItemInput,
  ): Promise<void> {
    return this.orders.replaceItem(staff, id, itemId, body);
  }

  /** Cancelling an item already in work needs orders.cancel (FR-KON-13). */
  @Post('orders/:id/items/:itemId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.cancel')
  cancelItem(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Param('itemId', uuid) itemId: string,
    @Body(new ZodPipe(ReasonRequest)) body: { reason?: string },
  ): Promise<void> {
    return this.orders.removeItem(staff, id, itemId, body.reason, 'cancelled');
  }

  @Post('orders/:id/dispute')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('orders.disputes')
  resolveDispute(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(ResolveDisputeRequest)) body: ResolveDisputeRequest,
  ): Promise<void> {
    return this.orders.resolveDispute(staff, id, body.action);
  }

  // ---------- Web Push ----------

  @Get('push')
  pushSettings(): PushConfig {
    return this.push.settings();
  }

  @Post('push/subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  subscribe(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(PushSubscriptionRequest)) body: PushSubscriptionRequest,
  ): Promise<void> {
    return this.push.subscribe(staff, body);
  }

  @Delete('push/subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsubscribe(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(PushUnsubscribeRequest)) body: PushUnsubscribeRequest,
  ): Promise<void> {
    return this.push.unsubscribe(staff, body.endpoint);
  }
}
