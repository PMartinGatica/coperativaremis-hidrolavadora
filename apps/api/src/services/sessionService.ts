import { and, eq, sql } from 'drizzle-orm';
import {
  AppError,
  PLATE_CATEGORY_LABELS,
  startOfDayAmericaArgentina,
  type SessionStatus,
  type CheckoutResponse,
  type PlateCategory,
  type SessionTimelineEvent,
} from '@hidro/shared';
import type { Db } from '../db/client.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { PaymentProvider } from '../payments/provider.js';
import { newSessionId, uuid } from '../ids.js';
import { authorizations, payments as paymentsTable, sessions as sessionsTable } from '../db/schema.js';
import {
  countWashesToday,
  getMachine,
  getPaymentBySession,
  getSession,
  getVehicleByPlate,
  insertAudit,
  insertPayment,
  insertSession,
  listAuditForSession,
  listDeviceEventsForSession,
  getAuthorizationByPayment,
  setPaymentStatus,
  setSessionStatus,
  setAuthorizationStatus,
} from '../repositories/repos.js';
import { assertMachinePayable, categoryAndPriceOf } from './machineService.js';
import { transitionSession } from './transition.js';
import { getAuthTtlSeconds, getDailyWashLimit, getDemoTimeScale, getPaymentPendingTimeoutSeconds } from './settingsService.js';
import { processApproval } from './paymentService.js';

/**
 * Ventana máxima para la re-consulta al proveedor en el momento del timeout (ADR-023).
 * Fault isolation (Eng review, hallazgo #3): un proveedor lento/caído nunca debe
 * bloquear el vencimiento del resto de las máquinas en este mismo barrido.
 */
const SWEEP_SEARCH_TIMEOUT_MS = 5000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout tras ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export interface SessionDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
  provider: PaymentProvider;
}

// El "día" del negocio es el de Ushuaia (UTC-3 fijo, sin DST), no el del servidor.
const startOfToday = startOfDayAmericaArgentina;

/**
 * Crea la sesión y la orden de cobro para UNA PATENTE.
 * Seguridad:
 *  - lock advisory por patente (hashtext): el límite diario no tiene carreras
 *    aunque dos clientes usen la misma patente en máquinas distintas.
 *    El cupo se RESERVA acá mismo: PAYMENT_PENDING ya cuenta contra el límite.
 *  - lock FOR UPDATE de la máquina: nunca dos cobros simultáneos por máquina.
 *  - tarifa re-validada en el servidor (nunca se confía en el frontend).
 */
