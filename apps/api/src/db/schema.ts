import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AuthorizationStatus, MachineStatus, PaymentStatus, SessionStatus } from '@hidro/shared';

/**
 * Modelo de datos central. Restricciones de idempotencia A NIVEL DE BASE DE DATOS:
 *  - uq_payments_external_id     -> un único pago por id externo (webhooks duplicados)
 *  - uq_payments_session         -> un único pago por sesión
 *  - uq_authorizations_payment   -> UNA SOLA autorización por pago (nunca 2 ciclos por pago)
 *  - uq_authorizations_session   -> una sola autorización por sesión
 *  - uq_sessions_active_machine  -> NUNCA dos sesiones activas para la misma máquina
 */

export const machines = pgTable('machines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').$type<MachineStatus>().notNull().default('OFFLINE'),
  priceRemisArs: integer('price_remis_ars').notNull(),
  priceSocioArs: integer('price_socio_ars').notNull(),
  priceExternoArs: integer('price_externo_ars').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Patentes registradas: remis de la cooperativa y autos de socios.
 *  Toda patente NO registrada se cotiza como EXTERNO ($8.000). */
export const vehicles = pgTable(
  'vehicles',
  {
    id: text('id').primaryKey(),
    plate: text('plate').notNull(),
    category: text('category').$type<'remis' | 'socio'>().notNull(),
    ownerName: text('owner_name'),
    /** Hash (hashSecret) del PIN de 4 dígitos. NULL = sin PIN (grandfather clause: no se
     *  exige hasta que un admin le asigne uno). Nunca se guarda en claro. */
    pin: text('pin'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_vehicles_plate').on(t.plate),
    index('idx_vehicles_category').on(t.category),
  ],
);

export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  machineId: text('machine_id')
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' })
    .unique(),
  deviceIdentifier: text('device_identifier').notNull().unique(),
  firmwareVersion: text('firmware_version'),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  status: text('status').$type<'ONLINE' | 'OFFLINE' | 'DEGRADED'>().notNull().default('OFFLINE'),
  /** Secret del dispositivo cifrado AES-256-GCM (clave derivada de DEVICE_AUTH_SECRET). */
  secretEnc: text('secret_enc').notNull(),
  lastRelayState: boolean('last_relay_state').notNull().default(false),
  lastWifiRssi: integer('last_wifi_rssi'),
  lastUptime: integer('last_uptime'),
  currentSessionId: text('current_session_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    machineId: text('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    plate: text('plate'),
    plateCategory: text('plate_category').$type<'remis' | 'socio' | 'externo'>(),
    paymentId: text('payment_id'),
    authorizationId: text('authorization_id'),
    status: text('status').$type<SessionStatus>().notNull().default('IDLE'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds').notNull(),
    interruptionReason: text('interruption_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_sessions_active_machine').on(t.machineId).where(
      sql`${t.status} IN ('IDLE','PAYMENT_PENDING','PAYMENT_APPROVED','AUTHORIZED','WAITING_FOR_BUTTON','RUNNING')`,
    ),
    index('idx_sessions_machine_created').on(t.machineId, t.createdAt),
    index('idx_sessions_status').on(t.status),
    index('idx_sessions_plate_created').on(t.plate, t.createdAt),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    externalPaymentId: text('external_payment_id').notNull(),
    provider: text('provider').$type<'demo' | 'mercadopago'>().notNull(),
    machineId: text('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    amount: integer('amount').notNull(),
    status: text('status').$type<PaymentStatus>().notNull().default('PENDING'),
    rawStatus: text('raw_status'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_payments_external_id').on(t.externalPaymentId),
    uniqueIndex('uq_payments_session').on(t.sessionId),
    index('idx_payments_machine_created').on(t.machineId, t.createdAt),
    index('idx_payments_status').on(t.status),
  ],
);

export const authorizations = pgTable(
  'authorizations',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    machineId: text('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    status: text('status').$type<AuthorizationStatus>().notNull().default('AUTHORIZED'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_authorizations_payment').on(t.paymentId),
    uniqueIndex('uq_authorizations_session').on(t.sessionId),
    index('idx_authorizations_machine_status').on(t.machineId, t.status),
  ],
);

export const deviceEvents = pgTable(
  'device_events',
  {
    id: text('id').primaryKey(),
    machineId: text('machine_id').notNull(),
    deviceId: text('device_id').notNull(),
    sessionId: text('session_id'),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_device_events_session').on(t.sessionId),
    index('idx_device_events_machine_created').on(t.machineId, t.createdAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_entity').on(t.entity, t.entityId),
    index('idx_audit_created').on(t.createdAt),
  ],
);

export const deviceCommands = pgTable(
  'device_commands',
  {
    id: text('id').primaryKey(),
    deviceId: text('device_id').notNull(),
    machineId: text('machine_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    status: text('status').$type<'PENDING' | 'DELIVERED' | 'FAILED'>().notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => [index('idx_commands_machine_status').on(t.machineId, t.status)],
);

export const adminUsers = pgTable('admin_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  /** 'tecnico' | 'admin' | 'operador' (CHECK en la migración 0003; permisos en @hidro/shared). */
  role: text('role').notNull().default('operador'),
  name: text('name'),
  active: boolean('active').notNull().default(true),
  /** Se incrementa al desactivar, cambiar rol o clave: invalida todos los JWT anteriores. */
  tokenVersion: integer('token_version').notNull().default(0),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Configuración dinámica (sobrescribe defaults de entorno en runtime, vía admin). */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MachineRow = typeof machines.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type AuthorizationRow = typeof authorizations.$inferSelect;
export type DeviceEventRow = typeof deviceEvents.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type DeviceCommandRow = typeof deviceCommands.$inferSelect;
export type AdminUserRow = typeof adminUsers.$inferSelect;
