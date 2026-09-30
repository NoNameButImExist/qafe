import { Injectable } from '@nestjs/common';
import { CoreDatabase } from './core.database.js';

/** Readiness of the core module, for /health/ready. */
@Injectable()
export class CoreHealth {
  constructor(private readonly db: CoreDatabase) {}

  database(): Promise<boolean> {
    return this.db.ping();
  }
}
