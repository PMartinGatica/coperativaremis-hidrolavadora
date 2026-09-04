import {
  ACTIVE_SESSION_STATUSES,
  ERROR_SESSION_STATUSES,
  TERMINAL_SESSION_STATUSES,
  type SessionStatus,
} from '@hidro/shared';

/**
 * Máquina de estados CENTRALIZADA de sesión.
 * Una sesión nunca puede pasar arbitrariamente de un estado a otro:
 * toda transición debe estar declarada aquí. La API valida con assertTransition()
 * ANTES de escribir en base de datos.
 *
 * Flujo feliz:
 *   IDLE -> PAYMENT_PENDING -> PAYMENT_APPROVED -> AUTHORIZED
 *        -> WAITING_FOR_BUTTON -> RUNNING -> FINISHED
 */
export const TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  IDLE: ['PAYMENT_PENDING', 'MACHINE_OFFLINE'],
  PAYMENT_PENDING: ['PAYMENT_APPROVED', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'MACHINE_OFFLINE'],
  // MACHINE_OFFLINE: la máquina cayó entre el pago y la aprobación (no se habilita nada)
  PAYMENT_APPROVED: ['AUTHORIZED', 'MACHINE_OFFLINE'],
  AUTHORIZED: ['WAITING_FOR_BUTTON', 'AUTHORIZATION_EXPIRED', 'EMERGENCY_STOP'],
  WAITING_FOR_BUTTON: ['RUNNING', 'AUTHORIZATION_EXPIRED', 'EMERGENCY_STOP'],
  RUNNING: ['FINISHED', 'SESSION_INTERRUPTED', 'EMERGENCY_STOP', 'DEVICE_ERROR'],
  FINISHED: [],
  PAYMENT_FAILED: [],
  PAYMENT_EXPIRED: [],
  AUTHORIZATION_EXPIRED: [],
  MACHINE_OFFLINE: [],
  SESSION_INTERRUPTED: [],
  EMERGENCY_STOP: [],
  DEVICE_ERROR: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (from === to) return; // no-op permitido (idempotencia)
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_TRANSITION: ${from} -> ${to}`);
  }
}

export function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_SESSION_STATUSES.includes(status);
}

export function isActive(status: SessionStatus): boolean {
  return ACTIVE_SESSION_STATUSES.includes(status);
}

export function isErrorStatus(status: SessionStatus): boolean {
  return ERROR_SESSION_STATUSES.includes(status);
}

export type StatusTone = 'ok' | 'warn' | 'error' | 'info' | 'neutral';

export const STATUS_LABELS: Record<SessionStatus, string> = {
  IDLE: 'Inactiva',
  PAYMENT_PENDING: 'Esperando pago',
  PAYMENT_APPROVED: 'Pago aprobado',
  AUTHORIZED: 'Autorizada',
  WAITING_FOR_BUTTON: 'Esperando pulsador',
  RUNNING: 'Lavado en curso',
  FINISHED: 'Finalizada',
  PAYMENT_FAILED: 'Pago rechazado',
  PAYMENT_EXPIRED: 'Pago vencido',
  AUTHORIZATION_EXPIRED: 'Autorización vencida',
  MACHINE_OFFLINE: 'Máquina fuera de servicio',
  SESSION_INTERRUPTED: 'Interrumpida',
  EMERGENCY_STOP: 'Parada de emergencia',
  DEVICE_ERROR: 'Error de dispositivo',
};

export const STATUS_TONES: Record<SessionStatus, StatusTone> = {
  IDLE: 'neutral',
  PAYMENT_PENDING: 'info',
  PAYMENT_APPROVED: 'info',
  AUTHORIZED: 'ok',
  WAITING_FOR_BUTTON: 'ok',
  RUNNING: 'ok',
  FINISHED: 'ok',
  PAYMENT_FAILED: 'error',
  PAYMENT_EXPIRED: 'warn',
  AUTHORIZATION_EXPIRED: 'warn',
  MACHINE_OFFLINE: 'warn',
  SESSION_INTERRUPTED: 'warn',
  EMERGENCY_STOP: 'error',
  DEVICE_ERROR: 'error',
};
