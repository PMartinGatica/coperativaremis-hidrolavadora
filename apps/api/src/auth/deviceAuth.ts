import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppError, DEVICE_AUTH_TOLERANCE_MS, type DeviceRow } from '@hidro/shared';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/client.js';
import { getDeviceByIdentifier } from '../repositories/repos.js';
import { decryptSecret } from '../db/seed.js';
import { createLogger } from '../logger.js';

const log = createLogger('device-auth');

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Autenticación de dispositivos por HMAC-SHA256 con secret POR DISPOSITIVO.
 * Headers: x-device-id, x-device-ts (unix ms), x-device-sig
 * firma = hex( HMAC_SHA256(secret, `${deviceId}.${ts}.${METHOD}.${path}.${sha256(body)}`) )
 *
 * El secret se almacena CIFRADO (AES-256-GCM, clave derivada de DEVICE_AUTH_SECRET)
 * para que el servidor pueda verificar la firma. Nunca se confía en machine_id suelto.
 * La ventana de timestamp (±5 min) mitiga replay de requests capturadas.
 */
export function signDeviceRequest(
  secret: string,
  deviceId: string,
  ts: number,
  method: string,
  path: string,
  body: Buffer | string,
): string {
  const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const bodyHash = createHash('sha256').update(bodyBuf).digest('hex');
  const payload = `${deviceId}.${ts}.${method.toUpperCase()}.${path}.${bodyHash}`;
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export async function authenticateDevice(db: Db, config: AppConfig, req: Request): Promise<DeviceRow> {
  const deviceId = req.header('x-device-id');
  const tsHeader = req.header('x-device-ts');
  const signature = req.header('x-device-sig');
  if (!deviceId || !tsHeader || !signature) {
    throw new AppError('DEVICE_UNAUTHORIZED', 'Faltan headers de autenticación del dispositivo.');
  }
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > DEVICE_AUTH_TOLERANCE_MS) {
    log.warn('device auth timestamp fuera de ventana', { deviceId });
    throw new AppError('DEVICE_UNAUTHORIZED', 'Timestamp de autenticación inválido o fuera de ventana.');
  }

  const device = await getDeviceByIdentifier(db, deviceId);
  if (!device) {
    log.warn('device no registrado', { deviceId });
    throw new AppError('DEVICE_UNREGISTERED', 'Dispositivo no registrado en el sistema.');
  }

  const secret = decryptSecret(device.secretEnc, config.deviceAuthSecret);
  if (!secret) {
    log.error('device secret no descifrable', { deviceId });
    throw new AppError('DEVICE_UNAUTHORIZED', 'Secret del dispositivo inválido. Rotá las credenciales desde administración.');
  }

  const rawBody = (req as RawBodyRequest).rawBody ?? Buffer.from('');
  // IMPORTANTE: dentro de un router montado, req.path pierde el prefijo de montaje.
  // Firmamos sobre originalUrl (sin query) para que el dispositivo y el backend coincidan.
  const path = (req.originalUrl ?? req.path).split('?')[0] as string;
  const expected = signDeviceRequest(secret, deviceId, ts, req.method, path, rawBody);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.toLowerCase(), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    log.warn('device auth firma inválida', { deviceId, path: req.path });
    throw new AppError('DEVICE_UNAUTHORIZED', 'Firma HMAC inválida.');
  }
  return device;
}
