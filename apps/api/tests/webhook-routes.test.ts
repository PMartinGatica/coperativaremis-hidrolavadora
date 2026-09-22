import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, PLATES, waitMachineStatus, type TestCtx } from './helpers.js';
import { listAudit } from '../src/repositories/repos.js';
import { classifyInvalidWebhook } from '../src/http/routes/webhookRoutes.js';

/**
 * WEBHOOK HTTP — la suite que no existía (ADR-052).
 *
 * Hasta hoy NINGÚN test pegaba a `/api/webhooks/mercadopago`: los tres "de webhook" de
 * `payment-flow.test.ts` usan el endpoint DEMO de simulación, y `mercadoPagoProvider.test.ts`
 * prueba `validateWebhook` en aislamiento **firmando él mismo** el manifest que el código
 * espera. O sea: las dos cosas que deciden qué contesta producción — el filtro de `topic` y la
 * guarda 404 del modo demo — nunca se habían ejercitado, y el "test del formato legado con firma
 * válida" pasaba por construcción, no porque Mercado Pago firme así (de hecho no puede: MP no
 * permite validar la firma de la vía IPN con el secret de la aplicación).
 *
 * Lo que se prueba acá es el HANDLER: qué código HTTP recibe Mercado Pago en cada caso. Y eso
 * importa por una razón concreta y documentada: si MP no recibe 200/201, REINTENTA hasta 4 días.
 * Contestar de más apaga una cola de reintentos que a veces es lo único que rescata un pago;
 * contestar de menos deja a MP martillando el endpoint por algo que igual no vamos a procesar.
 *
 * ⚠️ Estos tests NO prueban que Mercado Pago se comporte como acá se simula. Eso solo lo prueba
 * un pago real de sandbox con el túnel abierto (`pendientes-manual.md` C2b).
 */

const { mockCreate, mockGet, mockSearch } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockGet: vi.fn(),
  mockSearch: vi.fn(),
}));

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: vi.fn(),
  Preference: vi.fn().mockImplementation(() => ({ create: mockCreate })),
  Payment: vi.fn().mockImplementation(() => ({ get: mockGet, search: mockSearch })),
}));

const WEBHOOK_SECRET = 'secreto-de-prueba-del-panel';
const MP_PAYMENT_ID = '178976950845';
const URL = '/api/webhooks/mercadopago';

/** Firma como la manda MP en la vía Webhooks: `id:<pago>;request-id:<rid>;ts:<unix>;`. */
function signature(paymentId: string, requestId: string, ts = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', WEBHOOK_SECRET)
    .update(`id:${paymentId};request-id:${requestId};ts:${ts};`, 'utf8')
    .digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}

/** Firma que no corresponde al payload: lo que llega por la vía IPN legada, y también un ataque. */
function badSignature(requestId = 'req-mala') {
  const ts = Math.floor(Date.now() / 1000);
  return { 'x-signature': `ts=${ts},v1=${'f'.repeat(64)}`, 'x-request-id': requestId };
}

async function mpTestApp(overrides = {}): Promise<TestCtx> {
  return createTestApp({
    paymentProvider: 'mercadopago',
    mercadopagoAccessToken: 'TEST-token',
    mercadopagoPublicKey: 'TEST-public',
    mercadopagoWebhookSecret: WEBHOOK_SECRET,
    ...overrides,
  });
}

/** Crea una sesión real con pago pendiente y devuelve su id (la preference la da el SDK mockeado). */
async function crearSesionConPagoPendiente(t: TestCtx) {
  await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
  mockCreate.mockResolvedValueOnce({ id: `pref-${Date.now()}`, init_point: 'https://mp.example/checkout' });
  const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
  const checkout = res.body.checkout as { sessionId: string; payment: { externalPaymentId: string } };
  return checkout.sessionId;
}

async function auditActions(t: TestCtx): Promise<string[]> {
  const rows = await listAudit(t.ctx.db, { limit: 50 });
  return rows.map((r) => r.action);
}

