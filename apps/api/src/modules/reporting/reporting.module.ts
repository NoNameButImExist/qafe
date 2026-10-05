import { Module } from '@nestjs/common';
import { CoreModule } from '../core/index.js';
import { MyDayController } from './my-day.controller.js';
import { ReportingDatabase } from './reporting.database.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Sales facts and reports (schema "reporting"). Facts are written by the worker. */
@Module({
  imports: [CoreModule],
  controllers: [ReportsController, MyDayController],
  providers: [ReportingDatabase, ReportsService],
})
export class ReportingModule {}
