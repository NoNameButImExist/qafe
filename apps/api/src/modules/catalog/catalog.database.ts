import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { TenantDatabase } from '@qafe/db';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

/** The catalog module's pool, logged in as svc_catalog (sees only the catalog schema). */
@Injectable()
export class CatalogDatabase extends TenantDatabase implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: 'svc_catalog',
      password: config.db.catalogPassword,
      applicationName: 'qafe-api:catalog',
      max: config.db.poolMax,
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}
