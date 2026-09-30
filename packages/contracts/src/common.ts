import { z } from 'zod';

/** Every API error has this shape. `code` is stable and used for i18n on the client. */
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export const ErrorCode = {
  validationFailed: 'validation_failed',
  unauthorized: 'unauthorized',
  invalidCredentials: 'invalid_credentials',
  accountDisabled: 'account_disabled',
  mfaRequired: 'mfa_required',
  tooManyAttempts: 'too_many_attempts',
  forbidden: 'forbidden',
  notFound: 'not_found',
  slugTaken: 'slug_taken',
  cannotModifySelf: 'cannot_modify_self',
  venueClosed: 'venue_closed',
  categoryNotEmpty: 'category_not_empty',
  unsupportedImage: 'unsupported_image',
  fileTooLarge: 'file_too_large',
  internal: 'internal_error',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