export async function createSessionWithPayment(
  deps: SessionDeps,
  machineId: string,
  plate: string,
  pin?: string,
): Promise<CheckoutResponse> {
  const { db, provider } = deps;

  const machine = await getMachine(db, machineId);
  if (!machine) throw new AppError('MACHINE_NOT_FOUND', `Máquina no encontrada: ${machineId}`);

  const sessionId = newSessionId();
  let category: PlateCategory = 'externo';
  let amount = 0;

  // ---- Tx 1: locks + verificación de máquina, tarifa y límite diario ----
  await db.transaction(async (tx) => {
    // Serializa por patente (evita carreras en el límite diario entre máquinas)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${plate}))`);
    await assertMachinePayable({ ...deps, db: tx }, machineId);

    const vehicle = await getVehicleByPlate(tx, plate);
    const priced = categoryAndPriceOf(vehicle, machine, pin);
    category = priced.category;
    amount = priced.priceArs;

    // Límite de lavados por día POR PATENTE (abuso de tarifa de remis)
    const limit = await getDailyWashLimit(tx, deps.config);
    const used = await countWashesToday(tx, plate, startOfToday());
    if (used >= limit) {
      await insertAudit(tx, {
        actor: 'system',
        action: 'PLATE_LIMIT_REJECTED',
        entity: 'plate',
        entityId: plate,
        metadata: { machineId, used, limit },
      });
      throw new AppError(
        'PLATE_LIMIT_REACHED',
        `Esta patente ya usó sus ${limit} lavados de hoy. Volvé mañana. No se realizó ningún cobro.`,
        { plate, used, limit },
      );
    }

    await insertSession(tx, {
      id: sessionId,
      machineId,
      plate,
      plateCategory: category,
      durationSeconds: machine.durationSeconds,
      status: 'IDLE',
    });
    await insertAudit(tx, {
      actor: 'system',
      action: 'SESSION_CREATED',
      entity: 'session',
      entityId: sessionId,
      metadata: { machineId, plate, category, amount },
    });
    await transitionSession(tx, sessionId, 'IDLE', 'PAYMENT_PENDING');
  });

  // ---- Proveedor (fuera de tx): Demo instantáneo; Mercado Pago crea preference ----
  let externalPaymentId: string;
  let initPoint: string | null = null;
  let providerStatus = 'PENDING';
  try {
    const created = await provider.createPayment({
      machineId,
      machineName: machine.name,
      sessionId,
      externalReference: sessionId,
      amount,
      durationSeconds: machine.durationSeconds,
      description: `Lavado ${machine.name} (${machine.durationSeconds}s) — ${PLATE_CATEGORY_LABELS[category]} ${plate}`,
    });
    externalPaymentId = created.externalPaymentId;
    initPoint = created.initPoint;
    providerStatus = created.status;
  } catch (err) {
    deps.logger.error('payment provider createPayment failed', { machineId, sessionId, err: String(err) });
    await db.transaction(async (tx) => {
      await transitionSession(tx, sessionId, 'PAYMENT_PENDING', 'PAYMENT_FAILED', {
        interruptionReason: 'provider_error',
      });
      await insertAudit(tx, {
        actor: 'system',
        action: 'PAYMENT_REJECTED',
        entity: 'session',
        entityId: sessionId,
        metadata: { sessionId, reason: 'provider_error', err: String(err) },
      });
    });
    throw new AppError('BAD_REQUEST', 'No se pudo iniciar el pago. Intentá nuevamente.', { machineId });
  }

  // ---- Tx 2: registro del pago (unique external + unique session) ----
  await db.transaction(async (tx) => {
    const paymentId = uuid();
    await insertPayment(tx, {
      id: paymentId,
      externalPaymentId,
      provider: provider.name,
      machineId,
      sessionId,
      amount,
      status: providerStatus as import('@hidro/shared').PaymentStatus,
      rawStatus: 'created',
    });
    await setSessionStatus(tx, sessionId, 'PAYMENT_PENDING', 'PAYMENT_PENDING', { paymentId });
    await insertAudit(tx, {
      actor: 'system',
      action: 'PAYMENT_CREATED',
      entity: 'payment',
      entityId: paymentId,
      metadata: { sessionId, machineId, externalPaymentId, amount, provider: provider.name, plate, category },
    });
  });

  return {
    sessionId,
    plate,
    plateCategory: category,
    payment: { externalPaymentId, provider: provider.name, status: 'PENDING', initPoint, amount },
    demoMode: provider.name === 'demo',
  };
}

