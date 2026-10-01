import { Module, type DynamicModule } from '@nestjs/common';
import { AuthInfraModule } from './common/auth/auth-infra.module.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { HealthController } from './health/health.controller.js';
import { RedisModule } from './common/redis/redis.module.js';
import { StorageModule } from './common/storage/storage.module.js';
import { AuditModule } from './modules/audit/index.js';
import { BillingModule } from './modules/billing/index.js';
import { CatalogModule } from './modules/catalog/index.js';
import { CoreModule } from './modules/core/index.js';
import { OrderingModule } from './modules/ordering/index.js';
import { ReportingModule } from './modules/reporting/index.js';

@Module({})
class ConfigModule {}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        {
          module: ConfigModule,
          global: true,
          providers: [{ provide: APP_CONFIG, useValue: config }],
          exports: [APP_CONFIG],
        },
        AuthInfraModule,
        RedisModule,
        StorageModule,
        CoreModule,
        AuditModule,
        CatalogModule,
        OrderingModule,
        BillingModule,
        ReportingModule,
      ],
      controllers: [HealthController],
    };
  }
}
