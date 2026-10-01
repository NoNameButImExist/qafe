import { RESERVED_SLUGS } from '@qafe/contracts';
import { createHmac, randomBytes } from 'node:crypto';

/** Anonymous device id of a guest; host-only cookie, so it never leaves the venue subdomain. */
export const GUEST_COOKIE = 'qafe_gd';
const ONE_YEAR = 365 * 24 * 60 * 60;

export const newDeviceId = () => randomBytes(24).toString('base64url');

/** Only an HMAC of the device id is stored, so the database alone cannot link devices. */
export const deviceHash = (deviceId: string, secret: string) =>
  createHmac('sha256', secret).update(deviceId).digest('hex');

export const isDeviceId = (value: string | undefined): value is string =>
  value !== undefined && /^[A-Za-z0-9_-]{32}$/.test(value);

export const guestCookieOptions = (secure: boolean) => ({
  path: '/',
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
  maxAge: ONE_YEAR,
});

/**
 * The venue slug from the request host: "demo.qafe.ba" -> "demo" for domain "qafe.ba".
 * Anything else (the bare domain, app hosts like staff.qafe.ba, nested subdomains) has no tenant.
 */
export function slugFromHost(host: string | undefined, domain: string): string | null {
  if (!host) return null;
  const hostname = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const suffix = `.${domain}`;
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  if (!/^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/.test(slug)) return null;
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) return null;
  return slug;
}

/** Reads one cookie from a raw Cookie header (Socket.IO handshakes). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
