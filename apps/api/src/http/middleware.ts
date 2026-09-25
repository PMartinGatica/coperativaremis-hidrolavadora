import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { AppError, httpStatusOf, isAppError, normalizePlate } from '@hidro/shared';
import type { Logger } from '../logger.js';

/** Asigna un requestId correlacionable en todos los logs de la request. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.requestId = (req.header('x-request-id') as string | undefined) ?? randomUUID();
  res.setHeader('x-request-id', req.requestId as string);
  next();
}

export function requestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const entry: Record<string, unknown> = {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
      };
      if (res.statusCode >= 500) logger.error('http', entry);
      else if (res.statusCode >= 400) logger.warn('http', entry);
      else logger.debug('http', entry);
    });
    next();
  };
}

/** Manejador central de errores: errores tipados -> JSON estable. */
export function errorHandler(logger: Logger) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (err: unknown, req: Request, res: Response, _next: NextFunction): any => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Entrada inválida.', details: err.flatten() },
      });
    }
    if (isAppError(err)) {
      return res.status(httpStatusOf(err)).json({
        error: { code: err.code, message: err.message, details: err.details ?? undefined },
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error('unhandled error', { requestId: req.requestId, path: req.path, err: message });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno del servidor.' } });
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
}

/** IP real del visitante. En producción hay 2 capas delante de la app (túnel de Cloudflare +
 *  Traefik dentro de Coolify) y `TRUST_PROXY` (saltos de `X-Forwarded-For` a confiar) es frágil
 *  de calibrar a mano — un valor de menos hace que TODOS los visitantes reales compartan la IP
 *  de una de esas capas internas, agrupando su cupo de rate-limit (hallazgo A3, 2026-09-17:
 *  confirmado en vivo que dos redes reales distintas -wifi y datos móviles- caían en el mismo
 *  balde). `CF-Connecting-IP` es más confiable: Cloudflare lo pone en su edge con la IP real y
 *  no se puede falsificar porque el origen solo es alcanzable a través del túnel (sin IP pública
 *  propia expuesta). En local/tests, sin ese header, cae al `req.ip` de siempre. */
export function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) return cf;
  return req.ip ?? 'unknown';
}

/** Esquema con el que el visitante entró a Cloudflare, según el header `CF-Visitor`
 *  (`{"scheme":"http"}` o `{"scheme":"https"}`). `null` si no vino o no es JSON válido. */
