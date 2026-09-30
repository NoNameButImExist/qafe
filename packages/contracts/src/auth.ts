import { z } from 'zod';

export const PlatformRole = z.enum(['super_admin', 'support']);
export type PlatformRole = z.infer<typeof PlatformRole>;

/** POST /auth/admin/login (FR-ADM-01). */
export const AdminLoginRequest = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export type AdminLoginRequest = z.infer<typeof AdminLoginRequest>;

/** GET /auth/me */
export const Me = z.object({
  id: z.uuid(),
  kind: z.literal('platform'),
  email: z.email(),
  fullName: z.string(),
  role: PlatformRole,
  preferredLanguage: z.string(),
  mustChangePassword: z.boolean(),
});
export type Me = z.infer<typeof Me>;

/**
 * Login and refresh response. The access token lives in memory on the client;
 * the refresh token is an httpOnly cookie and never appears in a body.
 */
export const AuthSession = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: Me,
});
export type AuthSession = z.infer<typeof AuthSession>;

/**
 * POST /auth/staff/login (FR-SEF-01, FR-KON-01): venue slug + username + password.
 * The panel and staff apps use their own refresh cookie, separate from the admin's.
 */
export const StaffLoginRequest = z.object({
  venueSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/, 'slug'),
  username: z.string().trim().min(1).max(30),
  password: z.string().min(1).max(200),
});
export type StaffLoginRequest = z.input<typeof StaffLoginRequest>;

/** GET /auth/staff/me */
export const StaffMe = z.object({
  id: z.uuid(),
  kind: z.literal('staff'),
  memberId: z.uuid(),
  fullName: z.string(),
  username: z.string(),
  role: z.string(),
  isOwner: z.boolean(),
  /** Permission codes from core.permissions, e.g. "menu.edit". */
  permissions: z.array(z.string()),
  venue: z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    status: z.enum(['pending', 'active', 'suspended', 'closed']),
    currency: z.string(),
  }),
  /** Codes of the modules enabled for the venue (FR-ADM-06). */
  modules: z.array(z.string()),
  preferredLanguage: z.string(),
});
export type StaffMe = z.infer<typeof StaffMe>;

export const StaffSession = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: StaffMe,
});
export type StaffSession = z.infer<typeof StaffSession>;
