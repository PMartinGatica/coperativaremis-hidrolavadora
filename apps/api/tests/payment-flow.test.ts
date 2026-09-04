import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { authorizations, payments } from '../src/db/schema.js';
import { createTestApp, PLATES, payAndAuthorize, sessionStatus, waitSessionStatus, waitMachineStatus, waitFor, type TestCtx } from './helpers.js';

let t: TestCtx;

async function authCount(sessionId: string): Promise<number> {
  const rows = await t.ctx.db.select().from(authorizations).where(eq(authorizations.sessionId, sessionId));
  return rows.length;
}

describe('flujo de pago DEMO (mismo dominio que Mercado Pago)', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('pago aprobado -> genera UNA autorización -> sesión AUTHORIZED -> WAITING_FOR_BUTTON', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    expect(await sessionStatus(t, sessionId)).toBe('AUTHORIZED');
    expect(await authCount(sessionId)).toBe(1);
    // el simulador (ESP32) hace polling y recibe la autorización
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
  });

  it('pago rechazado -> PAYMENT_FAILED y NINGUNA autorización', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
    const { sessionId, payment } = res.body.checkout as { sessionId: string; payment: { externalPaymentId: string } };
    await t.api.post(`/api/public/payments/${payment.externalPaymentId}/simulate`).send({ action: 'reject' }).expect(200);
    expect(await sessionStatus(t, sessionId)).toBe('PAYMENT_FAILED');
    expect(await authCount(sessionId)).toBe(0);
  });

  it('pago pendiente -> la máquina NO se habilita', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
    const { sessionId, payment } = res.body.checkout as { sessionId: string; payment: { externalPaymentId: string } };
    await t.api.post(`/api/public/payments/${payment.externalPaymentId}/simulate`).send({ action: 'pending' }).expect(200);
    expect(await sessionStatus(t, sessionId)).toBe('PAYMENT_PENDING');
    expect(await authCount(sessionId)).toBe(0);
  });

  it('webhook duplicado -> una sola autorización (idempotencia)', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
    const { sessionId, payment } = res.body.checkout as { sessionId: string; payment: { externalPaymentId: string } };
    await t.api.post(`/api/public/payments/${payment.externalPaymentId}/simulate`).send({ action: 'duplicate_webhook' }).expect(200);
    expect(await authCount(sessionId)).toBe(1);
    const rows = await t.ctx.db.select().from(payments).where(eq(payments.sessionId, sessionId));
    expect(rows[0]?.status).toBe('APPROVED');
  });

  it('webhook inválido -> descartado, sin cambios de estado', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
    const { sessionId, payment } = res.body.checkout as { sessionId: string; payment: { externalPaymentId: string } };
    await t.api.post(`/api/public/payments/${payment.externalPaymentId}/simulate`).send({ action: 'invalid_webhook' }).expect(200);
    expect(await sessionStatus(t, sessionId)).toBe('PAYMENT_PENDING');
    expect(await authCount(sessionId)).toBe(0);
  });

  it('importe distinto al esperado -> rechazado, sin autorización', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
    const { sessionId, payment } = res.body.checkout as { sessionId: string; payment: { externalPaymentId: string } };
    const { processApproval } = await import('../src/services/paymentService.js');
    const result = await processApproval(t.ctx, {
      externalPaymentId: payment.externalPaymentId,
      providerStatus: 'APPROVED',
      providerRawStatus: 'approved',
      providerAmount: 999999, // monto manipulado
    });
    expect(result.result).toBe('amount_mismatch');
    expect(await sessionStatus(t, sessionId)).toBe('PAYMENT_FAILED');
    expect(await authCount(sessionId)).toBe(0);
  });

  it('pago aprobado con máquina caída -> autorización REVOCADA + MACHINE_OFFLINE', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
    const { sessionId, payment } = res.body.checkout as { sessionId: string; payment: { externalPaymentId: string } };
    // máquina cae antes de la aprobación
    await t.ctx.simulator!.action('HIDRO-01', 'disconnect');
    await waitMachineStatus(t, 'HIDRO-01', 'OFFLINE', 12_000);
    await t.api.post(`/api/public/payments/${payment.externalPaymentId}/simulate`).send({ action: 'approve' }).expect(200);
    expect(await sessionStatus(t, sessionId)).toBe('MACHINE_OFFLINE');
    const auths = await t.ctx.db.select().from(authorizations).where(eq(authorizations.sessionId, sessionId));
    expect(auths.length).toBe(1);
    expect(auths[0]?.status).toBe('REVOKED');
  });

  it('autorización vencida -> el pulsador NO arranca', async () => {
    t = await createTestApp({ authTtlSeconds: 1 });
    const { sessionId } = await payAndAuthorize(t);
    // con TTL de 1s, la autorización vence antes de que el simulador la entregue
    await waitSessionStatus(t, sessionId, 'AUTHORIZATION_EXPIRED', 8000);
    const press = await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(press.ok).toBe(false);
    const machine = await t.machineInfo('HIDRO-01');
    expect(machine.relayState).toBe(false);
  });

  it('ciclo completo: RUNNING -> FINISHED con relay ON -> OFF', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    const press = await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(press.ok).toBe(true);
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');
    await waitFor(async () => (((await t.machineInfo('HIDRO-01')).relayState as boolean) === true), {
      timeoutMs: 3000,
      label: 'relay ON (heartbeat)',
    });
    await waitSessionStatus(t, sessionId, 'FINISHED', 10_000); // 180s/60 = 3s
    // el relay OFF llega por el próximo heartbeat (<= 500ms en tests)
    await waitFor(async () => (((await t.machineInfo('HIDRO-01')).relayState as boolean) === false), {
      timeoutMs: 5000,
      label: 'relay OFF (heartbeat)',
    });
  });
});
