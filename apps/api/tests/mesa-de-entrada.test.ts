import { afterEach, describe, expect, it } from 'vitest';
import { DemoPaymentProvider } from '../src/payments/demoProvider.js';
import { sweepExpired } from '../src/services/sessionService.js';
import { issueToken } from '../src/services/adminService.js';
import { adminUsers } from '../src/db/schema.js';
import { hashSecret } from '../src/db/seed.js';
import { uuid } from '../src/ids.js';
import { createTestApp, PLATES, sessionStatus, waitMachineStatus, type TestCtx } from './helpers.js';

/**
 * QA del pendiente C1 (mesa de entrada). Lo que estos tests fijan no es lógica nueva: es la
 * puerta de entrada que hoy NO existe, y por qué la suite no se daba cuenta.
 *
 * Contexto: reconciliar un pago colgado está prohibido para la cuenta admin por defecto
 * (`default_admin_forbidden`, `paymentService.ts:563`) justamente para que cada persona de la
 * cooperativa use su propia cuenta y quede su nombre en la auditoría. Pero la única fila de
 * `admin_users` que alguien crea es la del seed, con `ADMIN_EMAIL`. No hay endpoint ni pantalla
 * para dar de alta una segunda: `adminRoutes.ts` no expone ninguna, y este archivo lo demuestra
 * al tener que insertarla a mano con drizzle para poder probar el camino feliz.
 *
 * El test viejo de reconciliación (`reconciliation.test.ts:20`) fabricaba el JWT con
 * `issueToken()` en vez de pasar por el login, así que verde no probaba que una cuenta individual
 * pudiera existir ni entrar. Acá se prueba por la puerta real.
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

/** Da de alta una cuenta individual como HABRÍA que poder hacerlo desde el panel. Que este
 *  helper tenga que escribir en la tabla a mano ES el hallazgo: no hay otra forma. */
async function crearCuentaIndividual(ctx: TestCtx, email: string, password: string): Promise<void> {
  await ctx.ctx.db.insert(adminUsers).values({
    id: uuid(),
    email: email.toLowerCase(),
    passwordHash: hashSecret(password),
    role: 'admin',
  });
}

describe('C1: mesa de entrada', () => {
  it('con solo el seed, la ÚNICA cuenta que puede entrar es la de ADMIN_EMAIL', async () => {
    t = await createTestApp();
    const filas = await t.ctx.db.select().from(adminUsers);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.email).toBe(t.ctx.config.adminEmail.toLowerCase());
  });

  it('y esa cuenta tiene prohibido reconciliar -> hoy nadie puede destrabar un pago', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    const expirada = await createPendingSession(t);
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).approve(expirada.payment.externalPaymentId);

    // Login por la puerta real, con la única cuenta que existe en producción.
    const login = await t.api
      .post('/api/admin/auth/login')
      .send({ email: 'admin@test.local', password: 'admin-pass' })
      .expect(200);
    const res = await t.api
      .post(`/api/admin/sessions/${expirada.sessionId}/reconcile/auto`)
      .set('Authorization', `Bearer ${(login.body as { token: string }).token}`)
      .send({})
      .expect(200);

    expect(res.body.result).toBe('default_admin_forbidden');
    // El pago estaba aprobado del lado del proveedor: lo único que faltó fue alguien habilitado.
    expect(await sessionStatus(t, expirada.sessionId)).toBe('PAYMENT_EXPIRED');
  });

  it('una cuenta individual que existe en la base entra por el login real y sí reconcilia', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    await crearCuentaIndividual(t, 'mesa@coop.local', 'clave-de-mesa-1');
    const expirada = await createPendingSession(t);
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).approve(expirada.payment.externalPaymentId);

    const login = await t.api
      .post('/api/admin/auth/login')
      .send({ email: 'mesa@coop.local', password: 'clave-de-mesa-1' })
      .expect(200);
    expect(login.body.email).toBe('mesa@coop.local');

    const res = await t.api
      .post(`/api/admin/sessions/${expirada.sessionId}/reconcile/auto`)
      .set('Authorization', `Bearer ${(login.body as { token: string }).token}`)
      .send({})
      .expect(200);

    expect(res.body.result).toBe('approved');
    expect(await sessionStatus(t, expirada.sessionId)).toBe('AUTHORIZED');
  });

  it('el email queda en la auditoría: se sabe quién destrabó el pago', async () => {
    t = await createTestApp({ paymentPendingTimeoutSeconds: 120 });
    await crearCuentaIndividual(t, 'Mesa@Coop.Local', 'clave-de-mesa-1');
    const expirada = await createPendingSession(t);
    await forceExpire(t);
    (t.ctx.provider as DemoPaymentProvider).approve(expirada.payment.externalPaymentId);

    // Mayúsculas al entrar: el login normaliza, así que la auditoría no se parte en dos actores.
    const login = await t.api
      .post('/api/admin/auth/login')
      .send({ email: 'MESA@coop.local', password: 'clave-de-mesa-1' })
      .expect(200);
    await t.api
      .post(`/api/admin/sessions/${expirada.sessionId}/reconcile/auto`)
      .set('Authorization', `Bearer ${(login.body as { token: string }).token}`)
      .send({})
      .expect(200);

    const logs = await t.api
      .get('/api/admin/logs')
      .set('Authorization', `Bearer ${(login.body as { token: string }).token}`)
      .expect(200);
    // El endpoint publica la acción como `type` (`adminService.ts:428`), no como `action`.
    const reconciliaciones = (logs.body.logs as Array<{ type: string; actor: string }>).filter(
      (l) => l.type === 'PAYMENT_AUTO_RECONCILED',
    );
    expect(reconciliaciones.map((l) => l.actor)).toContain('mesa@coop.local');
  });

  it('el token vive 12 h por su cuenta: borrar la cuenta no lo corta hasta que venza', async () => {
    // Límite conocido y aceptado a esta escala (`adminAuth.ts` no consulta la base). Queda
    // fijado acá para que sea una decisión y no una sorpresa el día que haya que sacarle el
    // acceso a alguien: la baja tarda hasta 12 h, o hay que rotar JWT_SECRET (echa a todos).
    t = await createTestApp();
    const token = issueToken(t.ctx.config, { email: 'ya-no-trabaja@coop.local', role: 'admin' });
    const res = await t.api.get('/api/admin/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.email).toBe('ya-no-trabaja@coop.local');
  });
});
