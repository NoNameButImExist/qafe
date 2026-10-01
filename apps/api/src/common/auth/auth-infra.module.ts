import { Global, Module } from '@nestjs/common';
import { TokenVerifier } from '@qafe/auth';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { AuthGuard, PlatformAdminGuard, StaffGuard, TOKEN_VERIFIER } from './auth.guard.js';

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
  ],
  exports: [TOKEN_VERIFIER, AuthGuard, PlatformAdminGuard, StaffGuard],
})
export class AuthInfraModule {}
