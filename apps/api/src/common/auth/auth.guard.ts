import {
  createParamDecorator,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  can,
  type AccessClaims,
  type PlatformClaims,
  type StaffClaims,
  type TokenVerifier,
} from '@qafe/auth';
import { ErrorCode } from '@qafe/contracts';
import type { FastifyRequest } from 'fastify';
import { ApiException, forbidden, unauthorized } from '../errors.js';

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
const PERMISSIONS = 'qafe:permissions';
const ALLOW_TEMPORARY_PASSWORD = 'qafe:allowTemporaryPassword';

const PUBLIC = 'qafe:public';

/**
 * Marks a route (or a whole controller) as reachable without signing in. Everything else is
 * closed by default (RequireSignIn below), so a forgotten guard cannot open a route.
 */
export const Public = () => SetMetadata(PUBLIC, true);

/**
 * Global guard: every HTTP route needs a valid access token unless it is marked @Public().
 * Controllers still add their own guards (StaffGuard, PlatformAdminGuard) for roles and
 * permissions; this one only makes "closed" the default.
 */
@Injectable()
export class RequireSignIn implements CanActivate {
  constructor(
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw unauthorized();
    try {
      await this.verifier.verify(token);
    } catch {
      throw unauthorized('Invalid or expired token');
    }
    return true;
  }
}

/**
 * Routes a user with a temporary password may still call (who am I, change the password).
 * Everything else answers 403 password_change_required until the password is changed.
 */
export const AllowTemporaryPassword = () => SetMetadata(ALLOW_TEMPORARY_PASSWORD, true);

type AuthedRequest = FastifyRequest & { auth?: AccessClaims };

/** Requires a valid access token (Authorization: Bearer ...). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    protected readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw unauthorized();
    try {
      request.auth = await this.verifier.verify(token);
    } catch {
      throw unauthorized('Invalid or expired token');
    }
    if (
      request.auth.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_TEMPORARY_PASSWORD, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        ErrorCode.passwordChangeRequired,
        'Change the temporary password first',
      );
    }
    return true;
  }
}

/** Requires a platform super admin. */
@Injectable()
export class PlatformAdminGuard extends AuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const { auth } = context.switchToHttp().getRequest<AuthedRequest>();
    if (auth?.kind !== 'platform' || auth.role !== 'super_admin') throw forbidden();
    return true;
  }
}

/**
 * Staff can act on this route if they have ANY of the listed permissions
 * (codes from core.permissions). Without the decorator any venue staff may call it.
 */
export const RequirePermission = (...codes: string[]) => SetMetadata(PERMISSIONS, codes);

/** Requires venue staff; the tenant (venue) comes from the token (StaffClaims.venueId). */
@Injectable()
export class StaffGuard extends AuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const { auth } = context.switchToHttp().getRequest<AuthedRequest>();
    if (auth?.kind !== 'staff') throw forbidden();
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length && !required.some((code) => can(auth, code))) throw forbidden();
    return true;
  }
}

/** The verified claims of the current request (use behind AuthGuard). */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const { auth } = context.switchToHttp().getRequest<AuthedRequest>();
  if (!auth) throw unauthorized();
  return auth;
});

/** The staff claims of the current request (use behind StaffGuard). */
export const CurrentStaff = createParamDecorator(
  (_: unknown, context: ExecutionContext): StaffClaims => {
    const { auth } = context.switchToHttp().getRequest<AuthedRequest>();
    if (auth?.kind !== 'staff') throw unauthorized();
    return auth;
  },
);

export type { AccessClaims, PlatformClaims, StaffClaims };