const LABELS: Record<string, string> = {
  SESSION_CREATED: 'Sesión creada',
  SESSION_STATUS_CHANGED: 'Cambio de estado',
  PAYMENT_CREATED: 'Pago creado',
  PAYMENT_APPROVED: 'Pago aprobado',
  PAYMENT_REJECTED: 'Pago rechazado',
  PAYMENT_EXPIRED: 'Pago vencido',
  PAYMENT_AUTO_RECONCILED: 'Pago reconciliado automáticamente',
  PAYMENT_MANUALLY_RECONCILED: 'Pago reconciliado por mesa de entrada',
  PAYMENT_RECONCILE_REJECTED: 'Reconciliación rechazada',
  PAYMENT_RECONCILE_AMBIGUOUS: 'Reconciliación ambigua (revisar cobro duplicado)',
  PAYMENT_RECONCILE_DENIED: 'Reconciliación denegada (cuenta compartida)',
  WEBHOOK_RECEIVED: 'Webhook recibido',
  WEBHOOK_DUPLICATED: 'Webhook duplicado (ignorado)',
  WEBHOOK_INVALID: 'Webhook inválido (descartado)',
  WEBHOOK_UNKNOWN_PAYMENT: 'Webhook de pago desconocido',
  AUTH_CREATED: 'Autorización generada',
  AUTH_CONSUMED: 'Autorización consumida',
  AUTH_EXPIRED: 'Autorización vencida',
  AUTH_REVOKED: 'Autorización revocada',
  EMERGENCY_STOP: 'Parada de emergencia',
  EMERGENCY_STOP_EXECUTED: 'Parada de emergencia ejecutada',
  MACHINE_BUSY_REJECTED: 'Máquina ocupada (pago no generado)',
  SESSION_FINISHED: 'Sesión finalizada',
  SESSION_INTERRUPTED: 'Sesión interrumpida',
  AUTHORIZATION_FETCHED: 'ESP32 recibió la autorización',
  BUTTON_PRESSED: 'Pulsador presionado',
  BUTTON_PRESSED_WITHOUT_AUTH: 'Pulsador sin autorización (ignorado)',
  RELAY_ON: 'Relay ON',
  RELAY_OFF: 'Relay OFF',
  SESSION_STARTED: 'Ciclo iniciado',
  DEVICE_REBOOT: 'Reinicio del dispositivo',
  DEVICE_ERROR: 'Error de dispositivo',
  POWER_CUT: 'Corte eléctrico',
  INTERNET_LOST: 'Internet perdido',
  INTERNET_RESTORED: 'Internet restaurado',
  DEVICE_ONLINE: 'Dispositivo online',
  DEVICE_OFFLINE: 'Dispositivo offline',
};

