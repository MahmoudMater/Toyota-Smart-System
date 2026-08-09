import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('events')
  recent(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    return this.audit.recent(Number.isFinite(n) ? n : 50);
  }
}
