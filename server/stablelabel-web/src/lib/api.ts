/**
 * API client — wraps fetch with auth token injection.
 *
 * All API calls go through this module. The MSAL ID token is attached
 * as a Bearer token in the Authorization header.
 */

export interface RequestOptions {
  signal?: AbortSignal;
}

let _getToken: (() => Promise<string | null>) | null = null;

/** Called once from AuthProvider to wire up token acquisition. */
export function setTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn;
}

const BASE = '/api';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (_getToken) {
    const token = await _getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, detail.detail || res.statusText);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function uploadFile<T>(path: string, file: File, options?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {};

  if (_getToken) {
    const token = await _getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
    signal: options?.signal,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, detail.detail || res.statusText);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
  upload: <T>(path: string, file: File, options?: RequestOptions) => uploadFile<T>(path, file, options),
};
