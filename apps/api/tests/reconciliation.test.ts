import { afterEach, describe, expect, it } from 'vitest';
import { DemoPaymentProvider } from '../src/payments/demoProvider.js';
import { selectSearchMatch } from '../src/payments/provider.js';
import { processApproval } from '../src/services/paymentService.js';
import { sweepExpired } from '../src/services/sessionService.js';
import { issueToken } from '../src/services/adminService.js';
import { listAuditForSession } from '../src/repositories/repos.js';
import {
  createTestApp,
  PLATES,
  payAndAuthorize,
  sessionStatus,
  waitMachineStatus,
  waitSessionStatus,
  type TestCtx,
} from './helpers.js';

let t: TestCtx;

function nonDefaultAdminToken(ctx: TestCtx, email = 'mesa@coop.local'): string {
  return issueToken(ctx.ctx.config, { email, role: 'admin' });
}

async function sessionAuditActions(ctx: TestCtx, sessionId: string): Promise<string[]> {
  const rows = await listAuditForSession(ctx.ctx.db, sessionId);
  return rows.map((r) => r.action);
}

/** Crea una sesión PAYMENT_PENDING sin pagarla todavía (el checkout, sin simular pago). */
async function createPendingSession(ctx: TestCtx, machineId = 'HIDRO-01', plate = PLATES.remis) {
  await waitMachineStatus(ctx, machineId, 'ONLINE');
  const res = await ctx.api.post(`/api/public/machines/${machineId}/sessions`).send({ plate }).expect(201);
  return res.body.checkout as { sessionId: string; payment: { externalPaymentId: string; amount: number } };
}

/**
 * Fuerza la expiración del pago pendiente sin depender de esperar el timeout real: avanza
 * el `now` que ve el barrido lo suficiente para cruzar `paymentPendingTimeoutSeconds`
 * (120s, fijado en `createTestApp` de este archivo), pero MUY por debajo del TTL de
 * autorización por defecto (300s) — si no, la MISMA pasada del barrido (sección 2,
 * autorizaciones vencidas) vería como "vencida" una autorización recién creada por la
 * sección 1 en esta misma llamada, con ese mismo `now` adelantado artificialmente.
 */
async function forceExpire(ctx: TestCtx): Promise<void> {
  await sweepExpired(ctx.ctx, new Date(Date.now() + 150_000));
}

describe('PaymentProvider: searchByExternalReference / getPaymentById (T1)', () => {
  it('searchByExternalReference: found cuando hay un pago APROBADO que matchea el importe', async () => {
    const provider = new DemoPaymentProvider();
    const created = await provider.createPayment({
      machineId: 'HIDRO-01',
      machineName: 'Hidro 1',
      sessionId: 'sess-found',
      externalReference: 'sess-found',
      amount: 500,
      durationSeconds: 180,
      description: 'x',
    });
    provider.approve(created.externalPaymentId);
    const result = await provider.searchByExternalReference('sess-found', 500);
    expect(result.outcome).toBe('found');
    if (result.outcome === 'found') expect(result.match.externalPaymentId).toBe(created.externalPaymentId);
  });

  it('searchByExternalReference: not_found sin pagos para esa referencia', async () => {
    const provider = new DemoPaymentProvider();
    const result = await provider.searchByExternalReference('sess-inexistente', 500);
    expect(result.outcome).toBe('not_found');
  });

  it('searchByExternalReference: ambiguous con 2 pagos aprobados que matchean (cobro duplicado)', async () => {
    const provider = new DemoPaymentProvider();
    const a = await provider.createPayment({
      machineId: 'HIDRO-01', machineName: 'Hidro 1', sessionId: 'sess-ambig', externalReference: 'sess-ambig', amount: 500, durationSeconds: 180, description: 'x',
    });
    const b = await provider.createPayment({
      machineId: 'HIDRO-01', machineName: 'Hidro 1', sessionId: 'sess-ambig', externalReference: 'sess-ambig', amount: 500, durationSeconds: 180, description: 'x',
    });
    provider.approve(a.externalPaymentId);
    provider.approve(b.externalPaymentId);
    const result = await provider.searchByExternalReference('sess-ambig', 500);
    expect(result.outcome).toBe('ambiguous');
  });

  it('getPaymentById: pago inexistente -> externalReference null (nunca lanza)', async () => {
    const provider = new DemoPaymentProvider();
    const result = await provider.getPaymentById('no-existe');
    expect(result.externalReference).toBeNull();
  });

  it('selectSearchMatch: ignora candidatos con importe distinto al esperado', () => {
    const result = selectSearchMatch(
      [{ externalPaymentId: 'p1', status: 'APPROVED', rawStatus: 'approved', amount: 999, currency: 'ARS' }],
      500,
    );
    expect(result.outcome).toBe('not_found');
  });
});

