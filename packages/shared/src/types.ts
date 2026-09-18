/**
 * Contratos compartidos de dominio HIDRO SELF-SERVICE.
 * Fuente única de verdad para API, web y simulador (el firmware C++ replica
 * estos contratos en docs/device-protocol.md).
 */

// ---------- Sesión ----------
export const SESSION_STATUSES = [
  'IDLE',
  'PAYMENT_PENDING',
  'PAYMENT_APPROVED',
  'AUTHORIZED',
  'WAITING_FOR_BUTTON',
  'RUNNING',
  'FINISHED',
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
  'AUTHORIZATION_EXPIRED',
  'MACHINE_OFFLINE',
  'SESSION_INTERRUPTED',
  'EMERGENCY_STOP',
  'DEVICE_ERROR',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const PAYMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const AUTH_STATUSES = ['AUTHORIZED', 'CONSUMED', 'EXPIRED', 'REVOKED'] as const;
export type AuthorizationStatus = (typeof AUTH_STATUSES)[number];

export const MACHINE_STATUSES = ['ONLINE', 'DEGRADED', 'OFFLINE', 'DISABLED'] as const;
export type MachineStatus = (typeof MACHINE_STATUSES)[number];

export const AVAILABILITY = ['AVAILABLE', 'BUSY', 'OUT_OF_SERVICE'] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const COMMAND_TYPES = ['EMERGENCY_STOP'] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export const COMMAND_STATUSES = ['PENDING', 'DELIVERED', 'FAILED'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

// ---------- Patentes y tarifas ----------
export const PLATE_CATEGORIES = ['remis', 'socio', 'externo'] as const;
export type PlateCategory = (typeof PLATE_CATEGORIES)[number];

export const PLATE_CATEGORY_LABELS: Record<PlateCategory, string> = {
  remis: 'Remis de la cooperativa',
  socio: 'Auto de socio',
  externo: 'Particular no asociado',
};

export interface VehicleRow {
  id: string;
  plate: string;
  category: 'remis' | 'socio';
  ownerName: string | null;
  /** Hash del PIN (nunca en claro). NULL = sin PIN, grandfather clause. */
  pin: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estados de sesión que cuentan como "lavado usado" para el límite diario por patente.
 * IMPORTANTE: PAYMENT_PENDING está incluido a propósito: el cupo se RESERVA al crear
 * la sesión (antes de cobrar), para que dos checkouts simultáneos de la misma patente
 * no se pasen del límite. PAYMENT_FAILED / PAYMENT_EXPIRED NO cuentan: un pago
 * rechazado o vencido devuelve el cupo automáticamente.
 */
export const WASH_COUNTING_STATUSES: SessionStatus[] = [
  'PAYMENT_PENDING',
  'PAYMENT_APPROVED',
  'AUTHORIZED',
  'WAITING_FOR_BUTTON',
  'RUNNING',
  'FINISHED',
  'AUTHORIZATION_EXPIRED',
  'MACHINE_OFFLINE',
  'SESSION_INTERRUPTED',
  'EMERGENCY_STOP',
  'DEVICE_ERROR',
];

/** Eventos reportados por el dispositivo (DeviceEvent.type). */
export const DEVICE_EVENT_TYPES = [
  'HEARTBEAT',
  'DEVICE_ONLINE',
  'DEVICE_OFFLINE',
  'DEVICE_DEGRADED',
  'DEVICE_REBOOT',
  'DEVICE_ERROR',
  'AUTHORIZATION_FETCHED',
  'BUTTON_PRESSED',
  'BUTTON_PRESSED_WITHOUT_AUTH',
  'RELAY_ON',
  'RELAY_OFF',
  'SESSION_STARTED',
  'SESSION_FINISHED',
  'SESSION_INTERRUPTED',
  'EMERGENCY_STOP',
  'INTERNET_LOST',
  'INTERNET_RESTORED',
  'POWER_CUT',
] as const;
export type DeviceEventType = (typeof DEVICE_EVENT_TYPES)[number];

/** Acciones de auditoría / log del sistema (AuditLog.action). */
export const AUDIT_ACTIONS = [
  'SESSION_STATUS_CHANGED',
  'SESSION_CREATED',
  'PAYMENT_CREATED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'PAYMENT_EXPIRED',
  'PAYMENT_AUTO_RECONCILED',
  'PAYMENT_MANUALLY_RECONCILED',
  'PAYMENT_RECONCILE_REJECTED',
  'PAYMENT_RECONCILE_AMBIGUOUS',
  'PAYMENT_RECONCILE_DENIED',
  'WEBHOOK_RECEIVED',
  'WEBHOOK_DUPLICATED',
  'WEBHOOK_INVALID',
  'WEBHOOK_UNKNOWN_PAYMENT',
  'AUTH_CREATED',
  'AUTH_CONSUMED',
  'AUTH_EXPIRED',
  'AUTH_REVOKED',
  'DEVICE_ONLINE',
  'DEVICE_OFFLINE',
  'DEVICE_DEGRADED',
  'RELAY_ON',
  'RELAY_OFF',
  'SESSION_FINISHED',
  'SESSION_INTERRUPTED',
  'EMERGENCY_STOP',
  'EMERGENCY_STOP_EXECUTED',
  'MACHINE_BUSY_REJECTED',
  'PLATE_LIMIT_REJECTED',
  'VEHICLE_CREATED',
  'VEHICLE_UPDATED',
  'VEHICLE_DELETED',
  'MACHINE_ENABLED',
  'MACHINE_DISABLED',
  'SETTINGS_UPDATED',
  'ADMIN_LOGIN',
  'ADMIN_LOGIN_FAILED',
  'DEVICE_SECRET_ROTATED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// ---------- Filas de base de datos ----------
export interface MachineRow {
  id: string;
  name: string;
  description: string | null;
  status: MachineStatus;
  priceRemisArs: number;
  priceSocioArs: number;
  priceExternoArs: number;
  durationSeconds: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceRow {
  id: string;
  machineId: string;
  deviceIdentifier: string;
  firmwareVersion: string | null;
  lastHeartbeatAt: Date | null;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  secretEnc: string;
  lastRelayState: boolean;
  lastWifiRssi: number | null;
  lastUptime: number | null;
  currentSessionId: string | null;
  createdAt: Date;
}

export interface PaymentRow {
  id: string;
  externalPaymentId: string;
  provider: 'demo' | 'mercadopago';
  machineId: string;
  sessionId: string;
  amount: number;
  status: PaymentStatus;
  rawStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthorizationRow {
  id: string;
  sessionId: string;
  machineId: string;
  paymentId: string;
  status: AuthorizationStatus;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface SessionRow {
  id: string;
  machineId: string;
  plate: string | null;
  plateCategory: PlateCategory | null;
  paymentId: string | null;
  authorizationId: string | null;
  status: SessionStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationSeconds: number;
  interruptionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceEventRow {
  id: string;
  machineId: string;
  deviceId: string;
  sessionId: string | null;
  type: DeviceEventType;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogRow {
  id: string;
  actor: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface DeviceCommandRow {
  id: string;
  deviceId: string;
  machineId: string;
  type: CommandType;
  payload: Record<string, unknown> | null;
  status: CommandStatus;
  createdAt: Date;
  deliveredAt: Date | null;
}

// ---------- DTOs públicos ----------
export interface PublicMachineInfo {
  id: string;
  name: string;
  description: string | null;
  priceRemisArs: number;
  priceSocioArs: number;
  priceExternoArs: number;
  durationSeconds: number;
  status: MachineStatus;
  enabled: boolean;
  availability: Availability;
  lastHeartbeatAt: string | null;
  firmwareVersion: string | null;
  relayState: boolean;
  wifiRssi: number | null;
  currentSessionId: string | null;
  currentSessionStatus: SessionStatus | null;
  demoMode: boolean;
  /** true = no hay ESP32 físico: los heartbeats los manda el simulador in-process (ADR-047).
   *  La UI lo usa para avisar que nada de lo que se ve enciende una hidrolavadora real. */
  simulatedDevice: boolean;
}

export interface SessionTimelineEvent {
  at: string;
  source: 'system' | 'device' | 'payment';
  type: string;
  label: string;
  status?: SessionStatus | null;
  payload?: Record<string, unknown> | null;
}

export interface PublicSessionState {
  session: {
    id: string;
    machineId: string;
    plate: string | null;
    plateCategory: PlateCategory | null;
    status: SessionStatus;
    durationSeconds: number;
    startedAt: string | null;
    finishedAt: string | null;
    authorizationExpiresAt: string | null;
    interruptionReason: string | null;
    demoTimeScale: number;
  };
  machine: {
    id: string;
    name: string;
  };
  payment: {
    id: string;
    externalPaymentId: string;
    provider: string;
    amount: number;
    status: PaymentStatus;
  } | null;
  events: SessionTimelineEvent[];
  serverTime: string;
}

/** Cotización de tarifa por patente (no crea nada ni cobra). */
export interface PlateQuote {
  plate: string;
  category: PlateCategory;
  categoryLabel: string;
  priceArs: number;
  limit: number;
  remainingToday: number;
}

export interface CheckoutResponse {
  sessionId: string;
  plate: string;
  plateCategory: PlateCategory;
  payment: {
    externalPaymentId: string;
    provider: 'demo' | 'mercadopago';
    status: PaymentStatus;
    initPoint: string | null;
    amount: number;
  };
  demoMode: boolean;
}

export interface PaymentPublicInfo {
  payment: {
    id: string;
    externalPaymentId: string;
    provider: string;
    status: PaymentStatus;
    amount: number;
    machineId: string;
    sessionId: string;
    plate: string | null;
    plateCategory: PlateCategory | null;
  };
  machine: { id: string; name: string } | null;
  demoMode: boolean;
}

// ---------- Protocolo de dispositivo ----------
export interface HeartbeatPayload {
  machine_id: string;
  device_id: string;
  firmware_version: string;
  status: 'ONLINE' | 'DEGRADED' | 'ERROR';
  uptime: number;
  current_session_id: string | null;
  relay_state: boolean;
  wifi_rssi: number;
  timestamp: number;
}

export interface DeviceAuthResponse {
  device_id: string;
  machine_id: string;
  server_time: number;
  commands: PendingCommandDto[];
  /** NUEVO: el dispositivo guarda este valor como su umbral online/offline. */
  heartbeat_interval_ms: number;
}

export interface PendingCommandDto {
  id: string;
  type: CommandType;
  payload: Record<string, unknown> | null;
}

export interface AuthorizationDto {
  authorization_id: string;
  session_id: string;
  machine_id: string;
  duration_seconds: number;
  expires_at: string;
  status: 'AUTHORIZED' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
}

export interface SessionStartPayload {
  machine_id: string;
  session_id: string;
  authorization_id: string;
  relay_expected_state: boolean;
}

export interface SessionFinishPayload {
  machine_id: string;
  session_id: string;
  reason: 'timer_completed';
  duration_seconds: number;
}

export interface SessionInterruptedPayload {
  machine_id: string;
  session_id: string;
  reason: string;
}

export interface DeviceEventPayload {
  machine_id: string;
  session_id: string | null;
  type: DeviceEventType;
  data?: Record<string, unknown>;
}

// ---------- Simulador (DEMO MODE) ----------
export interface SimulatorSnapshot {
  machineId: string;
  running: boolean;
  deviceId: string;
  wifiConnected: boolean;
  backendReachable: boolean;
  state: string;
  relayState: boolean;
  ledState: 'OFF' | 'GREEN' | 'GREEN_BLINK' | 'RED';
  authorizedSessionId: string | null;
  authorizationExpiresAt: string | null;
  timer: { running: boolean; durationSeconds: number; remainingSeconds: number } | null;
  lastHeartbeatAt: string | null;
  uptimeSeconds: number;
  lastError: string | null;
  persistedNvs: unknown;
  speedFactor: number;
}

export type SimulatorAction =
  | 'press_button'
  | 'disconnect'
  | 'reconnect'
  | 'reboot'
  | 'internet_cut'
  | 'internet_restore'
  | 'power_cut'
  | 'device_error'
  | 'clear_error';

// ---------- Aprobación / reconciliación de pagos (Fase 1, ADR-023/029/030) ----------
// Compartido entre apps/api (fuente de verdad) y apps/web (UI de reconciliación) para
// que un typo o una variante renombrada rompa en tsc en los dos workspaces, no en
// silencio en runtime (autoplan Eng review, 2026-09-07).
export type ApprovalResultType =
  | 'approved'
  | 'duplicated'
  | 'ignored'
  | 'rejected'
  | 'amount_mismatch'
  | 'session_terminal'
  | 'offline'
  | 'pending'
  /** Sub-caso A de la recuperación (ADR-030): otra sesión sigue ACTIVA en la máquina. */
  | 'machine_occupied'
  /** Sub-caso B de la recuperación (ADR-030): la máquina ya se usó para otro cliente desde entonces. */
  | 'machine_used_since';

export interface ApprovalResult {
  result: ApprovalResultType;
  sessionId?: string;
  authorizationId?: string;
}

export type ReconcileResultType =
  | ApprovalResultType
  | 'not_found'
  | 'ambiguous'
  | 'not_recoverable'
  | 'session_id_mismatch'
  | 'default_admin_forbidden';

export interface ReconcileResult {
  result: ReconcileResultType;
  sessionId: string;
  authorizationId?: string;
}
