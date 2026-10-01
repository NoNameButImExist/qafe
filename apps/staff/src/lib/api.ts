import { ApiErrorBody, type StaffSession } from '@qafe/contracts';
import i18n from '../i18n';

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

// Access token in memory only; the refresh token is the httpOnly "qafe_srt" cookie.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshing: Promise<StaffSession | null> | null = null;

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

/** Exchanges the staff refresh cookie for a new access token. Concurrent calls share one request. */
export function refreshSession(): Promise<StaffSession | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/staff/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const body = (await res.json()) as StaffSession;
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
  /** Multipart upload instead of JSON. */
  form?: FormData;
  query?: Record<string, string | number | undefined>;
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

/** The current access token, for the Socket.IO handshake. */
export const currentToken = () => accessToken;

/** Translation key for an error; codes without a translation fall back to "unknown". */
export function errorKey(error: unknown): 'errors.unknown' {
  const code = error instanceof ApiError ? error.code : 'unknown';
  const key = `errors.${code}`;
  return (i18n.exists(key) ? key : 'errors.unknown') as 'errors.unknown';
}