describe('barrido: recuperación de webhook perdido antes de vencer (T4)', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('MP aprobó pero nuestro webhook se perdió -> el barrido recupera antes de vencer', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const checkout = await createPendingSession(t);
    const demo = t.ctx.provider as DemoPaymentProvider;
    demo.approve(checkout.payment.externalPaymentId);
    await forceExpire(t);
    expect(await sessionStatus(t, checkout.sessionId)).toBe('AUTHORIZED');
    expect(await sessionAuditActions(t, checkout.sessionId)).toContain('PAYMENT_AUTO_RECONCILED');
  });

  /**
   * ADR-052. Una aprobación que no entró por el webhook ES un webhook que no llegó, y el cliente
   * lo pagó esperando parado frente a la máquina. Varias seguidas significan que la vía firmada
   * de Mercado Pago no está llegando — típicamente, una cuenta nueva sin el webhook dado de alta
   * en su panel. Tiene que quedar rastro explícito, no deducible.
   *
   * ⚠️ NO reescribir este chequeo como "la sesión no tiene WEBHOOK_RECEIVED": ese audit se
   * escribe para TODOS los orígenes, incluido el barrido, así que esa versión da siempre falso
   * (así estaba especificado el detector antes del review, y no podía dispararse nunca).
   */
  it('recuperado por el barrido -> queda WEBHOOK_MISSING (el aviso de MP no llegó)', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const checkout = await createPendingSession(t);
    const demo = t.ctx.provider as DemoPaymentProvider;
    demo.approve(checkout.payment.externalPaymentId);
    await forceExpire(t);
    const acciones = await sessionAuditActions(t, checkout.sessionId);
    expect(acciones).toContain('WEBHOOK_MISSING');
    // Y el rastro sigue conviviendo con WEBHOOK_RECEIVED, que el propio barrido escribe: por eso
    // la ausencia de WEBHOOK_RECEIVED no sirve como señal.
    expect(acciones).toContain('WEBHOOK_RECEIVED');
  });

  it('aprobado por el webhook normal -> NO queda WEBHOOK_MISSING', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    expect(await sessionAuditActions(t, sessionId)).not.toContain('WEBHOOK_MISSING');
  });

  it('regresión: sin pago aprobado en el proveedor, la sesión vence normalmente', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const checkout = await createPendingSession(t);
    await forceExpire(t);
    expect(await sessionStatus(t, checkout.sessionId)).toBe('PAYMENT_EXPIRED');
  });

  it('fault isolation: si la búsqueda falla para una máquina, la otra vence igual en el mismo barrido', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    // HIDRO-02 viene deshabilitada en el seed DEMO; se habilita para tener 2 máquinas ONLINE.
    const token = await t.api.post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'admin-pass' }).expect(200);
    await t.api
      .patch('/api/admin/machines/HIDRO-02')
      .set('Authorization', `Bearer ${(token.body as { token: string }).token}`)
      .send({ enabled: true })
      .expect(200);
    const a = await createPendingSession(t, 'HIDRO-01');
    const b = await createPendingSession(t, 'HIDRO-02');
    const demo = t.ctx.provider as DemoPaymentProvider;
    const original = demo.searchByExternalReference.bind(demo);
    demo.searchByExternalReference = async (ref: string, amount: number) => {
      if (ref === a.sessionId) throw new Error('proveedor caído (simulado)');
      return original(ref, amount);
    };
    await forceExpire(t);
    expect(await sessionStatus(t, a.sessionId)).toBe('PAYMENT_EXPIRED');
    expect(await sessionStatus(t, b.sessionId)).toBe('PAYMENT_EXPIRED');
  });

  it('resultado ambiguo (2 pagos aprobados) -> vence igual y audita PAYMENT_RECONCILE_AMBIGUOUS', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const checkout = await createPendingSession(t, 'HIDRO-01');
    const demo = t.ctx.provider as DemoPaymentProvider;
    const dup = await demo.createPayment({
      machineId: 'HIDRO-01',
      machineName: 'Hidro 1',
      sessionId: checkout.sessionId,
      externalReference: checkout.sessionId,
      amount: checkout.payment.amount,
      durationSeconds: 180,
      description: 'x',
    });
    demo.approve(checkout.payment.externalPaymentId);
    demo.approve(dup.externalPaymentId);
    await forceExpire(t);
    expect(await sessionStatus(t, checkout.sessionId)).toBe('PAYMENT_EXPIRED');
    expect(await sessionAuditActions(t, checkout.sessionId)).toContain('PAYMENT_RECONCILE_AMBIGUOUS');
  });
});

