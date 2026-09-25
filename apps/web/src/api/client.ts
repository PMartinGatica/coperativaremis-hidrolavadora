import { safeGet, safeRemove, safeSet } from '../lib/storage.js';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
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
    const err = (data.error ?? {}) as { code?: string; message?: string; details?: Record<string, unknown> };
    handleAuthFailure(path, res.status, err.code, err.details, token);
    throw new ApiError(err.message ?? `Error ${res.status}`, err.code ?? 'ERROR', res.status, err.details);
  }
  return data as T;
}

/**
 * Qué hacer cuando el servidor corta o frena la sesión (ADR-062):
 *  - 401 fuera del login: la cuenta fue desactivada, modificada o el token venció. Se limpia el
 *    token SOLO si es el mismo que usó este pedido (un poll viejo en vuelo no borra el token
 *    nuevo que acaba de llegar de "cambiar clave") y el login muestra el motivo.
 *  - 403 PASSWORD_CHANGE_REQUIRED: clave inicial sin cambiar → a "Mi cuenta".
 */
export function handleAuthFailure(
  path: string,
  status: number,
  code: string | undefined,
  details: Record<string, unknown> | undefined,
  usedToken: string | null,
): void {
  if (status === 401 && usedToken && !path.startsWith('/admin/auth/login')) {
    if (getToken() !== usedToken) return;
    clearToken();
    const reason = typeof details?.reason === 'string' ? details.reason : 'expired';
    safeSet(LOGOUT_REASON_KEY, reason);
    if (!window.location.pathname.startsWith('/admin/login')) {
      window.location.href = '/admin/login';
    }
    return;
  }
  if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED' && !window.location.pathname.startsWith('/admin/account')) {
    window.location.href = '/admin/account';
  }
}

const TOKEN_KEY = 'hidro.admin.token';
const LOGOUT_REASON_KEY = 'hidro.admin.logoutReason';

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

/** Motivo del último corte de sesión, para el aviso del login. Se lee una sola vez. */
export function takeLogoutReason(): string | null {
  const reason = safeGet(LOGOUT_REASON_KEY);
  if (reason) safeRemove(LOGOUT_REASON_KEY);
  return reason;
}
