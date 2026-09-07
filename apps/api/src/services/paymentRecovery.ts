import { TERMINAL_SESSION_STATUSES, type SessionStatus } from '@hidro/shared';

/**
 * Tabla EXHAUSTIVA de recuperabilidad (Fase 1, Approach B del design doc): qué estado
 * terminal de sesión admite recuperar un pago aprobado tardío. Deliberadamente NO es
 * un solo `if` en processApproval() — el próximo estado terminal que se agregue a la
 * máquina de estados fuerza pasar por acá y tomar una decisión explícita, en vez de
 * colar en silencio un comportamiento no revisado en una función que mueve dinero real.
 *
 * Cubre los 8 SessionStatus con TRANSITIONS[...] === [] antes de esta fase
 * (@hidro/state-machine): solo PAYMENT_EXPIRED entra con `recoverable: true`.
 */
export interface RecoverabilityEntry {
  recoverable: boolean;
  reason: string;
}

export const TERMINAL_RECOVERABILITY: Record<
  'FINISHED' | 'PAYMENT_FAILED' | 'PAYMENT_EXPIRED' | 'AUTHORIZATION_EXPIRED' | 'MACHINE_OFFLINE' | 'SESSION_INTERRUPTED' | 'EMERGENCY_STOP' | 'DEVICE_ERROR',
  RecoverabilityEntry
> = {
  PAYMENT_EXPIRED: {
    recoverable: true,
    reason: 'El webhook se perdió sobre un pago que sí se acreditó (ADR-023).',
  },
  PAYMENT_FAILED: {
    recoverable: false,
    reason: 'Mercado Pago ya rechazó explícitamente ese pago; una aprobación tardía sobre el mismo ID sería anómala.',
  },
  MACHINE_OFFLINE: {
    recoverable: false,
    reason: 'La máquina cayó entre el pago y la aprobación (revocación deliberada); reabrirla es política de reembolso, fuera de alcance.',
  },
  AUTHORIZATION_EXPIRED: {
    recoverable: false,
    reason: 'El pago ya fue aprobado con éxito antes; lo que expiró es la ventana del pulsador, no el pago.',
  },
  SESSION_INTERRUPTED: {
    recoverable: false,
    reason: 'El lavado ya arrancó y se interrumpió; es el caso de reembolso de ADR-024 (Fase 1.5).',
  },
  EMERGENCY_STOP: {
    recoverable: false,
    reason: 'Acción deliberada de un admin; no es un problema de pago.',
  },
  DEVICE_ERROR: {
    recoverable: false,
    reason: 'Falla reportada por el ESP32, no del proveedor de pago.',
  },
  FINISHED: {
    recoverable: false,
    reason: 'El pago ya se resolvió con éxito antes; no hay nada que reconciliar.',
  },
};

/** SessionStatus recuperables — hoy únicamente PAYMENT_EXPIRED. */
export function isRecoverableTerminalStatus(status: SessionStatus): status is 'PAYMENT_EXPIRED' {
  const entry = (TERMINAL_RECOVERABILITY as Record<string, RecoverabilityEntry | undefined>)[status];
  return entry?.recoverable === true;
}

// El union literal de TERMINAL_RECOVERABILITY arriba no está ligado a nivel de tipos a
// TERMINAL_SESSION_STATUSES (ese último no es `as const`, así que derivarlo perdería la
// unión literal) — así que el "fuerza pasar por acá" del comentario de arriba lo cumple
// este chequeo en tiempo de carga, no el compilador: si alguien agrega un estado terminal
// nuevo en @hidro/shared sin decidir su recuperabilidad acá, esto explota en el boot y en
// cada test, no en silencio en producción.
const missing = TERMINAL_SESSION_STATUSES.filter((s) => !(s in TERMINAL_RECOVERABILITY));
if (missing.length > 0) {
  throw new Error(`TERMINAL_RECOVERABILITY desactualizada: falta decidir recuperabilidad para ${missing.join(', ')}`);
}
