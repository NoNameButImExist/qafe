import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // Liveness only: the process is up. Readiness (DB, Redis) is added in phase 3.
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
