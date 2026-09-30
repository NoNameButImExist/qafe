import { Body, Controller, Delete, Get, Inject, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  UpdateVenueSettingsRequest,
  type UpdateVenueSettingsInput,
  type VenueSettings,
} from '@qafe/contracts';
import type { FastifyRequest } from 'fastify';
import {
  CurrentStaff,
  RequirePermission,
  StaffGuard,
  type StaffClaims,
} from '../../../common/auth/auth.guard.js';
import { storeImage } from '../../../common/storage/image-upload.js';
import { STORAGE, type Storage } from '../../../common/storage/storage.js';
import { ZodPipe } from '../../../common/zod.pipe.js';
import { VenueSettingsService } from './venue-settings.service.js';

/** The signed-in staff member's own venue. The tenant comes from the token. */
@Controller('venue')
@UseGuards(StaffGuard)
export class VenueSettingsController {
  constructor(
    private readonly settings: VenueSettingsService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Get()
  get(@CurrentStaff() staff: StaffClaims): Promise<VenueSettings> {
    return this.settings.get(staff.venueId);
  }

  @Patch()
  @RequirePermission('venue.settings')
  update(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(UpdateVenueSettingsRequest)) body: UpdateVenueSettingsInput,
  ): Promise<VenueSettings> {
    return this.settings.update(staff, body);
  }

  @Post('logo')
  @RequirePermission('venue.settings')
  async uploadLogo(
    @CurrentStaff() staff: StaffClaims,
    @Req() req: FastifyRequest,
  ): Promise<VenueSettings> {
    const url = await storeImage(req, this.storage, staff.venueId, 'logo');
    return this.settings.setLogo(staff, url);
  }

  @Delete('logo')
  @RequirePermission('venue.settings')
  removeLogo(@CurrentStaff() staff: StaffClaims): Promise<VenueSettings> {
    return this.settings.setLogo(staff, null);
  }
}
