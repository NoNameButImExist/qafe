// Development seed: platform admin + "Demo kafić" (owner, waiter, two tables, small menu).
//   pnpm db:seed
// Runs as the admin role (superuser, bypasses RLS). Safe to run repeatedly: the admin is
// upserted (password reset to SEED_ADMIN_PASSWORD) and the demo venue is created only once.

import { randomBytes } from 'node:crypto';
import { hashPassword } from '@qafe/auth';
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { DB } from '../src/generated/db.js';

const DEMO_SLUG = 'demo-kafic';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('The development seed must not run in production.');
}

const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: env('DATABASE_ADMIN_URL'), max: 1 }),
  }),
});

/** QR token with 192 bits of randomness (NFR-10 asks for at least 128). */
const qrToken = () => randomBytes(24).toString('base64url');

async function seedAdmin(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  await db
    .insertInto('core.users')
    .values({
      email,
      password_hash: passwordHash,
      full_name: 'Qafe Admin',
      platform_role: 'super_admin',
      must_change_password: false,
    })
    .onConflict((oc) =>
      oc.column('email').doUpdateSet({
        password_hash: passwordHash,
        platform_role: 'super_admin',
        is_active: true,
        deleted_at: null,
      }),
    )
    .execute();
}

async function createStaff(
  trx: Transaction<DB>,
  venueId: string,
  roleName: string,
  username: string,
  fullName: string,
  passwordHash: string,
) {
  const user = await trx
    .insertInto('core.users')
    .values({ password_hash: passwordHash, full_name: fullName, must_change_password: false })
    .returning('id')
    .executeTakeFirstOrThrow();
  const role = await trx
    .selectFrom('core.venue_roles')
    .select('id')
    .where('venue_id', '=', venueId)
    .where('name', '=', roleName)
    .executeTakeFirstOrThrow();
  await trx
    .insertInto('core.venue_members')
    .values({
      venue_id: venueId,
      user_id: user.id,
      role_id: role.id,
      username,
      display_name: fullName.split(' ')[0] ?? fullName,
    })
    .execute();
}

async function seedDemoVenue(
  staffPassword: string,
): Promise<{ created: boolean; tables: string[] }> {
  const existing = await db
    .selectFrom('core.venues')
    .select('id')
    .where('slug', '=', DEMO_SLUG)
    .executeTakeFirst();
  if (existing) return { created: false, tables: [] };

  const staffHash = await hashPassword(staffPassword);

  return db.transaction().execute(async (trx) => {
    const venue = await trx
      .insertInto('core.venues')
      .values({
        slug: DEMO_SLUG,
        name: 'Demo kafić',
        legal_name: 'Demo kafić d.o.o.',
        tax_id: '4200000000000',
        address: 'Ferhadija 1',
        city: 'Sarajevo',
        postal_code: '71000',
        phone: '+387 33 000 000',
        email: 'demo@qafe.ba',
        status: 'active',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const venueId = venue.id;

    // Default roles (Šef, Konobar) and payment methods, as the core module does (FR-ADM-03).
    await sql`select core.init_venue(${venueId}::uuid)`.execute(trx);

    await createStaff(trx, venueId, 'Šef', 'sef', 'Amra Hodžić', staffHash);
    await createStaff(trx, venueId, 'Konobar', 'konobar', 'Kenan Mehić', staffHash);

    const area = await trx
      .insertInto('core.areas')
      .values({ venue_id: venueId, name: 'Sala' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const tables = await trx
      .insertInto('core.tables')
      .values(
        ['S1', 'S2'].map((label) => ({
          venue_id: venueId,
          area_id: area.id,
          label,
          seats: 4,
          qr_token: qrToken(),
        })),
      )
      .returning(['label', 'qr_token'])
      .execute();

    const menu = await trx
      .insertInto('catalog.menus')
      .values({ venue_id: venueId, name: 'Glavni meni' })
      .returning('id')
      .executeTakeFirstOrThrow();

    const category = (name: string, sort_order: number) =>
      trx
        .insertInto('catalog.categories')
        .values({ venue_id: venueId, menu_id: menu.id, name, sort_order })
        .returning('id')
        .executeTakeFirstOrThrow();
    const hot = await category('Topli napici', 1);
    const cold = await category('Sokovi', 2);

    const items = await trx
      .insertInto('catalog.items')
      .values(
        [
          { category_id: hot.id, name: 'Espresso', price: '2.00', sort_order: 1 },
          { category_id: hot.id, name: 'Kafa s mlijekom', price: '2.50', sort_order: 2 },
          { category_id: hot.id, name: 'Čaj', price: '2.00', sort_order: 3 },
          {
            category_id: cold.id,
            name: 'Coca-Cola',
            volume_label: '0,33 l',
            price: '3.50',
            sort_order: 1,
          },
          {
            category_id: cold.id,
            name: 'Cijeđena narandža',
            volume_label: '0,2 l',
            price: '4.50',
            sort_order: 2,
          },
        ].map((item) => ({ ...item, venue_id: venueId })),
      )
      .returning(['id', 'name'])
      .execute();

    const milk = await trx
      .insertInto('catalog.modifier_groups')
      .values({ venue_id: venueId, name: 'Mlijeko', min_select: 0, max_select: 1 })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('catalog.modifier_options')
      .values([
        {
          venue_id: venueId,
          group_id: milk.id,
          name: 'Kravlje',
          price_delta: '0',
          is_default: true,
          sort_order: 1,
        },
        {
          venue_id: venueId,
          group_id: milk.id,
          name: 'Zobeno',
          price_delta: '0.50',
          sort_order: 2,
        },
      ])
      .execute();
    await trx
      .insertInto('catalog.item_modifier_groups')
      .values(
        items
          .filter((i) => i.name === 'Espresso' || i.name === 'Kafa s mlijekom')
          .map((i) => ({ venue_id: venueId, item_id: i.id, group_id: milk.id })),
      )
      .execute();

    return { created: true, tables: tables.map((t) => `${t.label}: ${t.qr_token}`) };
  });
}

try {
  const adminEmail = env('SEED_ADMIN_EMAIL');
  await seedAdmin(adminEmail, env('SEED_ADMIN_PASSWORD'));
  console.log(`✓ Platform admin: ${adminEmail} (password from SEED_ADMIN_PASSWORD)`);

  const demo = await seedDemoVenue(env('SEED_STAFF_PASSWORD'));
  if (demo.created) {
    console.log(
      `✓ Venue "${DEMO_SLUG}": staff "sef" and "konobar" (password from SEED_STAFF_PASSWORD)`,
    );
    console.log(`  QR tokens: ${demo.tables.join(', ')}`);
  } else {
    console.log(
      `• Venue "${DEMO_SLUG}" already exists, left unchanged (pnpm db:reset to start over)`,
    );
  }
} finally {
  await db.destroy();
}
