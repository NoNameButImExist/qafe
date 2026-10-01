import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditQuery, type AuditFacets, type AuditList, type AuditParams } from '@qafe/contracts';
import { PlatformAdminGuard } from '../../common/auth/auth.guard.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { AuditService } from './audit.service.js';

@Controller('admin/audit')
@UseGuards(PlatformAdminGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query(new ZodPipe(AuditQuery)) query: AuditParams): Promise<AuditList> {
    return this.audit.list(query);
  }

  @Get('facets')
  facets(): Promise<AuditFacets> {
    return this.audit.facets();
  }
}
