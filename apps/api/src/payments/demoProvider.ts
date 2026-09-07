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
import { newDemoPaymentId } from '../ids.js';

interface DemoPaymentRecord {
  externalPaymentId: string;
  sessionId: string;
  machineId: string;
  amount: number;
  status: PaymentStatus;
  rawStatus: string;
  createdAt: string;
}

/**
 * DEMO PAYMENT PROVIDER — mismo contrato que Mercado Pago, sin credenciales.
 * El estado vive en memoria del proceso (al reiniciar, los pagos demo pendientes
 * se pierden — aceptable para DEMO MODE, documentado).
 */
export class DemoPaymentProvider implements PaymentProvider {
  readonly name = 'demo' as const;
  private readonly records = new Map<string, DemoPaymentRecord>();

  constructor(private readonly defaultStatus: PaymentStatus = 'PENDING') {}

  async createPayment(input: ProviderPaymentCreateInput): Promise<ProviderPaymentCreateResult> {
    const externalPaymentId = newDemoPaymentId();
    this.records.set(externalPaymentId, {
      externalPaymentId,
      sessionId: input.sessionId,
      machineId: input.machineId,
      amount: input.amount,
      status: this.defaultStatus,
      rawStatus: this.defaultStatus,
      createdAt: new Date().toISOString(),
    });
    return { externalPaymentId, status: this.defaultStatus, rawStatus: this.defaultStatus, initPoint: null };
  }

  async getPaymentById(externalPaymentId: string): Promise<ProviderPaymentLookupResult> {
    const rec = this.records.get(externalPaymentId);
    if (!rec) return { status: 'PENDING', rawStatus: 'not_found', amount: null, externalReference: null };
    return { status: rec.status, rawStatus: rec.rawStatus, amount: rec.amount, externalReference: rec.sessionId };
  }

  /** Mismo contrato que MercadoPagoPaymentProvider: busca por sessionId (external_reference). */
  async searchByExternalReference(externalReference: string, expectedAmount: number): Promise<ProviderSearchResult> {
    const matches: ProviderPaymentSearchMatch[] = [];
    for (const rec of this.records.values()) {
      if (rec.sessionId === externalReference) {
        matches.push({ externalPaymentId: rec.externalPaymentId, status: rec.status, rawStatus: rec.rawStatus, amount: rec.amount, currency: null });
      }
    }
    return selectSearchMatch(matches, expectedAmount);
  }

  /** El webhook de demo nunca es válido por diseño (se prueba con "webhook inválido"). */
  async validateWebhook(_req: WebhookRequest): Promise<WebhookValidation> {
    return { valid: false, reason: 'demo provider: los webhooks externos no aplican' };
  }

  async refundPayment(externalPaymentId: string, _reason: string) {
    const rec = this.records.get(externalPaymentId);
    if (!rec) return { ok: false, rawStatus: 'not_found' };
    rec.status = 'REFUNDED';
    rec.rawStatus = 'refunded';
    return { ok: true, rawStatus: 'refunded' };
  }

  // -------- controles de la pantalla SIMULAR PAGO (solo demo) --------

  /** Aprobación simulada: mismo efecto que un webhook válido re-consultado. */
  approve(externalPaymentId: string): { status: PaymentStatus; rawStatus: string; amount: number | null } {
    const rec = this.require(externalPaymentId);
    if (rec.status === 'PENDING') {
      rec.status = 'APPROVED';
      rec.rawStatus = 'approved';
    }
    return { status: rec.status, rawStatus: rec.rawStatus, amount: rec.amount };
  }

  reject(externalPaymentId: string): { status: PaymentStatus; rawStatus: string; amount: number | null } {
    const rec = this.require(externalPaymentId);
    if (rec.status === 'PENDING') {
      rec.status = 'REJECTED';
      rec.rawStatus = 'rejected';
    }
    return { status: rec.status, rawStatus: rec.rawStatus, amount: rec.amount };
  }

  keepPending(externalPaymentId: string): { status: PaymentStatus; rawStatus: string; amount: number | null } {
    const rec = this.require(externalPaymentId);
    return { status: rec.status, rawStatus: rec.rawStatus, amount: rec.amount };
  }

  private require(externalPaymentId: string): DemoPaymentRecord {
    const rec = this.records.get(externalPaymentId);
    if (!rec) throw new Error(`demo payment not found: ${externalPaymentId}`);
    return rec;
  }
}