describe('processApproval: recuperación de PAYMENT_EXPIRED (T2, ADR-030)', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('sin conflicto en la máquina -> recupera a AUTHORIZED con PAYMENT_AUTO_RECONCILED', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    const demo = t.ctx.provider as DemoPaymentProvider;
    demo.approve(expired.payment.externalPaymentId);
    const result = await processApproval(t.ctx, {
      externalPaymentId: expired.payment.externalPaymentId,
      providerStatus: 'APPROVED',
      providerRawStatus: 'approved',
      providerAmount: expired.payment.amount,
      source: 'admin_recheck',
      actorEmail: 'mesa@coop.local',
    });
    expect(result.result).toBe('approved');
    expect(await sessionStatus(t, expired.sessionId)).toBe('AUTHORIZED');
    expect(await sessionAuditActions(t, expired.sessionId)).toContain('PAYMENT_AUTO_RECONCILED');
  });

  it('sub-caso A: otra sesión sigue ACTIVA en la máquina -> machine_occupied (índice único)', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);

    // Necesariamente creada DESPUÉS de `expired`: el índice único no deja crear una
    // sesión activa mientras `expired` retenía la máquina en PAYMENT_PENDING.
    const { sessionId: activeSessionId } = await payAndAuthorize(t, 'HIDRO-01', PLATES.remis);
    expect(await sessionStatus(t, activeSessionId)).toBe('AUTHORIZED');

    const demo = t.ctx.provider as DemoPaymentProvider;
    demo.approve(expired.payment.externalPaymentId);
    const result = await processApproval(t.ctx, {
      externalPaymentId: expired.payment.externalPaymentId,
      providerStatus: 'APPROVED',
      providerRawStatus: 'approved',
      providerAmount: expired.payment.amount,
      source: 'admin_recheck',
      actorEmail: 'mesa@coop.local',
    });
    expect(result.result).toBe('machine_occupied');
    expect(await sessionStatus(t, expired.sessionId)).toBe('PAYMENT_EXPIRED');
    expect(await sessionAuditActions(t, expired.sessionId)).toContain('PAYMENT_RECONCILE_REJECTED');
  });

  it('sub-caso B: otra sesión ya TERMINÓ en la máquina desde entonces -> machine_used_since', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);

    const { sessionId: usedSessionId } = await payAndAuthorize(t, 'HIDRO-01', PLATES.remis);
    await waitSessionStatus(t, usedSessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    await waitSessionStatus(t, usedSessionId, 'FINISHED', 10_000);

    const demo = t.ctx.provider as DemoPaymentProvider;
    demo.approve(expired.payment.externalPaymentId);
    const result = await processApproval(t.ctx, {
      externalPaymentId: expired.payment.externalPaymentId,
      providerStatus: 'APPROVED',
      providerRawStatus: 'approved',
      providerAmount: expired.payment.amount,
      source: 'admin_recheck',
      actorEmail: 'mesa@coop.local',
    });
    expect(result.result).toBe('machine_used_since');
    expect(await sessionStatus(t, expired.sessionId)).toBe('PAYMENT_EXPIRED');
    expect(await sessionAuditActions(t, expired.sessionId)).toContain('PAYMENT_RECONCILE_REJECTED');
  });
});

