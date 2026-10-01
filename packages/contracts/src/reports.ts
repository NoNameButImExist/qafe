import { z } from 'zod';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date');

/** GET /reports/summary and exports: an inclusive range of business days (FR-SEF-24). */
export const ReportQuery = z
  .object({ from: IsoDate, to: IsoDate })
  .refine((q) => q.from <= q.to, { message: 'range', path: ['to'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 366, {
    message: 'range_too_long',
    path: ['to'],
  });
export type ReportQuery = z.infer<typeof ReportQuery>;

export const ReportTotals = z.object({
  revenue: z.string(),
  vatAmount: z.string(),
  orders: z.number().int(),
  items: z.number().int(),
  /** Revenue per order. */
  averageOrder: z.string(),
});
export type ReportTotals = z.infer<typeof ReportTotals>;

const row = { revenue: z.string(), orders: z.number().int(), quantity: z.number().int() };

export const ReportSummary = z.object({
  from: IsoDate,
  to: IsoDate,
  /** The period of the same length just before (FR-SEF-24 comparison). */
  previous: z.object({ from: IsoDate, to: IsoDate, totals: ReportTotals }),
  totals: ReportTotals,
  byDay: z.array(z.object({ date: IsoDate, ...row })),
  byHour: z.array(z.object({ hour: z.number().int(), ...row })),
  byWeekday: z.array(z.object({ day: z.number().int(), ...row })),
  byItem: z.array(
    z.object({ itemId: z.uuid(), name: z.string(), category: z.string().nullable(), ...row }),
  ),
  byCategory: z.array(z.object({ name: z.string().nullable(), ...row })),
  byMember: z.array(
    z.object({ memberId: z.uuid().nullable(), name: z.string().nullable(), ...row }),
  ),
  byPaymentMethod: z.array(
    z.object({ method: z.enum(['cash', 'card', 'online']).nullable(), ...row }),
  ),
});
export type ReportSummary = z.infer<typeof ReportSummary>;

/** Which table an export contains. */
export const ReportDimension = z.enum([
  'day',
  'hour',
  'weekday',
  'item',
  'category',
  'member',
  'payment',
]);
export type ReportDimension = z.infer<typeof ReportDimension>;

export const ReportExportQuery = z.object({
  from: IsoDate,
  to: IsoDate,
  format: z.enum(['csv', 'xlsx']),
  /** csv: one table; xlsx: every table on its own sheet when omitted. */
  dimension: ReportDimension.optional(),
  lang: z.enum(['bs', 'en']).default('bs'),
});
export type ReportExportQuery = z.infer<typeof ReportExportQuery>;
