import { Module } from '@nestjs/common';
import { ReportingDatabase } from './reporting.database.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Sales facts and reports (schema "reporting"). Facts are written by the worker. */
@Module({
  controllers: [ReportsController],
  providers: [ReportingDatabase, ReportsService],
})
export class ReportingModule {}
