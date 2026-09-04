import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { authorizations, deviceEvents, payments } from '../src/db/schema.js';
import { createTestApp, deviceHeaders, payAndAuthorize, waitSessionStatus, waitMachineStatus, PLATES, type TestCtx } from './helpers.js';

let t: TestCtx;

describe('concurrencia y bloqueo de máquina (BUSY)', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('webhooks CONCURRENTES del mismo pago -> approved + duplicated, nunca 500', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
    const checkout = res.body.checkout as { sessionId: string; payment: { externalPaymentId: string; amount: number } };

    // Dos aprobaciones simultáneas del MISMO pago (webhook duplicado en paralelo).
    // Con la transacción FOR UPDATE, la segunda espera el commit y responde duplicated.
    const { processApproval } = await import('../src/services/paymentService.js');
    const input = {
      externalPaymentId: checkout.payment.externalPaymentId,
      providerStatus: 'APPROVED' as const,
      providerRawStatus: 'approved',
      providerAmount: checkout.payment.amount,
    };
    const [a, b] = await Promise.all([processApproval(t.ctx, input), processApproval(t.ctx, input)]);
    expect([a.result, b.result].sort()).toEqual(['approved', 'duplicated']);

    // UNA sola autorización (el índice único + el lock de fila lo garantizan)
    const auths = await t.ctx.db.select().from(authorizations).where(eq(authorizations.sessionId, checkout.sessionId));
    expect(auths.length).toBe(1);
  });

  it('dos clientes simultáneos -> UNA sesión creada, UNA rechazada con 409, UN solo cobro', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const [a, b] = await Promise.allSettled([
      t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }),
      t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }),
    ]);
    const statuses = [a.status === 'fulfilled' ? a.value.status : a.reason.status, b.status === 'fulfilled' ? b.value.status : b.reason.status];
    expect(statuses.sort()).toEqual([201, 409]);
    const rows = await t.ctx.db.select().from(payments);
    expect(rows.length).toBe(1); // NUNCA un segundo cobro
  });

  it('con máquina autorizada, un nuevo pago es rechazado (BUSY)', async () => {
    t = await createTestApp();
    await payAndAuthorize(t);
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(409);
    expect(res.body.error.code).toBe('MACHINE_BUSY');
  });

  it('doble arranque concurrente desde el dispositivo -> un solo RUNNING', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    // obtener authorization_id real
    const authRes = await t.api
      .get('/api/device/authorization')
      .set(deviceHeaders('HIDRO-01', 'GET', '/api/device/authorization'))
      .expect(200);
    const authorizationId = authRes.body.authorization.authorization_id as string;
    const body = {
      machine_id: 'HIDRO-01',
      session_id: sessionId,
      authorization_id: authorizationId,
      relay_expected_state: true,
    };
    const [a, b] = await Promise.allSettled([
      t.api.post('/api/device/session/start').set(deviceHeaders('HIDRO-01', 'POST', '/api/device/session/start', body)).send(body),
      t.api.post('/api/device/session/start').set(deviceHeaders('HIDRO-01', 'POST', '/api/device/session/start', body)).send(body),
    ]);
    const statuses = [a.status === 'fulfilled' ? a.value.status : a.reason.status, b.status === 'fulfilled' ? b.value.status : b.reason.status].sort();
    expect(statuses).toEqual([200, 409]);
    const events = await t.ctx.db.select().from(deviceEvents).where(eq(deviceEvents.type, 'SESSION_STARTED'));
    expect(events.length).toBe(1);
  });

  it('la base de datos impide dos sesiones activas de la misma máquina (índice único parcial)', async () => {
    t = await createTestApp();
    const { insertSession } = await import('../src/repositories/repos.js');
    await insertSession(t.ctx.db, { id: 'HS-TEST-1', machineId: 'HIDRO-01', durationSeconds: 180, status: 'RUNNING' });
    await expect(
      insertSession(t.ctx.db, { id: 'HS-TEST-2', machineId: 'HIDRO-01', durationSeconds: 180, status: 'PAYMENT_PENDING' }),
    ).rejects.toThrow(/Failed query|duplicate|uq_sessions|unique/i);
  });
});
