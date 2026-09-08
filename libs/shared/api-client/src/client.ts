import { ApiRequestError } from '@ezihubb/types';

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
}

// Strip trailing /api/v1 so the env var works correctly regardless of whether
// it was set to "https://api.example.com" or "https://api.example.com/api/v1"
// — apps/client/.env.local.example documents the latter form, so any caller
// that skips this (as apps/client/src/lib/api.ts's setBaseUrl() call once
// did) doubles the prefix into .../api/v1/api/v1/... and 404s every request.
// Centralized here, in setBaseUrl itself, so no caller can bypass it by
// assigning the raw env value directly.
function stripApiV1Suffix(url: string): string {
  return url.replace(/\/api\/v1\/?$/, '');
}

let baseUrl = stripApiV1Suffix(process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3002');

export function setBaseUrl(url: string): void {
  baseUrl = stripApiV1Suffix(url);
}

// ── Token provider (registered by auth store) ─────────────────────────────────

type TokenGetter  = () => string | null;
type TokenUpdater = (token: string | null) => void;
type LocaleGetter = () => string | null;

let _tokenGetter:  TokenGetter  = () => null;     // returns in-memory access token
let _tokenUpdater: TokenUpdater = () => undefined; // called when token is refreshed
let _localeGetter: LocaleGetter = () => null;     // returns the active UI locale ('en' | 'vi' | 'zh')

/**
 * Registered once at app root (from a component that calls `useLocale()`) so
 * every API request tells the server which locale to translate DB content
 * (product/category/collection names) into via the `X-Locale` header.
 */
export function setLocaleGetter(getter: LocaleGetter): void {
  _localeGetter = getter;
}

function getLocaleHeader(): Record<string, string> {
  const locale = _localeGetter();
  return locale ? { 'X-Locale': locale } : {};
}

/**
 * Register an in-memory token provider from the auth store.
 * Must be called during app initialisation so API calls use the correct token.
 */
export function setTokenGetter(getter: TokenGetter): void {
  _tokenGetter = getter;
}

/**
 * Register a callback that is invoked whenever the API client silently
 * refreshes the access token (on 401). The auth store uses this to keep
 * its in-memory copy in sync.
 */
export function setTokenUpdater(updater: TokenUpdater): void {
  _tokenUpdater = updater;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildUrl(path: string, params?: RequestOptions['params']): string {
  // Prepend /api/v1 so the old `api` client matches the server's global prefix.
  const prefixed = path.startsWith('/api/') ? path : `/api/v1${path}`;
  const url = new URL(prefixed, baseUrl);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  // 1. In-memory token from auth store (preferred)
  const memToken = _tokenGetter();
  if (memToken) return { Authorization: `Bearer ${memToken}` };

  return {};
}

async function refreshTokens(): Promise<string | null> {
  try {
    const res = await fetch(buildUrl('/auth/refresh'), {
      method:      'POST',
      credentials: 'include', // sends httpOnly refresh cookie
    });
    if (!res.ok) {
      _tokenUpdater(null); // clear stale token
      return null;
    }
    const json  = await res.json();
    const token: string | null = json?.data?.accessToken ?? null;
    if (token) {
      _tokenUpdater(token); // update auth store in-memory token
    }
    return token;
  } catch {
    return null;
  }
}

// ── Core fetch ────────────────────────────────────────────────────────────────

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers: extraHeaders, ...rest } = options;

  // A FormData body must go out WITHOUT a content-type of our choosing.
  //
  // multipart requires a boundary token that has to match the encoded body,
  // and only the runtime that serialises the body knows it. Sending
  // `application/json` over a FormData body — which this did for every upload
  // through this helper — produces a request the server cannot parse: multer
  // finds no multipart body and the handler sees no file.
  //
  // It failed quietly, because the request itself succeeded: right URL, valid
  // auth, 2xx-shaped round trip, no file.
  const isFormDataBody = typeof FormData !== 'undefined' && rest.body instanceof FormData;

  const doFetch = async (withAuth: boolean): Promise<Response> => {
    const authHeader = withAuth ? getAuthHeader() : {};
    return fetch(buildUrl(path, params), {
      credentials: 'include',
      ...rest,
      headers: {
        ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
        Accept:         'application/json',
        ...authHeader,
        ...getLocaleHeader(),
        ...(extraHeaders as Record<string, string>),
      },
    });
  };

  let res = await doFetch(true);

  // Auto-refresh on 401
  if (res.status === 401) {
    const newToken = await refreshTokens();
    if (newToken) {
      res = await doFetch(true);
    }
  }

  let body: unknown;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  if (!res.ok) {
    const payload = body as {
      message?: unknown;
      code?: unknown;
      errors?: Record<string, string[]>;
      error?: {
        message?: unknown;
        code?: unknown;
        details?: { field: string; message: string }[];
      };
    };
    const serverError = payload?.error;
    throw new ApiRequestError(
      res.status,
      typeof serverError?.message === 'string'
        ? serverError.message
        : typeof payload?.message === 'string' ? payload.message : `HTTP ${res.status}`,
      payload?.errors,
      typeof serverError?.code === 'string'
        ? serverError.code
        : typeof payload?.code === 'string' ? payload.code : undefined,
      serverError?.details,
    );
  }

  // Unwrap { success, data } envelope
  if (
    body !== null &&
    typeof body === 'object' &&
    'success' in (body as object) &&
    'data' in (body as object)
  ) {
    return (body as { data: T }).data;
  }

  return body as T;
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export const api = {
  get:    <T>(path: string, opts?: RequestOptions) =>
    apiFetch<T>(path, { method: 'GET', ...opts }),

  post:   <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), ...opts }),

  patch:  <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...opts }),

  put:    <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body), ...opts }),

  delete: <T>(path: string, opts?: RequestOptions) =>
    apiFetch<T>(path, { method: 'DELETE', ...opts }),
};