describe('admin: rutas de reconciliación (T5)', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('cuenta admin sembrada por defecto -> default_admin_forbidden en ambas rutas', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    const token = await t.api.post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'admin-pass' }).expect(200);
    const bearer = `Bearer ${(token.body as { token: string }).token}`;
    const auto = await t.api.post(`/api/admin/sessions/${expired.sessionId}/reconcile/auto`).set('Authorization', bearer).send({}).expect(200);
    expect(auto.body.result).toBe('default_admin_forbidden');
    const manual = await t.api
      .post(`/api/admin/sessions/${expired.sessionId}/reconcile/manual`)
      .set('Authorization', bearer)
      .send({ paymentId: 'mp-123' })
      .expect(200);
    expect(manual.body.result).toBe('default_admin_forbidden');
  });

  it('reintentar automáticamente: not_found sin pago aprobado del lado del proveedor', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    const bearer = `Bearer ${nonDefaultAdminToken(t)}`;
    const res = await t.api.post(`/api/admin/sessions/${expired.sessionId}/reconcile/auto`).set('Authorization', bearer).send({}).expect(200);
    expect(res.body.result).toBe('not_found');
  });

  it('reintentar automáticamente: approved cuando el proveedor sí tiene el pago aprobado', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).approve(expired.payment.externalPaymentId);
    const bearer = `Bearer ${nonDefaultAdminToken(t)}`;
    const res = await t.api.post(`/api/admin/sessions/${expired.sessionId}/reconcile/auto`).set('Authorization', bearer).send({}).expect(200);
    expect(res.body.result).toBe('approved');
    expect(await sessionStatus(t, expired.sessionId)).toBe('AUTHORIZED');
  });

  it('aprobación manual: session_id_mismatch con un ID de pago que no corresponde', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    const bearer = `Bearer ${nonDefaultAdminToken(t)}`;
    const res = await t.api
      .post(`/api/admin/sessions/${expired.sessionId}/reconcile/manual`)
      .set('Authorization', bearer)
      .send({ paymentId: 'no-corresponde-a-esta-sesion' })
      .expect(200);
    expect(res.body.result).toBe('session_id_mismatch');
  });

  it('aprobación manual: approved con el ID real de pago', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).approve(expired.payment.externalPaymentId);
    const bearer = `Bearer ${nonDefaultAdminToken(t)}`;
    const res = await t.api
      .post(`/api/admin/sessions/${expired.sessionId}/reconcile/manual`)
      .set('Authorization', bearer)
      .send({ paymentId: expired.payment.externalPaymentId })
      .expect(200);
    expect(res.body.result).toBe('approved');
    expect(await sessionStatus(t, expired.sessionId)).toBe('AUTHORIZED');
  });

  it('sesión todavía no vencida (PAYMENT_PENDING) -> not_recoverable', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const checkout = await createPendingSession(t, 'HIDRO-01');
    const bearer = `Bearer ${nonDefaultAdminToken(t)}`;
    const res = await t.api.post(`/api/admin/sessions/${checkout.sessionId}/reconcile/auto`).set('Authorization', bearer).send({}).expect(200);
    expect(res.body.result).toBe('not_recoverable');
  });

  it('aprobación manual: amount_mismatch no autoriza — MP reporta un importe distinto al de la sesión', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    const demo = t.ctx.provider as DemoPaymentProvider;
    demo.approve(expired.payment.externalPaymentId);
    const original = demo.getPaymentById.bind(demo);
    demo.getPaymentById = async (id: string) => {
      const real = await original(id);
      return { ...real, amount: real.amount === null ? null : real.amount + 1 };
    };
    const bearer = `Bearer ${nonDefaultAdminToken(t)}`;
    const res = await t.api
      .post(`/api/admin/sessions/${expired.sessionId}/reconcile/manual`)
      .set('Authorization', bearer)
      .send({ paymentId: expired.payment.externalPaymentId })
      .expect(200);
    expect(res.body.result).toBe('amount_mismatch');
    expect(await sessionStatus(t, expired.sessionId)).toBe('PAYMENT_EXPIRED');
  });

  it('aprobación manual: MP todavía pendiente -> pending, sesión sigue vencida', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    const bearer = `Bearer ${nonDefaultAdminToken(t)}`;
    const res = await t.api
      .post(`/api/admin/sessions/${expired.sessionId}/reconcile/manual`)
      .set('Authorization', bearer)
      .send({ paymentId: expired.payment.externalPaymentId })
      .expect(200);
    expect(res.body.result).toBe('pending');
    expect(await sessionStatus(t, expired.sessionId)).toBe('PAYMENT_EXPIRED');
  });

  it('aprobación manual: MP reporta rechazado -> rejected, sesión sigue vencida', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).reject(expired.payment.externalPaymentId);
    const bearer = `Bearer ${nonDefaultAdminToken(t)}`;
    const res = await t.api
      .post(`/api/admin/sessions/${expired.sessionId}/reconcile/manual`)
      .set('Authorization', bearer)
      .send({ paymentId: expired.payment.externalPaymentId })
      .expect(200);
    expect(res.body.result).toBe('rejected');
    expect(await sessionStatus(t, expired.sessionId)).toBe('PAYMENT_EXPIRED');
  });

  it('el audit trail distingue PAYMENT_MANUALLY_RECONCILED (manual) de PAYMENT_AUTO_RECONCILED (auto)', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expired = await createPendingSession(t, 'HIDRO-01');
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).approve(expired.payment.externalPaymentId);
    const bearer = `Bearer ${nonDefaultAdminToken(t)}`;
    await t.api
      .post(`/api/admin/sessions/${expired.sessionId}/reconcile/manual`)
      .set('Authorization', bearer)
      .send({ paymentId: expired.payment.externalPaymentId })
      .expect(200);
    const actions = await sessionAuditActions(t, expired.sessionId);
    expect(actions).toContain('PAYMENT_MANUALLY_RECONCILED');
    expect(actions).not.toContain('PAYMENT_AUTO_RECONCILED');
  });
});

describe('settings: paymentPendingTimeoutSeconds dinámico (descubierto al escribir la guía manual)', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('PATCH /admin/settings cambia el timeout que usa sweepExpired de verdad, no solo lo que devuelve GET', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 3600 }); // muy largo: sin el fix, jamás vencería con este forceExpire
    const checkout = await createPendingSession(t, 'HIDRO-01');
    const token = await t.api.post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'admin-pass' }).expect(200);
    const bearer = `Bearer ${(token.body as { token: string }).token}`;
    await t.api.patch('/api/admin/settings').set('Authorization', bearer).send({ paymentPendingTimeoutSeconds: 60 }).expect(200);
    // now 90s adelante: cruza el nuevo límite dinámico (60s) pero NUNCA cruzaría el
    // límite estático original (3600s) si sweepExpired ignorara el setting de BD.
    await sweepExpired(t.ctx, new Date(Date.now() + 90_000));
    expect(await sessionStatus(t, checkout.sessionId)).toBe('PAYMENT_EXPIRED');
  });
});
