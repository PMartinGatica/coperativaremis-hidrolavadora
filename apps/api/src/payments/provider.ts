import type { PaymentStatus } from '@hidro/shared';

/**
 * Interfaz abstracta de pago. El dominio (SessionService / AuthorizationService /
 * DeviceService) depende SOLO de esta interfaz, nunca del SDK de Mercado Pago.
 * Implementaciones: DemoPaymentProvider (sin credenciales) y MercadoPagoPaymentProvider.
 */
export interface ProviderPaymentCreateInput {
  machineId: string;
  machineName: string;
  sessionId: string;
  externalReference: string;
  amount: number;
  /** Duración del lavado en segundos (para el título del checkout). */
  durationSeconds: number;
  description: string;
}

export interface ProviderPaymentCreateResult {
  externalPaymentId: string;
  status: PaymentStatus;
  rawStatus: string | null;
  /** URL de checkout a la que redirigir al cliente (null en demo: pago interno) */
  initPoint: string | null;
}

export interface ProviderPaymentQueryResult {
  status: PaymentStatus;
  rawStatus: string | null;
  amount: number | null;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  query: Record<string, string | string[] | undefined>;
}

export interface WebhookValidation {
  valid: boolean;
  reason?: string;
  /** Id de pago reportado por el proveedor (para re-consulta) */
  providerPaymentId?: string;
}

export interface PaymentProvider {
  readonly name: 'demo' | 'mercadopago';
  /** Crea la orden de cobro en el proveedor. */
  createPayment(input: ProviderPaymentCreateInput): Promise<ProviderPaymentCreateResult>;
  /** Re-consulta el estado REAL en el proveedor. Nunca confiar en el webhook. */
  getPayment(externalPaymentId: string): Promise<ProviderPaymentQueryResult>;
  /** Valida firma/estructura del webhook entrante. */
  validateWebhook(req: WebhookRequest): Promise<WebhookValidation>;
  /** Reembolso (PENDING CLIENT DECISION: política de reembolso automático). */
  refundPayment?(externalPaymentId: string, reason: string): Promise<{ ok: boolean; rawStatus: string }>;
}
