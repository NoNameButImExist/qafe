import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { TenantDatabase } from '@qafe/db';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

/** The billing module's pool, logged in as svc_billing (sees only the billing schema). */
@Injectable()
export class BillingDatabase extends TenantDatabase implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: 'svc_billing',
      password: config.db.billingPassword,
      applicationName: 'qafe-api:billing',
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}
