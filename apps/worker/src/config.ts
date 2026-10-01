import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().default('qafe'),
  SVC_CORE_PASSWORD: z.string().min(1),
  SVC_AUDIT_PASSWORD: z.string().min(1),
  SVC_CATALOG_PASSWORD: z.string().min(1),
  SVC_ORDERING_PASSWORD: z.string().min(1),
  SVC_BILLING_PASSWORD: z.string().min(1),
  SVC_REPORTING_PASSWORD: z.string().min(1),
  // Web Push for staff (FR-KON-05); without keys no notifications are sent.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@qafe.ba'),
  OUTBOX_POLL_MS: z.coerce.number().int().min(100).default(1000),
});

export type WorkerConfig = z.infer<typeof Env>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = Env.safeParse(source);
  if (!parsed.success) throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
