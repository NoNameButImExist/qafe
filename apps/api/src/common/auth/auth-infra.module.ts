import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TokenVerifier } from '@qafe/auth';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import {
  AuthGuard,
  PlatformAdminGuard,
  RequireSignIn,
  StaffGuard,
  TOKEN_VERIFIER,
} from './auth.guard.js';

/** Token verification for every module. Only the core module can issue tokens. */
@Global()
@Module({
  providers: [
    {
      provide: TOKEN_VERIFIER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        TokenVerifier.fromPem(config.auth.publicKeyPem, config.auth.issuer),
    },
    AuthGuard,
    PlatformAdminGuard,
    StaffGuard,
    // Closed by default: a route without @Public() needs a valid access token.
    { provide: APP_GUARD, useClass: RequireSignIn },
  ],
  exports: [TOKEN_VERIFIER, AuthGuard, PlatformAdminGuard, StaffGuard],
})
export class AuthInfraModule {}
