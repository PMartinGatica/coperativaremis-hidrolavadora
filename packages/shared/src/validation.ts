import { z } from 'zod';
import { DEVICE_EVENT_TYPES } from './types.js';
import { ASSIGNABLE_ROLES, MIN_PASSWORD_LENGTH } from './permissions.js';

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
/** Normaliza una patente: mayúsculas, sin espacios, puntos ni guiones. */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s.-]/g, '');
}

/** 4 a 10 alfanuméricos ya normalizados. Acepta patentes de otros países (turistas):
 *  una patente no registrada cotiza como particular, así que ampliar el rango no abarata
 *  nada (ADR-057). */
export const PLATE_REGEX = /^[A-Z0-9]{4,10}$/;

export const PLATE_INVALID_MESSAGE = 'Patente inválida (ej: AG945RS).';

const AR_PLATE_PATTERNS = [
  /^[A-Z]{2}\d{3}[A-Z]{2}$/, // auto Mercosur (AG945RS)
  /^[A-Z]{3}\d{3}$/, // auto formato viejo (ABC123)
  /^[A-Z]\d{3}[A-Z]{3}$/, // moto Mercosur (A123BCD)
  /^\d{3}[A-Z]{3}$/, // moto formato viejo (123ABC)
];

/** Solo informativo para la pantalla: el precio lo decide el servidor por registro, no
 *  por formato. Un formato no reconocido puede ser igual una patente argentina registrada. */
export function plateOrigin(plate: string): 'ar' | 'foreign' {
  const p = normalizePlate(plate);
  return AR_PLATE_PATTERNS.some((re) => re.test(p)) ? 'ar' : 'foreign';
}

/** PIN de 4 dígitos (remis/socio). Opcional: una patente particular no manda nada acá. */
export const PIN_REGEX = /^\d{4}$/;

export const PlateBodySchema = z.object({
  plate: z
    .string()
    .min(1, 'Ingresá la patente.')
    .max(16)
    .transform((v) => normalizePlate(v))
    .refine((v) => PLATE_REGEX.test(v), { message: PLATE_INVALID_MESSAGE }),
  // El input del cliente puede mandar '' (campo vacío, no tocado) — se trata igual que
  // "no mandó pin", no como un PIN inválido.
  pin: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || PIN_REGEX.test(v), { message: 'El PIN son 4 dígitos.' }),
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
    .refine((v) => PLATE_REGEX.test(v), { message: PLATE_INVALID_MESSAGE }),
  category: z.enum(['remis', 'socio']),
  ownerName: z.string().max(128).optional(),
  // Tri-estado: AUSENTE (undefined) = no tocar el PIN existente; null = borrarlo
  // explícitamente; string de 4 dígitos = setearlo. Nunca "" como valor válido.
  pin: z
    .string()
    .regex(PIN_REGEX, 'El PIN son 4 dígitos.')
    .nullable()
    .optional(),
});

export const EmergencyStopSchema = z.object({
  reason: z.string().min(1).max(256).optional(),
  confirmation: z.literal('DETENER'),
});

export const PaymentReconcileManualSchema = z.object({
  /** ID real de pago de Mercado Pago (el que ve mesa de entrada en su propio dashboard). */
  paymentId: z.string().min(1, 'Ingresá el ID de pago de Mercado Pago.').max(64),
});

// ---------- Usuarios del panel (ADR-062) ----------
// `.strict()`: `tokenVersion`, `mustChangePassword` o `role: 'tecnico'` nunca vienen del cliente.
const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email('Email inválido.').max(128));

const PasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `La clave tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .max(256);

const UserNameSchema = z.string().trim().min(1, 'Ingresá el nombre.').max(80);

export const UserCreateSchema = z
  .object({
    email: EmailSchema,
    name: UserNameSchema,
    role: z.enum(ASSIGNABLE_ROLES),
    password: PasswordSchema,
  })
  .strict();

export const UserPatchSchema = z
  .object({
    name: UserNameSchema.optional(),
    role: z.enum(ASSIGNABLE_ROLES).optional(),
    active: z.boolean().optional(),
    password: PasswordSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay nada para cambiar.' });

export const PasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresá tu clave actual.').max(256),
    newPassword: PasswordSchema,
  })
  .strict();

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