export async function buildTimeline(deps: SessionDeps, sessionId: string): Promise<SessionTimelineEvent[]> {
  const [auditRows, deviceRows] = await Promise.all([
    listAuditForSession(deps.db, sessionId),
    listDeviceEventsForSession(deps.db, sessionId),
  ]);
  const events: SessionTimelineEvent[] = [];
  for (const row of auditRows) {
    const from = row.metadata?.from as string | undefined;
    const to = row.metadata?.to as string | undefined;
    events.push({
      at: row.createdAt.toISOString(),
      source: row.action.startsWith('PAYMENT') || row.action.startsWith('WEBHOOK') ? 'payment' : 'system',
      type: row.action,
      label: from && to ? `${from} → ${to}` : (LABELS[row.action] ?? row.action),
      status: (to as SessionStatus | undefined) ?? null,
      payload: row.metadata,
    });
  }
  for (const row of deviceRows) {
    events.push({
      at: row.createdAt.toISOString(),
      source: 'device',
      type: row.type,
      label: LABELS[row.type] ?? row.type,
      status: null,
      payload: row.payload,
    });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  return events;
}

export async function getSessionState(deps: SessionDeps, sessionId: string) {
  const session = await getSession(deps.db, sessionId);
  if (!session) throw new AppError('SESSION_NOT_FOUND', `Sesión no encontrada: ${sessionId}`);
  const machine = await getMachine(deps.db, session.machineId);
  const payment = await getPaymentBySession(deps.db, sessionId);
  const auth = session.authorizationId ? await getAuthorizationByPayment(deps.db, payment?.id ?? '') : null;
  const events = await buildTimeline(deps, sessionId);
  return {
    session: {
      id: session.id,
      machineId: session.machineId,
      plate: session.plate,
      plateCategory: session.plateCategory,
      status: session.status,
      durationSeconds: session.durationSeconds,
      startedAt: session.startedAt?.toISOString() ?? null,
      finishedAt: session.finishedAt?.toISOString() ?? null,
      authorizationExpiresAt: auth && auth.status === 'AUTHORIZED' ? auth.expiresAt.toISOString() : null,
      interruptionReason: session.interruptionReason,
      demoTimeScale: await getDemoTimeScale(deps.db, deps.config),
    },
    machine: { id: machine?.id ?? session.machineId, name: machine?.name ?? session.machineId },
    payment: payment
      ? {
          id: payment.id,
          externalPaymentId: payment.externalPaymentId,
          provider: payment.provider,
          amount: payment.amount,
          status: payment.status,
        }
      : null,
    events,
    serverTime: new Date().toISOString(),
  };
}

export async function finishSession(deps: Pick<SessionDeps, 'db' | 'logger'>, machineId: string, sessionId: string, durationSeconds: number) {
  const { db } = deps;
  return db.transaction(async (tx) => {
    const session = await getSession(tx, sessionId);
    if (!session) throw new AppError('SESSION_NOT_FOUND', `Sesión no encontrada: ${sessionId}`);
    if (session.machineId !== machineId) {
      throw new AppError('AUTH_WRONG_MACHINE', 'La sesión no pertenece a esta máquina.', { sessionId, machineId });
    }
    if (session.status === 'FINISHED') return { ok: true, idempotent: true };
    const row = await transitionSession(tx, sessionId, 'RUNNING', 'FINISHED', { finishedAt: new Date() });
    await insertAudit(tx, { actor: 'device', action: 'SESSION_FINISHED', entity: 'session', entityId: sessionId, metadata: { sessionId, machineId, durationSeconds } });
    await insertAudit(tx, { actor: 'device', action: 'RELAY_OFF', entity: 'session', entityId: sessionId, metadata: { sessionId, machineId } });
    return { ok: true, idempotent: false, status: row?.status ?? 'FINISHED' };
  });
}

export async function interruptSession(
  deps: Pick<SessionDeps, 'db' | 'logger'>,
  machineId: string,
  sessionId: string,
  reason: string,
): Promise<{ ok: boolean; status: SessionStatus }> {
  const { db } = deps;
  const target: SessionStatus =
    reason === 'emergency_stop' ? 'EMERGENCY_STOP' : reason === 'device_error' ? 'DEVICE_ERROR' : 'SESSION_INTERRUPTED';
  return db.transaction(async (tx) => {
    const session = await getSession(tx, sessionId);
    if (!session) throw new AppError('SESSION_NOT_FOUND', `Sesión no encontrada: ${sessionId}`);
    if (session.machineId !== machineId) {
      throw new AppError('AUTH_WRONG_MACHINE', 'La sesión no pertenece a esta máquina.', { sessionId, machineId });
    }
    if (session.status === target) return { ok: true, status: target };
    if (session.status !== 'RUNNING') {
      throw new AppError('INVALID_TRANSITION', `La sesión no está RUNNING (${session.status})`, { sessionId });
    }
    const row = await transitionSession(tx, sessionId, 'RUNNING', target, {
      finishedAt: new Date(),
      interruptionReason: reason,
    });
    const action = target === 'EMERGENCY_STOP' ? 'EMERGENCY_STOP_EXECUTED' : 'SESSION_INTERRUPTED';
    await insertAudit(tx, { actor: 'device', action, entity: 'session', entityId: sessionId, metadata: { sessionId, machineId, reason } });
    await insertAudit(tx, { actor: 'device', action: 'RELAY_OFF', entity: 'session', entityId: sessionId, metadata: { sessionId, machineId, reason } });
    return { ok: true, status: row?.status ?? target };
  });
}

/** Barrido: pagos pendientes vencidos y autorizaciones vencidas. */
export async function sweepExpired(deps: SessionDeps, now: Date): Promise<void> {
  const { db, config } = deps;

  // 1) pagos pendientes vencidos: UNA última re-consulta al proveedor antes de vencer
  //    (ADR-023) — un webhook perdido no puede escribir "no pagó" sobre un pago real.
  //    Política de reintento: UNA sola vez por sesión, en el momento en que cruza el
  //    timeout — no reintentos indefinidos (ver docs/designs/reconciliacion-pagos.md).
  const timeoutSeconds = await getPaymentPendingTimeoutSeconds(db, config);
  const cutoff = new Date(now.getTime() - timeoutSeconds * 1000);
  const staleSessions = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.status, 'PAYMENT_PENDING'), sql`${sessionsTable.createdAt} < ${cutoff}`));
  for (const s of staleSessions) {
    // Búsqueda en el proveedor SIEMPRE fuera de cualquier transacción (mismo patrón que
    // webhookRoutes.ts): nunca sostener I/O externo mientras se retiene un lock de fila.
    const payment = await getPaymentBySession(db, s.id);
    let recovered = false;
    if (payment && payment.status === 'PENDING') {
      try {
        const search = await withTimeout(deps.provider.searchByExternalReference(s.id, payment.amount), SWEEP_SEARCH_TIMEOUT_MS);
        if (search.outcome === 'ambiguous') {
          await insertAudit(db, {
            actor: 'system',
            action: 'PAYMENT_RECONCILE_AMBIGUOUS',
            entity: 'session',
            entityId: s.id,
            metadata: { sessionId: s.id, machineId: s.machineId, candidates: search.matches.length },
          });
        }
        if (search.outcome === 'found') {
          // processApproval decide todo lo demás (aprobado/máquina offline/monto
          // incorrecto) — cualquiera de esos resultados ya sacó a la sesión de
          // PAYMENT_PENDING, así que este ciclo del barrido no debe vencerla también.
          await processApproval(deps, {
            externalPaymentId: payment.externalPaymentId,
            providerStatus: search.match.status,
            providerRawStatus: search.match.rawStatus,
            providerAmount: search.match.amount,
            source: 'sweep',
          });
          recovered = true;
        }
      } catch (err) {
        // Fault isolation: un proveedor lento/caído no bloquea el vencimiento de las
        // demás máquinas de este mismo barrido — cae al comportamiento normal de abajo.
        deps.logger.warn('sweep: searchByExternalReference falló, se vence normalmente', {
          sessionId: s.id,
          machineId: s.machineId,
          err: String(err),
        });
      }
    }
    if (recovered) continue;

    await db.transaction(async (tx) => {
      const row = await transitionSession(tx, s.id, 'PAYMENT_PENDING', 'PAYMENT_EXPIRED');
      if (!row) return;
      const p = await getPaymentBySession(tx, s.id);
      if (p && p.status === 'PENDING') {
        await setPaymentStatus(tx, p.id, 'EXPIRED', 'expired');
      }
      await insertAudit(tx, { actor: 'system', action: 'PAYMENT_EXPIRED', entity: 'session', entityId: s.id, metadata: { sessionId: s.id, machineId: s.machineId } });
    });
  }

  // 2) autorizaciones vencidas
  const expiredAuths = await db
    .select()
    .from(authorizations)
    .where(and(eq(authorizations.status, 'AUTHORIZED'), sql`${authorizations.expiresAt} <= ${now}`));
  for (const a of expiredAuths) {
    await db.transaction(async (tx) => {
      await setAuthorizationStatus(tx, a.id, 'EXPIRED');
      const session = await getSession(tx, a.sessionId);
      if (session && (session.status === 'AUTHORIZED' || session.status === 'WAITING_FOR_BUTTON')) {
        await transitionSession(tx, session.id, session.status, 'AUTHORIZATION_EXPIRED');
      }
      await insertAudit(tx, { actor: 'system', action: 'AUTH_EXPIRED', entity: 'authorization', entityId: a.id, metadata: { sessionId: a.sessionId, machineId: a.machineId } });
    });
  }
}
