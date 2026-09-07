import { z } from 'zod';
import { DEVICE_EVENT_TYPES } from './types.js';

/** Validación de entradas del protocolo de dispositivo (POST /api/device/*). */
export const HeartbeatPayloadSchema = z.object({
  machine_id: z.string().min(1).max(64),
  device_id: z.string().min(1).max(64),
  firmware_version: z.string().min(1).max(32),
  status: z.enum(['ONLINE', 'DEGRADED', 'ERROR']),
  uptime: z.number().int().nonnegative(),
  current_session_id: z.string().max(64).nullable(),
  relay_state: z.boolean(),
  wifi_rssi: z.number().int().min(-127).max(0),
  timestamp: z.number().int().positive(),
});

export const SessionStartPayloadSchema = z.object({
  machine_id: z.string().min(1).max(64),
  session_id: z.string().min(1).max(64),
  authorization_id: z.string().min(1).max(64),
  relay_expected_state: z.boolean(),
});

export const SessionFinishPayloadSchema = z.object({
  machine_id: z.string().min(1).max(64),
  session_id: z.string().min(1).max(64),
  reason: z.literal('timer_completed'),
  duration_seconds: z.number().int().positive().max(3600),
});

export const SessionInterruptedPayloadSchema = z.object({
  machine_id: z.string().min(1).max(64),
  session_id: z.string().min(1).max(64),
  reason: z.string().min(1).max(256),
});

export const DeviceEventPayloadSchema = z.object({
  machine_id: z.string().min(1).max(64),
  session_id: z.string().max(64).nullable(),
  type: z.enum(DEVICE_EVENT_TYPES),
  data: z.record(z.unknown()).optional(),
});

// ---------- Público ----------
/** Normaliza una patente argentina: mayúsculas, sin espacios ni guiones. */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s.-]/g, '');
}

export const PLATE_REGEX = /^[A-Z0-9]{6,8}$/;

export const PlateBodySchema = z.object({
  plate: z
    .string()
    .min(1, 'Ingresá la patente.')
    .max(16)
    .transform((v) => normalizePlate(v))
    .refine((v) => PLATE_REGEX.test(v), { message: 'Patente inválida (ej: AE123CD).' }),
});

export const QuoteParamsSchema = z.object({
  machineId: z.string().min(1).max(64),
});

export const CreateSessionParamsSchema = z.object({
  machineId: z.string().min(1).max(64),
});

export const SimulatePaymentSchema = z.object({
  action: z.enum(['approve', 'reject', 'pending', 'duplicate_webhook', 'invalid_webhook']),
});

// ---------- Admin ----------
export const AdminLoginSchema = z.object({
  email: z.string().email().max(128),
  password: z.string().min(4).max(256),
});

export const MachinePatchSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(512).nullable().optional(),
  priceRemisArs: z.number().int().min(1).max(1_000_000).optional(),
  priceSocioArs: z.number().int().min(1).max(1_000_000).optional(),
  priceExternoArs: z.number().int().min(1).max(1_000_000).optional(),
  durationSeconds: z.number().int().min(10).max(3600).optional(),
  enabled: z.boolean().optional(),
});

export const VehicleUpsertSchema = z.object({
  plate: z
    .string()
    .min(1, 'Ingresá la patente.')
    .max(16)
    .transform((v) => normalizePlate(v))
    .refine((v) => PLATE_REGEX.test(v), { message: 'Patente inválida (ej: AE123CD).' }),
  category: z.enum(['remis', 'socio']),
  ownerName: z.string().max(128).optional(),
});

export const EmergencyStopSchema = z.object({
  reason: z.string().min(1).max(256).optional(),
  confirmation: z.literal('DETENER'),
});

export const PaymentReconcileManualSchema = z.object({
  /** ID real de pago de Mercado Pago (el que ve mesa de entrada en su propio dashboard). */
  paymentId: z.string().min(1, 'Ingresá el ID de pago de Mercado Pago.').max(64),
});

export const SettingsPatchSchema = z.object({
  demoSpeedFactor: z.number().min(1).max(600).optional(),
  authTtlSeconds: z.number().int().min(30).max(3600).optional(),
  heartbeatIntervalMs: z.number().int().min(1000).max(60000).optional(),
  paymentPendingTimeoutSeconds: z.number().int().min(60).max(86400).optional(),
  dailyWashLimit: z.number().int().min(1).max(50).optional(),
});

export const SimulatorActionSchema = z.object({
  action: z.enum([
    'press_button',
    'disconnect',
    'reconnect',
    'reboot',
    'internet_cut',
    'internet_restore',
    'power_cut',
    'device_error',
    'clear_error',
  ]),
});
