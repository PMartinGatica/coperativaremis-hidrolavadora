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

// IMPORTANTE: fábricas, no singletons. Un singleton a nivel de módulo compartiría
// el store en memoria entre instancias de la app (p.ej. entre tests), agotando la
// cuota entre aplicaciones distintas. Cada buildApp() crea sus propios limiters.
export function createGlobalRateLimit() {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
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
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiados intentos de inicio de sesión.' } },
  });
}

export function createSimulateRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Demasiadas simulaciones por minuto.' } },
  });
}

/** Captura el body crudo para la firma HMAC de dispositivos. */
export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
  req.rawBody = buf;
}
