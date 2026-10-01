import { Module } from '@nestjs/common';
import { CoreModule } from '../core/index.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogDatabase } from './catalog.database.js';
import { CatalogService } from './catalog.service.js';
import { GuestMenuService } from './guest-menu.service.js';
import { MenuCache } from './menu-cache.js';

/** Menus, categories, items and modifiers (schema "catalog"). */
@Module({
  imports: [CoreModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogDatabase, CatalogService, MenuCache, GuestMenuService],
  exports: [GuestMenuService],
})
export class CatalogModule {}