function visitorScheme(req: Request): string | null {
  const raw = req.headers['cf-visitor'];
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { scheme?: unknown };
    return typeof parsed.scheme === 'string' ? parsed.scheme.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Manda a HTTPS a quien entró por `http://` (pendiente C3).
 *
 *  Por qué `CF-Visitor` y no `X-Forwarded-Proto`: misma razón que `clientIp` usa
 *  `CF-Connecting-IP`. Hay 2 capas delante de la app (túnel de Cloudflare + Traefik) y el header
 *  de Cloudflare es el único que describe al visitante real; el origen solo es alcanzable a
 *  través del túnel, así que nadie de afuera lo puede falsificar.
 *
 *  No puede entrar en bucle (el riesgo que dejó anotado A1 al desaconsejar el `https://` en
 *  Domains de Coolify): después del 301 el visitante está en https, Cloudflare manda
 *  `scheme: https` y la condición deja de darse. Sin el header — local, tests, cualquier cosa
 *  que no pase por Cloudflare — no redirige nada.
 *
 *  Alcance angosto a propósito:
 *  - Solo GET/HEAD. Un 301 sobre un POST hace que el navegador lo reenvíe como GET y pierda el
 *    cuerpo; y el cuerpo en claro ya viajó, redirigir no lo desandaría.
 *  - `/api` y `/health` quedan afuera: son clientes máquina (ESP32, webhooks de MP, monitoreo)
 *    que pueden no seguir un redirect, y ahí un 301 rompe en silencio.
 *  Lo que queda adentro es justo la superficie que lleva la clave del panel: el HTML y el JS
 *  del admin. Con eso, el navegador recibe la app siempre por TLS y el HSTS que ya manda helmet
 *  (`max-age` de 1 año) se vuelve alcanzable en la primera visita en vez de la segunda.
 *
 *  El destino sale de `PUBLIC_APP_URL`, no del header `Host`: un `Host` atacante convertiría
 *  esto en un redirect abierto. Si esa URL no es https (dev), el middleware queda desactivado. */
export function createHttpsRedirect(publicAppUrl: string) {
  let origin: string | null = null;
  try {
    const parsed = new URL(publicAppUrl);
    if (parsed.protocol === 'https:') origin = parsed.origin;
  } catch {
    // URL inválida o vacía: sin redirect, igual que en desarrollo.
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    if (origin === null) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // En minúsculas: Express rutea sin distinguir mayúsculas, así que `/API/...` llega igual a
    // la API y tiene que quedar igual de excluido.
    const path = req.path.toLowerCase();
    if (path === '/health' || path.startsWith('/health/') || path.startsWith('/api/')) return next();
    if (visitorScheme(req) !== 'http') return next();
    // `originalUrl` normalmente es una ruta absoluta (`/algo`), pero el parser de Node deja la
    // URI entera cuando el pedido viene en forma absoluta (`GET http://x/y HTTP/1.1`, legal para
    // proxies). Concatenar eso daría un Location deforme. No es un redirect abierto (el origen
    // ya está fijo y termina en el host), pero se descarta y listo.
    if (!req.originalUrl.startsWith('/')) return next();
    // 302 y no 301 a propósito. El 301 es lo convencional para http->https, pero acá el destino
    // sale de una variable de entorno que se edita a mano en Coolify, y un 301 con un valor
    // equivocado se queda cacheado en el navegador de cada visitante: "en mi celu anda y en el
    // tuyo no", imposible de depurar desde acá. La parte permanente ya la hace el HSTS que manda
    // helmet (1 año), así que el 301 no aportaba nada que no estuviera cubierto.
    res.redirect(302, `${origin}${req.originalUrl}`);
  };
}

// IMPORTANTE: fábricas, no singletons. Un singleton a nivel de módulo compartiría
// el store en memoria entre instancias de la app (p.ej. entre tests), agotando la
// cuota entre aplicaciones distintas. Cada buildApp() crea sus propios limiters.
export function createGlobalRateLimit() {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: clientIp,
    // El polling de estado (GET) es parte del diseño y no debe consumir cuota;
    // el límite protege las MUTACIONES (pagos, arranques, admin).
    skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Reintentá en unos minutos.' } },
  });
}

export function createPaymentCreationRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: clientIp,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiados intentos de pago. Reintentá en un minuto.' } },
  });
}

/** Por PATENTE (no por IP): un límite global por IP no frena a alguien que prueba los
 *  10.000 PINs de 4 dígitos contra UNA patente conocida desde IPs distintas o rotando
 *  (hallazgo del Eng review de docs/designs/pin-patente-remis-socio.md). Clave = patente
 *  normalizada del body — el rate limiter corre ANTES del parseo Zod de la ruta, así que
 *  normaliza acá mismo para que "ae123cd" y "AE123CD" compartan cupo. */
export function createPinAttemptRateLimit() {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const raw = typeof req.body?.plate === 'string' ? req.body.plate : '';
      return `plate:${normalizePlate(raw)}`;
    },
    message: {
      error: { code: 'RATE_LIMITED', message: 'Demasiados intentos para esta patente. Reintentá en unos minutos.' },
    },
  });
}

export function createAdminLoginRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: clientIp,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiados intentos de inicio de sesión.' } },
  });
}

/** "Mi cuenta → cambiar clave": misma medida que el login pero contador aparte y POR CUENTA,
 *  no por IP (la cooperativa comparte una IP). Corre después de requireAdmin. */
export function createPasswordChangeRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.admin?.id ?? clientIp(req)}`,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Probá de nuevo en 15 minutos.' } },
  });
}

export function createSimulateRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: clientIp,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiadas simulaciones por minuto.' } },
  });
}

/** Captura el body crudo para la firma HMAC de dispositivos. */
export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
  req.rawBody = buf;
}
