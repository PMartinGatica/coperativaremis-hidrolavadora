import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

/**
 * SDK mockeado (`mercadopago` nunca llama a la red real). Esta suite existe porque
 * MercadoPagoPaymentProvider — el único código que habla con la plata real — no tenía
 * NINGÚN test desde el primer commit del repo (Testing specialist, /review de Fase 1).
 * `sdk()` hace `await import('mercadopago')` perezoso adentro de cada método, así que
 * el mock tiene que devolver una instancia fresca de Preference/Payment en cada llamada.
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

function fakeConfig(overrides: Parameters<typeof loadConfig>[0] = {}) {
  return loadConfig({
    paymentProvider: 'mercadopago',
    mercadopagoAccessToken: 'TEST-token',
    mercadopagoPublicKey: 'TEST-public',
    publicAppUrl: 'http://localhost:5173',
    publicApiUrl: 'http://localhost:3020',
    ...overrides,
  });
}

describe('MercadoPagoPaymentProvider (SDK mockeado)', () => {
  it('createPayment: arma la preference con external_reference/importe y devuelve el init_point', async () => {
    const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
    mockCreate.mockResolvedValueOnce({ id: 'pref-1', init_point: 'https://mp.example/checkout/pref-1' });
    const provider = new MercadoPagoPaymentProvider(fakeConfig());
    const result = await provider.createPayment({
      machineId: 'HIDRO-01',
      machineName: 'Hidro 1',
      sessionId: 'sess-1',
      externalReference: 'sess-1',
      amount: 500,
      durationSeconds: 180,
      description: 'Lavado HIDRO-01',
    });
    expect(result).toEqual({ externalPaymentId: 'pref-1', status: 'PENDING', rawStatus: 'preference_created', initPoint: 'https://mp.example/checkout/pref-1' });
    const body = mockCreate.mock.calls[0]?.[0]?.body;
    expect(body.external_reference).toBe('sess-1');
    expect(body.items[0].unit_price).toBe(500);
  });

  it('getPaymentById: mapea status/importe/external_reference reales de la API', async () => {
    const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
    mockGet.mockResolvedValueOnce({ status: 'approved', transaction_amount: 500.0, external_reference: 'sess-1' });
    const provider = new MercadoPagoPaymentProvider(fakeConfig());
    const result = await provider.getPaymentById('mp-payment-1');
    expect(result).toEqual({ status: 'APPROVED', rawStatus: 'approved', amount: 500, externalReference: 'sess-1' });
  });

  it('getPaymentById: pago sin external_reference (ajeno a este sistema) -> externalReference null', async () => {
    const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
    mockGet.mockResolvedValueOnce({ status: 'pending', transaction_amount: 100 });
    const provider = new MercadoPagoPaymentProvider(fakeConfig());
    const result = await provider.getPaymentById('mp-payment-2');
    expect(result.externalReference).toBeNull();
    expect(result.status).toBe('PENDING');
  });

  it.each([
    ['approved', 'APPROVED'],
    ['rejected', 'REJECTED'],
    ['cancelled', 'REJECTED'],
    ['refunded', 'REFUNDED'],
    ['in_process', 'PENDING'],
  ] as const)('getPaymentById: mapStatus %s -> %s', async (raw, expected) => {
    const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
    mockGet.mockResolvedValueOnce({ status: raw, transaction_amount: 500 });
    const provider = new MercadoPagoPaymentProvider(fakeConfig());
    const result = await provider.getPaymentById('mp-payment-3');
    expect(result.status).toBe(expected);
  });

  it('searchByExternalReference: encuentra el pago aprobado que matchea el importe esperado', async () => {
    const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
    mockSearch.mockResolvedValueOnce({
      results: [
        { id: 'mp-1', status: 'rejected', transaction_amount: 500, currency_id: 'ARS' },
        { id: 'mp-2', status: 'approved', transaction_amount: 500.0, currency_id: 'ARS' },
      ],
    });
    const provider = new MercadoPagoPaymentProvider(fakeConfig());
    const result = await provider.searchByExternalReference('sess-1', 500);
    expect(result.outcome).toBe('found');
    if (result.outcome === 'found') expect(result.match.externalPaymentId).toBe('mp-2');
  });

  it('searchByExternalReference: sin resultados aprobados -> not_found', async () => {
    const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
    mockSearch.mockResolvedValueOnce({ results: [] });
    const provider = new MercadoPagoPaymentProvider(fakeConfig());
    const result = await provider.searchByExternalReference('sess-1', 500);
    expect(result.outcome).toBe('not_found');
  });

  it('searchByExternalReference: 2 pagos aprobados que matchean el importe -> ambiguous', async () => {
    const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
    mockSearch.mockResolvedValueOnce({
      results: [
        { id: 'mp-1', status: 'approved', transaction_amount: 500, currency_id: 'ARS' },
        { id: 'mp-2', status: 'approved', transaction_amount: 500, currency_id: 'ARS' },
      ],
    });
    const provider = new MercadoPagoPaymentProvider(fakeConfig());
    const result = await provider.searchByExternalReference('sess-1', 500);
    expect(result.outcome).toBe('ambiguous');
  });

  it('searchByExternalReference: Payment.search rechaza (red caída/token inválido) -> not_found, nunca lanza', async () => {
    const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
    mockSearch.mockRejectedValueOnce(new Error('401 unauthorized'));
    const provider = new MercadoPagoPaymentProvider(fakeConfig());
    const result = await provider.searchByExternalReference('sess-1', 500);
    expect(result.outcome).toBe('not_found');
  });

  it('searchByExternalReference: respuesta sin campo results -> not_found (nunca revienta con .map de undefined)', async () => {
    const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
    mockSearch.mockResolvedValueOnce({});
    const provider = new MercadoPagoPaymentProvider(fakeConfig());
    const result = await provider.searchByExternalReference('sess-1', 500);
    expect(result.outcome).toBe('not_found');
  });

  /**
   * validateWebhook en aislamiento. MP manda el mismo evento en DOS formatos en paralelo: el
   * legado `{"resource":"<id>","topic":"payment"}` (query `?id=...&topic=payment`) y el nuevo
   * `{"data":{"id":"<id>"}}` (query `?data.id=...&type=payment`). El fallback a `body.resource`
   * extrae el id en los dos casos — sin este test, "simplificar" ese fallback pasa desapercibido.
   *
   * ⚠️ LEER ANTES DE CONFIAR EN EL CASO "formato legado con firma válida" (corregido en ADR-052):
   * acá la firma la calcula `sign()`, o sea el propio test, con el mismo manifest que espera el
   * código. Por eso pasa. **Mercado Pago NO firma así la vía legada**: su doc dice que la firma
   * de IPN no se puede validar con el secret de la aplicación, y en la prueba real de sandbox esa
   * vía dio "firma HMAC inválida". Este test prueba la extracción del id, NO que MP firme de esta
   * forma. Lo que contesta el sistema a cada vía se prueba en `webhook-routes.test.ts`.
   */
  describe('validateWebhook (firma HMAC, ADR-050/051)', () => {
    const secret = 'test-webhook-secret';

    function sign(paymentId: string, ts: string, requestId: string) {
      const payload = `id:${paymentId};request-id:${requestId};ts:${ts};`;
      return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    }

    function req(body: Record<string, unknown>, opts: { ts?: string; requestId?: string; paymentId?: string; badSignature?: boolean } = {}) {
      // Ahora: `validateWebhook` rechaza timestamps de más de 300 s (anti-replay), así que un
      // ts fijo haría fallar la suite sola con el paso del tiempo.
      const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
      const requestId = opts.requestId ?? 'req-1';
      const paymentId = opts.paymentId ?? '178976950845';
      const v1 = opts.badSignature ? 'f'.repeat(64) : sign(paymentId, ts, requestId);
      return {
        headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
        body,
        query: {},
      };
    }

    it('formato nuevo {data:{id}} con firma válida -> valid', async () => {
      const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
      const provider = new MercadoPagoPaymentProvider(fakeConfig({ mercadopagoWebhookSecret: secret }));
      const result = await provider.validateWebhook(req({ data: { id: '178976950845' } }));
      expect(result).toEqual({ valid: true, providerPaymentId: '178976950845' });
    });

    it('formato legado {resource, topic} (el que realmente manda MP para topic=payment) con firma válida -> valid', async () => {
      const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
      const provider = new MercadoPagoPaymentProvider(fakeConfig({ mercadopagoWebhookSecret: secret }));
      const result = await provider.validateWebhook(req({ resource: '178976950845', topic: 'payment' }));
      expect(result).toEqual({ valid: true, providerPaymentId: '178976950845' });
    });

    it('sin data.id ni resource -> invalid, nunca intenta procesar', async () => {
      const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
      const provider = new MercadoPagoPaymentProvider(fakeConfig({ mercadopagoWebhookSecret: secret }));
      const result = await provider.validateWebhook(req({ topic: 'merchant_order' }));
      expect(result.valid).toBe(false);
    });

    it('firma HMAC que no matchea (payload alterado o secret distinto) -> invalid', async () => {
      const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
      const provider = new MercadoPagoPaymentProvider(fakeConfig({ mercadopagoWebhookSecret: secret }));
      const result = await provider.validateWebhook(req({ resource: '178976950845', topic: 'payment' }, { badSignature: true }));
      expect(result.valid).toBe(false);
    });

    /**
     * Segunda línea de defensa (ADR-052). Desde que `assertProductionConfig` exige
     * `MERCADOPAGO_WEBHOOK_SECRET`, este estado — producción + Mercado Pago + sin secret — ya no
     * se puede alcanzar por la puerta de entrada: la API no arranca. Por eso la config se arma
     * en dos pasos y se fuerza el estado imposible **sin pasar por `loadConfig`**; construirla
     * con `fakeConfig({nodeEnv:'production', ...})` ahora tira la guarda, que es lo correcto y
     * tiene su propio test en `config-guards.test.ts`.
     * El chequeo sigue valiendo: si alguien afloja esa guarda, `validateWebhook` tiene que
     * seguir negándose a aceptar un webhook sin firma en producción.
     */
    it('secret no configurado en producción -> invalid (nunca se acepta un webhook sin firma en producción)', async () => {
      const { MercadoPagoPaymentProvider } = await import('../src/payments/mercadoPagoProvider.js');
      const config = {
        ...fakeConfig({ mercadopagoWebhookSecret: 'se-borra-abajo', deviceSimulator: false }),
        nodeEnv: 'production' as const,
        mercadopagoWebhookSecret: null,
      };
      const provider = new MercadoPagoPaymentProvider(config);
      const result = await provider.validateWebhook(req({ resource: '178976950845', topic: 'payment' }));
      expect(result.valid).toBe(false);
    });
  });
});
