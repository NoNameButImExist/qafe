import { z } from 'zod';
import { pageOf, PageQuery } from './common.js';

export const VenueStatus = z.enum(['pending', 'active', 'suspended', 'closed']);
export type VenueStatus = z.infer<typeof VenueStatus>;

/** Same rule as the CHECK on core.venues.slug: it becomes the subdomain. */
/** Subdomains the platform uses itself; a venue cannot take them (guests use <slug>.qafe.ba). */
export const RESERVED_SLUGS = [
  'api',
  'staff',
  'panel',
  'admin',
  's3',
  'www',
  'app',
  'traefik',
  'mail',
] as const;

export const VenueSlug = z
  .string()
  .regex(/^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/, 'slug')
  .refine((slug) => !(RESERVED_SLUGS as readonly string[]).includes(slug), 'slug_reserved');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

/** POST /admin/venues (FR-ADM-02, FR-ADM-03). */
export const CreateVenueRequest = z.object({
  name: z.string().trim().min(2).max(120),
  slug: VenueSlug,
  legalName: optionalText(200),
  taxId: optionalText(20),
  vatNumber: optionalText(20),
  address: optionalText(200),
  city: optionalText(80),
  postalCode: optionalText(10),
  phone: optionalText(30),
  email: z
    .union([z.email().max(254), z.literal('')])
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  currency: z.string().length(3).default('BAM'),
  timezone: z.string().min(1).max(50).default('Europe/Sarajevo'),
  defaultLanguage: z.enum(['bs', 'en']).default('bs'),
  owner: z.object({
    fullName: z.string().trim().min(2).max(120),
    username: z.string().regex(/^[a-zA-Z0-9._-]{3,30}$/, 'username'),
    /** Temporary password; the owner must change it at first login (FR-SEF-01). */
    temporaryPassword: z.string().min(10).max(200),
  }),
});
export type CreateVenueRequest = z.input<typeof CreateVenueRequest>;
export type CreateVenueInput = z.output<typeof CreateVenueRequest>;

/** GET /admin/venues (FR-ADM-05). */
export const VenueListQuery = PageQuery.extend({
  search: z.string().trim().max(100).optional(),
  status: VenueStatus.optional(),
  city: z.string().trim().max(80).optional(),
});
export type VenueListQuery = z.input<typeof VenueListQuery>;
export type VenueListParams = z.output<typeof VenueListQuery>;

export const VenueSummary = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  status: VenueStatus,
  staffCount: z.number().int(),
  tableCount: z.number().int(),
  createdAt: z.string(),
});
export type VenueSummary = z.infer<typeof VenueSummary>;

export const VenueList = pageOf(VenueSummary);
export type VenueList = z.infer<typeof VenueList>;

export const CreateVenueResponse = z.object({
  venue: VenueSummary,
  owner: z.object({ username: z.string() }),
});
export type CreateVenueResponse = z.infer<typeof CreateVenueResponse>;

/** PATCH /admin/venues/:id/status (FR-ADM-04). */
export const UpdateVenueStatusRequest = z.object({ status: VenueStatus });
export type UpdateVenueStatusRequest = z.infer<typeof UpdateVenueStatusRequest>;

/** GET /admin/stats */
export const AdminStats = z.object({
  venues: z.object({
    total: z.number().int(),
    pending: z.number().int(),
    active: z.number().int(),
    suspended: z.number().int(),
    closed: z.number().int(),
  }),
  venueStaff: z.number().int(),
  tables: z.number().int(),
  recentVenues: z.array(VenueSummary),
});
export type AdminStats = z.infer<typeof AdminStats>;

/** GET /venues/:slug/public — what a guest may see before the venue is known. */
export const PublicVenue = z.object({
  slug: z.string(),
  name: z.string(),
  status: VenueStatus,
  logoUrl: z.string().nullable(),
  primaryColor: z.string().nullable(),
  defaultLanguage: z.string(),
  currency: z.string(),
  guestOrderingEnabled: z.boolean(),
});
export type PublicVenue = z.infer<typeof PublicVenue>;

/** Empty input clears the field (stored as NULL). */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** PATCH /admin/venues/:id (FR-ADM-04). The slug is fixed: printed QR codes point to it. */
export const UpdateVenueRequest = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: clearableText(200),
  taxId: clearableText(20),
  vatNumber: clearableText(20),
  address: clearableText(200),
  city: clearableText(80),
  postalCode: clearableText(10),
  phone: clearableText(30),
  email: z
    .union([z.email().max(254), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().min(1).max(50).optional(),
  defaultLanguage: z.enum(['bs', 'en']).optional(),
});
export type UpdateVenueRequest = z.input<typeof UpdateVenueRequest>;
export type UpdateVenueInput = z.output<typeof UpdateVenueRequest>;

export const VenueModuleState = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  enabledAt: z.string().nullable(),
});
export type VenueModuleState = z.infer<typeof VenueModuleState>;

export const VenueStaffMember = z.object({
  memberId: z.uuid(),
  userId: z.uuid(),
  fullName: z.string(),
  username: z.string(),
  role: z.string(),
  isOwner: z.boolean(),
  isActive: z.boolean(),
  userActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
});
export type VenueStaffMember = z.infer<typeof VenueStaffMember>;

/** GET /admin/venues/:id */
export const VenueDetail = VenueSummary.extend({
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  vatNumber: z.string().nullable(),
  address: z.string().nullable(),
  postalCode: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  currency: z.string(),
  timezone: z.string(),
  defaultLanguage: z.string(),
  updatedAt: z.string(),
  modules: z.array(VenueModuleState),
  staff: z.array(VenueStaffMember),
});
export type VenueDetail = z.infer<typeof VenueDetail>;

/** GET /admin/modules (FR-ADM-06): the module catalog and which venues use each module. */
export const PlatformModule = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  venues: z.array(
    z.object({ id: z.uuid(), name: z.string(), slug: z.string(), status: VenueStatus }),
  ),
});
export type PlatformModule = z.infer<typeof PlatformModule>;
