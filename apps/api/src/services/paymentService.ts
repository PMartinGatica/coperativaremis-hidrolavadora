import {
  AppError,
  type PaymentStatus,
  type SessionStatus,
  type ApprovalResultType,
  type ApprovalResult,
  type ReconcileResultType,
  type ReconcileResult,
} from '@hidro/shared';
import type { Db } from '../db/client.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { PaymentProvider } from '../payments/provider.js';
import { DemoPaymentProvider } from '../payments/demoProvider.js';
import { uuid } from '../ids.js';
import {
  existsNewerSessionForMachine,
  getAuthorizationByPayment,
  getMachineForUpdate,
  getPaymentByExternalId,
  getPaymentByExternalIdForUpdate,
  getPaymentBySession,
  getSession,
  getSessionForUpdate,
  insertAudit,
  insertAuthorization,
  setAuthorizationStatus,
  setPaymentStatus,
} from '../repositories/repos.js';
import { transitionSession } from './transition.js';
import { getAuthTtlSeconds } from './settingsService.js';
import { isRecoverableTerminalStatus } from './paymentRecovery.js';

export interface PaymentDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
  provider: PaymentProvider;
}

// ApprovalResultType/ApprovalResult movidos a @hidro/shared (autoplan Eng review,
// 2026-09-07): la UI de reconciliación los necesita del lado frontend, y un typo o una
// variante renombrada ahora rompe en tsc en los dos workspaces, no en silencio en
// runtime. Re-exportados acá para no tocar los imports existentes de este módulo.
export type { ApprovalResultType, ApprovalResult, ReconcileResultType, ReconcileResult };

/**
 * Quién dispara esta aprobación — explícito, nunca inferido dentro de la función
 * (Eng review, hallazgo #9/#12 de Codex): con hasta 3 caminos de entrada distintos
 * (webhook, barrido automático, mesa de entrada), la auditoría necesita saber cuál sin
 * adivinar por contexto.
 *   webhook        -> notificación de Mercado Pago (camino feliz, sin cambios)
 *   sweep          -> el barrido re-consulta UNA vez al cruzar el timeout (ADR-023)
 *   admin_recheck  -> mesa de entrada aprieta "reintentar automáticamente" (sin ID)
 *   admin_manual   -> mesa de entrada tipea el ID real de pago de Mercado Pago
 */
export type ApprovalSource = 'webhook' | 'sweep' | 'admin_recheck' | 'admin_manual';

export interface ApprovalInput {
  externalPaymentId: string;
  providerStatus: PaymentStatus;
  providerRawStatus: string;
  providerAmount: number | null;
  source: ApprovalSource;
  /** Solo para source='admin_recheck'/'admin_manual': quién ejecuta la acción (auditoría). */
  actorEmail?: string;
}

/** ¿Es este el intento de reconciliación de un pago aprobado tardío (ADR-023/030)? */
function reconciliationAuditAction(source: ApprovalSource): 'PAYMENT_AUTO_RECONCILED' | 'PAYMENT_MANUALLY_RECONCILED' {
  return source === 'admin_manual' ? 'PAYMENT_MANUALLY_RECONCILED' : 'PAYMENT_AUTO_RECONCILED';
}

/**
 * Detecta la violación del índice único parcial `uq_sessions_active_machine` (sub-caso A
 * de la recuperación, ADR-030) sin depender de un pre-chequeo con su propia carrera: el
 * índice de Postgres serializa esto solo para cualquier escritor, con o sin lock de fila.
 * drizzle-orm envuelve el error del driver en un `DrizzleQueryError` propio y mueve el
 * error original (con `.code`/`.constraint` estructurados, tanto en `pg` como en PGlite)
 * a `.cause` — el mensaje del wrapper NUNCA menciona "duplicate key" ni el constraint, así
 * que hay que revisar `.cause` explícitamente o el chequeo nunca matchea en ningún driver.
 */
