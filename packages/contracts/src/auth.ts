import { z } from 'zod';

export const PlatformRole = z.enum(['super_admin', 'support']);
export type PlatformRole = z.infer<typeof PlatformRole>;

/** POST /auth/admin/login (FR-ADM-01). */
export const AdminLoginRequest = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  /** Code from the authenticator app, when the admin has two-factor sign-in on. */
  totp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'totp')
    .optional(),
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
  /** Two-factor sign-in (TOTP) is on for this admin (FR-ADM-01). */
  mfaEnabled: z.boolean(),
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
  /** Signed in with a temporary password: only changing it is allowed (FR-SEF-01). */
  mustChangePassword: z.boolean(),
});
export type StaffMe = z.infer<typeof StaffMe>;

export const StaffSession = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: StaffMe,
});
export type StaffSession = z.infer<typeof StaffSession>;

/** At least 8 characters; the platform's one password rule (argon2id stores it). */
export const NewPassword = z.string().min(8, 'password_short').max(200);

/** POST /auth/password, /auth/staff/password: change one's own password (FR-SEF-01). */
export const ChangePasswordRequest = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: NewPassword })
  .refine((r) => r.currentPassword !== r.newPassword, {
    message: 'password_same',
    path: ['newPassword'],
  });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

/** GET /auth/mfa */
export const MfaStatus = z.object({
  enabled: z.boolean(),
  /** The server has an encryption key, so two-factor sign-in can be turned on. */
  available: z.boolean(),
});
export type MfaStatus = z.infer<typeof MfaStatus>;

/** POST /auth/mfa/setup: a new secret to scan; it is saved only after a correct code. */
export const MfaSetup = z.object({ secret: z.string(), otpauthUrl: z.string() });
export type MfaSetup = z.infer<typeof MfaSetup>;

/** POST /auth/mfa/enable, /auth/mfa/disable */
export const MfaCodeRequest = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'totp'),
});
export type MfaCodeRequest = z.infer<typeof MfaCodeRequest>;

// ---------- PIN sign-in on a shared device (FR-KON-01) ----------

/** POST /auth/staff/devices — link the device in hand to the venue (staff.manage). */
export const LinkStaffDeviceRequest = z.object({ name: z.string().trim().min(1).max(60) });
export type LinkStaffDeviceRequest = z.infer<typeof LinkStaffDeviceRequest>;

export const StaffDevice = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type StaffDevice = z.infer<typeof StaffDevice>;

/** GET /auth/staff/device — on a linked device: the venue and who can sign in with a PIN. */
export const StaffDeviceRoster = z.object({
  device: z.object({ id: z.uuid(), name: z.string() }),
  venue: z.object({ name: z.string(), slug: z.string() }),
  members: z.array(z.object({ memberId: z.uuid(), name: z.string(), role: z.string() })),
});
export type StaffDeviceRoster = z.infer<typeof StaffDeviceRoster>;

/** POST /auth/staff/pin-login — name (member) + PIN, only on a linked device. */
export const PinLoginRequest = z.object({
  memberId: z.uuid(),
  pin: z.string().regex(/^\d{4,6}$/, 'pin'),
});
export type PinLoginRequest = z.infer<typeof PinLoginRequest>;
