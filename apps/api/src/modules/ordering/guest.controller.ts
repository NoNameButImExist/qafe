import { Public } from '../../common/auth/auth.guard.js';
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
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  GuestRefRequest,
  JoinTableRequest,
  PlaceOrderRequest,
  RenameRequest,
  ResubmitOrderRequest,
  ServiceRequestBody,
  VerifySessionRequest,
  type GuestMenu,
  type GuestSessionState,
  type GuestVenue,
  type PlacedOrder,
  type PlaceOrderInput,
  type ResubmitOrderInput,
} from '@qafe/contracts';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { GuestMenuService } from '../catalog/index.js';
import { GuestOrdersService } from './guest-orders.service.js';
import { GuestSessionService } from './guest-session.service.js';
import { CurrentGuest, GuestGuard, type GuestContext } from './guest.guard.js';

const uuid = new ParseUUIDPipe();
/** QR tokens are random base64url strings (at least 128 bits, NFR-10). */
const QrToken = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** Guest API on <slug>.<domain>/api/guest/* (FR-GOS). No login: the device cookie is the identity. */
// Public: guests have no account; GuestGuard identifies the venue and the device.
@Public()
@Controller('guest')
@UseGuards(GuestGuard)
export class GuestController {
  constructor(
    private readonly sessions: GuestSessionService,
    private readonly orders: GuestOrdersService,
    private readonly menu: GuestMenuService,
  ) {}

  @Get('venue')
  venue(@CurrentGuest() guest: GuestContext): Promise<GuestVenue> {
    return this.sessions.venue(guest);
  }

  @Get('menu')
  getMenu(@CurrentGuest() guest: GuestContext): Promise<GuestMenu> {
    return this.menu.menu(guest.venue.venueId);
  }

  @Post('tables/:token/join')
  @HttpCode(HttpStatus.OK)
  join(
    @CurrentGuest() guest: GuestContext,
    @Param('token', new ZodPipe(QrToken)) token: string,
    @Body(new ZodPipe(JoinTableRequest)) body: JoinTableRequest,
  ): Promise<GuestSessionState> {
    return this.sessions.join(guest, token, body);
  }

  @Get('session')
  session(@CurrentGuest() guest: GuestContext): Promise<GuestSessionState> {
    return this.sessions.state(guest);
  }

  @Delete('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@CurrentGuest() guest: GuestContext): Promise<void> {
    return this.sessions.leave(guest);
  }

  @Post('session/verify')
  @HttpCode(HttpStatus.OK)
  verify(
    @CurrentGuest() guest: GuestContext,
    @Body(new ZodPipe(VerifySessionRequest)) body: VerifySessionRequest,
  ): Promise<GuestSessionState> {
    return this.sessions.verify(guest, body.code);
  }

  @Put('session/nickname')
  rename(
    @CurrentGuest() guest: GuestContext,
    @Body(new ZodPipe(RenameRequest)) body: RenameRequest,
  ): Promise<GuestSessionState> {
    return this.sessions.rename(guest, body.nickname);
  }

  @Post('session/guests/:id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentGuest() guest: GuestContext,
    @Param('id', uuid) id: string,
  ): Promise<GuestSessionState> {
    return this.sessions.approve(guest, id);
  }

  @Post('session/guests/:id/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentGuest() guest: GuestContext,
    @Param('id', uuid) id: string,
  ): Promise<GuestSessionState> {
    return this.sessions.decline(guest, id);
  }

  @Post('session/host')
  @HttpCode(HttpStatus.OK)
  transferHost(
    @CurrentGuest() guest: GuestContext,
    @Body(new ZodPipe(GuestRefRequest)) body: GuestRefRequest,
  ): Promise<GuestSessionState> {
    return this.sessions.transferHost(guest, body.guestId);
  }

  /** 201 for a new order, 200 for a retry with the same idempotency key (NFR-06). */
  @Post('orders')
  async place(
    @CurrentGuest() guest: GuestContext,
    @Body(new ZodPipe(PlaceOrderRequest)) body: PlaceOrderInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PlacedOrder> {
    const result = await this.orders.place(guest, body);
    void reply.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return { order: result.order };
  }

  @Put('orders/:id')
  resubmit(
    @CurrentGuest() guest: GuestContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(ResubmitOrderRequest)) body: ResubmitOrderInput,
  ): Promise<GuestSessionState> {
    return this.orders.resubmit(guest, id, body);
  }

  @Post('orders/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentGuest() guest: GuestContext,
    @Param('id', uuid) id: string,
  ): Promise<GuestSessionState> {
    return this.orders.withdraw(guest, id);
  }

  @Post('orders/:id/dispute')
  @HttpCode(HttpStatus.OK)
  dispute(
    @CurrentGuest() guest: GuestContext,
    @Param('id', uuid) id: string,
  ): Promise<GuestSessionState> {
    return this.orders.dispute(guest, id);
  }

  @Post('requests')
  @HttpCode(HttpStatus.OK)
  request(
    @CurrentGuest() guest: GuestContext,
    @Body(new ZodPipe(ServiceRequestBody)) body: ServiceRequestBody,
  ): Promise<GuestSessionState> {
    return this.orders.request(guest, body);
  }
}
