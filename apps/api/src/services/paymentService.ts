import { AppError, type PaymentStatus, type SessionStatus } from '@hidro/shared';
import type { Db } from '../db/client.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { PaymentProvider } from '../payments/provider.js';
import { DemoPaymentProvider } from '../payments/demoProvider.js';
import { uuid } from '../ids.js';
import {
  getAuthorizationByPayment,
  getMachineForUpdate,
  getPaymentByExternalId,
  getPaymentByExternalIdForUpdate,
  getSessionForUpdate,
  insertAudit,
  insertAuthorization,
  setAuthorizationStatus,
  setPaymentStatus,
} from '../repositories/repos.js';
import { transitionSession } from './transition.js';
import { getAuthTtlSeconds } from './settingsService.js';

export interface PaymentDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
  provider: PaymentProvider;
}

export type ApprovalResultType =
  | 'approved'
  | 'duplicated'
  | 'ignored'
  | 'rejected'
  | 'amount_mismatch'
  | 'session_terminal'
  | 'offline'
  | 'pending';

export interface ApprovalInput {
  externalPaymentId: string;
  providerStatus: PaymentStatus;
  providerRawStatus: string;
  providerAmount: number | null;
}

export interface ApprovalResult {
  result: ApprovalResultType;
  sessionId?: string;
  authorizationId?: string;
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
  if (['REJECTED', 'EXPIRED', 'REFUNDED'].includes(payment.status)) {
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
      action: 'PAYMENT_APPROVED',
      entity: 'payment',
      entityId: payment.id,
      metadata: { sessionId: session.id, amount: payment.amount },
    });
    await insertAudit(tx, {
      actor: 'system',
      action: 'AUTH_CREATED',
      entity: 'authorization',
      entityId: auth.id,
      metadata: { sessionId: session.id, machineId: payment.machineId, ttlSeconds: ttl },
    });
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

  // ---- Sesión en estado terminal (rechazada/vencida/oficina/etc.): pago tardío ----
  await insertAudit(tx, {
    actor: 'system',
    action: 'PAYMENT_APPROVED',
    entity: 'payment',
    entityId: payment.id,
    metadata: { sessionId: session.id, sessionStatus: session.status, note: 'PENDING CLIENT DECISION: pago aprobado sobre sesión no utilizable (reembolso manual)' },
  });
  return { result: 'session_terminal', sessionId: session.id };
  });
}

export async function processRejection(deps: PaymentDeps, externalPaymentId: string, rawStatus: string): Promise<ApprovalResult> {
  return processApproval(deps, {
    externalPaymentId,
    providerStatus: 'REJECTED',
    providerRawStatus: rawStatus,
    providerAmount: null,
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
    return processApproval(deps, { externalPaymentId, providerStatus: r.status as PaymentStatus, providerRawStatus: r.rawStatus, providerAmount: r.amount });
  }

  // approve / duplicate_webhook
  const r = demo.approve(externalPaymentId);
  const first = await processApproval(deps, {
    externalPaymentId,
    providerStatus: r.status as PaymentStatus,
    providerRawStatus: r.rawStatus,
    providerAmount: r.amount,
  });
  if (action === 'duplicate_webhook') {
    const second = await processApproval(deps, {
      externalPaymentId,
      providerStatus: r.status as PaymentStatus,
      providerRawStatus: r.rawStatus,
      providerAmount: r.amount,
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
  const { getMachine, getSession } = await import('../repositories/repos.js');
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
