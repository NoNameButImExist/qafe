import { Controller, Get, Header } from '@nestjs/common';
import type { PlatformTheme } from '@qafe/contracts';
import { Public } from '../../../common/auth/auth.guard.js';
import { PlatformSettingsService } from './platform-settings.service.js';

/** What every app may read before signing in: the colour theme (sign-in pages use it too). */
@Controller('platform')
export class PlatformController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get('theme')
  @Public()
  // Not cached: a switch in the admin must reach open apps on their next check.
  @Header('Cache-Control', 'no-cache')
  theme(): Promise<PlatformTheme> {
    return this.settings.theme();
  }
}
