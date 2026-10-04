import { z } from 'zod';
/**
 * GET /admin/audit (FR-ADM-10). Dates are inclusive calendar days (YYYY-MM-DD).
 * Newest first, page by page with `cursor` (the `nextCursor` of the previous page): the log
 * can hold hundreds of millions of rows, so it is never counted or skipped through.
 */
export const AuditQuery = z.object({
  cursor: z
    .string()
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  venueId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  action: z.string().max(60).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type AuditQuery = z.input<typeof AuditQuery>;
export type AuditParams = z.output<typeof AuditQuery>;

export const AuditEntry = z.object({
  id: z.string(),
  createdAt: z.string(),
  service: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  venueId: z.string().nullable(),
  venueLabel: z.string().nullable(),
  actorId: z.string().nullable(),
  actorLabel: z.string().nullable(),
  ip: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AuditList = z.object({
  items: z.array(AuditEntry),
  /** Pass as `cursor` for the next (older) page; null on the last page. */
  nextCursor: z.string().nullable(),
});
export type AuditList = z.infer<typeof AuditList>;

/** Filter options: actions, people and venues that appear in the log. */
export const AuditFacets = z.object({
  actions: z.array(z.string()),
  actors: z.array(z.object({ id: z.string(), label: z.string() })),
  venues: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type AuditFacets = z.infer<typeof AuditFacets>;
