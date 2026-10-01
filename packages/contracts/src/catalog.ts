import { z } from 'zod';
import { Money } from './venue-settings.js';

/** A price difference for a modifier option; may be negative ("-0.50"). */
export const MoneyDelta = z
  .string()
  .trim()
  .regex(/^-?\d{1,8}([.,]\d{1,2})?$/, 'money');

export const MenuItem = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  /** Price including VAT, as a decimal string ("2.50"). */
  price: z.string(),
  volumeLabel: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** false = temporarily unavailable ("nestalo", FR-SEF-19). */
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
  modifierGroupIds: z.array(z.uuid()),
});
export type MenuItem = z.infer<typeof MenuItem>;

export const MenuCategory = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  items: z.array(MenuItem),
});
export type MenuCategory = z.infer<typeof MenuCategory>;

export const ModifierOption = z.object({
  id: z.uuid(),
  name: z.string(),
  priceDelta: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
});
export type ModifierOption = z.infer<typeof ModifierOption>;

export const ModifierGroup = z.object({
  id: z.uuid(),
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  options: z.array(ModifierOption),
  /** How many items use this group. */
  itemCount: z.number().int(),
});
export type ModifierGroup = z.infer<typeof ModifierGroup>;

/** GET /catalog/menu (FR-SEF-17, FR-SEF-18). */
export const Menu = z.object({
  categories: z.array(MenuCategory),
  modifierGroups: z.array(ModifierGroup),
});
export type Menu = z.infer<typeof Menu>;

const optionalDescription = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const CreateCategoryRequest = z.object({
  name: z.string().trim().min(1).max(80),
  description: optionalDescription,
});
export type CreateCategoryRequest = z.input<typeof CreateCategoryRequest>;

export const UpdateCategoryRequest = CreateCategoryRequest.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateCategoryRequest = z.input<typeof UpdateCategoryRequest>;

/** New order of categories, or of the items in one category (drag and drop). */
export const ReorderRequest = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
export type ReorderRequest = z.infer<typeof ReorderRequest>;

export const CreateItemRequest = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  description: optionalDescription,
  price: Money,
  volumeLabel: z
    .string()
    .trim()
    .max(20)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  imageUrl: z.url().max(500).nullable().optional(),
  isAvailable: z.boolean().optional(),
  modifierGroupIds: z.array(z.uuid()).max(20).optional(),
});
export type CreateItemRequest = z.input<typeof CreateItemRequest>;
export type CreateItemInput = z.output<typeof CreateItemRequest>;

export const UpdateItemRequest = CreateItemRequest.partial();
export type UpdateItemRequest = z.input<typeof UpdateItemRequest>;
export type UpdateItemInput = z.output<typeof UpdateItemRequest>;

/** PATCH /catalog/items/:id/availability — one tap for "nestalo" (FR-SEF-19, FR-KON-22). */
export const ItemAvailabilityRequest = z.object({ available: z.boolean() });
export type ItemAvailabilityRequest = z.infer<typeof ItemAvailabilityRequest>;

/** POST / PUT /catalog/modifier-groups — options are replaced as a whole. */
export const SaveModifierGroupRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    options: z
      .array(
        z.object({
          id: z.uuid().optional(),
          name: z.string().trim().min(1).max(60),
          priceDelta: MoneyDelta,
          isDefault: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(30),
  })
  .refine((g) => g.maxSelect >= g.minSelect, { message: 'max_below_min', path: ['maxSelect'] })
  .refine((g) => g.minSelect <= g.options.length, {
    message: 'min_above_options',
    path: ['minSelect'],
  });
export type SaveModifierGroupRequest = z.input<typeof SaveModifierGroupRequest>;
export type SaveModifierGroupInput = z.output<typeof SaveModifierGroupRequest>;

/** POST /catalog/images, /venue/logo — multipart upload, returns the public URL. */
export const UploadedImage = z.object({ url: z.string() });
export type UploadedImage = z.infer<typeof UploadedImage>;
