import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { TenantDatabase } from '@qafe/db';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

/** The reporting module's pool, logged in as svc_reporting (sees only the reporting schema). */
@Injectable()
export class ReportingDatabase extends TenantDatabase implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: 'svc_reporting',
      password: config.db.reportingPassword,
      applicationName: 'qafe-api:reporting',
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}
