import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminUserListQuery,
  CreateVenueRequest,
  ResetPasswordRequest,
  type ResetPasswordInput,
  UpdateUserStatusRequest,
  UpdateVenueRequest,
  UpdateVenueStatusRequest,
  VenueListQuery,
  type AdminUserList,
  type AdminUserListParams,
  type PlatformModule,
  type UpdateVenueInput,
  type VenueDetail,
  type VenueModuleState,
  type AdminStats,
  type CreateVenueInput,
  type CreateVenueResponse,
  type VenueList,
  type VenueListParams,
  type VenueSummary,
} from '@qafe/contracts';
import {
  CurrentUser,
  PlatformAdminGuard,
  type AccessClaims,
} from '../../../common/auth/auth.guard.js';
import { ZodPipe } from '../../../common/zod.pipe.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminVenuesService } from './admin-venues.service.js';

/** Platform administration (FR-ADM). Super admins only. */
@Controller('admin')
@UseGuards(PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly venues: AdminVenuesService,
    private readonly users: AdminUsersService,
  ) {}

  @Get('stats')
  stats(): Promise<AdminStats> {
    return this.venues.stats();
  }

  @Get('venues')
  list(@Query(new ZodPipe(VenueListQuery)) query: VenueListParams): Promise<VenueList> {
    return this.venues.list(query);
  }

  @Get('venues/cities')
  cities(): Promise<string[]> {
    return this.venues.cities();
  }

  @Post('venues')
  create(
    @Body(new ZodPipe(CreateVenueRequest)) body: CreateVenueInput,
    @CurrentUser() user: AccessClaims,
  ): Promise<CreateVenueResponse> {
    return this.venues.create(body, user.userId);
  }

  @Patch('venues/:id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(UpdateVenueStatusRequest)) body: UpdateVenueStatusRequest,
    @CurrentUser() user: AccessClaims,
  ): Promise<VenueSummary> {
    return this.venues.updateStatus(id, body.status, user.userId);
  }

  @Get('venues/:id')
  detail(@Param('id', new ParseUUIDPipe()) id: string): Promise<VenueDetail> {
    return this.venues.detail(id);
  }

  @Patch('venues/:id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(UpdateVenueRequest)) body: UpdateVenueInput,
    @CurrentUser() user: AccessClaims,
  ): Promise<VenueDetail> {
    return this.venues.update(id, body, user.userId);
  }

  @Get('modules')
  modules(): Promise<PlatformModule[]> {
    return this.venues.modules();
  }

  @Put('venues/:id/modules/:code')
  enableModule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('code') code: string,
    @CurrentUser() user: AccessClaims,
  ): Promise<VenueModuleState[]> {
    return this.venues.setModule(id, code, true, user.userId);
  }

  @Delete('venues/:id/modules/:code')
  disableModule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('code') code: string,
    @CurrentUser() user: AccessClaims,
  ): Promise<VenueModuleState[]> {
    return this.venues.setModule(id, code, false, user.userId);
  }

  @Get('users')
  listUsers(
    @Query(new ZodPipe(AdminUserListQuery)) query: AdminUserListParams,
  ): Promise<AdminUserList> {
    return this.users.list(query);
  }

  @Patch('users/:id/status')
  @HttpCode(204)
  async setUserStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(UpdateUserStatusRequest)) body: UpdateUserStatusRequest,
    @CurrentUser() user: AccessClaims,
  ): Promise<void> {
    await this.users.setActive(id, body.active, user.userId);
  }

  @Post('users/:id/password')
  @HttpCode(204)
  async resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(ResetPasswordRequest)) body: ResetPasswordInput,
    @CurrentUser() user: AccessClaims,
  ): Promise<void> {
    await this.users.resetPassword(
      id,
      body.temporaryPassword,
      user.userId,
      body.requirePasswordChange,
    );
  }
}
