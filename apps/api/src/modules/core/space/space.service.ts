import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { StaffClaims } from '@qafe/auth';
import {
  ErrorCode,
  type CreateAreaRequest,
  type CreateTableRequest,
  type CreateTablesBulkInput,
  type SpaceEvent,
  type UpdateAreaRequest,
  type UpdateTableRequest,
  type VenueSpace,
} from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { randomBytes } from 'node:crypto';
import { ApiException, notFound } from '../../../common/errors.js';
import { APP_CONFIG, type AppConfig } from '../../../config/config.js';
import { CoreDatabase } from '../core.database.js';
import { publish } from '../outbox.js';

/** 192 bits of randomness; NFR-10 asks for at least 128. */
const newQrToken = () => randomBytes(24).toString('base64url');

const labelTaken = () =>
  new ApiException(
    HttpStatus.CONFLICT,
    ErrorCode.labelTaken,
    'A table with this label already exists',
  );

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === '23505';

/** Areas, tables and QR codes of the signed-in member's venue (FR-SEF-11, FR-SEF-15, FR-SEF-16). */
@Injectable()
export class SpaceService {
  constructor(
    private readonly db: CoreDatabase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get(venueId: string): Promise<VenueSpace> {
    return this.inVenue(venueId, (trx) => this.load(trx, venueId));
  }

  createArea(staff: StaffClaims, input: CreateAreaRequest): Promise<VenueSpace> {
    return this.inVenue(staff.venueId, async (trx) => {
      const { max } = await trx
        .selectFrom('core.areas')
        .select((eb) => eb.fn.max('sort_order').as('max'))
        .executeTakeFirstOrThrow();
      const area = await trx
        .insertInto('core.areas')
        .values({ venue_id: staff.venueId, name: input.name, sort_order: (max ?? 0) + 1 })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch((error: unknown) => {
          throw isUniqueViolation(error) ? labelTaken() : error;
        });
      await this.event(trx, staff, {
        type: 'area.created',
        entityId: area.id,
        entityName: input.name,
        after: { name: input.name },
      });
      return this.load(trx, staff.venueId);
    });
  }

  updateArea(staff: StaffClaims, id: string, input: UpdateAreaRequest): Promise<VenueSpace> {
    return this.inVenue(staff.venueId, async (trx) => {
      const area = await trx
        .selectFrom('core.areas')
        .select(['name', 'is_active'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!area) throw notFound('Area not found');
      const changes = defined({ name: input.name, is_active: input.isActive });
      if (Object.keys(changes).length) {
        await trx
          .updateTable('core.areas')
          .set(changes)
          .where('id', '=', id)
          .execute()
          .catch((error: unknown) => {
            throw isUniqueViolation(error) ? labelTaken() : error;
          });
        await this.event(trx, staff, {
          type: 'area.updated',
          entityId: id,
          entityName: input.name ?? area.name,
          before: pick(area, changes),
          after: changes,
        });
      }
      return this.load(trx, staff.venueId);
    });
  }

  /** The tables of a deleted area stay, without an area. */
  deleteArea(staff: StaffClaims, id: string): Promise<VenueSpace> {
    return this.inVenue(staff.venueId, async (trx) => {
      const area = await trx
        .selectFrom('core.areas')
        .select('name')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!area) throw notFound('Area not found');
      await trx
        .updateTable('core.tables')
        .set({ area_id: null })
        .where('area_id', '=', id)
        .execute();
      await trx.deleteFrom('core.member_area_assignments').where('area_id', '=', id).execute();
      await trx.deleteFrom('core.areas').where('id', '=', id).execute();
      await this.event(trx, staff, { type: 'area.deleted', entityId: id, entityName: area.name });
      return this.load(trx, staff.venueId);
    });
  }

  createTable(staff: StaffClaims, input: CreateTableRequest): Promise<VenueSpace> {
    return this.inVenue(staff.venueId, async (trx) => {
      if (input.areaId) await this.requireArea(trx, input.areaId);
      const table = await trx
        .insertInto('core.tables')
        .values({
          venue_id: staff.venueId,
          label: input.label,
          seats: input.seats ?? null,
          area_id: input.areaId ?? null,
          qr_token: newQrToken(),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch((error: unknown) => {
          throw isUniqueViolation(error) ? labelTaken() : error;
        });
      await this.event(trx, staff, {
        type: 'table.created',
        entityId: table.id,
        entityName: input.label,
        after: { label: input.label, seats: input.seats ?? null },
      });
      return this.load(trx, staff.venueId);
    });
  }

  /** "S" 1..10 → S1…S10. Labels that already exist are skipped. */
  createTables(staff: StaffClaims, input: CreateTablesBulkInput): Promise<VenueSpace> {
    return this.inVenue(staff.venueId, async (trx) => {
      if (input.areaId) await this.requireArea(trx, input.areaId);
      const labels = Array.from(
        { length: input.to - input.from + 1 },
        (_, i) => `${input.prefix}${input.from + i}`,
      );
      const created = await trx
        .insertInto('core.tables')
        .values(
          labels.map((label) => ({
            venue_id: staff.venueId,
            label,
            seats: input.seats ?? null,
            area_id: input.areaId ?? null,
            qr_token: newQrToken(),
          })),
        )
        .onConflict((oc) => oc.columns(['venue_id', 'label']).doNothing())
        .returning(['id', 'label'])
        .execute();
      for (const table of created) {
        await this.event(trx, staff, {
          type: 'table.created',
          entityId: table.id,
          entityName: table.label,
          after: { label: table.label, seats: input.seats ?? null },
        });
      }
      return this.load(trx, staff.venueId);
    });
  }

  updateTable(staff: StaffClaims, id: string, input: UpdateTableRequest): Promise<VenueSpace> {
    return this.inVenue(staff.venueId, async (trx) => {
      const table = await trx
        .selectFrom('core.tables')
        .select(['label', 'seats', 'area_id', 'is_active'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!table) throw notFound('Table not found');
      if (input.areaId) await this.requireArea(trx, input.areaId);
      const changes = defined({
        label: input.label,
        seats: input.seats,
        area_id: input.areaId,
        is_active: input.isActive,
      });
      if (Object.keys(changes).length) {
        await trx
          .updateTable('core.tables')
          .set(changes)
          .where('id', '=', id)
          .execute()
          .catch((error: unknown) => {
            throw isUniqueViolation(error) ? labelTaken() : error;
          });
        await this.event(trx, staff, {
          type: 'table.updated',
          entityId: id,
          entityName: input.label ?? table.label,
          before: pick(table, changes),
          after: changes,
        });
      }
      return this.load(trx, staff.venueId);
    });
  }

  /** Past orders keep their own snapshot of the table label. */
  deleteTable(staff: StaffClaims, id: string): Promise<VenueSpace> {
    return this.inVenue(staff.venueId, async (trx) => {
      const table = await trx
        .selectFrom('core.tables')
        .select('label')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!table) throw notFound('Table not found');
      await trx.deleteFrom('core.tables').where('id', '=', id).execute();
      await this.event(trx, staff, {
        type: 'table.deleted',
        entityId: id,
        entityName: table.label,
      });
      return this.load(trx, staff.venueId);
    });
  }

  /** FR-SEF-16: a new token makes the printed code stop working at once. */
  rotateQr(staff: StaffClaims, id: string): Promise<VenueSpace> {
    return this.inVenue(staff.venueId, async (trx) => {
      const table = await trx
        .selectFrom('core.tables')
        .select(['label', 'qr_version'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!table) throw notFound('Table not found');
      await trx
        .updateTable('core.tables')
        .set({ qr_token: newQrToken(), qr_version: table.qr_version + 1 })
        .where('id', '=', id)
        .execute();
      await this.event(trx, staff, {
        type: 'table.qr_rotated',
        entityId: id,
        entityName: table.label,
        before: { qr_version: table.qr_version },
        after: { qr_version: table.qr_version + 1 },
      });
      return this.load(trx, staff.venueId);
    });
  }

  private inVenue<T>(venueId: string, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId, isSuperAdmin: false }, fn);
  }

  private async requireArea(trx: Tx, id: string): Promise<void> {
    const area = await trx
      .selectFrom('core.areas')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!area) throw notFound('Area not found');
  }

  private async event(
    trx: Tx,
    staff: StaffClaims,
    event: Omit<SpaceEvent, 'venueId' | 'venueName' | 'actor'>,
  ): Promise<void> {
    const venue = await trx
      .selectFrom('core.venues')
      .select('name')
      .where('id', '=', staff.venueId)
      .executeTakeFirstOrThrow();
    await publish(trx, {
      ...event,
      venueId: staff.venueId,
      venueName: venue.name,
      actor: { id: staff.userId, label: staff.name },
    });
  }

  private async load(trx: Tx, venueId: string): Promise<VenueSpace> {
    const venue = await trx
      .selectFrom('core.venues')
      .select('slug')
      .where('id', '=', venueId)
      .executeTakeFirstOrThrow();
    const areas = await trx
      .selectFrom('core.areas')
      .select(['id', 'name', 'sort_order', 'is_active'])
      .where('venue_id', '=', venueId)
      .orderBy('sort_order')
      .orderBy('name')
      .execute();
    const tables = await trx
      .selectFrom('core.tables')
      .select(['id', 'area_id', 'label', 'seats', 'is_active', 'qr_version', 'qr_token'])
      .where('venue_id', '=', venueId)
      .execute();
    // Natural order: S2 before S10.
    const collator = new Intl.Collator('bs', { numeric: true, sensitivity: 'base' });
    tables.sort((a, b) => collator.compare(a.label, b.label));
    return {
      areas: areas.map((a) => ({
        id: a.id,
        name: a.name,
        sortOrder: a.sort_order,
        isActive: a.is_active,
      })),
      tables: tables.map((t) => ({
        id: t.id,
        areaId: t.area_id,
        label: t.label,
        seats: t.seats,
        isActive: t.is_active,
        qrVersion: t.qr_version,
        qrUrl: this.config.guestUrlTemplate
          .replace('{slug}', venue.slug)
          .replace('{token}', t.qr_token),
      })),
    };
  }
}

/** Drops keys whose value is undefined ("not sent"). */
function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

function pick(
  row: Record<string, unknown>,
  keys: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.keys(keys).map((k) => [k, row[k]]));
}
