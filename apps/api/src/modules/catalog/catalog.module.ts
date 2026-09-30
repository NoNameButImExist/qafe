import { Module } from '@nestjs/common';
import { CoreModule } from '../core/index.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogDatabase } from './catalog.database.js';
import { CatalogService } from './catalog.service.js';

/** Menus, categories, items and modifiers (schema "catalog"). */
@Module({
  imports: [CoreModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogDatabase, CatalogService],
})
export class CatalogModule {}