function isUniqueViolation(err: unknown, constraintName: string): boolean {
  for (const candidate of [err, err instanceof Error ? err.cause : undefined]) {
    if (!(candidate instanceof Error)) continue;
    const withCode = candidate as Error & { code?: string; constraint?: string };
    if (withCode.code === '23505') {
      return !withCode.constraint || withCode.constraint === constraintName;
    }
    if (/duplicate key|unique constraint/i.test(candidate.message) && candidate.message.includes(constraintName)) {
      return true;
    }
  }
  return false;
}

/**
 * PUNTO ÚNICO de aprobación de pagos — usado TANTO por el webhook de Mercado Pago
 * como por la simulación DEMO. Idempotente por construcción:
 *   - payments.external_payment_id es UNIQUE
 *   - authorizations.payment_id es UNIQUE  (nunca 2 autorizaciones por pago)
 *   - la re-consulta al proveedor ocurre ANTES (el caller pasa providerStatus)
 * TODO el cuerpo corre en UNA transacción: el SELECT ... FOR UPDATE del pago
 * retiene el lock hasta el COMMIT, así los webhooks concurrentes del mismo pago
 * se serializan de verdad (el segundo espera y responde `duplicated`, nunca 500).
 */
export async function processApproval(deps: PaymentDeps, input: ApprovalInput): Promise<ApprovalResult> {
  const { db } = deps;
  return db.transaction(async (tx) => {
  const payment = await getPaymentByExternalIdForUpdate(tx, input.externalPaymentId);
  if (!payment) {
    await insertAudit(tx, {
      actor: 'system',
      action: 'WEBHOOK_UNKNOWN_PAYMENT',
      entity: 'payment',
      entityId: input.externalPaymentId,
      metadata: { externalPaymentId: input.externalPaymentId },
    });
    return { result: 'ignored' };
  }

  const session = await getSessionForUpdate(tx, payment.sessionId);
  if (!session) {
    // Estado imposible en teoría (FK), pero jamás generamos autorización sin sesión.
    deps.logger.error('payment approved but session missing', { externalPaymentId: input.externalPaymentId, sessionId: payment.sessionId });
    await insertAudit(tx, {
      actor: 'system',
      action: 'WEBHOOK_RECEIVED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { externalPaymentId: input.externalPaymentId, sessionId: payment.sessionId, error: 'session_missing' },
    });
    return { result: 'session_terminal', sessionId: payment.sessionId };
  }

  const existingAuth = await getAuthorizationByPayment(tx, payment.id);

  // Intento de RECONCILIACIÓN de un pago vencido (ADR-023/030): el session.status ya
  // nos dice si esto es un intento válido de recuperación, sin inferir nada del `source`.
  // Sin este escape, el guard de abajo trataría CUALQUIER pago 'EXPIRED' como un caso
  // ya resuelto para siempre — que es exactamente el bug que esta fase corrige.
  const isReconciliationAttempt = payment.status === 'EXPIRED' && isRecoverableTerminalStatus(session.status);

  // ---- Ya resuelto antes: idempotencia pura (webhook duplicado) ----
  if (payment.status === 'APPROVED' && existingAuth && existingAuth.status !== 'REVOKED') {
    await insertAudit(tx, {
      actor: 'system',
      action: 'WEBHOOK_DUPLICATED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId: session.id, externalPaymentId: input.externalPaymentId, authorizationId: existingAuth.id },
    });
    return { result: 'duplicated', sessionId: session.id, authorizationId: existingAuth.id };
  }
  if (!isReconciliationAttempt && ['REJECTED', 'EXPIRED', 'REFUNDED'].includes(payment.status)) {
    await insertAudit(tx, {
      actor: 'system',
      action: 'WEBHOOK_DUPLICATED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId: session.id, externalPaymentId: input.externalPaymentId, paymentStatus: payment.status },
    });
    return { result: 'duplicated', sessionId: session.id };
  }

  await insertAudit(tx, {
    actor: 'system',
    action: 'WEBHOOK_RECEIVED',
    entity: 'payment',
    entityId: payment.id,
    metadata: { sessionId: session.id, externalPaymentId: input.externalPaymentId, providerStatus: input.providerStatus },
  });

  // ---- Rechazo del proveedor ----
  if (input.providerStatus === 'REJECTED') {
    await setPaymentStatus(tx, payment.id, 'REJECTED', input.providerRawStatus);
    if (session.status === 'PAYMENT_PENDING') {
      await transitionSession(tx, session.id, 'PAYMENT_PENDING', 'PAYMENT_FAILED', {
        interruptionReason: 'payment_rejected',
      });
    }
    await insertAudit(tx, {
      actor: 'system',
      action: 'PAYMENT_REJECTED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId: session.id, rawStatus: input.providerRawStatus },
    });
    return { result: 'rejected', sessionId: session.id };
  }

  // ---- Sigue pendiente (webhook de estado intermedio) ----
  if (input.providerStatus !== 'APPROVED') {
    await setPaymentStatus(tx, payment.id, 'PENDING', input.providerRawStatus);
    return { result: 'pending', sessionId: session.id };
  }

  // ---- APROBADO: verificación de importe (nunca confiar en el webhook) ----
  if (input.providerAmount !== null && input.providerAmount !== payment.amount) {
    await setPaymentStatus(tx, payment.id, 'REJECTED', `amount_mismatch:${input.providerAmount}`);
    if (session.status === 'PAYMENT_PENDING') {
      await transitionSession(tx, session.id, 'PAYMENT_PENDING', 'PAYMENT_FAILED', {
        interruptionReason: 'amount_mismatch',
      });
    }
    await insertAudit(tx, {
      actor: 'system',
      action: 'PAYMENT_REJECTED',
      entity: 'payment',
      entityId: payment.id,
      metadata: {
        sessionId: session.id,
        reason: 'amount_mismatch',
        expected: payment.amount,
        received: input.providerAmount,
        note: 'PENDING CLIENT DECISION: política ante importe incorrecto',
      },
    });
    return { result: 'amount_mismatch', sessionId: session.id };
  }

  await setPaymentStatus(tx, payment.id, 'APPROVED', input.providerRawStatus);

  const machine = await getMachineForUpdate(tx, payment.machineId);
  const machineUsable = machine !== null && machine.enabled && machine.status === 'ONLINE';
  const ttl = await getAuthTtlSeconds(tx, deps.config);

  // ---- Sesión en espera de pago: camino principal ----
  if (session.status === 'PAYMENT_PENDING') {
    if (!machineUsable) {
      // El cliente pagó pero la máquina no está disponible: autorización REVOCADA
      // inmediatamente. PENDING CLIENT DECISION: política de reembolso automático.
      const revoked = await insertAuthorization(tx, {
        id: uuid(),
        sessionId: session.id,
        machineId: payment.machineId,
        paymentId: payment.id,
        status: 'REVOKED',
        expiresAt: new Date(Date.now() + ttl * 1000),
      });
      await transitionSession(tx, session.id, 'PAYMENT_PENDING', 'MACHINE_OFFLINE', {
        authorizationId: revoked.id,
        finishedAt: new Date(),
        interruptionReason: 'machine_offline_after_payment',
      });
      await insertAudit(tx, {
        actor: 'system',
        action: 'PAYMENT_APPROVED',
        entity: 'payment',
        entityId: payment.id,
        metadata: { sessionId: session.id },
      });
      await insertAudit(tx, {
        actor: 'system',
        action: 'AUTH_REVOKED',
        entity: 'authorization',
        entityId: revoked.id,
        metadata: { sessionId: session.id, machineId: payment.machineId, note: 'PENDING CLIENT DECISION: reembolso automático ante máquina offline' },
      });
      return { result: 'offline', sessionId: session.id };
    }

    await transitionSession(tx, session.id, 'PAYMENT_PENDING', 'PAYMENT_APPROVED');
    const auth = await insertAuthorization(tx, {
      id: uuid(),
      sessionId: session.id,
      machineId: payment.machineId,
      paymentId: payment.id,
      status: 'AUTHORIZED',
      expiresAt: new Date(Date.now() + ttl * 1000),
    });
    await transitionSession(tx, session.id, 'PAYMENT_APPROVED', 'AUTHORIZED', { authorizationId: auth.id });
    await insertAudit(tx, {
      actor: 'system',
      // El barrido encontrando el pago EN el momento del timeout ya es la señal de "pagó
      // pero casi no se lava" (ADR-023) — se etiqueta distinto del webhook normal.
      action: input.source === 'sweep' ? 'PAYMENT_AUTO_RECONCILED' : 'PAYMENT_APPROVED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId: session.id, amount: payment.amount, source: input.source },
    });
    await insertAudit(tx, {
      actor: 'system',
      action: 'AUTH_CREATED',
      entity: 'authorization',
      entityId: auth.id,
      metadata: { sessionId: session.id, machineId: payment.machineId, ttlSeconds: ttl },
    });
    // Una aprobación que NO entró por el webhook es, por definición, un webhook que no llegó:
    // el cliente esperó parado frente a la máquina hasta que lo rescató el barrido o mesa de
    // entrada. Un caso aislado es ruido de red; varios seguidos significan que la vía firmada
    // no está llegando — el escenario típico es una cuenta de Mercado Pago nueva sin el webhook
    // dado de alta en su panel (ADR-052).
    // OJO al modificar: NO sirve deducir esto mirando si la sesión tiene un `WEBHOOK_RECEIVED`.
    // Ese audit se escribe unas líneas más arriba para TODOS los sources, incluido el barrido,
    // así que esa consulta da siempre falso. El `source` es el dato, no el rastro.
    if (input.source !== 'webhook') {
      deps.logger.error('pago aprobado SIN webhook: la notificación de Mercado Pago no llegó', {
        sessionId: session.id,
        externalPaymentId: input.externalPaymentId,
        source: input.source,
      });
      await insertAudit(tx, {
        actor: 'system',
        action: 'WEBHOOK_MISSING',
        entity: 'payment',
        entityId: payment.id,
        metadata: { sessionId: session.id, source: input.source },
      });
    }
    return { result: 'approved', sessionId: session.id, authorizationId: auth.id };
  }

  // ---- Sesión ya avanzada: webhook duplicado o recuperación tras crash ----
  const authFlow: SessionStatus[] = ['PAYMENT_APPROVED', 'AUTHORIZED', 'WAITING_FOR_BUTTON', 'RUNNING'];
  if (authFlow.includes(session.status)) {
    if (!existingAuth && (session.status === 'AUTHORIZED' || session.status === 'WAITING_FOR_BUTTON' || session.status === 'PAYMENT_APPROVED')) {
      // Recuperación: pago aprobado pero la autorización nunca se persistió.
      const auth = await insertAuthorization(tx, {
        id: uuid(),
        sessionId: session.id,
        machineId: payment.machineId,
        paymentId: payment.id,
        status: 'AUTHORIZED',
        expiresAt: new Date(Date.now() + ttl * 1000),
      });
      await transitionSession(tx, session.id, session.status, 'AUTHORIZED', { authorizationId: auth.id });
      await insertAudit(tx, {
        actor: 'system',
        action: 'AUTH_CREATED',
        entity: 'authorization',
        entityId: auth.id,
        metadata: { sessionId: session.id, machineId: payment.machineId, note: 'crash_recovery' },
      });
    }
    await insertAudit(tx, {
      actor: 'system',
      action: 'WEBHOOK_DUPLICATED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId: session.id, sessionStatus: session.status },
    });
    return { result: 'duplicated', sessionId: session.id, authorizationId: existingAuth?.id };
  }

  // ---- Sesión en estado terminal NO recuperable: pago tardío, sin acción posible ----
  if (!isRecoverableTerminalStatus(session.status)) {
    await insertAudit(tx, {
      actor: 'system',
      action: 'PAYMENT_APPROVED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId: session.id, sessionStatus: session.status, note: 'PENDING CLIENT DECISION: pago aprobado sobre sesión no utilizable (reembolso manual)' },
    });
    return { result: 'session_terminal', sessionId: session.id };
  }

  // ---- Recuperación de PAYMENT_EXPIRED: pago aprobado tardío (ADR-023/030) ----
  // Deliberadamente NO se chequea machineUsable acá (a diferencia del camino feliz de
  // arriba): esta rama solo corre para una máquina que HOY no está `machine_occupied`
  // (sub-caso A, más abajo). Si además está OFFLINE, la autorización queda inerte y el
  // barrido de autorizaciones vencidas (sección 2 de sweepExpired) la cierra sola con la
  // transición YA legal AUTHORIZED -> AUTHORIZATION_EXPIRED — no hace falta un segundo
  // edge nuevo (PAYMENT_EXPIRED -> MACHINE_OFFLINE) para un caso sin impacto de seguridad.
  const actor = input.actorEmail ?? 'system';

  // Sub-caso B: otra sesión de esta máquina ya se creó desde que ÉSTA se creó (aunque ya
  // haya terminado). El índice único no lo detecta (excluye estados terminales a
  // propósito) — por eso hace falta este chequeo positivo, dentro de la MISMA
  // transacción que la escritura, inmediatamente antes de intentarla.
  const usedSince = await existsNewerSessionForMachine(tx, payment.machineId, session.id, session.createdAt);
  if (usedSince) {
    await insertAudit(tx, {
      actor,
      action: 'PAYMENT_RECONCILE_REJECTED',
      entity: 'session',
      entityId: session.id,
      metadata: { sessionId: session.id, machineId: payment.machineId, reason: 'machine_used_since', source: input.source },
    });
    return { result: 'machine_used_since', sessionId: session.id };
  }

  // Sub-caso A: otra sesión SIGUE ACTIVA en esta máquina ahora mismo. No hace falta
  // pre-chequearlo: el índice único parcial `uq_sessions_active_machine` ya lo serializa
  // para cualquier escritor — alcanza con capturar la violación en vez de dejarla salir
  // como un 500 crudo. El SAVEPOINT (tx.transaction anidado) permite seguir usando `tx`
  // para auditar el rechazo después de que Postgres aborte este intento puntual.
  try {
    const auth = await tx.transaction(async (tx2) => {
      const inserted = await insertAuthorization(tx2, {
        id: uuid(),
        sessionId: session.id,
        machineId: payment.machineId,
        paymentId: payment.id,
        status: 'AUTHORIZED',
        expiresAt: new Date(Date.now() + ttl * 1000),
      });
      await transitionSession(tx2, session.id, session.status, 'AUTHORIZED', { authorizationId: inserted.id });
      return inserted;
    });
    await insertAudit(tx, {
      actor,
      action: reconciliationAuditAction(input.source),
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId: session.id, machineId: payment.machineId, authorizationId: auth.id, source: input.source, previousStatus: session.status },
    });
    await insertAudit(tx, {
      actor: 'system',
      action: 'AUTH_CREATED',
      entity: 'authorization',
      entityId: auth.id,
      metadata: { sessionId: session.id, machineId: payment.machineId, ttlSeconds: ttl, note: 'reconciliation_recovery' },
    });
    return { result: 'approved', sessionId: session.id, authorizationId: auth.id };
  } catch (err) {
    if (isUniqueViolation(err, 'uq_sessions_active_machine')) {
      await insertAudit(tx, {
        actor,
        action: 'PAYMENT_RECONCILE_REJECTED',
        entity: 'session',
        entityId: session.id,
        metadata: { sessionId: session.id, machineId: payment.machineId, reason: 'machine_occupied', source: input.source },
      });
      return { result: 'machine_occupied', sessionId: session.id };
    }
    throw err;
  }
  });
}

