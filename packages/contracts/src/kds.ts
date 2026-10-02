import { z } from 'zod';
import { OrderItemStatus } from './ordering.js';
import { PrepStation } from './venue-settings.js';

export const KdsItem = z.object({
  id: z.uuid(),
  name: z.string(),
  quantity: z.number().int(),
  note: z.string().nullable(),
  modifiers: z.array(z.string()),
  status: OrderItemStatus,
  stationId: z.uuid().nullable(),
  /** When it was marked ready (for the 10-second undo and the finished list). */
  readyAt: z.string().nullable(),
});
export type KdsItem = z.infer<typeof KdsItem>;

export const KdsOrder = z.object({
  orderId: z.uuid(),
  number: z.number().int(),
  tableLabel: z.string(),
  /** Waiting is counted from acceptance (the station starts then). */
  acceptedAt: z.string(),
  note: z.string().nullable(),
  items: z.array(KdsItem),
});
export type KdsOrder = z.infer<typeof KdsOrder>;

/** GET /staff/kds?station= (FR-KON-24..29). */
export const KdsView = z.object({
  stations: z.array(PrepStation),
  warningMinutes: z.number().int(),
  criticalMinutes: z.number().int(),
  /** Orders with items still to prepare at the station, oldest first. */
  open: z.array(KdsOrder),
  /** Finished in the last 60 minutes, newest first (FR-KON-29). */
  done: z.array(KdsOrder),
});
export type KdsView = z.infer<typeof KdsView>;

export const KdsQuery = z.object({ station: z.uuid().optional() });
export type KdsQuery = z.infer<typeof KdsQuery>;
