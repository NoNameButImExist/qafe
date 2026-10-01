import { ApiErrorBody, type StaffSession } from '@qafe/contracts';

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

const KNOWN = [
  'invalid_credentials',
  'account_disabled',
  'venue_closed',
  'too_many_attempts',
  'validation_failed',
  'category_not_empty',
  'unsupported_image',
  'file_too_large',
  'label_taken',
  'username_taken',
  'last_owner',
  'cannot_modify_self',
  'unauthorized',
  'forbidden',
  'not_found',
  'network',
  'invalid_state',
] as const;

/** Downloads a file from the API (Excel, CSV) with the access token and saves it. */
export async function download(path: string, retried = false): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
  if (res.status === 401 && !retried && (await refreshSession())) return download(path, true);
  if (!res.ok) throw new ApiError(res.status, 'unknown', res.statusText);
  const name =
    /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'qafe-report';
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Translation key for an error, for t(errorKey(error)). */
export function errorKey(error: unknown) {
  const code = error instanceof ApiError ? error.code : 'unknown';
  return `errors.${(KNOWN as readonly string[]).includes(code) ? (code as (typeof KNOWN)[number]) : 'unknown'}` as const;
}
