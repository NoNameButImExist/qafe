import { z } from 'zod';

/** FR-SEF-08, FR-SEF-09: the venue's staff accounts, managed by the owner. */
export const VenueRoleSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  isOwner: z.boolean(),
  permissions: z.array(z.string()),
});
export type VenueRoleSummary = z.infer<typeof VenueRoleSummary>;

export const StaffMember = z.object({
  memberId: z.uuid(),
  userId: z.uuid(),
  fullName: z.string(),
  username: z.string(),
  roleId: z.uuid(),
  role: z.string(),
  isOwner: z.boolean(),
  /** Membership active in this venue (the owner can deactivate it). */
  isActive: z.boolean(),
  /** Account not blocked by a platform admin. */
  userActive: z.boolean(),
  hasPin: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type StaffMember = z.infer<typeof StaffMember>;

/** GET /venue/staff */
export const VenueStaff = z.object({
  members: z.array(StaffMember),
  roles: z.array(VenueRoleSummary),
});
export type VenueStaff = z.infer<typeof VenueStaff>;

const username = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{3,30}$/, 'username');
const password = z.string().min(8).max(200);
/** 4–6 digits, for signing in on a shared device (FR-KON-01). */
export const Pin = z.string().regex(/^\d{4,6}$/, 'pin');

export const CreateStaffRequest = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    username,
    roleId: z.uuid(),
    password: password.optional(),
    pin: Pin.optional(),
    /** The member changes the password at the first sign-in (FR-SEF-01); on by default. */
    requirePasswordChange: z.boolean().default(true),
  })
  .refine((r) => r.password || r.pin, { message: 'password_or_pin', path: ['password'] });
export type CreateStaffRequest = z.input<typeof CreateStaffRequest>;
export type CreateStaffInput = z.output<typeof CreateStaffRequest>;

export const UpdateStaffRequest = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  roleId: z.uuid().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateStaffRequest = z.infer<typeof UpdateStaffRequest>;

export const SetStaffPasswordRequest = z.object({
  password,
  /** The member changes it at the next sign-in; on by default (ignored for one's own). */
  requirePasswordChange: z.boolean().default(true),
});
export type SetStaffPasswordRequest = z.input<typeof SetStaffPasswordRequest>;
export type SetStaffPasswordInput = z.output<typeof SetStaffPasswordRequest>;

export const SetStaffPinRequest = z.object({ pin: Pin });
export type SetStaffPinRequest = z.infer<typeof SetStaffPinRequest>;
