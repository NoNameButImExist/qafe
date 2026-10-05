import { z } from 'zod';

// ---------- Colour theme of the admin, panel and staff apps ----------

/**
 * Theme families. "warm" is the green and sand of the landing page, "ice" the cool summer one.
 * A new one is a new value here plus its tokens in @qafe/ui theme.css. Light/dark stays each
 * member's own choice; the brand is set for the whole platform by the super admin.
 */
export const THEME_BRANDS = ['warm', 'ice'] as const;
export const ThemeBrand = z.enum(THEME_BRANDS);
export type ThemeBrand = z.infer<typeof ThemeBrand>;

/** GET /platform/theme (public), GET/PUT /admin/settings/theme. */
export const PlatformTheme = z.object({ brand: ThemeBrand });
export type PlatformTheme = z.infer<typeof PlatformTheme>;

// ---------- SMTP for e-mail ----------

export const SmtpSecurity = z.enum(['starttls', 'tls', 'none']);
export type SmtpSecurity = z.infer<typeof SmtpSecurity>;

/** GET /admin/settings/smtp — the password itself never leaves the server. */
export const SmtpSettings = z.object({
  configured: z.boolean(),
  host: z.string(),
  port: z.number().int(),
  security: SmtpSecurity,
  username: z.string(),
  hasPassword: z.boolean(),
  fromName: z.string(),
  fromEmail: z.string(),
  updatedAt: z.string().nullable(),
  /** False when SETTINGS_ENCRYPTION_KEY is missing: a password cannot be stored. */
  canStorePassword: z.boolean(),
});
export type SmtpSettings = z.infer<typeof SmtpSettings>;

/**
 * PUT /admin/settings/smtp. `password` omitted = keep the stored one; empty string = remove it.
 */
export const UpdateSmtpRequest = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.-]+$/, 'host'),
  port: z.coerce.number().int().min(1).max(65535),
  security: SmtpSecurity,
  username: z.string().trim().max(200).default(''),
  password: z.string().max(500).optional(),
  fromName: z.string().trim().min(1).max(100),
  fromEmail: z.email().max(254),
});
export type UpdateSmtpRequest = z.input<typeof UpdateSmtpRequest>;
export type UpdateSmtpInput = z.output<typeof UpdateSmtpRequest>;

/** POST /admin/settings/smtp/test — sends a short message with the stored settings. */
export const SmtpTestRequest = z.object({ to: z.email().max(254) });
export type SmtpTestRequest = z.infer<typeof SmtpTestRequest>;
