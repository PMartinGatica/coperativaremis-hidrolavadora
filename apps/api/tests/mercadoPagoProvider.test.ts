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

function fakeConfig() {
  return loadConfig({
    paymentProvider: 'mercadopago',
    mercadopagoAccessToken: 'TEST-token',
    mercadopagoPublicKey: 'TEST-public',
    publicAppUrl: 'http://localhost:5173',
    publicApiUrl: 'http://localhost:3020',
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
});
