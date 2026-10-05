import { ApiErrorBody, type AuthSession } from '@qafe/contracts';

const BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Stable code from @qafe/contracts ErrorCode, or "network" / "unknown". */
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

// The access token lives only in memory (never in localStorage). The refresh token is an
// httpOnly cookie the browser sends to /auth/refresh by itself.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshing: Promise<AuthSession | null> | null = null;

export const session = {
  set(token: string) {
    accessToken = token;
  },
  clear() {
    accessToken = null;
  },
  onExpired(callback: () => void) {
    onSessionExpired = callback;
  },
};

/** Exchanges the refresh cookie for a new access token. Concurrent calls share one request. */
export function refreshSession(): Promise<AuthSession | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const body = (await res.json()) as AuthSession;
      accessToken = body.accessToken;
      return body;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Multipart upload instead of JSON (menu images, FR-ADM-07). */
  form?: FormData;
  query?: Record<string, string | number | undefined>;
  /** Internal: do not try to refresh again. */
  retried?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'network', 'Network error');
  }

  if (res.status === 401 && !options.retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, { ...options, retried: true });
    onSessionExpired?.();
  }

  if (!res.ok) {
    const parsed = ApiErrorBody.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(res.status, code, message, details);
    }
    throw new ApiError(res.status, 'unknown', res.statusText);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Translation key for an error, for t(errorKey(error)). */
export function errorKey(error: unknown) {
  const known = [
    'invalid_credentials',
    'account_disabled',
    'mfa_required',
    'too_many_attempts',
    'slug_taken',
    'cannot_modify_self',
    'validation_failed',
    'unauthorized',
    'forbidden',
    'not_found',
    'network',
  ] as const;
  const code = error instanceof ApiError ? error.code : 'unknown';
  return `errors.${(known as readonly string[]).includes(code) ? (code as (typeof known)[number]) : 'unknown'}` as const;
}
