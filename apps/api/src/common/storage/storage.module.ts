import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { createStorage, STORAGE } from './storage.js';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => createStorage(c.storage),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
