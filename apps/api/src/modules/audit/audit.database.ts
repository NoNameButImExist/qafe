import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { TenantDatabase } from '@qafe/db';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

/** The audit module's pool, logged in as svc_audit (reads and appends audit.audit_logs only). */
@Injectable()
export class AuditDatabase extends TenantDatabase implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: 'svc_audit',
      password: config.db.auditPassword,
      applicationName: 'qafe-api:audit',
      max: Math.min(4, config.db.poolMax),
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}
