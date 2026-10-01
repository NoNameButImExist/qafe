import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { TenantDatabase } from '@qafe/db';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

/** The ordering module's pool, logged in as svc_ordering (sees only the ordering schema). */
@Injectable()
export class OrderingDatabase extends TenantDatabase implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: 'svc_ordering',
      password: config.db.orderingPassword,
      applicationName: 'qafe-api:ordering',
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}
