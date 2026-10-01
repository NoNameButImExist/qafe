// Public interface of the catalog module. Other modules import only from here.
export { CatalogModule } from './catalog.module.js';
export {
  GuestMenuService,
  type PricedLine,
  type QuoteLine,
  type QuoteResult,
} from './guest-menu.service.js';
