import { AppError, type SessionStatus } from '@hidro/shared';
import type { Db } from '../db/client.js';
import {
  getSession,
  getSessionForUpdate,
  setSessionStatus,
} from '../repositories/repos.js';

/**
 * Transición explícita y centralizada. assertTransition() viene del paquete
 * @hidro/state-machine: nunca se escribe un estado no declarado.
 * Idempotente: si la sesión ya está en el estado destino, devuelve sin error.
 */
export async function transitionSession(
  db: Db,
  sessionId: string,
  from: SessionStatus,
  to: SessionStatus,
  extra: Parameters<typeof setSessionStatus>[4] = {},
): Promise<{ id: string; status: SessionStatus } | null> {
  const { assertTransition } = await import('@hidro/state-machine');
  assertTransition(from, to);
  const row = await setSessionStatus(db, sessionId, from, to, extra);
  if (row) return row;
  const current = await getSession(db, sessionId);
  if (!current) throw new AppError('SESSION_NOT_FOUND', `Sesión no encontrada: ${sessionId}`);
  if (current.status === to) return current; // ya estaba: idempotente
  throw new AppError(
    'INVALID_TRANSITION',
    `Transición inválida para sesión ${sessionId}: ${current.status} -> ${to}`,
    { sessionId, from: current.status, to },
  );
}

export async function lockSessionOrThrow(db: Db, sessionId: string) {
  const session = await getSessionForUpdate(db, sessionId);
  if (!session) throw new AppError('SESSION_NOT_FOUND', `Sesión no encontrada: ${sessionId}`);
  return session;
}
