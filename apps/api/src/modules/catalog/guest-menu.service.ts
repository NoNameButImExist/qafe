import { Injectable } from '@nestjs/common';
import type { GuestMenu } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { CatalogDatabase } from './catalog.database.js';
import { MenuCache } from './menu-cache.js';

export interface QuoteLine {
  itemId: string;
  quantity: number;
  note?: string | undefined;
  modifierOptionIds: string[];
}

/** A line priced from the current menu; ordering stores it as a snapshot. */
export interface PricedLine {
  itemId: string;
  itemName: string;
  categoryName: string;
  quantity: number;
  note: string | null;
  /** Item price plus modifier deltas, VAT included ("2.80"). */
  unitPrice: string;
  lineTotal: string;
  modifiers: { optionId: string; groupName: string; optionName: string; priceDelta: string }[];
  /** KDS station of the item, copied onto the order item. */
  prepStationId: string | null;
}

export type QuoteResult =
  | { ok: true; lines: PricedLine[]; total: string }
  | { ok: false; code: 'item_unavailable' | 'invalid_modifiers'; itemId: string };

const cents = (value: string) => Math.round(Number(value) * 100);
const fromCents = (value: number) => (value / 100).toFixed(2);

/**
 * What the ordering module may ask the catalog about (public interface): the guest menu and
 * prices for an order. Runs as svc_catalog in the venue's RLS context.
 */
@Injectable()
export class GuestMenuService {
  constructor(
    private readonly db: CatalogDatabase,
    private readonly cache: MenuCache,
  ) {}

  /** Active categories with their items (FR-GOS-04); unavailable items stay visible. */
  async menu(venueId: string): Promise<GuestMenu> {
    const cached = await this.cache.get(venueId);
    if (cached) return cached;
    const menu = await this.db.withTenant({ venueId, isSuperAdmin: false }, (trx) =>
      loadGuestMenu(trx, venueId),
    );
    await this.cache.set(venueId, menu);
    return menu;
  }

  /**
   * Prices order lines from the database, never from the cache: the item must exist, be
   * available and sit in an active category; the options must belong to the item's groups
   * and respect each group's min and max.
   */
  quote(venueId: string, lines: QuoteLine[]): Promise<QuoteResult> {
    return this.db.withTenant({ venueId, isSuperAdmin: false }, async (trx) => {
      const itemIds = [...new Set(lines.map((l) => l.itemId))];
      const items = await trx
        .selectFrom('catalog.items as i')
        .innerJoin('catalog.categories as c', 'c.id', 'i.category_id')
        .select([
          'i.id',
          'i.name',
          'i.price',
          'i.is_available',
          'i.prep_station_id',
          'c.name as category_name',
        ])
        .where('i.id', 'in', itemIds)
        .where('i.deleted_at', 'is', null)
        .where('c.is_active', '=', true)
        .execute();
      const links = await trx
        .selectFrom('catalog.item_modifier_groups as l')
        .innerJoin('catalog.modifier_groups as g', 'g.id', 'l.group_id')
        .select(['l.item_id', 'g.id', 'g.name', 'g.min_select', 'g.max_select'])
        .where('l.item_id', 'in', itemIds)
        .execute();
      const groupIds = [...new Set(links.map((l) => l.id))];
      const options = groupIds.length
        ? await trx
            .selectFrom('catalog.modifier_options')
            .select(['id', 'group_id', 'name', 'price_delta'])
            .where('group_id', 'in', groupIds)
            .execute()
        : [];

      const priced: PricedLine[] = [];
      let total = 0;
      for (const line of lines) {
        const item = items.find((i) => i.id === line.itemId);
        if (!item?.is_available)
          return { ok: false, code: 'item_unavailable', itemId: line.itemId };

        const groups = links.filter((l) => l.item_id === item.id);
        const chosen = [...new Set(line.modifierOptionIds)];
        if (chosen.length !== line.modifierOptionIds.length) {
          return { ok: false, code: 'invalid_modifiers', itemId: item.id };
        }
        const picked = chosen.map((id) => options.find((o) => o.id === id));
        const valid =
          picked.every((o) => o !== undefined && groups.some((g) => g.id === o.group_id)) &&
          groups.every((g) => {
            const count = picked.filter((o) => o?.group_id === g.id).length;
            return count >= g.min_select && count <= g.max_select;
          });
        if (!valid) return { ok: false, code: 'invalid_modifiers', itemId: item.id };

        const modifiers = picked.map((o) => ({
          optionId: o!.id,
          groupName: groups.find((g) => g.id === o!.group_id)!.name,
          optionName: o!.name,
          priceDelta: o!.price_delta,
        }));
        const unit = cents(item.price) + modifiers.reduce((s, m) => s + cents(m.priceDelta), 0);
        // A discount option must not make the line negative.
        const unitCents = Math.max(unit, 0);
        total += unitCents * line.quantity;
        priced.push({
          itemId: item.id,
          itemName: item.name,
          categoryName: item.category_name,
          quantity: line.quantity,
          note: line.note ?? null,
          unitPrice: fromCents(unitCents),
          lineTotal: fromCents(unitCents * line.quantity),
          modifiers,
          prepStationId: item.prep_station_id,
        });
      }
      return { ok: true, lines: priced, total: fromCents(total) };
    });
  }
}

async function loadGuestMenu(trx: Tx, venueId: string): Promise<GuestMenu> {
  const categories = await trx
    .selectFrom('catalog.categories')
    .select(['id', 'name', 'description'])
    .where('venue_id', '=', venueId)
    .where('is_active', '=', true)
    .orderBy('sort_order')
    .orderBy('name')
    .execute();
  const items = await trx
    .selectFrom('catalog.items')
    .select([
      'id',
      'category_id',
      'name',
      'description',
      'price',
      'volume_label',
      'image_url',
      'is_available',
    ])
    .where('venue_id', '=', venueId)
    .where('deleted_at', 'is', null)
    .orderBy('sort_order')
    .orderBy('name')
    .execute();
  const links = await trx
    .selectFrom('catalog.item_modifier_groups')
    .select(['item_id', 'group_id'])
    .where('venue_id', '=', venueId)
    .orderBy('sort_order')
    .execute();
  const usedGroups = new Set(links.map((l) => l.group_id));
  const groups = await trx
    .selectFrom('catalog.modifier_groups')
    .select(['id', 'name', 'min_select', 'max_select'])
    .where('venue_id', '=', venueId)
    .execute();
  const options = await trx
    .selectFrom('catalog.modifier_options')
    .select(['id', 'group_id', 'name', 'price_delta', 'is_default'])
    .where('venue_id', '=', venueId)
    .orderBy('sort_order')
    .execute();

  return {
    categories: categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        items: items
          .filter((i) => i.category_id === c.id)
          .map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            price: i.price,
            volumeLabel: i.volume_label,
            imageUrl: i.image_url,
            isAvailable: i.is_available,
            modifierGroupIds: links.filter((l) => l.item_id === i.id).map((l) => l.group_id),
          })),
      }))
      .filter((c) => c.items.length > 0),
    modifierGroups: groups
      .filter((g) => usedGroups.has(g.id))
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.min_select,
        maxSelect: g.max_select,
        options: options
          .filter((o) => o.group_id === g.id)
          .map((o) => ({
            id: o.id,
            name: o.name,
            priceDelta: o.price_delta,
            isDefault: o.is_default,
          })),
      })),
  };
}
