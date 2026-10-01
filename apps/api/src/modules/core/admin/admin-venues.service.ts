import { HttpStatus, Injectable } from '@nestjs/common';
import { hashPassword } from '@qafe/auth';
import {
  ErrorCode,
  type AdminStats,
  type CreateVenueInput,
  type CreateVenueResponse,
  type PlatformModule,
  type UpdateVenueInput,
  type VenueDetail,
  type VenueList,
  type VenueListParams,
  type VenueModuleState,
  type VenueStatus,
  type VenueSummary,
} from '@qafe/contracts';
import type { DB, Tx } from '@qafe/db';
import { sql, type SelectQueryBuilder } from 'kysely';
import { ApiException, notFound } from '../../../common/errors.js';
import { CoreDatabase } from '../core.database.js';
import { actorOf, escapeLike, publish, SUPER_ADMIN } from '../outbox.js';

@Injectable()
export class AdminVenuesService {
  constructor(private readonly db: CoreDatabase) {}

  /** FR-ADM-05: search by name, slug or city; filter by status and city. */
  async list(query: VenueListParams): Promise<VenueList> {
    return this.db.withTenant(SUPER_ADMIN, async (trx) => {
      let base = trx.selectFrom('core.venues as v').where('v.deleted_at', 'is', null);
      if (query.search) {
        const pattern = `%${escapeLike(query.search)}%`;
        base = base.where((eb) =>
          eb.or([
            eb('v.name', 'ilike', pattern),
            eb('v.slug', 'ilike', pattern),
            eb('v.city', 'ilike', pattern),
          ]),
        );
      }
      if (query.status) base = base.where('v.status', '=', query.status);
      if (query.city) base = base.where(sql<string>`lower(v.city)`, '=', query.city.toLowerCase());

      const { total } = await base
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirstOrThrow();
      const rows = await summaries(base)
        .orderBy('v.created_at', 'desc')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute();

      return {
        items: rows.map(toSummary),
        total: Number(total),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /** Distinct cities, for the list filter. */
  cities(): Promise<string[]> {
    return this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const rows = await trx
        .selectFrom('core.venues')
        .select('city')
        .distinct()
        .where('city', 'is not', null)
        .where('deleted_at', 'is', null)
        .orderBy('city')
        .execute();
      return rows.map((r) => r.city).filter((c): c is string => c !== null);
    });
  }

  async stats(): Promise<AdminStats> {
    return this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const byStatus = await trx
        .selectFrom('core.venues')
        .select(['status', (eb) => eb.fn.countAll<string>().as('n')])
        .where('deleted_at', 'is', null)
        .groupBy('status')
        .execute();
      const count = (status: VenueStatus) =>
        Number(byStatus.find((r) => r.status === status)?.n ?? 0);
      const { staff } = await trx
        .selectFrom('core.venue_members')
        .select((eb) => eb.fn.countAll<string>().as('staff'))
        .where('is_active', '=', true)
        .executeTakeFirstOrThrow();
      const { tables } = await trx
        .selectFrom('core.tables')
        .select((eb) => eb.fn.countAll<string>().as('tables'))
        .where('is_active', '=', true)
        .executeTakeFirstOrThrow();
      const recent = await summaries(
        trx.selectFrom('core.venues as v').where('v.deleted_at', 'is', null),
      )
        .orderBy('v.created_at', 'desc')
        .limit(5)
        .execute();

      const venues = {
        pending: count('pending'),
        active: count('active'),
        suspended: count('suspended'),
        closed: count('closed'),
      };
      return {
        venues: { total: Object.values(venues).reduce((a, b) => a + b, 0), ...venues },
        venueStaff: Number(staff),
        tables: Number(tables),
        recentVenues: recent.map(toSummary),
      };
    });
  }