export async function processRejection(deps: PaymentDeps, externalPaymentId: string, rawStatus: string): Promise<ApprovalResult> {
  return processApproval(deps, {
    externalPaymentId,
    providerStatus: 'REJECTED',
    providerRawStatus: rawStatus,
    providerAmount: null,
    source: 'webhook',
  });
}

/** SIMULAR PAGO — solo con DemoPaymentProvider. Usa EXACTAMENTE el mismo dominio. */
export async function simulateDemoPayment(
  deps: PaymentDeps,
  externalPaymentId: string,
  action: 'approve' | 'reject' | 'pending' | 'duplicate_webhook' | 'invalid_webhook',
): Promise<ApprovalResult & { paymentStatus?: string; invalidWebhook?: boolean }> {
  if (deps.provider.name !== 'demo') {
    throw new AppError('DEMO_MODE_REQUIRED', 'La simulación de pagos solo está disponible en PAYMENT_PROVIDER=demo.');
  }
  const demo = deps.provider as DemoPaymentProvider;

  if (action === 'invalid_webhook') {
    await insertAudit(deps.db, {
      actor: 'system',
      action: 'WEBHOOK_INVALID',
      entity: 'payment',
      entityId: externalPaymentId,
      metadata: { reason: 'demo: webhook simulado inválido', externalPaymentId },
    });
    return { result: 'ignored', invalidWebhook: true };
  }

  if (action === 'pending') {
    const r = demo.keepPending(externalPaymentId);
    return { result: 'pending', paymentStatus: r.status };
  }

  if (action === 'reject') {
    const r = demo.reject(externalPaymentId);
    return processApproval(deps, { externalPaymentId, providerStatus: r.status as PaymentStatus, providerRawStatus: r.rawStatus, providerAmount: r.amount, source: 'webhook' });
  }

  // approve / duplicate_webhook
  const r = demo.approve(externalPaymentId);
  const first = await processApproval(deps, {
    externalPaymentId,
    providerStatus: r.status as PaymentStatus,
    providerRawStatus: r.rawStatus,
    providerAmount: r.amount,
    source: 'webhook',
  });
  if (action === 'duplicate_webhook') {
    const second = await processApproval(deps, {
      externalPaymentId,
      providerStatus: r.status as PaymentStatus,
      providerRawStatus: r.rawStatus,
      providerAmount: r.amount,
      source: 'webhook',
    });
    return { ...second, paymentStatus: r.status };
  }
  return { ...first, paymentStatus: r.status };
}

