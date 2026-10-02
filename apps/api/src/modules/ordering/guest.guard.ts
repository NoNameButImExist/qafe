import {
  createParamDecorator,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { notFound } from '../../common/errors.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { VenueDirectory, type ResolvedVenue } from '../core/index.js';
import {
  deviceHash,
  GUEST_COOKIE,
  guestCookieOptions,
  isDeviceId,
  newDeviceId,
  slugFromHost,
} from './guest-identity.js';

/** Who is calling a guest route: the venue of the subdomain and the device. */
export interface GuestContext {
  venue: ResolvedVenue;
  deviceHash: string;
  /** The client's address (behind Traefik: from X-Forwarded-For), for Wi-Fi verification. */
  ip: string;
}

type GuestRequest = FastifyRequest & { guest?: GuestContext };

/**
 * Guest routes live on <slug>.<domain>/api/*: the tenant comes from the host, never from
 * the body or the path. A device without the cookie gets a new anonymous id.
 */
@Injectable()
export class GuestGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly venues: VenueDirectory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<GuestRequest>();
    const slug = slugFromHost(request.hostname, this.config.guest.domain);
    const venue = slug ? await this.venues.resolveVenue(slug) : null;
    if (!venue || venue.status === 'pending') throw notFound('Venue not found');

    let deviceId = request.cookies[GUEST_COOKIE];
    if (!isDeviceId(deviceId)) {
      deviceId = newDeviceId();
      void http
        .getResponse<FastifyReply>()
        .setCookie(GUEST_COOKIE, deviceId, guestCookieOptions(this.config.guest.cookieSecure));
    }
    request.guest = {
      venue,
      deviceHash: deviceHash(deviceId, this.config.guest.deviceSecret),
      ip: request.ip,
    };
    return true;
  }
}

/** The guest context of the current request (use behind GuestGuard). */
export const CurrentGuest = createParamDecorator(
  (_: unknown, context: ExecutionContext): GuestContext => {
    const { guest } = context.switchToHttp().getRequest<GuestRequest>();
    if (!guest) throw notFound('Venue not found');
    return guest;
  },
);
