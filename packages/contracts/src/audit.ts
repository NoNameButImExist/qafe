import { z } from 'zod';
import { pageOf, PageQuery } from './common.js';

/** GET /admin/audit (FR-ADM-10). Dates are inclusive calendar days (YYYY-MM-DD). */
export const AuditQuery = PageQuery.extend({
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

export const AuditList = pageOf(AuditEntry);
export type AuditList = z.infer<typeof AuditList>;

/** Filter options: actions and actors that appear in the log. */
export const AuditFacets = z.object({
  actions: z.array(z.string()),
  actors: z.array(z.object({ id: z.string(), label: z.string() })),
  venues: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type AuditFacets = z.infer<typeof AuditFacets>;
