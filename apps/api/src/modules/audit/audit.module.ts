import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditDatabase } from './audit.database.js';
import { AuditService } from './audit.service.js';

/**
 * Read side of the audit log (schema "audit"). Entries are written by the worker,
 * which relays outbox events from the other modules (append-only, NFR-25).
 */
@Module({
  controllers: [AuditController],
  providers: [AuditDatabase, AuditService],
})
export class AuditModule {}
