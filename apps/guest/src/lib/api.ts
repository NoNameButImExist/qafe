import type { ApiErrorBody } from '@qafe/contracts';

/** Same origin: <slug>.qafe.ba/api/* reaches the API, which reads the venue from the host. */
const BASE_URL = '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Stable code from @qafe/contracts ErrorCode, or "network" / "unknown". */
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** JSON request with the device cookie; errors become ApiError with the server's code. */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Network error');
  }
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (json as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      error?.code ?? 'unknown',
      error?.message ?? res.statusText,
      error?.details as Record<string, unknown> | undefined,
    );
  }
  return json as T;
}

/** i18n key for an error; unknown codes fall back to a generic message. */
export function errorKey(error: unknown) {
  const code = error instanceof ApiError ? error.code : 'unknown';
  return `errors.${code}` as const;
}
