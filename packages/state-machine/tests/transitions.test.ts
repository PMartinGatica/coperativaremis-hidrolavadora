import { describe, expect, it } from 'vitest';
import {
  canTransition,
  TRANSITIONS,
  isActive,
  isTerminal,
  assertTransition,
  STATUS_LABELS,
} from '../src/index.js';

describe('state machine: transiciones declaradas', () => {
  it('flujo feliz completo', () => {
    const path = ['IDLE', 'PAYMENT_PENDING', 'PAYMENT_APPROVED', 'AUTHORIZED', 'WAITING_FOR_BUTTON', 'RUNNING', 'FINISHED'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i] as never, path[i + 1] as never)).toBe(true);
    }
  });

  it('nunca salta estados arbitrariamente', () => {
    expect(canTransition('IDLE', 'RUNNING')).toBe(false);
    expect(canTransition('PAYMENT_PENDING', 'RUNNING')).toBe(false);
    expect(canTransition('PAYMENT_PENDING', 'AUTHORIZED')).toBe(false);
    expect(canTransition('AUTHORIZED', 'RUNNING')).toBe(false); // requiere WAITING_FOR_BUTTON
    expect(canTransition('RUNNING', 'AUTHORIZED')).toBe(false);
    expect(canTransition('FINISHED', 'RUNNING')).toBe(false);
    expect(canTransition('PAYMENT_FAILED', 'AUTHORIZED')).toBe(false);
  });

  it('estados de error permitidos', () => {
    expect(canTransition('RUNNING', 'SESSION_INTERRUPTED')).toBe(true);
    expect(canTransition('RUNNING', 'EMERGENCY_STOP')).toBe(true);
    expect(canTransition('RUNNING', 'DEVICE_ERROR')).toBe(true);
    expect(canTransition('WAITING_FOR_BUTTON', 'AUTHORIZATION_EXPIRED')).toBe(true);
    expect(canTransition('AUTHORIZED', 'AUTHORIZATION_EXPIRED')).toBe(true);
    expect(canTransition('PAYMENT_APPROVED', 'MACHINE_OFFLINE')).toBe(true);
  });

  it('assertTransition lanza en transición inválida', () => {
    expect(() => assertTransition('RUNNING', 'IDLE')).toThrow(/INVALID_TRANSITION/);
    expect(() => assertTransition('IDLE', 'PAYMENT_PENDING')).not.toThrow();
  });

  it('terminales y activas correctas', () => {
    for (const t of ['FINISHED', 'PAYMENT_FAILED', 'EMERGENCY_STOP', 'AUTHORIZATION_EXPIRED']) {
      expect(isTerminal(t as never)).toBe(true);
      expect(isActive(t as never)).toBe(false);
    }
    for (const a of ['IDLE', 'PAYMENT_PENDING', 'AUTHORIZED', 'RUNNING']) {
      expect(isActive(a as never)).toBe(true);
    }
  });

  it('todos los estados tienen etiqueta', () => {
    for (const statuses of Object.values(TRANSITIONS)) {
      for (const s of statuses) expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });
});
