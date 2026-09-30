import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().default('qafe'),
  SVC_CORE_PASSWORD: z.string().min(1),
  SVC_AUDIT_PASSWORD: z.string().min(1),
  SVC_CATALOG_PASSWORD: z.string().min(1),

  // PEM content wins over a path (production secrets are usually injected as values).
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PRIVATE_KEY_PATH: z.string().default('secrets/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('secrets/jwt-public.pem'),
  JWT_ISSUER: z.string().min(1),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_COOKIE_PATH: z.string().startsWith('/').default('/auth'),
  ADMIN_MFA_REQUIRED: z.stringbool().default(false),

  CORS_ORIGINS: z.string().default(''),

  // Menu images and logos. "memory" keeps files in the process (tests only).
  STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET_MENU_IMAGES: z.string().default('menu-images'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  /** Base URL browsers load images from, e.g. http://localhost:9000/menu-images */
  S3_PUBLIC_URL: z.string().optional(),
});

export type StorageConfig =
  | {
      driver: 's3';
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicUrl: string;
    }
  | { driver: 'memory' };

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  db: {
    host: string;
    port: number;
    database: string;
    corePassword: string;
    auditPassword: string;
    catalogPassword: string;
  };
  storage: StorageConfig;
  auth: {
    privateKeyPem: string;
    publicKeyPem: string;
    issuer: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    cookiePath: string;
    /** Secure cookies everywhere except local development over http. */
    cookieSecure: boolean;
    adminMfaRequired: boolean;
  };
  corsOrigins: string[];
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Relative paths in .env are relative to the repo root (or the working dir in a container). */
function baseDir(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function readKey(value: string | undefined, path: string): string {
  if (value) return value.replace(/\\n/g, '\n');
  return readFileSync(isAbsolute(path) ? path : resolve(baseDir(), path), 'utf8');
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    db: {
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      corePassword: env.SVC_CORE_PASSWORD,
      auditPassword: env.SVC_AUDIT_PASSWORD,
      catalogPassword: env.SVC_CATALOG_PASSWORD,
    },
    storage: storageConfig(env),
    auth: {
      privateKeyPem: readKey(env.JWT_PRIVATE_KEY, env.JWT_PRIVATE_KEY_PATH),
      publicKeyPem: readKey(env.JWT_PUBLIC_KEY, env.JWT_PUBLIC_KEY_PATH),
      issuer: env.JWT_ISSUER,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      cookiePath: env.AUTH_COOKIE_PATH,
      cookieSecure: env.NODE_ENV !== 'development',
      adminMfaRequired: env.ADMIN_MFA_REQUIRED,
    },
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

function storageConfig(env: z.infer<typeof Env>): StorageConfig {
  if (env.STORAGE_DRIVER === 'memory') return { driver: 'memory' };
  const missing = (['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const).filter(
    (k) => !env[k],
  );
  if (missing.length)
    throw new Error(`Invalid environment: ${missing.join(', ')} required for STORAGE_DRIVER=s3`);
  const endpoint = env.S3_ENDPOINT!;
  return {
    driver: 's3',
    endpoint,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET_MENU_IMAGES,
    accessKeyId: env.S3_ACCESS_KEY!,
    secretAccessKey: env.S3_SECRET_KEY!,
    publicUrl: (env.S3_PUBLIC_URL ?? `${endpoint}/${env.S3_BUCKET_MENU_IMAGES}`).replace(/\/$/, ''),
  };
}
