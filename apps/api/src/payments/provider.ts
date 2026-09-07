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

export interface ProviderPaymentLookupResult {
  status: PaymentStatus;
  rawStatus: string;
  amount: number | null;
  /** external_reference reportado por el proveedor (debe casar con nuestro sessionId). */
  externalReference: string | null;
}

export interface ProviderPaymentSearchMatch {
  externalPaymentId: string;
  status: PaymentStatus;
  rawStatus: string;
  amount: number | null;
  currency: string | null;
}

export type ProviderSearchResult =
  | { outcome: 'not_found' }
  | { outcome: 'found'; match: ProviderPaymentSearchMatch }
  /** Más de un pago aprobado matchea: anomalía de cobro duplicado, requiere revisión humana. */
  | { outcome: 'ambiguous'; matches: ProviderPaymentSearchMatch[] };

/**
 * Regla de selección de reconciliación (ADR-023/030): de todos los resultados de una
 * búsqueda por external_reference, solo cuenta un pago APROBADO cuyo importe (y moneda,
 * cuando el proveedor la informa) coincidan EXACTO con lo esperado. Nunca se asume que
 * "hay un solo resultado" — un checkout reintentado puede generar más de un intento.
 */
export function selectSearchMatch(
  matches: ProviderPaymentSearchMatch[],
  expectedAmount: number,
  expectedCurrency = 'ARS',
): ProviderSearchResult {
  const approved = matches.filter(
    (m) => m.status === 'APPROVED' && m.amount === expectedAmount && (m.currency === null || m.currency === expectedCurrency),
  );
  if (approved.length === 0) return { outcome: 'not_found' };
  if (approved.length > 1) return { outcome: 'ambiguous', matches: approved };
  return { outcome: 'found', match: approved[0]! };
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
  /** Re-consulta un pago real por su ID (el que ve mesa de entrada en el dashboard del proveedor). */
  getPaymentById(providerPaymentId: string): Promise<ProviderPaymentLookupResult>;
  /**
   * Busca pagos por external_reference (nuestro sessionId) — reconciliación sin conocer
   * el ID del pago de antemano (barrido al vencer, y "reintentar automáticamente" de mesa
   * de entrada). Nunca confiar en un solo resultado sin filtrar: ver selectSearchMatch().
   */
  searchByExternalReference(externalReference: string, expectedAmount: number): Promise<ProviderSearchResult>;
  /** Valida firma/estructura del webhook entrante. */
  validateWebhook(req: WebhookRequest): Promise<WebhookValidation>;
  /** Reembolso (PENDING CLIENT DECISION: política de reembolso automático). */
  refundPayment?(externalPaymentId: string, reason: string): Promise<{ ok: boolean; rawStatus: string }>;
}