  /**
   * FR-ADM-02/03: creates the venue (status "pending"), its default roles and payment methods,
   * and the owner account with a temporary password that must be changed at first login.
   */
  async create(input: CreateVenueInput, actorId: string): Promise<CreateVenueResponse> {
    const passwordHash = await hashPassword(input.owner.temporaryPassword);

    return this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const taken = await trx
        .selectFrom('core.venues')
        .select('id')
        .where('slug', '=', input.slug)
        .executeTakeFirst();
      if (taken) throw slugTaken();

      const venue = await trx
        .insertInto('core.venues')
        .values({
          slug: input.slug,
          name: input.name,
          legal_name: input.legalName ?? null,
          tax_id: input.taxId ?? null,
          vat_number: input.vatNumber ?? null,
          address: input.address ?? null,
          city: input.city ?? null,
          postal_code: input.postalCode ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          currency: input.currency,
          timezone: input.timezone,
          default_language: input.defaultLanguage,
          created_by: actorId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch((error: unknown) => {
          // Two admins creating the same slug at once.
          if ((error as { code?: string }).code === '23505') throw slugTaken();
          throw error;
        });

      await sql`select core.init_venue(${venue.id}::uuid)`.execute(trx);

      const owner = await trx
        .insertInto('core.users')
        .values({
          password_hash: passwordHash,
          full_name: input.owner.fullName,
          must_change_password: true,
          preferred_language: input.defaultLanguage,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const ownerRole = await trx
        .selectFrom('core.venue_roles')
        .select('id')
        .where('venue_id', '=', venue.id)
        .where('is_owner', '=', true)
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('core.venue_members')
        .values({
          venue_id: venue.id,
          user_id: owner.id,
          role_id: ownerRole.id,
          username: input.owner.username,
          display_name: input.owner.fullName.split(' ')[0] ?? input.owner.fullName,
          created_by: actorId,
        })
        .execute();

      await publish(trx, {
        type: 'venue.created',
        venueId: venue.id,
        venueName: input.name,
        slug: input.slug,
        actor: await actorOf(trx, actorId),
      });

      return {
        venue: await this.summary(trx, venue.id),
        owner: { username: input.owner.username },
      };
    });
  }

  /** FR-ADM-04: a suspended venue stays visible but does not take orders. */
  async updateStatus(venueId: string, status: VenueStatus, actorId: string): Promise<VenueSummary> {
    return this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const current = await trx
        .selectFrom('core.venues')
        .select(['status', 'name'])
        .where('id', '=', venueId)
        .where('deleted_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!current) throw notFound('Venue not found');

      if (current.status !== status) {
        await trx.updateTable('core.venues').set({ status }).where('id', '=', venueId).execute();
        await publish(trx, {
          type: 'venue.status_changed',
          venueId,
          venueName: current.name,
          from: current.status,
          to: status,
          actor: await actorOf(trx, actorId),
        });
      }
      return this.summary(trx, venueId);
    });
  }

  /** Everything the admin sees on the venue page: data, modules and staff. */
  async detail(venueId: string): Promise<VenueDetail> {
    return this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const venue = await trx
        .selectFrom('core.venues')
        .selectAll()
        .where('id', '=', venueId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!venue) throw notFound('Venue not found');

      const staff = await trx
        .selectFrom('core.venue_members as m')
        .innerJoin('core.users as u', 'u.id', 'm.user_id')
        .innerJoin('core.venue_roles as r', 'r.id', 'm.role_id')
        .select([
          'm.id as member_id',
          'u.id as user_id',
          'u.full_name',
          'm.username',
          'r.name as role',
          'r.is_owner',
          'm.is_active',
          'u.is_active as user_active',
          'u.last_login_at',
        ])
        .where('m.venue_id', '=', venueId)
        .orderBy('r.is_owner', 'desc')
        .orderBy('u.full_name')
        .execute();

      return {
        ...(await this.summary(trx, venueId)),
        legalName: venue.legal_name,
        taxId: venue.tax_id,
        vatNumber: venue.vat_number,
        address: venue.address,
        postalCode: venue.postal_code,
        phone: venue.phone,
        email: venue.email,
        currency: venue.currency.trim(),
        timezone: venue.timezone,
        defaultLanguage: venue.default_language,
        updatedAt: venue.updated_at.toISOString(),
        modules: await this.modulesOf(trx, venueId),
        staff: staff.map((m) => ({
          memberId: m.member_id,
          userId: m.user_id,
          fullName: m.full_name,
          username: m.username,
          role: m.role,
          isOwner: m.is_owner,
          isActive: m.is_active,
          userActive: m.user_active,
          lastLoginAt: m.last_login_at?.toISOString() ?? null,
        })),
      };
    });
  }

  /** FR-ADM-04: edits venue data. Only changed fields are written and reported to the audit log. */
  async update(venueId: string, input: UpdateVenueInput, actorId: string): Promise<VenueDetail> {
    await this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const current = await trx
        .selectFrom('core.venues')
        .selectAll()
        .where('id', '=', venueId)
        .where('deleted_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!current) throw notFound('Venue not found');

      const columns = {
        name: input.name,
        legal_name: input.legalName,
        tax_id: input.taxId,
        vat_number: input.vatNumber,
        address: input.address,
        city: input.city,
        postal_code: input.postalCode,
        phone: input.phone,
        email: input.email,
        currency: input.currency,
        timezone: input.timezone,
        default_language: input.defaultLanguage,
      } as const;

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const changes: Record<string, string | null> = {};
      for (const [column, value] of Object.entries(columns) as [
        keyof typeof columns,
        string | null | undefined,
      ][]) {
        if (value === undefined) continue;
        const old = typeof current[column] === 'string' ? current[column].trim() : current[column];
        if (old === value) continue;
        before[column] = old;
        after[column] = value;
        changes[column] = value;
      }
      if (Object.keys(changes).length === 0) return;

      await trx.updateTable('core.venues').set(changes).where('id', '=', venueId).execute();
      await publish(trx, {
        type: 'venue.updated',
        venueId,
        venueName: changes.name ?? current.name,
        before,
        after,
        actor: await actorOf(trx, actorId),
      });
    });
    return this.detail(venueId);
  }

  /** FR-ADM-06: the module catalog and the venues that use each module. */
  async modules(): Promise<PlatformModule[]> {
    return this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const catalog = await trx.selectFrom('core.modules').selectAll().orderBy('name').execute();
      const usage = await trx
        .selectFrom('core.venue_modules as vm')
        .innerJoin('core.venues as v', 'v.id', 'vm.venue_id')
        .select(['vm.module_code', 'v.id', 'v.name', 'v.slug', 'v.status'])
        .where('v.deleted_at', 'is', null)
        .orderBy('v.name')
        .execute();
      return catalog.map((m) => ({
        code: m.code,
        name: m.name,
        description: m.description,
        venues: usage
          .filter((u) => u.module_code === m.code)
          .map((u) => ({ id: u.id, name: u.name, slug: u.slug, status: u.status })),
      }));
    });
  }

  /** FR-ADM-06: a disabled module is hidden from the owner and staff of that venue. */
  async setModule(
    venueId: string,
    code: string,
    enabled: boolean,
    actorId: string,
  ): Promise<VenueModuleState[]> {
    return this.db.withTenant(SUPER_ADMIN, async (trx) => {
      const venue = await trx
        .selectFrom('core.venues')
        .select('name')
        .where('id', '=', venueId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!venue) throw notFound('Venue not found');
      const known = await trx
        .selectFrom('core.modules')
        .select('code')
        .where('code', '=', code)
        .executeTakeFirst();
      if (!known) throw notFound('Unknown module');

      const changed = enabled
        ? await trx
            .insertInto('core.venue_modules')
            .values({ venue_id: venueId, module_code: code, enabled_by: actorId })
            .onConflict((oc) => oc.columns(['venue_id', 'module_code']).doNothing())
            .executeTakeFirst()
        : await trx
            .deleteFrom('core.venue_modules')
            .where('venue_id', '=', venueId)
            .where('module_code', '=', code)
            .executeTakeFirst();
      const rows =
        'numInsertedOrUpdatedRows' in changed
          ? changed.numInsertedOrUpdatedRows
          : changed.numDeletedRows;

      if (rows && rows > 0n) {
        await publish(trx, {
          type: enabled ? 'venue.module_enabled' : 'venue.module_disabled',
          venueId,
          venueName: venue.name,
          module: code,
          actor: await actorOf(trx, actorId),
        });
      }
      return this.modulesOf(trx, venueId);
    });
  }

  private async modulesOf(trx: Tx, venueId: string): Promise<VenueModuleState[]> {
    const rows = await trx
      .selectFrom('core.modules as m')
      .leftJoin('core.venue_modules as vm', (join) =>
        join.onRef('vm.module_code', '=', 'm.code').on('vm.venue_id', '=', venueId),
      )
      .select(['m.code', 'm.name', 'm.description', 'vm.enabled_at'])
      .orderBy('m.name')
      .execute();
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      enabled: r.enabled_at !== null,
      enabledAt: r.enabled_at?.toISOString() ?? null,
    }));
  }

  private async summary(trx: Tx, venueId: string): Promise<VenueSummary> {
    const row = await summaries(trx.selectFrom('core.venues as v'))
      .where('v.id', '=', venueId)
      .executeTakeFirstOrThrow();
    return toSummary(row);
  }
}

