import { safeGet, safeRemove, safeSet } from '../lib/storage.js';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** undefined -> adjunta automáticamente el token admin almacenado; null -> sin token */
  token?: string | null;
}

/** Cliente único de API. El frontend NUNCA habla con Mercado Pago directamente. */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = opts.token === undefined ? getToken() : opts.token;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data.error ?? {}) as { code?: string; message?: string };
    // Token vencido/inválido: limpiar y volver al login (fuera de la auth pública)
    if (res.status === 401 && getToken() && !path.startsWith('/admin/auth')) {
      clearToken();
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }
    throw new ApiError(err.message ?? `Error ${res.status}`, err.code ?? 'ERROR', res.status);
  }
  return data as T;
}

const TOKEN_KEY = 'hidro.admin.token';

// safe*: api() lee el token en CADA request, también en la página pública del cliente. Con
// el almacenamiento bloqueado, un localStorage directo tiraba abajo toda la página.
export function storeToken(token: string): void {
  safeSet(TOKEN_KEY, token);
}
export function getToken(): string | null {
  return safeGet(TOKEN_KEY);
}
export function clearToken(): void {
  safeRemove(TOKEN_KEY);
}
