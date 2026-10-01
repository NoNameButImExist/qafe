import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ReportExportQuery,
  ReportQuery,
  type ReportExportQuery as ExportQuery,
  type ReportSummary,
} from '@qafe/contracts';
import type { FastifyReply } from 'fastify';
import {
  CurrentStaff,
  RequirePermission,
  StaffGuard,
  type StaffClaims,
} from '../../common/auth/auth.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { reportTable, toCsv, toXlsx } from './reports-export.js';
import { ReportsService } from './reports.service.js';

/** Sales reports of the member's venue (FR-SEF-24, FR-SEF-25). */
@Controller('reports')
@UseGuards(StaffGuard)
@RequirePermission('reports.view')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(
    @CurrentStaff() staff: StaffClaims,
    @Query(new ZodPipe(ReportQuery)) query: ReportQuery,
  ): Promise<ReportSummary> {
    return this.reports.summary(staff.venueId, query.from, query.to);
  }

  /** CSV (one table) or Excel (every table on its own sheet). PDF is the panel's print view. */
  @Get('export')
  async export(
    @CurrentStaff() staff: StaffClaims,
    @Query(new ZodPipe(ReportExportQuery)) query: ExportQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | string> {
    const summary = await this.reports.summary(staff.venueId, query.from, query.to);
    const name = `qafe-${query.lang === 'en' ? 'report' : 'izvjestaj'}-${query.from}_${query.to}${query.dimension ? `-${query.dimension}` : ''}`;
    if (query.format === 'csv') {
      void reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${name}.csv"`);
      return toCsv(reportTable(summary, query.dimension ?? 'day', query.lang), query.lang);
    }
    void reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${name}.xlsx"`);
    return toXlsx(summary, query.lang, query.dimension);
  }
}
