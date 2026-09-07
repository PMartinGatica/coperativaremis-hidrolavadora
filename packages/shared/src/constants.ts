import type { SessionStatus } from './types.js';

/**
 * Tarifas definidas por el cliente (configurables desde administración):
 *   remis  -> $500 (remis de la cooperativa con patente registrada)
 *   socio  -> $2.000 (auto particular del socio)
 *   externo -> $8.000 (particular no asociado)
 */
export const DEFAULT_PRICE_REMIS_ARS = 500;
export const DEFAULT_PRICE_SOCIO_ARS = 2000;
export const DEFAULT_PRICE_EXTERNO_ARS = 8000;

/** Límite de lavados por día POR PATENTE (abuso de tarifa de remis). Configurable. */
export const DEFAULT_DAILY_WASH_LIMIT = 2;

export const DEFAULT_DURATION_SECONDS = 180;
export const DEFAULT_AUTH_TTL_SECONDS = 300;
/**
 * Tiempo máximo que una orden de pago sin confirmar ocupa la máquina.
 * 600 s (10 min, Fase 1 / ADR-032 — antes 120 s): escanear el QR, abrir la app de MP,
 * loguearse y pagar con señal de una parada de remises supera 120 s en un pago LENTO
 * normal, no solo en un caso raro de webhook perdido (ver ADR-023). 600 s balancea eso
 * contra "un checkout que nadie paga libera la máquina rápido". Configurable desde admin.
 */
export const DEFAULT_PAYMENT_PENDING_TIMEOUT_SECONDS = 600;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5000;
export const DEVICE_AUTH_POLL_INTERVAL_MS = 2000;

/** Si no hay heartbeat dentro de este umbral: ONLINE -> DEGRADED -> OFFLINE. */
export const DEVICE_ONLINE_THRESHOLD_MS = 15_000;
export const DEVICE_DEGRADED_THRESHOLD_MS = 45_000;

/** Ventana de tolerancia de timestamp para la firma HMAC de dispositivos. */
export const DEVICE_AUTH_TOLERANCE_MS = 300_000;

/** Estados de sesión que "ocupan" la máquina (bloquean nuevos pagos). */
export const ACTIVE_SESSION_STATUSES: SessionStatus[] = [
  'IDLE',
  'PAYMENT_PENDING',
  'PAYMENT_APPROVED',
  'AUTHORIZED',
  'WAITING_FOR_BUTTON',
  'RUNNING',
];

export const TERMINAL_SESSION_STATUSES: SessionStatus[] = [
  'FINISHED',
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
  'AUTHORIZATION_EXPIRED',
  'MACHINE_OFFLINE',
  'SESSION_INTERRUPTED',
  'EMERGENCY_STOP',
  'DEVICE_ERROR',
];

export const ERROR_SESSION_STATUSES: SessionStatus[] = [
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
  'AUTHORIZATION_EXPIRED',
  'MACHINE_OFFLINE',
  'SESSION_INTERRUPTED',
  'EMERGENCY_STOP',
  'DEVICE_ERROR',
];

/** Estados en los que ya existe autorización usable (o por crearse). */
export const AUTHORIZATION_FLOW_STATUSES: SessionStatus[] = [
  'PAYMENT_APPROVED',
  'AUTHORIZED',
  'WAITING_FOR_BUTTON',
  'RUNNING',
];

/** Configuración de hardware: PENDING (validar en puesta en marcha). Ver firmware/esp32/src/app_config.h */
export const HARDWARE_PLACEHOLDER = 'PENDING CLIENT DECISION';