export async function getPaymentPublicInfo(deps: PaymentDeps, externalPaymentId: string) {
  if (deps.provider.name !== 'demo') {
    throw new AppError('DEMO_MODE_REQUIRED', 'Página de pago demo no disponible con Mercado Pago.');
  }
  const payment = await getPaymentByExternalId(deps.db, externalPaymentId);
  if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 'Pago no encontrado.');
  const { getMachine } = await import('../repositories/repos.js');
  const machine = await getMachine(deps.db, payment.machineId);
  const session = await getSession(deps.db, payment.sessionId);
  return {
    payment: {
      id: payment.id,
      externalPaymentId: payment.externalPaymentId,
      provider: payment.provider,
      status: payment.status,
      amount: payment.amount,
      machineId: payment.machineId,
      sessionId: payment.sessionId,
      plate: session?.plate ?? null,
      plateCategory: session?.plateCategory ?? null,
    },
    machine: machine ? { id: machine.id, name: machine.name } : null,
    demoMode: true,
  };
}

/** Reembolso (PENDING CLIENT DECISION: cuándo aplica). */
export async function refundPayment(deps: PaymentDeps, externalPaymentId: string, reason: string) {
  const payment = await getPaymentByExternalId(deps.db, externalPaymentId);
  if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 'Pago no encontrado.');
  if (payment.status !== 'APPROVED') {
    throw new AppError('BAD_REQUEST', 'Solo se pueden reembolsar pagos aprobados.');
  }
  if (!deps.provider.refundPayment) {
    throw new AppError('BAD_REQUEST', 'El proveedor no soporta reembolsos.');
  }
  const res = await deps.provider.refundPayment(externalPaymentId, reason);
  if (res.ok) {
    await setPaymentStatus(deps.db, payment.id, 'REFUNDED', res.rawStatus);
    await insertAudit(deps.db, {
      actor: 'admin',
      action: 'SETTINGS_UPDATED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId: payment.sessionId, reason, refunded: true },
    });
  }
  return res;
}

