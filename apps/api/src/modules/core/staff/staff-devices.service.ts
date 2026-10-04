import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type SpaceEvent, type StaffDevice } from '@qafe/contracts';
import type { Tx } from '@qafe/db';
import { randomBytes } from 'node:crypto';
import type { StaffClaims } from '../../../common/auth/auth.guard.js';
import { ApiException } from '../../../common/errors.js';
import { hashDeviceToken } from '../auth/auth.service.js';
import { CoreDatabase } from '../core.database.js';
import { publish } from '../outbox.js';

/**
 * Shared devices of a venue for PIN sign-in (FR-KON-01): the owner links the device in hand
 * (the token goes to it as a cookie, only its hash is stored), lists them and revokes them.
 */
@Injectable()
export class StaffDevicesService {
  constructor(private readonly db: CoreDatabase) {}

  async link(staff: StaffClaims, name: string): Promise<{ device: StaffDevice; token: string }> {
    // 256 bits: the cookie alone opens the name list of the venue.
    const token = randomBytes(32).toString('base64url');
    return this.inVenue(staff.venueId, async (trx) => {
      const row = await trx
        .insertInto('core.staff_devices')
        .values({
          venue_id: staff.venueId,
          name,
          token_hash: hashDeviceToken(token),
          created_by: staff.memberId,
        })
        .returning(['id', 'name', 'created_at', 'last_used_at'])
        .executeTakeFirstOrThrow();
      await this.event(trx, staff, 'staff_device.linked', row.id, row.name);
      return { device: toDevice(row), token };
    });
  }

  list(staff: StaffClaims): Promise<StaffDevice[]> {
    return this.inVenue(staff.venueId, async (trx) => {
      const rows = await trx
        .selectFrom('core.staff_devices')
        .select(['id', 'name', 'created_at', 'last_used_at'])
        .where('revoked_at', 'is', null)
        .orderBy('created_at')
        .execute();
      return rows.map(toDevice);
    });
  }

  /** The device can no longer show the name list or sign anyone in. */
  revoke(staff: StaffClaims, id: string): Promise<void> {
    return this.inVenue(staff.venueId, async (trx) => {
      const row = await trx
        .updateTable('core.staff_devices')
        .set({ revoked_at: new Date() })
        .where('id', '=', id)
        .where('revoked_at', 'is', null)
        .returning(['id', 'name'])
        .executeTakeFirst();
      if (!row) {
        throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.notFound, 'Device not found');
      }
      await this.event(trx, staff, 'staff_device.revoked', row.id, row.name);
    });
  }

  private inVenue<T>(venueId: string, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant({ venueId, isSuperAdmin: false }, fn);
  }

  private async event(
    trx: Tx,
    staff: StaffClaims,
    type: Extract<SpaceEvent['type'], `staff_device.${string}`>,
    id: string,
    name: string,
  ): Promise<void> {
    const venue = await trx
      .selectFrom('core.venues')
      .select('name')
      .where('id', '=', staff.venueId)
      .executeTakeFirstOrThrow();
    await publish(trx, {
      type,
      venueId: staff.venueId,
      venueName: venue.name,
      entityId: id,
      entityName: name,
      actor: { id: staff.userId, label: staff.name },
    });
  }
}

function toDevice(row: {
  id: string;
  name: string;
  created_at: Date;
  last_used_at: Date | null;
}): StaffDevice {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}
