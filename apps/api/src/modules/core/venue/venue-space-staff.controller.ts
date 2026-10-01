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
  UseGuards,
} from '@nestjs/common';
import {
  CreateAreaRequest,
  CreateStaffRequest,
  CreateTableRequest,
  CreateTablesBulkRequest,
  SetStaffPasswordRequest,
  SetStaffPinRequest,
  UpdateAreaRequest,
  UpdateStaffRequest,
  UpdateTableRequest,
  type CreateTablesBulkInput,
  type VenueSpace,
  type VenueStaff,
} from '@qafe/contracts';
import {
  CurrentStaff,
  RequirePermission,
  StaffGuard,
  type StaffClaims,
} from '../../../common/auth/auth.guard.js';
import { ZodPipe } from '../../../common/zod.pipe.js';
import { SpaceService } from '../space/space.service.js';
import { StaffService } from '../staff/staff.service.js';

const uuid = new ParseUUIDPipe();

/** FR-SEF-11, FR-SEF-15, FR-SEF-16: areas, tables and QR codes of the member's venue. */
@Controller('venue')
@UseGuards(StaffGuard)
@RequirePermission('tables.manage')
export class VenueSpaceController {
  constructor(private readonly space: SpaceService) {}

  @Get('tables')
  get(@CurrentStaff() staff: StaffClaims): Promise<VenueSpace> {
    return this.space.get(staff.venueId);
  }

  @Post('areas')
  createArea(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(CreateAreaRequest)) body: CreateAreaRequest,
  ) {
    return this.space.createArea(staff, body);
  }

  @Patch('areas/:id')
  updateArea(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(UpdateAreaRequest)) body: UpdateAreaRequest,
  ): Promise<VenueSpace> {
    return this.space.updateArea(staff, id, body);
  }

  @Delete('areas/:id')
  deleteArea(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
  ): Promise<VenueSpace> {
    return this.space.deleteArea(staff, id);
  }

  @Post('tables')
  createTable(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(CreateTableRequest)) body: CreateTableRequest,
  ) {
    return this.space.createTable(staff, body);
  }

  @Post('tables/bulk')
  createTables(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(CreateTablesBulkRequest)) body: CreateTablesBulkInput,
  ): Promise<VenueSpace> {
    return this.space.createTables(staff, body);
  }

  @Patch('tables/:id')
  updateTable(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(UpdateTableRequest)) body: UpdateTableRequest,
  ): Promise<VenueSpace> {
    return this.space.updateTable(staff, id, body);
  }

  @Delete('tables/:id')
  deleteTable(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
  ): Promise<VenueSpace> {
    return this.space.deleteTable(staff, id);
  }

  @Post('tables/:id/qr')
  @HttpCode(200)
  rotateQr(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<VenueSpace> {
    return this.space.rotateQr(staff, id);
  }
}

/** FR-SEF-08, FR-SEF-09: staff accounts of the member's venue. */
@Controller('venue/staff')
@UseGuards(StaffGuard)
@RequirePermission('staff.manage')
export class VenueStaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  get(@CurrentStaff() staff: StaffClaims): Promise<VenueStaff> {
    return this.staffService.get(staff.venueId);
  }

  @Post()
  create(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(CreateStaffRequest)) body: CreateStaffRequest,
  ) {
    return this.staffService.create(staff, body);
  }

  @Patch(':memberId')
  update(
    @CurrentStaff() staff: StaffClaims,
    @Param('memberId', uuid) memberId: string,
    @Body(new ZodPipe(UpdateStaffRequest)) body: UpdateStaffRequest,
  ): Promise<VenueStaff> {
    return this.staffService.update(staff, memberId, body);
  }

  @Post(':memberId/password')
  @HttpCode(200)
  setPassword(
    @CurrentStaff() staff: StaffClaims,
    @Param('memberId', uuid) memberId: string,
    @Body(new ZodPipe(SetStaffPasswordRequest)) body: SetStaffPasswordRequest,
  ): Promise<VenueStaff> {
    return this.staffService.setPassword(staff, memberId, body.password);
  }

  @Put(':memberId/pin')
  setPin(
    @CurrentStaff() staff: StaffClaims,
    @Param('memberId', uuid) memberId: string,
    @Body(new ZodPipe(SetStaffPinRequest)) body: SetStaffPinRequest,
  ): Promise<VenueStaff> {
    return this.staffService.setPin(staff, memberId, body.pin);
  }

  @Delete(':memberId/pin')
  removePin(
    @CurrentStaff() staff: StaffClaims,
    @Param('memberId', uuid) memberId: string,
  ): Promise<VenueStaff> {
    return this.staffService.setPin(staff, memberId, null);
  }
}
