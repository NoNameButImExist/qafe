import { z } from 'zod';
import { pageOf, PageQuery } from './common.js';

export const UserKind = z.enum(['platform', 'staff']);
export type UserKind = z.infer<typeof UserKind>;

/** GET /admin/users (FR-ADM-09). */
export const AdminUserListQuery = PageQuery.extend({
  search: z.string().trim().max(100).optional(),
  kind: UserKind.optional(),
  status: z.enum(['active', 'blocked']).optional(),
});
export type AdminUserListQuery = z.input<typeof AdminUserListQuery>;
export type AdminUserListParams = z.output<typeof AdminUserListQuery>;

export const AdminUser = z.object({
  id: z.uuid(),
  fullName: z.string(),
  email: z.string().nullable(),
  kind: UserKind,
  platformRole: z.enum(['super_admin', 'support']).nullable(),
  memberships: z.array(
    z.object({
      venueId: z.uuid(),
      venueName: z.string(),
      venueSlug: z.string(),
      username: z.string(),
      role: z.string(),
      isActive: z.boolean(),
    }),
  ),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof AdminUser>;

export const AdminUserList = pageOf(AdminUser);
export type AdminUserList = z.infer<typeof AdminUserList>;

/** PATCH /admin/users/:id/status — blocking also ends every session of the user. */
export const UpdateUserStatusRequest = z.object({ active: z.boolean() });
export type UpdateUserStatusRequest = z.infer<typeof UpdateUserStatusRequest>;

/** POST /admin/users/:id/password — the user must change it at the next sign-in. */
export const ResetPasswordRequest = z.object({ temporaryPassword: z.string().min(10).max(200) });
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;
