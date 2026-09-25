import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { payments, sessions as sessionsTable } from '../src/db/schema.js';
import { createTestApp, PLATES, adminToken, payAndAuthorize, waitMachineStatus, waitSessionStatus, type TestCtx } from './helpers.js';

let t: TestCtx;

describe('patentes y tarifas por categoría', () => {
  afterEach(async () => {
    await t?.close();
  });

  async function quote(plate: string) {
    const res = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate }).expect(200);
    return res.body.quote as { plate: string; category: string; priceArs: number; limit: number; remainingToday: number };
  }

  it('patente de remis registrada -> $500 (remis)', async () => {
    t = await createTestApp();
    const q = await quote(PLATES.remis);
    expect(q.category).toBe('remis');
    expect(q.priceArs).toBe(500);
    expect(q.limit).toBe(2);
    expect(q.remainingToday).toBe(2);
  });

  it('patente de socio registrada -> $2.000 (socio)', async () => {
    t = await createTestApp();
    const q = await quote(PLATES.socio);
    expect(q.category).toBe('socio');
    expect(q.priceArs).toBe(2000);
  });

  it('patente NO registrada -> $8.000 (externo)', async () => {
    t = await createTestApp();
    const q = await quote('ZZ999ZZ');
    expect(q.category).toBe('externo');
    expect(q.priceArs).toBe(8000);
  });

  it('normaliza la patente (minúsculas, espacios y guiones)', async () => {
    t = await createTestApp();
    const q = await quote('  ae-100-aa  ');
    expect(q.plate).toBe('AE100AA');
    expect(q.category).toBe('remis');
  });

  it('patente inválida -> 400', async () => {
    t = await createTestApp();
    await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'abc' }).expect(400);
  });

  it('patente de otro país (formato no argentino) -> se acepta y cotiza $8.000 (externo)', async () => {
    t = await createTestApp();
    const chile = await quote('BBCL42');
    expect(chile.plate).toBe('BBCL42');
    expect(chile.category).toBe('externo');
    expect(chile.priceArs).toBe(8000);
    const corta = await quote('1234');
    expect(corta.category).toBe('externo');
  });

  it('patente de 11 caracteres -> 400 con el mensaje de ejemplo actual', async () => {
    t = await createTestApp();
    const res = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'ABCDEFGHIJK' }).expect(400);
    expect(JSON.stringify(res.body)).toContain('AG945RS');
  });

  it('crear sesión SIN patente -> 400 (nunca se cobra)', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    await t.api.post('/api/public/machines/HIDRO-01/sessions').send({}).expect(400);
    const rows = await t.ctx.db.select().from(payments);
    expect(rows.length).toBe(0);
  });

  it('el pago usa la tarifa de la categoría (remis = $500)', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
    const checkout = res.body.checkout as { plate: string; plateCategory: string; payment: { amount: number } };
    expect(checkout.plate).toBe('AE100AA');
    expect(checkout.plateCategory).toBe('remis');
    expect(checkout.payment.amount).toBe(500);
    const session = await t.ctx.db.select().from(sessionsTable).where(eq(sessionsTable.id, checkout.sessionId));
    expect(session[0]?.plate).toBe('AE100AA');
    expect(session[0]?.plateCategory).toBe('remis');
  });

  it('límite diario: con límite 1, el segundo pago se rechaza SIN cobrar', async () => {
    t = await createTestApp();
    const { updateDynamicSettings } = await import('../src/services/settingsService.js');
    await updateDynamicSettings(t.ctx.db, t.ctx.config, { dailyWashLimit: 1 });

    const { sessionId } = await payAndAuthorize(t); // 1er lavado remis OK
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    await waitSessionStatus(t, sessionId, 'FINISHED', 10_000); // máquina libre

    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(409);
    expect(res.body.error.code).toBe('PLATE_LIMIT_REACHED');
    const rows = await t.ctx.db.select().from(payments);
    expect(rows.length).toBe(1); // UN solo cobro
  });

  it('el límite es POR PATENTE: otra patente sigue pudiendo', async () => {
    t = await createTestApp();
    const { updateDynamicSettings } = await import('../src/services/settingsService.js');
    await updateDynamicSettings(t.ctx.db, t.ctx.config, { dailyWashLimit: 1 });

    const { sessionId } = await payAndAuthorize(t, 'HIDRO-01', PLATES.remis);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    await waitSessionStatus(t, sessionId, 'FINISHED', 10_000);

    // otra patente (socio) -> permitida
    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.socio }).expect(201);
    expect(res.body.checkout.plateCategory).toBe('socio');
  });

  it('el pago aprobado cuenta contra el límite aunque no se presione el botón', async () => {
    t = await createTestApp();

    const { sessionId } = await payAndAuthorize(t); // aprobado, sin pulsador
    const q = await quote(PLATES.remis);
    expect(q.remainingToday).toBe(1); // ya cuenta el pago aprobado

    // completar el 1er lavado
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    await waitSessionStatus(t, sessionId, 'FINISHED', 10_000);

    // 2do lavado: pagar, aprobar, completar (máquina libre entre pasos)
    const res2 = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
    const checkout2 = res2.body.checkout as { sessionId: string; payment: { externalPaymentId: string } };
    await t.api.post(`/api/public/payments/${checkout2.payment.externalPaymentId}/simulate`).send({ action: 'approve' }).expect(200);
    await waitSessionStatus(t, checkout2.sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    await waitSessionStatus(t, checkout2.sessionId, 'FINISHED', 10_000);

    // tercero -> límite (2 lavados por día por patente)
    const third = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(409);
    expect(third.body.error.code).toBe('PLATE_LIMIT_REACHED');
  });

  it('límite diario ENTRE MÁQUINAS: misma patente en paralelo -> la segunda es PLATE_LIMIT_REACHED', async () => {
    t = await createTestApp();
    const token = await adminToken(t);

    // habilitar HIDRO-02 (viene deshabilitada en el seed)
    await t.api
      .patch('/api/admin/machines/HIDRO-02')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true })
      .expect(200);
    await waitMachineStatus(t, 'HIDRO-02', 'ONLINE', 12_000);

    const { updateDynamicSettings } = await import('../src/services/settingsService.js');
    await updateDynamicSettings(t.ctx.db, t.ctx.config, { dailyWashLimit: 1 });

    // El cupo se reserva AL CREAR la sesión (PAYMENT_PENDING cuenta), así que aunque
    // los dos checkouts corran en máquinas distintas y en paralelo, el lock advisory
    // por patente serializa la reserva y la segunda queda afuera SIN cobro.
    const [a, b] = await Promise.allSettled([
      t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }),
      t.api.post('/api/public/machines/HIDRO-02/sessions').send({ plate: PLATES.remis }),
    ]);
    const aRes = a.status === 'fulfilled' ? a.value : null;
    const bRes = b.status === 'fulfilled' ? b.value : null;
    const statuses = [aRes?.status ?? 0, bRes?.status ?? 0].sort();
    expect(statuses).toEqual([201, 409]);
    const rejected = (aRes?.status === 409 ? aRes : bRes) as { body: { error: { code: string } } };
    expect(rejected.body.error.code).toBe('PLATE_LIMIT_REACHED');

    // UN solo pago generado en total
    const rows = await t.ctx.db.select().from(payments);
    expect(rows.length).toBe(1);
  });
});
