import { z } from 'zod';
import { VenueStatus } from './venues.js';

/** A decimal amount as a string ("2.50"), never a float. */
export const Money = z
  .string()
  .trim()
  .regex(/^\d{1,8}([.,]\d{1,2})?$/, 'money');

export const PaymentMethodCode = z.enum(['cash', 'card']);
export type PaymentMethodCode = z.infer<typeof PaymentMethodCode>;

/** GET /venue — the owner's view of their venue (panel). */
export const VenueSettings = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: VenueStatus,
  currency: z.string(),
  timezone: z.string(),
  profile: z.object({
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    postalCode: z.string().nullable(),
    primaryColor: z.string().nullable(),
    logoUrl: z.string().nullable(),
  }),
  /** FR-SEF-03, FR-SEF-04, FR-GOS-21, FR-GOS-22 */
  ordering: z.object({
    guestOrderingEnabled: z.boolean(),
    sessionVerificationMode: z.enum(['waiter', 'pin']),
    deviceApprovalRequired: z.boolean(),
    orderRejectionEnabled: z.boolean(),
  }),
  /** FR-SEF-07: one VAT rate for the venue, prices include VAT. */
  vatRate: z.string(),
  /** FR-SEF-05 */
  payments: z.object({
    cash: z.boolean(),
    card: z.boolean(),
    default: PaymentMethodCode,
  }),
  modules: z.array(z.string()),
});
export type VenueSettings = z.infer<typeof VenueSettings>;

const clearable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** PATCH /venue — only the sections sent are changed. */
export const UpdateVenueSettingsRequest = z.object({
  profile: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: clearable(30),
      email: z
        .union([z.email().max(254), z.literal('')])
        .transform((v) => (v === '' ? null : v))
        .nullable()
        .optional(),
      address: clearable(200),
      city: clearable(80),
      postalCode: clearable(10),
      primaryColor: z
        .union([z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'color'), z.literal('')])
        .transform((v) => (v === '' ? null : v.toUpperCase()))
        .nullable()
        .optional(),
    })
    .optional(),
  ordering: z
    .object({
      guestOrderingEnabled: z.boolean().optional(),
      sessionVerificationMode: z.enum(['waiter', 'pin']).optional(),
      deviceApprovalRequired: z.boolean().optional(),
      orderRejectionEnabled: z.boolean().optional(),
    })
    .optional(),
  vatRate: z
    .string()
    .trim()
    .regex(/^\d{1,3}([.,]\d{1,2})?$/, 'vat')
    .refine((v) => Number(v.replace(',', '.')) <= 100, 'vat')
    .optional(),
  payments: z
    .object({ cash: z.boolean(), card: z.boolean(), default: PaymentMethodCode })
    .refine((p) => p.cash || p.card, { message: 'at_least_one', path: ['cash'] })
    .refine((p) => p[p.default], { message: 'default_disabled', path: ['default'] })
    .optional(),
});
export type UpdateVenueSettingsRequest = z.input<typeof UpdateVenueSettingsRequest>;
export type UpdateVenueSettingsInput = z.output<typeof UpdateVenueSettingsRequest>;
