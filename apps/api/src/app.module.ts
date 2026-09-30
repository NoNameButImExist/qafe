import { Module, type DynamicModule } from '@nestjs/common';
import { AuthInfraModule } from './common/auth/auth-infra.module.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { HealthController } from './health/health.controller.js';
import { StorageModule } from './common/storage/storage.module.js';
import { AuditModule } from './modules/audit/index.js';
import { CatalogModule } from './modules/catalog/index.js';
import { CoreModule } from './modules/core/index.js';

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
        StorageModule,
        CoreModule,
        AuditModule,
        CatalogModule,
      ],
      controllers: [HealthController],
    };
  }
}
