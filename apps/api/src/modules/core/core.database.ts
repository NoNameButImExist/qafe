import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { TenantDatabase } from '@qafe/db';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

/** The core module's own connection pool, logged in as svc_core (sees only the core schema). */
@Injectable()
export class CoreDatabase extends TenantDatabase implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: 'svc_core',
      password: config.db.corePassword,
      applicationName: 'qafe-api:core',
      max: config.db.poolMax,
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}
