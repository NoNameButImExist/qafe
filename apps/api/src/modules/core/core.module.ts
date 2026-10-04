import { Module } from '@nestjs/common';
import { TokenSigner } from '@qafe/auth';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { AdminUsersService } from './admin/admin-users.service.js';
import { AdminVenuesService } from './admin/admin-venues.service.js';
import { AdminController } from './admin/admin.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService, TOKEN_SIGNER } from './auth/auth.service.js';
import { LoginThrottle } from './auth/login-throttle.js';
import { MfaService } from './auth/mfa.service.js';
import { CoreDatabase } from './core.database.js';
import { CoreHealth } from './core.health.js';
import { PublicVenuesController } from './venues/public-venues.controller.js';
import { VenueDirectory } from './venue-directory.js';
import { VenueSettingsController } from './venue/venue-settings.controller.js';
import {
  VenueSpaceController,
  VenueStaffController,
  VenueStaffDevicesController,
} from './venue/venue-space-staff.controller.js';
import { SpaceService } from './space/space.service.js';
import { MonitoringService } from './admin/monitoring.service.js';
import { StaffDevicesService } from './staff/staff-devices.service.js';
import { StaffService } from './staff/staff.service.js';
import { VenueSettingsService } from './venue/venue-settings.service.js';

/** Venues, staff, roles, spaces and authentication (schema "core"). */
@Module({
  controllers: [
    AuthController,
    AdminController,
    PublicVenuesController,
    VenueSettingsController,
    VenueSpaceController,
    VenueStaffController,
    VenueStaffDevicesController,
  ],
  providers: [
    CoreDatabase,
    CoreHealth,
    LoginThrottle,
    MfaService,
    AuthService,
    AdminVenuesService,
    AdminUsersService,
    MonitoringService,
    VenueSettingsService,
    SpaceService,
    StaffService,
    StaffDevicesService,
    VenueDirectory,
    {
      provide: TOKEN_SIGNER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        TokenSigner.fromPem(
          config.auth.privateKeyPem,
          config.auth.publicKeyPem,
          config.auth.issuer,
        ),
    },
  ],
  exports: [CoreHealth, VenueDirectory],
})
export class CoreModule {}
