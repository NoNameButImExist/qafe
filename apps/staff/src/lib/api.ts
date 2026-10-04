import { ApiErrorBody, type StaffSession } from '@qafe/contracts';
import i18n from '../i18n';
import { reportNetwork } from './network';

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

/** The refresh failed because the API could not be reached (not because the session ended). */
let lastRefreshOffline = false;
export const refreshFailedOffline = () => lastRefreshOffline;

/** Exchanges the staff refresh cookie for a new access token. Concurrent calls share one request. */
export function refreshSession(): Promise<StaffSession | null> {
  refreshing ??= (async () => {
    try {
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}/auth/staff/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        lastRefreshOffline = true;
        reportNetwork(false);
        return null;
      }
      lastRefreshOffline = false;
      reportNetwork(true);
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
  /** Give up after this long and treat it as a network error (a connection that hangs). */
  timeoutMs?: number;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  let res: Response;
  const controller = options.timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
  try {
    res = await fetch(url, {
      signal: controller?.signal,
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    reportNetwork(false);
    throw new ApiError(0, 'network', 'Network error');
  } finally {
    if (timer) clearTimeout(timer);
  }
  reportNetwork(true);

  if (res.status === 401 && !options.retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, { ...options, retried: true });
    // Unreachable is not signed out: keep the member in, the request just failed.
    if (refreshFailedOffline()) throw new ApiError(0, 'network', 'Network error');
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
