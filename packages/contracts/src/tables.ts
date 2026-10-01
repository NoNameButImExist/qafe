import { z } from 'zod';

/** FR-SEF-11, FR-SEF-15, FR-SEF-16: areas, tables and their QR codes. */
export const VenueTable = z.object({
  id: z.uuid(),
  areaId: z.uuid().nullable(),
  label: z.string(),
  seats: z.number().int().nullable(),
  isActive: z.boolean(),
  qrVersion: z.number().int(),
  /** The address the printed QR code opens (guest menu for this table). */
  qrUrl: z.string(),
});
export type VenueTable = z.infer<typeof VenueTable>;

export const VenueArea = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type VenueArea = z.infer<typeof VenueArea>;

/** GET /venue/tables */
export const VenueSpace = z.object({
  areas: z.array(VenueArea),
  /** All tables; `areaId` null = not in any area. */
  tables: z.array(VenueTable),
});
export type VenueSpace = z.infer<typeof VenueSpace>;

const areaName = z.string().trim().min(1).max(60);
const tableLabel = z.string().trim().min(1).max(20);
const seats = z.number().int().min(1).max(99).nullable().optional();

export const CreateAreaRequest = z.object({ name: areaName });
export type CreateAreaRequest = z.infer<typeof CreateAreaRequest>;

export const UpdateAreaRequest = z.object({
  name: areaName.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAreaRequest = z.infer<typeof UpdateAreaRequest>;

export const CreateTableRequest = z.object({
  label: tableLabel,
  seats,
  areaId: z.uuid().nullable().optional(),
});
export type CreateTableRequest = z.infer<typeof CreateTableRequest>;

/** POST /venue/tables/bulk: "S" 1..10 creates S1…S10. */
export const CreateTablesBulkRequest = z
  .object({
    prefix: z.string().trim().max(10).default(''),
    from: z.number().int().min(0).max(999),
    to: z.number().int().min(0).max(999),
    seats,
    areaId: z.uuid().nullable().optional(),
  })
  .refine((r) => r.to >= r.from && r.to - r.from < 100, { message: 'range', path: ['to'] });
export type CreateTablesBulkRequest = z.input<typeof CreateTablesBulkRequest>;
export type CreateTablesBulkInput = z.output<typeof CreateTablesBulkRequest>;

export const UpdateTableRequest = z.object({
  label: tableLabel.optional(),
  seats,
  areaId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTableRequest = z.infer<typeof UpdateTableRequest>;