// A query over `core.venues as v` with nothing selected yet.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type VenueQuery = SelectQueryBuilder<DB & { v: DB['core.venues'] }, 'v', {}>;

/** Adds the summary columns, including active staff and table counts. */
function summaries(query: VenueQuery) {
  return query.select((eb) => [
    'v.id',
    'v.slug',
    'v.name',
    'v.city',
    'v.status',
    'v.created_at',
    eb
      .selectFrom('core.venue_members as m')
      .whereRef('m.venue_id', '=', 'v.id')
      .where('m.is_active', '=', true)
      .select((e) => e.fn.countAll<string>().as('n'))
      .as('staff_count'),
    eb
      .selectFrom('core.tables as t')
      .whereRef('t.venue_id', '=', 'v.id')
      .where('t.is_active', '=', true)
      .select((e) => e.fn.countAll<string>().as('n'))
      .as('table_count'),
  ]);
}

type SummaryRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  status: VenueStatus;
  created_at: Date;
  staff_count: string | null;
  table_count: string | null;
};

function toSummary(row: SummaryRow): VenueSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    status: row.status,
    staffCount: Number(row.staff_count ?? 0),
    tableCount: Number(row.table_count ?? 0),
    createdAt: row.created_at.toISOString(),
  };
}

function slugTaken() {
  return new ApiException(HttpStatus.CONFLICT, ErrorCode.slugTaken, 'This slug is already in use');
}
