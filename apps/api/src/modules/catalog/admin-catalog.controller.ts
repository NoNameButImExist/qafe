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
import type { z } from 'zod';
import {
  CurrentUser,
  PlatformAdminGuard,
  type AccessClaims,
} from '../../common/auth/auth.guard.js';
import { notFound } from '../../common/errors.js';
import { storeImage } from '../../common/storage/image-upload.js';
import { STORAGE, type Storage } from '../../common/storage/storage.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { VenueDirectory } from '../core/index.js';
import { CatalogService } from './catalog.service.js';

const uuid = new ParseUUIDPipe();
const actorOf = (user: AccessClaims) => ({ id: user.userId, label: user.name });

/** FR-ADM-07: platform admins edit the menu of any venue (e.g. to help with setup). */
@Controller('admin/venues/:venueId/catalog')
@UseGuards(PlatformAdminGuard)
export class AdminCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly venues: VenueDirectory,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Get('menu')
  async menu(@Param('venueId', uuid) venueId: string): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.getMenu(venueId);
  }

  @Post('categories')
  async createCategory(
    @Param('venueId', uuid) venueId: string,
    @CurrentUser() user: AccessClaims,
    @Body(new ZodPipe(CreateCategoryRequest)) body: z.output<typeof CreateCategoryRequest>,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.createCategory(venueId, actorOf(user), body);
  }

  @Put('categories/order')
  async reorderCategories(
    @Param('venueId', uuid) venueId: string,
    @Body(new ZodPipe(ReorderRequest)) body: ReorderRequest,
  ) {
    await this.requireVenue(venueId);
    return this.catalog.reorderCategories(venueId, body.ids);
  }

  @Patch('categories/:id')
  async updateCategory(
    @Param('venueId', uuid) venueId: string,
    @Param('id', uuid) id: string,
    @CurrentUser() user: AccessClaims,
    @Body(new ZodPipe(UpdateCategoryRequest)) body: z.output<typeof UpdateCategoryRequest>,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.updateCategory(venueId, actorOf(user), id, body);
  }

  @Delete('categories/:id')
  async deleteCategory(
    @Param('venueId', uuid) venueId: string,
    @Param('id', uuid) id: string,
    @CurrentUser() user: AccessClaims,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.deleteCategory(venueId, actorOf(user), id);
  }

  @Put('categories/:id/items/order')
  async reorderItems(
    @Param('venueId', uuid) venueId: string,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(ReorderRequest)) body: ReorderRequest,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.reorderItems(venueId, id, body.ids);
  }

  @Post('items')
  async createItem(
    @Param('venueId', uuid) venueId: string,
    @CurrentUser() user: AccessClaims,
    @Body(new ZodPipe(CreateItemRequest)) body: CreateItemInput,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.createItem(venueId, actorOf(user), body);
  }

  @Patch('items/:id')
  async updateItem(
    @Param('venueId', uuid) venueId: string,
    @Param('id', uuid) id: string,
    @CurrentUser() user: AccessClaims,
    @Body(new ZodPipe(UpdateItemRequest)) body: UpdateItemInput,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.updateItem(venueId, actorOf(user), id, body);
  }

  @Delete('items/:id')
  async deleteItem(
    @Param('venueId', uuid) venueId: string,
    @Param('id', uuid) id: string,
    @CurrentUser() user: AccessClaims,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.deleteItem(venueId, actorOf(user), id);
  }

  @Patch('items/:id/availability')
  async setAvailability(
    @Param('venueId', uuid) venueId: string,
    @Param('id', uuid) id: string,
    @CurrentUser() user: AccessClaims,
    @Body(new ZodPipe(ItemAvailabilityRequest)) body: ItemAvailabilityRequest,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.setAvailability(venueId, actorOf(user), id, body.available);
  }

  @Post('modifier-groups')
  async createGroup(
    @Param('venueId', uuid) venueId: string,
    @CurrentUser() user: AccessClaims,
    @Body(new ZodPipe(SaveModifierGroupRequest)) body: SaveModifierGroupInput,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.saveModifierGroup(venueId, actorOf(user), null, body);
  }

  @Put('modifier-groups/:id')
  async saveGroup(
    @Param('venueId', uuid) venueId: string,
    @Param('id', uuid) id: string,
    @CurrentUser() user: AccessClaims,
    @Body(new ZodPipe(SaveModifierGroupRequest)) body: SaveModifierGroupInput,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.saveModifierGroup(venueId, actorOf(user), id, body);
  }

  @Delete('modifier-groups/:id')
  async deleteGroup(
    @Param('venueId', uuid) venueId: string,
    @Param('id', uuid) id: string,
    @CurrentUser() user: AccessClaims,
  ): Promise<Menu> {
    await this.requireVenue(venueId);
    return this.catalog.deleteModifierGroup(venueId, actorOf(user), id);
  }

  @Post('images')
  async uploadImage(
    @Param('venueId', uuid) venueId: string,
    @Req() req: FastifyRequest,
  ): Promise<UploadedImage> {
    await this.requireVenue(venueId);
    return { url: await storeImage(req, this.storage, venueId, 'items') };
  }

  /** The catalog module cannot read core; the core module confirms the venue exists. */
  private async requireVenue(venueId: string): Promise<void> {
    if (!(await this.venues.exists(venueId))) throw notFound('Venue not found');
  }
}