// ==================================================================================
// RECONCILIACIÓN DE MESA DE ENTRADA (Fase 1) — dos caminos, mismo funnel de siempre
// (processApproval). Nunca se autoriza sin una consulta real y positiva al proveedor:
// "reintentar automáticamente" reusa searchByExternalReference (sin ID, sin tipeo);
// "aprobación manual" exige el ID real de pago (getPaymentById), nunca un checkbox.
// ==================================================================================

/** Preámbulo común a ambos caminos de reconciliación: sesión recuperable + pago registrado.
 *  Quién puede reconciliar lo decide el permiso `pagos.destrabar` en la ruta (ADR-062): la
 *  cuenta técnica de Insolva no lo tiene, así la auditoría nombra a alguien de la cooperativa. */
async function loadRecoverableSessionAndPayment(
  deps: PaymentDeps,
  sessionId: string,
): Promise<ReconcileResult | { payment: NonNullable<Awaited<ReturnType<typeof getPaymentBySession>>> }> {
  const session = await getSession(deps.db, sessionId);
  if (!session) throw new AppError('SESSION_NOT_FOUND', `Sesión no encontrada: ${sessionId}`);
  if (!isRecoverableTerminalStatus(session.status)) {
    return { result: 'not_recoverable', sessionId };
  }
  const payment = await getPaymentBySession(deps.db, sessionId);
  if (!payment) throw new AppError('PAYMENT_NOT_FOUND', `Sin pago registrado para la sesión ${sessionId}`);
  return { payment };
}

