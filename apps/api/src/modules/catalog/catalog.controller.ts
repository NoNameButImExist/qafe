import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateCategoryRequest,
  CreateItemRequest,
  ItemAvailabilityRequest,
  ReorderRequest,
  SaveModifierGroupRequest,
  UpdateCategoryRequest,
  UpdateItemRequest,
  type CreateItemInput,
  type Menu,
  type SaveModifierGroupInput,
  type UpdateItemInput,
  type UploadedImage,
} from '@qafe/contracts';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CurrentStaff,
  RequirePermission,
  StaffGuard,
  type StaffClaims,
} from '../../common/auth/auth.guard.js';
import { storeImage } from '../../common/storage/image-upload.js';
import { STORAGE, type Storage } from '../../common/storage/storage.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CatalogService } from './catalog.service.js';

type CategoryInput = z.output<typeof CreateCategoryRequest>;
type CategoryPatch = z.output<typeof UpdateCategoryRequest>;

const uuid = new ParseUUIDPipe();
const actorOf = (staff: StaffClaims) => ({ id: staff.userId, label: staff.name });

/** The menu of the signed-in staff member's venue (panel). The tenant comes from the token. */
@Controller('catalog')
@UseGuards(StaffGuard)
@RequirePermission('menu.edit')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Get('menu')
  @RequirePermission('menu.edit', 'menu.availability')
  menu(@CurrentStaff() staff: StaffClaims): Promise<Menu> {
    return this.catalog.getMenu(staff.venueId);
  }

  @Post('categories')
  createCategory(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(CreateCategoryRequest)) body: CategoryInput,
  ): Promise<Menu> {
    return this.catalog.createCategory(staff.venueId, actorOf(staff), body);
  }

  @Put('categories/order')
  reorderCategories(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(ReorderRequest)) body: ReorderRequest,
  ) {
    return this.catalog.reorderCategories(staff.venueId, body.ids);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(UpdateCategoryRequest)) body: CategoryPatch,
  ): Promise<Menu> {
    return this.catalog.updateCategory(staff.venueId, actorOf(staff), id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<Menu> {
    return this.catalog.deleteCategory(staff.venueId, actorOf(staff), id);
  }

  @Put('categories/:id/items/order')
  reorderItems(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(ReorderRequest)) body: ReorderRequest,
  ): Promise<Menu> {
    return this.catalog.reorderItems(staff.venueId, id, body.ids);
  }

  @Post('items')
  createItem(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(CreateItemRequest)) body: CreateItemInput,
  ) {
    return this.catalog.createItem(staff.venueId, actorOf(staff), body);
  }

  @Patch('items/:id')
  updateItem(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(UpdateItemRequest)) body: UpdateItemInput,
  ): Promise<Menu> {
    return this.catalog.updateItem(staff.venueId, actorOf(staff), id, body);
  }

  @Delete('items/:id')
  deleteItem(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<Menu> {
    return this.catalog.deleteItem(staff.venueId, actorOf(staff), id);
  }

  /** Waiters may mark an item unavailable too (FR-KON-22). */
  @Patch('items/:id/availability')
  @RequirePermission('menu.edit', 'menu.availability')
  setAvailability(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(ItemAvailabilityRequest)) body: ItemAvailabilityRequest,
  ): Promise<Menu> {
    return this.catalog.setAvailability(staff.venueId, actorOf(staff), id, body.available);
  }

  @Post('modifier-groups')
  createGroup(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(SaveModifierGroupRequest)) body: SaveModifierGroupInput,
  ): Promise<Menu> {
    return this.catalog.saveModifierGroup(staff.venueId, actorOf(staff), null, body);
  }

  @Put('modifier-groups/:id')
  saveGroup(
    @CurrentStaff() staff: StaffClaims,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(SaveModifierGroupRequest)) body: SaveModifierGroupInput,
  ): Promise<Menu> {
    return this.catalog.saveModifierGroup(staff.venueId, actorOf(staff), id, body);
  }

  @Delete('modifier-groups/:id')
  deleteGroup(@CurrentStaff() staff: StaffClaims, @Param('id', uuid) id: string): Promise<Menu> {
    return this.catalog.deleteModifierGroup(staff.venueId, actorOf(staff), id);
  }

  /** Stores an item image and returns its URL; the item is saved with it separately. */
  @Post('images')
  async uploadImage(
    @CurrentStaff() staff: StaffClaims,
    @Req() req: FastifyRequest,
  ): Promise<UploadedImage> {
    return { url: await storeImage(req, this.storage, staff.venueId, 'items') };
  }
}
