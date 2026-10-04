import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { publicJwk } from '@qafe/auth';
import {
  AdminLoginRequest,
  ChangePasswordRequest,
  LinkStaffDeviceRequest,
  MfaCodeRequest,
  PinLoginRequest,
  StaffLoginRequest,
  type MfaSetup,
  type MfaStatus,
  type AuthSession,
  type Me,
  type StaffDevice,
  type StaffDeviceRoster,
  type StaffMe,
  type StaffSession,
} from '@qafe/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AllowTemporaryPassword,
  AuthGuard,
  Public,
  CurrentStaff,
  CurrentUser,
  RequirePermission,
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
import { StaffDevicesService } from '../staff/staff-devices.service.js';
import { MfaService } from './mfa.service.js';

/**
 * Refresh cookies, one per kind of session. Separate names keep an admin and a staff
 * session apart when both apps share a host (localhost in development).
 */
export const REFRESH_COOKIE: Record<SessionKind, string> = {
  platform: 'qafe_rt',
  staff: 'qafe_srt',
};

/** Token of a shared device linked to a venue for PIN sign-in (FR-KON-01). */
export const DEVICE_COOKIE = 'qafe_sdev';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly devices: StaffDevicesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('auth/admin/login')
  @Public()
  @HttpCode(200)
  async adminLogin(
    @Body(new ZodPipe(AdminLoginRequest)) body: AdminLoginRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthSession> {
    return this.issue(
      reply,
      'platform',
      await this.auth.adminLogin(body.email, body.password, client(req), body.totp),
    );
  }

  @Post('auth/refresh')
  @Public()
  @HttpCode(200)
  refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthSession> {
    return this.rotate(req, reply, 'platform') as Promise<AuthSession>;
  }

  @Post('auth/logout')
  @Public()
  @HttpCode(204)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(req.cookies[REFRESH_COOKIE.platform]);
    this.clearCookie(reply, 'platform');
  }

  @Get('auth/me')
  @UseGuards(AuthGuard)
  @AllowTemporaryPassword()
  me(@CurrentUser() claims: AccessClaims): Promise<Me> {
    if (claims.kind !== 'platform') throw unauthorized();
    return this.auth.me(claims);
  }

  @Post('auth/staff/login')
  @Public()
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
  @Public()
  @HttpCode(200)
  staffRefresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StaffSession> {
    return this.rotate(req, reply, 'staff') as Promise<StaffSession>;
  }

  @Post('auth/staff/logout')
  @Public()
  @HttpCode(204)
  async staffLogout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(req.cookies[REFRESH_COOKIE.staff]);
    this.clearCookie(reply, 'staff');
  }

  /** Links the device in hand to the venue: PIN sign-in becomes possible on it (FR-KON-01). */
  @Post('auth/staff/devices')
  @UseGuards(StaffGuard)
  @RequirePermission('staff.manage')
  async linkDevice(
    @CurrentStaff() staff: StaffClaims,
    @Body(new ZodPipe(LinkStaffDeviceRequest)) body: LinkStaffDeviceRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StaffDevice> {
    const { device, token } = await this.devices.link(staff, body.name);
    void reply.setCookie(DEVICE_COOKIE, token, {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: 'strict',
      path: this.config.auth.cookiePath,
      maxAge: 365 * 86_400,
    });
    return device;
  }

  /** On a linked device: the venue and the members who can sign in with a PIN. */
  @Get('auth/staff/device')
  @Public()
  deviceRoster(@Req() req: FastifyRequest): Promise<StaffDeviceRoster> {
    return this.auth.deviceRoster(req.cookies[DEVICE_COOKIE]);
  }

  @Post('auth/staff/pin-login')
  @Public()
  @HttpCode(200)
  async pinLogin(
    @Body(new ZodPipe(PinLoginRequest)) body: PinLoginRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StaffSession> {
    const issued = await this.auth.staffPinLogin(
      req.cookies[DEVICE_COOKIE],
      body.memberId,
      body.pin,
      client(req),
    );
    return this.issue(reply, 'staff', issued);
  }

  /** Forgets the link on this device only (the owner revokes it in the panel). */
  @Post('auth/staff/device/forget')
  @Public()
  @HttpCode(204)
  forgetDevice(@Res({ passthrough: true }) reply: FastifyReply): void {
    void reply.clearCookie(DEVICE_COOKIE, { path: this.config.auth.cookiePath });
  }

  @Get('auth/staff/me')
  @UseGuards(StaffGuard)
  @AllowTemporaryPassword()
  staffMe(@CurrentStaff() claims: StaffClaims): Promise<StaffMe> {
    return this.auth.staffMe(claims);
  }

  /** Own password, admin or staff (FR-SEF-01). Refresh afterwards for a token without the flag. */
  @Post('auth/password')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @AllowTemporaryPassword()
  changePassword(
    @CurrentUser() claims: AccessClaims,
    @Body(new ZodPipe(ChangePasswordRequest)) body: ChangePasswordRequest,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    return this.auth.changePassword(claims, body.currentPassword, body.newPassword, client(req));
  }

  // ---------- Two-factor sign-in for platform admins (FR-ADM-01) ----------

  @Get('auth/mfa')
  @UseGuards(AuthGuard)
  mfaStatus(@CurrentUser() claims: AccessClaims): Promise<MfaStatus> {
    return this.mfa.status(platformOnly(claims));
  }

  @Post('auth/mfa/setup')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  mfaSetup(@CurrentUser() claims: AccessClaims): Promise<MfaSetup> {
    return this.mfa.setup(platformOnly(claims));
  }

  @Post('auth/mfa/enable')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  mfaEnable(
    @CurrentUser() claims: AccessClaims,
    @Body(new ZodPipe(MfaCodeRequest)) body: MfaCodeRequest,
  ): Promise<void> {
    return this.mfa.enable(platformOnly(claims), body.code);
  }

  @Post('auth/mfa/disable')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  mfaDisable(
    @CurrentUser() claims: AccessClaims,
    @Body(new ZodPipe(MfaCodeRequest)) body: MfaCodeRequest,
  ): Promise<void> {
    return this.mfa.disable(platformOnly(claims), body.code);
  }

  /** Public keys for verifying access tokens (other services, later). */
  @Get('.well-known/jwks.json')
  @Public()
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

function platformOnly(claims: AccessClaims) {
  if (claims.kind !== 'platform') throw unauthorized();
  return claims;
}

function client(req: FastifyRequest): ClientInfo {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
