import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { publicJwk } from '@qafe/auth';
import {
  AdminLoginRequest,
  StaffLoginRequest,
  type AuthSession,
  type Me,
  type StaffMe,
  type StaffSession,
} from '@qafe/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthGuard,
  CurrentStaff,
  CurrentUser,
  StaffGuard,
  type AccessClaims,
  type StaffClaims,
} from '../../../common/auth/auth.guard.js';
import { unauthorized } from '../../../common/errors.js';
import { ZodPipe } from '../../../common/zod.pipe.js';
import { APP_CONFIG, type AppConfig } from '../../../config/config.js';
import {
  AuthService,
  type ClientInfo,
  type IssuedSession,
  type SessionKind,
} from './auth.service.js';

/**
 * Refresh cookies, one per kind of session. Separate names keep an admin and a staff
 * session apart when both apps share a host (localhost in development).
 */
export const REFRESH_COOKIE: Record<SessionKind, string> = {
  platform: 'qafe_rt',
  staff: 'qafe_srt',
};

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('auth/admin/login')
  @HttpCode(200)
  async adminLogin(
    @Body(new ZodPipe(AdminLoginRequest)) body: AdminLoginRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthSession> {
    return this.issue(
      reply,
      'platform',
      await this.auth.adminLogin(body.email, body.password, client(req)),
    );
  }

  @Post('auth/refresh')
  @HttpCode(200)
  refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthSession> {
    return this.rotate(req, reply, 'platform') as Promise<AuthSession>;
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(req.cookies[REFRESH_COOKIE.platform]);
    this.clearCookie(reply, 'platform');
  }

  @Get('auth/me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() claims: AccessClaims): Promise<Me> {
    if (claims.kind !== 'platform') throw unauthorized();
    return this.auth.me(claims);
  }

  @Post('auth/staff/login')
  @HttpCode(200)
  async staffLogin(
    @Body(new ZodPipe(StaffLoginRequest)) body: StaffLoginRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StaffSession> {
    const issued = await this.auth.staffLogin(
      body.venueSlug,
      body.username,
      body.password,
      client(req),
    );
    return this.issue(reply, 'staff', issued);
  }

  @Post('auth/staff/refresh')
  @HttpCode(200)
  staffRefresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StaffSession> {
    return this.rotate(req, reply, 'staff') as Promise<StaffSession>;
  }

  @Post('auth/staff/logout')
  @HttpCode(204)
  async staffLogout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(req.cookies[REFRESH_COOKIE.staff]);
    this.clearCookie(reply, 'staff');
  }

  @Get('auth/staff/me')
  @UseGuards(StaffGuard)
  staffMe(@CurrentStaff() claims: StaffClaims): Promise<StaffMe> {
    return this.auth.staffMe(claims);
  }

  /** Public keys for verifying access tokens (other services, later). */
  @Get('.well-known/jwks.json')
  async jwks() {
    return { keys: [await publicJwk(this.config.auth.publicKeyPem)] };
  }

  private async rotate(req: FastifyRequest, reply: FastifyReply, kind: SessionKind) {
    const token = req.cookies[REFRESH_COOKIE[kind]];
    if (!token) throw unauthorized('No session');
    try {
      return this.issue(reply, kind, await this.auth.refresh(token, client(req), kind));
    } catch (error) {
      this.clearCookie(reply, kind);
      throw error;
    }
  }

  private issue<S extends AuthSession | StaffSession>(
    reply: FastifyReply,
    kind: SessionKind,
    issued: IssuedSession<S>,
  ): S {
    void reply.setCookie(REFRESH_COOKIE[kind], issued.refreshToken, {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: 'strict',
      path: this.config.auth.cookiePath,
      maxAge: this.config.auth.refreshTokenTtlDays * 86_400,
    });
    return issued.session;
  }

  private clearCookie(reply: FastifyReply, kind: SessionKind) {
    void reply.clearCookie(REFRESH_COOKIE[kind], { path: this.config.auth.cookiePath });
  }
}

function client(req: FastifyRequest): ClientInfo {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
