import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentStatus } from '@hidro/shared';
import {
  selectSearchMatch,
  type PaymentProvider,
  type ProviderPaymentCreateInput,
  type ProviderPaymentCreateResult,
  type ProviderPaymentLookupResult,
  type ProviderPaymentSearchMatch,
  type ProviderSearchResult,
  type WebhookRequest,
  type WebhookValidation,
} from './provider.js';
import type { AppConfig } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('mp');

/**
 * MERCADO PAGO PROVIDER — SDK oficial (mercadopago/sdk-nodejs v2).
 * SPIKE: validar flujo completo con credenciales de prueba ANTES de producción.
 * La seguridad no depende del webhook: SIEMPRE se re-consulta el pago al API.
 */
export class MercadoPagoPaymentProvider implements PaymentProvider {
  readonly name = 'mercadopago' as const;

  constructor(private readonly config: AppConfig) {}

  // Carga perezosa del SDK (evita cualquier efecto en modo demo)
  private async sdk() {
    const mp = await import('mercadopago');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new (mp as any).MercadoPagoConfig({ accessToken: this.config.mercadopagoAccessToken });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { Preference: new (mp as any).Preference(client), Payment: new (mp as any).Payment(client) };
  }

  async createPayment(input: ProviderPaymentCreateInput): Promise<ProviderPaymentCreateResult> {
    const { Preference } = await this.sdk();
    const base = `${this.config.publicAppUrl}/machine/${input.machineId}?session=${input.sessionId}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pref: any = await Preference.create({
      body: {
        items: [
          {
            id: `lavado-${input.machineId}`,
            title: `${input.machineName} — ${input.durationSeconds}s de lavado`,
            quantity: 1,
            unit_price: input.amount,
            currency_id: 'ARS',
          },
        ],
        external_reference: input.sessionId,
        // El webhook va a la API (PUBLIC_API_URL), no al frontend: si front y API
        // se despliegan separados, la URL del front NO recibe webhooks.
        notification_url: `${this.config.publicApiUrl}/api/webhooks/mercadopago`,
        back_urls: { success: base, pending: base, failure: base },
        auto_return: 'approved',
        statement_descriptor: 'HIDRO SELF-SERVICE',
        expires: false,
      },
    });
    return {
      externalPaymentId: String(pref.id ?? ''),
      status: 'PENDING',
      rawStatus: 'preference_created',
      initPoint: (pref.init_point as string) ?? (pref.sandbox_init_point as string) ?? null,
    };
  }

  /**
   * Re-consulta el PAGO real por id (el que ve mesa de entrada en su propio dashboard/
   * notificación de Mercado Pago, o el que reporta el webhook). Devuelve también
   * external_reference (sessionId) para casar con nuestra sesión.
   */
  async getPaymentById(paymentId: string): Promise<ProviderPaymentLookupResult> {
    const { Payment } = await this.sdk();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = await Payment.get({ id: paymentId });
    return {
      status: this.mapStatus(String(p.status ?? '')),
      rawStatus: String(p.status ?? ''),
      amount: typeof p.transaction_amount === 'number' ? Math.round(p.transaction_amount) : null,
      externalReference: p.external_reference ? String(p.external_reference) : null,
    };
  }

  /**
   * Busca pagos por external_reference (nuestro sessionId). SPIKE: confirmar contra la
   * documentación vigente de Mercado Pago el límite de resultados por página — con el
   * volumen de esta cooperativa (pocos lavados/día) una sola página alcanza hoy; si el
   * volumen crece, agregar paginación real antes de confiar en este método a ciegas.
   */
  async searchByExternalReference(externalReference: string, expectedAmount: number): Promise<ProviderSearchResult> {
    const { Payment } = await this.sdk();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any;
    try {
      response = await Payment.search({
        options: { external_reference: externalReference, sort: 'date_created', criteria: 'desc', limit: 30 },
      });
    } catch (err) {
      log.warn('mp searchByExternalReference failed', { externalReference, err: String(err) });
      return { outcome: 'not_found' };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = Array.isArray(response?.results) ? response.results : [];
    const matches: ProviderPaymentSearchMatch[] = results.map((p) => ({
      externalPaymentId: String(p.id ?? ''),
      status: this.mapStatus(String(p.status ?? '')),
      rawStatus: String(p.status ?? ''),
      amount: typeof p.transaction_amount === 'number' ? Math.round(p.transaction_amount) : null,
      currency: p.currency_id ? String(p.currency_id) : null,
    }));
    return selectSearchMatch(matches, expectedAmount);
  }

  private mapStatus(raw: string): PaymentStatus {
    switch (raw) {
      case 'approved':
        return 'APPROVED';
      case 'rejected':
      case 'cancelled':
        return 'REJECTED';
      case 'refunded':
        return 'REFUNDED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Valida firma del webhook (esquema oficial Mercado Pago):
   *   header x-signature: "ts=<unix>,v1=<hex>"
   *   hex = HMAC_SHA256(secret, "id:<payment id>;request-id:<x-request-id>;ts:<ts>;")
   * CONFIRMADO CONTRA MP REAL (2026-09-19, ver ADR-050/051): el body llega en formato IPN
   * legado `{"resource":"<id>","topic":"payment"}`, NO `{"data":{"id":...}}` como decía la
   * doc genérica — por eso el fallback a `body.resource`. `topic=merchant_order` (que MP manda
   * en paralelo a cada pago) se filtra antes, en `webhookRoutes.ts`: no tiene payment id y no
   * hay nada que reconciliar ahí.
   * Sin secret configurado: en desarrollo se acepta con WARNING (la re-consulta es la
   * verdadera barrera de seguridad); en producción se RECHAZA.
   */
  async validateWebhook(req: WebhookRequest): Promise<WebhookValidation> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = body.data ?? body;
    const paymentId =
      typeof data?.id === 'number'
        ? String(data.id)
        : typeof data?.id === 'string'
          ? data.id
          : typeof body.resource === 'string'
            ? body.resource
            : undefined;
    if (!paymentId) return { valid: false, reason: 'sin payment id en el body' };

    const secret = this.config.mercadopagoWebhookSecret;
    if (!secret) {
      if (this.config.nodeEnv === 'production') {
        return { valid: false, reason: 'webhook secret no configurado' };
      }
      log.warn('MERCADOPAGO_WEBHOOK_SECRET no configurado: se acepta webhook sin firma (solo desarrollo)');
      return { valid: true, providerPaymentId: paymentId };
    }

    const signature = this.header(req, 'x-signature');
    if (!signature) return { valid: false, reason: 'falta x-signature' };
    const match = /ts=(\d+),v1=([a-f0-9]+)/.exec(signature);
    if (!match) return { valid: false, reason: 'formato de firma inválido' };
    const ts = match[1] as string;
    const v1 = match[2] as string;
    const requestId = this.header(req, 'x-request-id') ?? '';

    const payload = `id:${paymentId};request-id:${requestId};ts:${ts};`;
    const computed = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: 'firma HMAC inválida' };
    }
    // tolerancia de timestamp (anti-replay)
    const ageSec = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(ageSec) || ageSec > 300) return { valid: false, reason: 'timestamp fuera de ventana' };
    return { valid: true, providerPaymentId: paymentId };
  }

  async refundPayment(externalPaymentId: string, reason: string) {
    // SPIKE: reembolso vía Payment.refund. PENDING CLIENT DECISION: política de reembolsos.
    log.warn('mp refund requested (spike pendiente)', { externalPaymentId, reason });
    return { ok: false, rawStatus: 'refund_pending_spike' };
  }

  private header(req: WebhookRequest, name: string): string | undefined {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  }
}
