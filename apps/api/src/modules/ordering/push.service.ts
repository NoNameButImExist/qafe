import { Inject, Injectable } from '@nestjs/common';
import type { PushConfig, PushSubscriptionRequest } from '@qafe/contracts';
import type { StaffClaims } from '../../common/auth/auth.guard.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { OrderingDatabase } from './ordering.database.js';

/**
 * Web Push subscriptions of staff devices (FR-KON-05). The worker sends the notifications
 * from the ordering outbox; the API only stores where to send them.
 */
@Injectable()
export class PushService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: OrderingDatabase,
  ) {}

  /** Null when VAPID keys are not configured: the app then hides the push switch. */
  settings(): PushConfig {
    return { publicKey: this.config.push.vapidPublicKey };
  }

  /** One row per browser endpoint; signing in as someone else on the device moves it. */
  async subscribe(staff: StaffClaims, input: PushSubscriptionRequest): Promise<void> {
    await this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, (trx) =>
      trx
        .insertInto('ordering.push_subscriptions')
        .values({
          venue_id: staff.venueId,
          member_id: staff.memberId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
        })
        .onConflict((oc) =>
          oc.column('endpoint').doUpdateSet({
            member_id: staff.memberId,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
          }),
        )
        .execute(),
    );
  }

  async unsubscribe(staff: StaffClaims, endpoint: string): Promise<void> {
    await this.db.withTenant({ venueId: staff.venueId, isSuperAdmin: false }, (trx) =>
      trx.deleteFrom('ordering.push_subscriptions').where('endpoint', '=', endpoint).execute(),
    );
  }
}