// ── apiClient — automatically unwraps { success, data, meta } envelope ─────────
// Returns T where T is the type of the `data` field.
// For paginated list endpoints, pass T = PaginatedResponse<X>; access .data for items.
// For single-item endpoints, pass T = YourDto; use result directly.
// Contrast with `api` (above) which also unwraps but uses the older apiFetch path.

type ApiClientOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  token?: string;
  /** Next.js ISR / full-route cache control — passed through to fetch() */
  next?: { revalidate?: number | false; tags?: string[] };
};

async function apiRequest<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const { body, params, token, ...init } = options;

  const url = new URL(`${baseUrl}/api/v1${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    });
  }

  /**
   * FormData goes out as itself, with no content-type of our choosing.
   *
   * This path did two separate fatal things to an upload. It set
   * `application/json`, which destroys the multipart boundary — that token has
   * to match the encoded body and only the runtime that serialises the body
   * knows it. And then `JSON.stringify` turned the FormData object into the
   * two-character string "{}", so the file never left the browser at all.
   *
   * The server's side of that is "No file was uploaded": multer finds no
   * multipart body, the handler is called with an empty array, and the request
   * otherwise looks perfect — right URL, valid auth, clean round trip.
   *
   * apiFetch above and the admin axios instance both already guard this, each
   * with its own note. This was the third copy and the one nobody had fixed.
   */
  const isFormDataBody = typeof FormData !== 'undefined' && body instanceof FormData;

  const doFetch = (authToken?: string): Promise<Response> => {
    const headers: Record<string, string> = {
      ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : getAuthHeader()),
      ...getLocaleHeader(),
      ...(init.headers as Record<string, string>),
    };
    return fetch(url.toString(), {
      credentials: 'include',
      ...init,
      headers,
      body: isFormDataBody
        ? (body as FormData)
        : body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch(token);

  // Auto-refresh on 401 — mirrors apiFetch's behavior below, which this
  // client previously lacked entirely. If the refresh itself fails,
  // refreshTokens() already calls the registered token-updater with `null`,
  // which clears the auth store and signs the user out (see auth.store.ts) —
  // so a dead session stops looking "logged in" instead of only surfacing on
  // the next unrelated request.
  if (res.status === 401) {
    const newToken = await refreshTokens();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  const json = await res.json();

  if (!res.ok || !json.success) {
    const err = new Error(json.error?.message ?? 'Request failed') as Error & {
      code?: string;
      details?: { field: string; message: string }[];
      status?: number;
      statusCode?: number;
    };
    err.code       = json.error?.code;
    err.details    = json.error?.details;
    err.status     = res.status;
    // Alias so shared auth-error classifiers (which check `statusCode`, matching
    // ApiRequestError from the older `apiFetch` client) also recognize this and
    // stop retrying — without it, a 401 here silently falls back to the default
    // retry policy and doubles up in the console instead of failing fast.
    err.statusCode = res.status;
    throw err;
  }

  // Unwrap standard API envelope { success: true, data: X, meta: {...} }
  // so callers receive X directly rather than the full envelope.
  if (json !== null && typeof json === 'object' && 'data' in json && 'meta' in json) {
    return (json as { data: T }).data;
  }

  return json as T;
}

export const apiClient = {
  get:    <T>(path: string, options?: ApiClientOptions) =>
            apiRequest<T>(path, { method: 'GET', ...options }),
  post:   <T>(path: string, body?: unknown, options?: ApiClientOptions) =>
            apiRequest<T>(path, { method: 'POST', body, ...options }),
  patch:  <T>(path: string, body?: unknown, options?: ApiClientOptions) =>
            apiRequest<T>(path, { method: 'PATCH', body, ...options }),
  put:    <T>(path: string, body?: unknown, options?: ApiClientOptions) =>
            apiRequest<T>(path, { method: 'PUT', body, ...options }),
  delete: <T>(path: string, options?: ApiClientOptions) =>
            apiRequest<T>(path, { method: 'DELETE', ...options }),
};
