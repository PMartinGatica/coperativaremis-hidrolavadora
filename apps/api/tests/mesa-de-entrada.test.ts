import { afterEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { DemoPaymentProvider } from '../src/payments/demoProvider.js';
import { sweepExpired } from '../src/services/sessionService.js';
import { adminUsers } from '../src/db/schema.js';
import { adminToken, createPanelUser, createTestApp, PLATES, sessionStatus, waitMachineStatus, type TestCtx } from './helpers.js';

/**
 * QA del pendiente C1 (mesa de entrada), cerrado por la fase de roles (ADR-062).
 *
 * Antes: la única cuenta era la del seed y tenía prohibido reconciliar por email ⇒ nadie de la
 * cooperativa podía destrabar un pago. Ahora la cuenta del seed es `tecnico` (Insolva), sigue
 * sin poder destrabar (403 por permiso, no por email), y la cooperativa da de alta sus propias
 * cuentas desde el panel. Todo por la puerta real: login + rutas, nunca un token fabricado.
 */

let t: TestCtx | undefined;

afterEach(async () => {
  const ctx = t;
  t = undefined;
  await ctx?.close();
});

async function createPendingSession(ctx: TestCtx, machineId = 'HIDRO-01', plate = PLATES.remis) {
  await waitMachineStatus(ctx, machineId, 'ONLINE');
  const res = await ctx.api.post(`/api/public/machines/${machineId}/sessions`).send({ plate }).expect(201);
  return res.body.checkout as { sessionId: string; payment: { externalPaymentId: string; amount: number } };
}

async function forceExpire(ctx: TestCtx): Promise<void> {
  await sweepExpired(ctx.ctx, new Date(Date.now() + 150_000));
}

describe('C1: mesa de entrada', () => {
  it('con solo el seed, la única cuenta es la técnica de ADMIN_EMAIL', async () => {
    t = await createTestApp();
    const filas = await t.ctx.db.select().from(adminUsers);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.email).toBe(t.ctx.config.adminEmail.toLowerCase());
    expect(filas[0]?.role).toBe('tecnico');
    expect(filas[0]?.mustChangePassword).toBe(false);
  });

  it('la cuenta técnica no puede destrabar: 403 y queda PERMISSION_DENIED en la auditoría', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expirada = await createPendingSession(t);
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).approve(expirada.payment.externalPaymentId);

    const token = await adminToken(t);
    const res = await t.api
      .post(`/api/admin/sessions/${expirada.sessionId}/reconcile/auto`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
    expect(res.body.error.details.permission).toBe('pagos.destrabar');
    expect(await sessionStatus(t, expirada.sessionId)).toBe('PAYMENT_EXPIRED');

    const logs = await t.api.get('/api/admin/logs').set('Authorization', `Bearer ${token}`).expect(200);
    expect((logs.body.logs as Array<{ type: string }>).map((l) => l.type)).toContain('PERMISSION_DENIED');
  });

  it('un operador creado desde el panel entra por el login real y destraba el pago', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const operador = await createPanelUser(t, { email: 'mesa@coop.local', role: 'operador' });
    const expirada = await createPendingSession(t);
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).approve(expirada.payment.externalPaymentId);

    const res = await t.api
      .post(`/api/admin/sessions/${expirada.sessionId}/reconcile/auto`)
      .set('Authorization', `Bearer ${operador.token}`)
      .send({})
      .expect(200);

    expect(res.body.result).toBe('approved');
    expect(await sessionStatus(t, expirada.sessionId)).toBe('AUTHORIZED');
  });

  it('el email de quien destrabó queda en la auditoría (alta con mayúsculas, login con otras)', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const operador = await createPanelUser(t, { email: 'Mesa@Coop.Local', role: 'operador' });
    expect(operador.email).toBe('mesa@coop.local');
    const expirada = await createPendingSession(t);
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).approve(expirada.payment.externalPaymentId);

    const login = await t.api
      .post('/api/admin/auth/login')
      .send({ email: 'MESA@coop.local', password: operador.password })
      .expect(200);
    const bearer = `Bearer ${(login.body as { token: string }).token}`;
    await t.api.post(`/api/admin/sessions/${expirada.sessionId}/reconcile/auto`).set('Authorization', bearer).send({}).expect(200);

    const logs = await t.api.get('/api/admin/logs').set('Authorization', bearer).expect(200);
    const reconciliaciones = (logs.body.logs as Array<{ type: string; actor: string }>).filter(
      (l) => l.type === 'PAYMENT_AUTO_RECONCILED',
    );
    expect(reconciliaciones.map((l) => l.actor)).toContain('mesa@coop.local');
  });

  it('desactivar una cuenta la corta en el acto: el siguiente pedido responde 401 inactive', async () => {
    // Antes (ADR-054) el token vivía 12 h aunque se borrara la cuenta. Ahora cada pedido
    // consulta la base.
    t = await createTestApp();
    const tecnico = await adminToken(t);
    const operador = await createPanelUser(t, { email: 'ya-no-trabaja@coop.local', role: 'operador' });
    await t.api.get('/api/admin/overview').set('Authorization', `Bearer ${operador.token}`).expect(200);

    await t.api
      .patch(`/api/admin/users/${operador.id}`)
      .set('Authorization', `Bearer ${tecnico}`)
      .send({ active: false })
      .expect(200);

    const res = await t.api.get('/api/admin/overview').set('Authorization', `Bearer ${operador.token}`).expect(401);
    expect(res.body.error.details.reason).toBe('inactive');
    await t.api.post('/api/admin/auth/login').send({ email: operador.email, password: operador.password }).expect(401);
  });

  it('un token del formato anterior (sub = email, sin tv) ya no entra: 401 session_changed', async () => {
    t = await createTestApp();
    const viejo = jwt.sign({ sub: 'admin@test.local', role: 'admin' }, t.ctx.config.jwtSecret, { expiresIn: '12h' });
    const res = await t.api.get('/api/admin/auth/me').set('Authorization', `Bearer ${viejo}`).expect(401);
    expect(res.body.error.details.reason).toBe('session_changed');
  });
});