describe('POST /api/webhooks/mercadopago (handler HTTP)', () => {
  // `undefined` a propósito: hay un test sincrónico que no levanta app, y sin soltar la
  // referencia el afterEach intentaría cerrar dos veces la base del test anterior.
  let t: TestCtx | undefined;

  beforeEach(() => {
    mockCreate.mockReset();
    mockGet.mockReset();
    mockSearch.mockReset();
  });

  afterEach(async () => {
    const abierto = t;
    t = undefined;
    await abierto?.close();
  });

  it('vía firmada con firma válida -> 200 y el pago queda aprobado', async () => {
    t = await mpTestApp();
    const sessionId = await crearSesionConPagoPendiente(t);
    mockGet.mockResolvedValue({ status: 'approved', transaction_amount: 500, external_reference: sessionId });

    const res = await t.api
      .post(`${URL}?data.id=${MP_PAYMENT_ID}&type=payment`)
      .set(signature(MP_PAYMENT_ID, 'req-ok'))
      .send({ action: 'payment.updated', data: { id: MP_PAYMENT_ID }, type: 'payment' })
      .expect(200);

    expect(res.body.result).toBe('approved');
    const estado = (await t.api.get(`/api/public/sessions/${sessionId}`).expect(200)).body.session.status;
    expect(['AUTHORIZED', 'WAITING_FOR_BUTTON', 'RUNNING']).toContain(estado);
  });

  it('vía IPN legada (firma no validable por diseño de MP) -> 200 acusado, sin procesar', async () => {
    t = await mpTestApp();
    const sessionId = await crearSesionConPagoPendiente(t);

    const res = await t.api
      .post(`${URL}?id=${MP_PAYMENT_ID}&topic=payment`)
      .set(badSignature())
      .send({ resource: MP_PAYMENT_ID, topic: 'payment' })
      .expect(200);

    expect(res.body.result).toBe('ignored_unverifiable_ipn');
    // No se procesó nada: ni se consultó el pago a MP, ni la sesión se movió.
    expect(mockGet).not.toHaveBeenCalled();
    const estado = (await t.api.get(`/api/public/sessions/${sessionId}`).expect(200)).body.session.status;
    expect(estado).toBe('PAYMENT_PENDING');
    expect(await auditActions(t)).toContain('WEBHOOK_IGNORED_IPN');
  });

  it('vía firmada con firma inválida -> 401 (el 200 de la vía legada no es una puerta de atrás)', async () => {
    t = await mpTestApp();
    await crearSesionConPagoPendiente(t);

    await t.api
      .post(`${URL}?data.id=${MP_PAYMENT_ID}&type=payment`)
      .set(badSignature())
      .send({ action: 'payment.updated', data: { id: MP_PAYMENT_ID }, type: 'payment' })
      .expect(401);

    expect(mockGet).not.toHaveBeenCalled();
  });

  /**
   * El caso que casi se cuela: Express usa `qs` con `allowDots:false`, así que `?data.id=X` llega
   * como la clave LITERAL 'data.id'. Leerlo con `req.query.data?.id` daría `undefined` siempre y
   * clasificaría como IPN legada a la vía firmada -> 200 mudo a una notificación real.
   */
  it('query con data.id y un topic colado -> 401, no se confunde con la vía legada', async () => {
    t = await mpTestApp();
    await crearSesionConPagoPendiente(t);

    await t.api
      .post(`${URL}?data.id=${MP_PAYMENT_ID}&topic=payment`)
      .set(badSignature())
      .send({ data: { id: MP_PAYMENT_ID }, topic: 'payment' })
      .expect(401);
  });

  it('merchant_order (lo que MP manda en paralelo a cada pago) -> 200 ignorado', async () => {
    t = await mpTestApp();
    await t.api
      .post(`${URL}?topic=merchant_order&id=123`)
      .send({ resource: 'https://api.mercadolibre.com/merchant_orders/123', topic: 'merchant_order' })
      .expect(200)
      .expect((r) => expect(r.body.result).toBe('ignored_topic'));
  });

  it('en modo demo el endpoint no existe -> 404 aunque el topic sea raro', async () => {
    t = await createTestApp();
    await t.api.post(`${URL}?topic=merchant_order&id=123`).send({ topic: 'merchant_order' }).expect(404);
    await t.api.post(`${URL}?data.id=1&type=payment`).send({ data: { id: '1' } }).expect(404);
  });

  /**
   * El viernes a las 2 AM: las dos vías del MISMO pago llegando de verdad a la vez (en la prueba
   * real las separaron 942 ms). Prueba que el `SELECT ... FOR UPDATE` de processApproval serializa
   * y que la vía legada no genera un segundo ciclo de lavado.
   */
  it('las dos vías del mismo pago, concurrentes -> una sola autorización', async () => {
    t = await mpTestApp();
    const sessionId = await crearSesionConPagoPendiente(t);
    mockGet.mockResolvedValue({ status: 'approved', transaction_amount: 500, external_reference: sessionId });

    const [firmada, legada] = await Promise.all([
      t.api
        .post(`${URL}?data.id=${MP_PAYMENT_ID}&type=payment`)
        .set(signature(MP_PAYMENT_ID, 'req-concurrente'))
        .send({ action: 'payment.updated', data: { id: MP_PAYMENT_ID }, type: 'payment' }),
      t.api
        .post(`${URL}?id=${MP_PAYMENT_ID}&topic=payment`)
        .set(badSignature('req-concurrente-ipn'))
        .send({ resource: MP_PAYMENT_ID, topic: 'payment' }),
    ]);

    expect(firmada.status).toBe(200);
    expect(legada.status).toBe(200);
    expect(legada.body.result).toBe('ignored_unverifiable_ipn');
    const acciones = await auditActions(t);
    expect(acciones.filter((a) => a === 'AUTH_CREATED')).toHaveLength(1);
  });

  it('el webhook duplicado de MP no genera un segundo lavado', async () => {
    t = await mpTestApp();
    const sessionId = await crearSesionConPagoPendiente(t);
    mockGet.mockResolvedValue({ status: 'approved', transaction_amount: 500, external_reference: sessionId });
    const headers = signature(MP_PAYMENT_ID, 'req-dup');
    const body = { action: 'payment.updated', data: { id: MP_PAYMENT_ID }, type: 'payment' };

    await t.api.post(`${URL}?data.id=${MP_PAYMENT_ID}&type=payment`).set(headers).send(body).expect(200);
    const segundo = await t.api.post(`${URL}?data.id=${MP_PAYMENT_ID}&type=payment`).set(headers).send(body).expect(200);

    expect(segundo.body.result).toBe('duplicated');
    const acciones = await auditActions(t);
    expect(acciones.filter((a) => a === 'AUTH_CREATED')).toHaveLength(1);
  });

  it('pago de otra cuenta (external_reference ajeno) -> 200 ignorado, sin tocar nada nuestro', async () => {
    t = await mpTestApp();
    await crearSesionConPagoPendiente(t);
    mockGet.mockResolvedValue({ status: 'approved', transaction_amount: 99999, external_reference: 'sesion-de-otro' });

    const res = await t.api
      .post(`${URL}?data.id=${MP_PAYMENT_ID}&type=payment`)
      .set(signature(MP_PAYMENT_ID, 'req-ajeno'))
      .send({ action: 'payment.updated', data: { id: MP_PAYMENT_ID }, type: 'payment' })
      .expect(200);

    expect(res.body.result).toBe('ignored');
    expect(await auditActions(t)).toContain('WEBHOOK_UNKNOWN_PAYMENT');
  });

  /**
   * El 503 por secret faltante no se puede montar por HTTP: con `assertProductionConfig` exigiendo
   * el secret, una app de producción sin él ya no arranca (que es el punto), y fuera de producción
   * `validateWebhook` acepta sin firma a propósito. Así que la decisión se prueba donde vive.
   * Esta rama es defensa en profundidad: el día que alguien afloje la guarda de config, MP tiene
   * que seguir reintentando en vez de recibir un 200 que apaga su cola.
   */
  it('falta el webhook secret -> se clasifica como problema NUESTRO (5xx), nunca como IPN acusable', () => {
    const req = {
      query: { id: MP_PAYMENT_ID, topic: 'payment' },
      body: { resource: MP_PAYMENT_ID, topic: 'payment' },
    } as unknown as Parameters<typeof classifyInvalidWebhook>[0];

    expect(classifyInvalidWebhook(req, { valid: false, reason: 'webhook secret no configurado' }).kind).toBe(
      'misconfigured',
    );
    // La MISMA request, con el secret puesto y la firma mala, sí es la vía legada esperada.
    expect(classifyInvalidWebhook(req, { valid: false, reason: 'firma HMAC inválida' }).kind).toBe(
      'unverifiable_ipn',
    );
  });

  /**
   * El audit no puede decidir qué contesta el endpoint. Con la base caída, un throw al auditar
   * convertiría el acuse en 500 y MP reintentaría durante días una notificación que igual
   * ignoramos. (La app se deja en pie a propósito: se cierra solo la base.)
   */
  it('base caída -> igual acusa recibo de la vía legada con 200', async () => {
    const app = await mpTestApp();
    await app.ctx.close();

    const res = await app.api
      .post(`${URL}?id=${MP_PAYMENT_ID}&topic=payment`)
      .set(badSignature())
      .send({ resource: MP_PAYMENT_ID, topic: 'payment' })
      .expect(200);

    expect(res.body.result).toBe('ignored_unverifiable_ipn');
  });

  it('si la re-consulta a MP falla -> 500, para que MP reintente (no se pierde el pago)', async () => {
    t = await mpTestApp();
    await crearSesionConPagoPendiente(t);
    mockGet.mockRejectedValue(new Error('timeout hablando con MP'));

    await t.api
      .post(`${URL}?data.id=${MP_PAYMENT_ID}&type=payment`)
      .set(signature(MP_PAYMENT_ID, 'req-timeout'))
      .send({ action: 'payment.updated', data: { id: MP_PAYMENT_ID }, type: 'payment' })
      .expect(500);
  });
});
