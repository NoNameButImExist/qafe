import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type Actor,
  type CatalogEvent,
  type CreateCategoryRequest,
  type CreateItemInput,
  type Menu,
  type SaveModifierGroupInput,
  type UpdateCategoryRequest,
  type UpdateItemInput,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { ApiException, notFound } from '../../common/errors.js';
import { CatalogDatabase } from './catalog.database.js';

/** Normalises "2", "2,5" or "2.50" to "2.50". */
const money = (value: string) => Number(value.replace(',', '.')).toFixed(2);

const categoryNotEmpty = () =>
  new ApiException(
    HttpStatus.CONFLICT,
    ErrorCode.categoryNotEmpty,
    'Move or delete the items of this category first',
  );

/**
 * The venue's menu (FR-SEF-17..19, FR-ADM-07). Every call runs in the venue's RLS context,
 * so one venue can never read or change another venue's menu. Every change writes an event
 * to catalog.outbox for the audit log (NFR-25).
 */
@Injectable()
export class CatalogService {
  constructor(private readonly db: CatalogDatabase) {}

  getMenu(venueId: string): Promise<Menu> {
    return this.inVenue(venueId, (trx) => this.load(trx, venueId));
  }

  createCategory(
    venueId: string,
    actor: Actor,
    input: CreateCategoryRequest & { name: string },
  ): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      const menuId = await this.ensureMenu(trx, venueId);
      const { max } = await trx
        .selectFrom('catalog.categories')
        .select((eb) => eb.fn.max('sort_order').as('max'))
        .where('venue_id', '=', venueId)
        .executeTakeFirstOrThrow();
      const category = await trx
        .insertInto('catalog.categories')
        .values({
          venue_id: venueId,
          menu_id: menuId,
          name: input.name,
          description: input.description ?? null,
          sort_order: (max ?? 0) + 1,
        })
        .returning(['id', 'name'])
        .executeTakeFirstOrThrow();
      await this.publish(trx, {
        type: 'category.created',
        venueId,
        entityId: category.id,
        entityName: category.name,
        after: { name: category.name },
        actor,
      });
      return this.load(trx, venueId);
    });
  }

  updateCategory(
    venueId: string,
    actor: Actor,
    id: string,
    input: UpdateCategoryRequest,
  ): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      const current = await trx
        .selectFrom('catalog.categories')
        .select(['name', 'description', 'is_active'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!current) throw notFound('Category not found');
      const { before, after, changes } = diff(current, {
        name: input.name,
        description: input.description,
        is_active: input.isActive,
      });
      if (changes) {
        await trx.updateTable('catalog.categories').set(changes).where('id', '=', id).execute();
        await this.publish(trx, {
          type: 'category.updated',
          venueId,
          entityId: id,
          entityName: (changes.name as string | undefined) ?? current.name,
          before,
          after,
          actor,
        });
      }
      return this.load(trx, venueId);
    });
  }

  /** Only an empty category can be deleted, so no item disappears from the menu by accident. */
  deleteCategory(venueId: string, actor: Actor, id: string): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      const category = await trx
        .selectFrom('catalog.categories')
        .select('name')
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!category) throw notFound('Category not found');
      const live = await trx
        .selectFrom('catalog.items')
        .select('id')
        .where('category_id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (live) throw categoryNotEmpty();
      // Deleted items still point at the category; past orders keep their own snapshots.
      await trx.deleteFrom('catalog.items').where('category_id', '=', id).execute();
      await trx.deleteFrom('catalog.categories').where('id', '=', id).execute();
      await this.publish(trx, {
        type: 'category.deleted',
        venueId,
        entityId: id,
        entityName: category.name,
        actor,
      });
      return this.load(trx, venueId);
    });
  }

  reorderCategories(venueId: string, ids: string[]): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      for (const [index, id] of ids.entries()) {
        await trx
          .updateTable('catalog.categories')
          .set({ sort_order: index + 1 })
          .where('id', '=', id)
          .execute();
      }
      return this.load(trx, venueId);
    });
  }

  createItem(venueId: string, actor: Actor, input: CreateItemInput): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      await this.requireCategory(trx, input.categoryId);
      const { max } = await trx
        .selectFrom('catalog.items')
        .select((eb) => eb.fn.max('sort_order').as('max'))
        .where('category_id', '=', input.categoryId)
        .executeTakeFirstOrThrow();
      const item = await trx
        .insertInto('catalog.items')
        .values({
          venue_id: venueId,
          category_id: input.categoryId,
          name: input.name,
          description: input.description ?? null,
          price: money(input.price),
          volume_label: input.volumeLabel ?? null,
          image_url: input.imageUrl ?? null,
          is_available: input.isAvailable ?? true,
          sort_order: (max ?? 0) + 1,
        })
        .returning(['id', 'name', 'price'])
        .executeTakeFirstOrThrow();
      if (input.modifierGroupIds?.length)
        await this.setGroups(trx, venueId, item.id, input.modifierGroupIds);
      await this.publish(trx, {
        type: 'item.created',
        venueId,
        entityId: item.id,
        entityName: item.name,
        after: { name: item.name, price: item.price },
        actor,
      });
      return this.load(trx, venueId);
    });
  }

  updateItem(venueId: string, actor: Actor, id: string, input: UpdateItemInput): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      const current = await this.requireItem(trx, id);
      if (input.categoryId) await this.requireCategory(trx, input.categoryId);
      const { before, after, changes } = diff(current, {
        name: input.name,
        description: input.description,
        price: input.price === undefined ? undefined : money(input.price),
        volume_label: input.volumeLabel,
        image_url: input.imageUrl,
        is_available: input.isAvailable,
        category_id: input.categoryId,
      });
      if (changes)
        await trx.updateTable('catalog.items').set(changes).where('id', '=', id).execute();

      if (input.modifierGroupIds) {
        const old = await this.groupIdsOf(trx, id);
        const next = [...new Set(input.modifierGroupIds)].sort();
        if (old.join() !== next.join()) {
          await this.setGroups(trx, venueId, id, next);
          before.modifier_groups = old;
          after.modifier_groups = next;
        }
      }
      if (Object.keys(after).length) {
        await this.publish(trx, {
          type: 'item.updated',
          venueId,
          entityId: id,
          entityName: (changes?.name as string | undefined) ?? current.name,
          before,
          after,
          actor,
        });
      }
      return this.load(trx, venueId);
    });
  }

  /** Soft delete: past orders keep their snapshot, the item leaves the menu. */
  deleteItem(venueId: string, actor: Actor, id: string): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      const item = await this.requireItem(trx, id);
      await trx
        .updateTable('catalog.items')
        .set({ deleted_at: new Date(), is_active: false })
        .where('id', '=', id)
        .execute();
      await trx.deleteFrom('catalog.item_modifier_groups').where('item_id', '=', id).execute();
      await this.publish(trx, {
        type: 'item.deleted',
        venueId,
        entityId: id,
        entityName: item.name,
        actor,
      });
      return this.load(trx, venueId);
    });
  }

  /** "Nestalo" with one tap (FR-SEF-19, FR-KON-22). */
  setAvailability(venueId: string, actor: Actor, id: string, available: boolean): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      const item = await this.requireItem(trx, id);
      if (item.is_available !== available) {
        await trx
          .updateTable('catalog.items')
          .set({ is_available: available })
          .where('id', '=', id)
          .execute();
        await this.publish(trx, {
          type: 'item.availability_changed',
          venueId,
          entityId: id,
          entityName: item.name,
          before: { is_available: item.is_available },
          after: { is_available: available },
          actor,
        });
      }
      return this.load(trx, venueId);
    });
  }

  reorderItems(venueId: string, categoryId: string, ids: string[]): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      await this.requireCategory(trx, categoryId);
      for (const [index, id] of ids.entries()) {
        await trx
          .updateTable('catalog.items')
          .set({ sort_order: index + 1 })
          .where('id', '=', id)
          .where('category_id', '=', categoryId)
          .execute();
      }
      return this.load(trx, venueId);
    });
  }

  /** FR-SEF-18: creates (id = null) or replaces a modifier group with its options. */
  saveModifierGroup(
    venueId: string,
    actor: Actor,
    id: string | null,
    input: SaveModifierGroupInput,
  ): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      let groupId = id;
      if (groupId) {
        const found = await trx
          .selectFrom('catalog.modifier_groups')
          .select('id')
          .where('id', '=', groupId)
          .forUpdate()
          .executeTakeFirst();
        if (!found) throw notFound('Modifier group not found');
        await trx
          .updateTable('catalog.modifier_groups')
          .set({ name: input.name, min_select: input.minSelect, max_select: input.maxSelect })
          .where('id', '=', groupId)
          .execute();
      } else {
        const created = await trx
          .insertInto('catalog.modifier_groups')
          .values({
            venue_id: venueId,
            name: input.name,
            min_select: input.minSelect,
            max_select: input.maxSelect,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        groupId = created.id;
      }

      const keep = input.options.map((o) => o.id).filter((o): o is string => Boolean(o));
      let removal = trx.deleteFrom('catalog.modifier_options').where('group_id', '=', groupId);
      if (keep.length) removal = removal.where('id', 'not in', keep);
      await removal.execute();
      for (const [index, option] of input.options.entries()) {
        const values = {
          name: option.name,
          price_delta: money(option.priceDelta),
          is_default: option.isDefault,
          sort_order: index + 1,
        };
        const updated = option.id
          ? await trx
              .updateTable('catalog.modifier_options')
              .set(values)
              .where('id', '=', option.id)
              .where('group_id', '=', groupId)
              .executeTakeFirst()
          : undefined;
        if (!updated || updated.numUpdatedRows === 0n) {
          await trx
            .insertInto('catalog.modifier_options')
            .values({ ...values, venue_id: venueId, group_id: groupId })
            .execute();
        }
      }

      await this.publish(trx, {
        type: 'modifier_group.saved',
        venueId,
        entityId: groupId,
        entityName: input.name,
        after: {
          name: input.name,
          min: input.minSelect,
          max: input.maxSelect,
          options: input.options.map((o) => `${o.name} (${money(o.priceDelta)})`),
        },
        actor,
      });
      return this.load(trx, venueId);
    });
  }

  deleteModifierGroup(venueId: string, actor: Actor, id: string): Promise<Menu> {
    return this.inVenue(venueId, async (trx) => {
      const group = await trx
        .selectFrom('catalog.modifier_groups')
        .select('name')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!group) throw notFound('Modifier group not found');
      // Options and item links go with the group (ON DELETE CASCADE).
      await trx.deleteFrom('catalog.modifier_groups').where('id', '=', id).execute();
      await this.publish(trx, {
        type: 'modifier_group.deleted',
        venueId,
        entityId: id,
        entityName: group.name,
        actor,
      });
      return this.load(trx, venueId);
    });
  }

  private inVenue<T>(venueId: string, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId, isSuperAdmin: false }, fn);
  }

  private async ensureMenu(trx: Tx, venueId: string): Promise<string> {
    const menu = await trx
      .selectFrom('catalog.menus')
      .select('id')
      .where('venue_id', '=', venueId)
      .orderBy('sort_order')
      .executeTakeFirst();
    if (menu) return menu.id;
    const created = await trx
      .insertInto('catalog.menus')
      .values({ venue_id: venueId, name: 'Glavni meni' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return created.id;
  }

  private async requireCategory(trx: Tx, id: string): Promise<void> {
    const found = await trx
      .selectFrom('catalog.categories')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!found) throw notFound('Category not found');
  }

  private async requireItem(trx: Tx, id: string) {
    const item = await trx
      .selectFrom('catalog.items')
      .select([
        'name',
        'description',
        'price',
        'volume_label',
        'image_url',
        'is_available',
        'category_id',
      ])
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (!item) throw notFound('Item not found');
    return item;
  }

  private async groupIdsOf(trx: Tx, itemId: string): Promise<string[]> {
    const rows = await trx
      .selectFrom('catalog.item_modifier_groups')
      .select('group_id')
      .where('item_id', '=', itemId)
      .execute();
    return rows.map((r) => r.group_id).sort();
  }

  private async setGroups(
    trx: Tx,
    venueId: string,
    itemId: string,
    groupIds: string[],
  ): Promise<void> {
    await trx.deleteFrom('catalog.item_modifier_groups').where('item_id', '=', itemId).execute();
    if (!groupIds.length) return;
    const found = await trx
      .selectFrom('catalog.modifier_groups')
      .select('id')
      .where('id', 'in', groupIds)
      .execute();
    if (found.length !== new Set(groupIds).size) throw notFound('Modifier group not found');
    await trx
      .insertInto('catalog.item_modifier_groups')
      .values(
        groupIds.map((groupId, index) => ({
          venue_id: venueId,
          item_id: itemId,
          group_id: groupId,
          sort_order: index,
        })),
      )
      .execute();
  }

  private async publish(trx: Tx, event: CatalogEvent): Promise<void> {
    await trx
      .insertInto('catalog.outbox')
      .values({
        venue_id: event.venueId,
        event_type: event.type,
        aggregate_id: event.entityId,
        payload: JSON.stringify(event),
      })
      .execute();
  }

  private async load(trx: Tx, venueId: string): Promise<Menu> {
    const categories = await trx
      .selectFrom('catalog.categories')
      .select(['id', 'name', 'description', 'is_active', 'sort_order'])
      .where('venue_id', '=', venueId)
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
        'sort_order',
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
    const groups = await trx
      .selectFrom('catalog.modifier_groups')
      .select(['id', 'name', 'min_select', 'max_select'])
      .where('venue_id', '=', venueId)
      .orderBy('name')
      .execute();
    const options = await trx
      .selectFrom('catalog.modifier_options')
      .select(['id', 'group_id', 'name', 'price_delta', 'is_default', 'sort_order'])
      .where('venue_id', '=', venueId)
      .orderBy('sort_order')
      .execute();

    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        isActive: c.is_active,
        sortOrder: c.sort_order,
        items: items
          .filter((i) => i.category_id === c.id)
          .map((i) => ({
            id: i.id,
            categoryId: i.category_id,
            name: i.name,
            description: i.description,
            price: i.price,
            volumeLabel: i.volume_label,
            imageUrl: i.image_url,
            isAvailable: i.is_available,
            sortOrder: i.sort_order,
            modifierGroupIds: links.filter((l) => l.item_id === i.id).map((l) => l.group_id),
          })),
      })),
      modifierGroups: groups.map((g) => ({
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
            sortOrder: o.sort_order,
          })),
        itemCount: links.filter((l) => l.group_id === g.id).length,
      })),
    };
  }
}

/** Old vs new values of the given columns; `undefined` in `next` means "not sent". */
function diff(current: Record<string, unknown>, next: Record<string, unknown>) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(next)) {
    if (value === undefined) continue;
    if (current[column] === value) continue;
    before[column] = current[column];
    after[column] = value;
    changes[column] = value;
  }
  return { before, after, changes: Object.keys(changes).length ? changes : null };
}