/** Paso 1: "reintentar automáticamente" — sin ID, sin tipeo, mesa de entrada solo aprieta un botón. */
export async function reconcileSessionAutomatic(deps: PaymentDeps, sessionId: string, actorEmail: string): Promise<ReconcileResult> {
  const loaded = await loadRecoverableSessionAndPayment(deps, sessionId);
  if ('result' in loaded) return loaded;
  const { payment } = loaded;

  const search = await deps.provider.searchByExternalReference(sessionId, payment.amount);
  if (search.outcome === 'not_found') {
    return { result: 'not_found', sessionId };
  }
  if (search.outcome === 'ambiguous') {
    await insertAudit(deps.db, {
      actor: actorEmail,
      action: 'PAYMENT_RECONCILE_AMBIGUOUS',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId, candidates: search.matches.length },
    });
    return { result: 'ambiguous', sessionId };
  }

  const approval = await processApproval(deps, {
    externalPaymentId: payment.externalPaymentId,
    providerStatus: search.match.status,
    providerRawStatus: search.match.rawStatus,
    providerAmount: search.match.amount,
    source: 'admin_recheck',
    actorEmail,
  });
  return { result: approval.result, sessionId: approval.sessionId ?? sessionId, authorizationId: approval.authorizationId };
}

/** Paso 2: aprobación manual con el ID real de pago de Mercado Pago (nunca un checkbox ciego). */
export async function reconcileSessionManual(
  deps: PaymentDeps,
  sessionId: string,
  providerPaymentId: string,
  actorEmail: string,
): Promise<ReconcileResult> {
  const loaded = await loadRecoverableSessionAndPayment(deps, sessionId);
  if ('result' in loaded) return loaded;
  const { payment } = loaded;

  const remote = await deps.provider.getPaymentById(providerPaymentId);
  if (remote.externalReference !== sessionId) {
    await insertAudit(deps.db, {
      actor: actorEmail,
      action: 'PAYMENT_RECONCILE_REJECTED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId, providerPaymentId, reason: 'session_id_mismatch', foundExternalReference: remote.externalReference },
    });
    return { result: 'session_id_mismatch', sessionId };
  }

  // A partir de acá reusa EXACTAMENTE el mismo funnel que el webhook (processApproval):
  // rechazado/pendiente/amount_mismatch quedan resueltos por sus ramas ya existentes.
  const approval = await processApproval(deps, {
    externalPaymentId: payment.externalPaymentId,
    providerStatus: remote.status,
    providerRawStatus: remote.rawStatus,
    providerAmount: remote.amount,
    source: 'admin_manual',
    actorEmail,
  });
  return { result: approval.result, sessionId: approval.sessionId ?? sessionId, authorizationId: approval.authorizationId };
}
