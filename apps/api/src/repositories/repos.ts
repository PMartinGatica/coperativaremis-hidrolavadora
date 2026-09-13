import { desc, eq, sql, and, gte, inArray } from 'drizzle-orm';
import type {
  AuthorizationStatus,
  MachineStatus,
  PaymentStatus,
  SessionStatus,
} from '@hidro/shared';
import { ACTIVE_SESSION_STATUSES, TERMINAL_SESSION_STATUSES, WASH_COUNTING_STATUSES } from '@hidro/shared';
import type { Db } from '../db/client.js';
import {
  auditLogs,
  authorizations,
  deviceCommands,
  deviceEvents,
  devices,
  machines,
  payments,
  sessions,
  settings,
  vehicles,
} from '../db/schema.js';
import { uuid } from '../ids.js';

// ---------------------------------------------------------------- machines
export async function getMachine(db: Db, id: string) {
  const rows = await db.select().from(machines).where(eq(machines.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getMachineForUpdate(db: Db, id: string) {
  const rows = await db.select().from(machines).where(eq(machines.id, id)).for('update').limit(1);
  return rows[0] ?? null;
}

export async function listMachines(db: Db) {
  return db.select().from(machines).orderBy(machines.id);
}

export async function updateMachine(
  db: Db,
  id: string,
  patch: Partial<{ name: string; description: string | null; priceRemisArs: number; priceSocioArs: number; priceExternoArs: number; durationSeconds: number; enabled: boolean; status: MachineStatus }>,
) {
  const rows = await db
    .update(machines)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(machines.id, id))
    .returning();
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- vehicles (patentes)
export async function getVehicleByPlate(db: Db, plate: string) {
  const rows = await db.select().from(vehicles).where(eq(vehicles.plate, plate)).limit(1);
  return rows[0] ?? null;
}

export async function listVehicles(db: Db) {
  return db.select().from(vehicles).orderBy(vehicles.plate);
}

export async function upsertVehicle(
  db: Db,
  data: {
    plate: string;
    category: 'remis' | 'socio';
    ownerName: string | null;
    /** Tri-estado: undefined = no tocar el PIN existente; null = borrarlo; string = setearlo
     *  (ya hasheado por el llamador, acá se guarda tal cual). */
    pinHash?: string | null;
  },
) {
  const set: Record<string, unknown> = { category: data.category, ownerName: data.ownerName, updatedAt: new Date() };
  if (data.pinHash !== undefined) set.pin = data.pinHash;
  const rows = await db
    .insert(vehicles)
    .values({ id: uuid(), plate: data.plate, category: data.category, ownerName: data.ownerName, pin: data.pinHash ?? null })
    .onConflictDoUpdate({ target: vehicles.plate, set })
    .returning();
  return rows[0] as (typeof rows)[number];
}

export async function deleteVehicle(db: Db, plate: string) {
  return db.delete(vehicles).where(eq(vehicles.plate, plate)).returning();
}

/** Lavados de HOY de una patente que cuentan contra el límite diario. */
export async function countWashesToday(db: Db, plate: string, todayStart: Date) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(
      and(
        eq(sessions.plate, plate),
        gte(sessions.createdAt, todayStart),
        inArray(sessions.status, WASH_COUNTING_STATUSES),
      ),
    );
  return rows[0]?.count ?? 0;
}

// ---------------------------------------------------------------- devices
export async function getDeviceByMachine(db: Db, machineId: string) {
  const rows = await db.select().from(devices).where(eq(devices.machineId, machineId)).limit(1);
  return rows[0] ?? null;
}

export async function getDeviceByIdentifier(db: Db, identifier: string) {
  const rows = await db.select().from(devices).where(eq(devices.deviceIdentifier, identifier)).limit(1);
  return rows[0] ?? null;
}

export async function listDevices(db: Db) {
  return db.select().from(devices).orderBy(devices.machineId);
}

export async function updateDevice(
  db: Db,
  deviceId: string,
  patch: Partial<{
    lastHeartbeatAt: Date | null;
    status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
    firmwareVersion: string | null;
    lastRelayState: boolean;
    lastWifiRssi: number | null;
    lastUptime: number | null;
    currentSessionId: string | null;
    secretEnc: string;
  }>,
) {
  const rows = await db.update(devices).set(patch).where(eq(devices.id, deviceId)).returning();
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- sessions
export async function getSession(db: Db, id: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getSessionForUpdate(db: Db, id: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).for('update').limit(1);
  return rows[0] ?? null;
}

/**
 * Sub-caso B de la recuperación de PAYMENT_EXPIRED (Fase 1, ADR-030): ¿ya se creó otra
 * sesión en esta máquina desde que la que estamos por recuperar fue creada, Y ESA OTRA
 * SESIÓN YA TERMINÓ (liberó la máquina)? Restringido a estados TERMINALES a propósito
 * (docs/designs/reconciliacion-pagos.md, diagrama de arquitectura): una sesión más nueva
 * que sigue ACTIVA es sub-caso A (la máquina está ocupada AHORA, no "ya se usó y liberó")
 * y ese caso lo resuelve el índice único `uq_sessions_active_machine` al intentar la
 * escritura — mezclar ambas acá haría inalcanzable a sub-caso A, porque toda sesión más
 * nueva por definición se creó DESPUÉS de la que se está recuperando. Chequeo POSITIVO
 * de existencia (no de "último"), a propósito: con `createdAt >= A.createdAt` (no `>`)
 * evita depender de un tie-break seguro entre timestamps iguales. Usa
 * idx_sessions_machine_created — sin índice nuevo.
 */
export async function existsNewerSessionForMachine(
  db: Db,
  machineId: string,
  excludeSessionId: string,
  sinceCreatedAt: Date,
): Promise<boolean> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.machineId, machineId),
        gte(sessions.createdAt, sinceCreatedAt),
        sql`${sessions.id} != ${excludeSessionId}`,
        inArray(sessions.status, TERMINAL_SESSION_STATUSES),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function getActiveSessionForMachine(db: Db, machineId: string) {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.machineId, machineId), inArray(sessions.status, ACTIVE_SESSION_STATUSES)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertSession(
  db: Db,
  data: {
    id: string;
    machineId: string;
    durationSeconds: number;
    status: SessionStatus;
    plate?: string | null;
    plateCategory?: 'remis' | 'socio' | 'externo' | null;
  },
) {
  const rows = await db.insert(sessions).values({ ...data }).returning();
  return rows[0] as (typeof rows)[number];
}

export async function setSessionStatus(
  db: Db,
  id: string,
  expectedStatus: SessionStatus,
  nextStatus: SessionStatus,
  extra: Partial<{ startedAt: Date; finishedAt: Date; interruptionReason: string; authorizationId: string; paymentId: string }> = {},
) {
  const rows = await db
    .update(sessions)
    .set({ status: nextStatus, updatedAt: new Date(), ...extra })
    .where(and(eq(sessions.id, id), eq(sessions.status, expectedStatus)))
    .returning();
  return rows[0] ?? null;
}

export async function listSessions(db: Db, opts: { machineId?: string; status?: SessionStatus; limit?: number } = {}) {
  const conds = [];
  if (opts.machineId) conds.push(eq(sessions.machineId, opts.machineId));
  if (opts.status) conds.push(eq(sessions.status, opts.status));
  const rows = conds.length
    ? await db
        .select()
        .from(sessions)
        .where(and(...conds))
        .orderBy(desc(sessions.createdAt))
        .limit(opts.limit ?? 100)
    : await db.select().from(sessions).orderBy(desc(sessions.createdAt)).limit(opts.limit ?? 100);
  return rows;
}

export async function sessionsSince(db: Db, date: Date) {
  return db
    .select()
    .from(sessions)
    .where(gte(sessions.createdAt, date))
    .orderBy(desc(sessions.createdAt));
}

// ---------------------------------------------------------------- payments
export async function getPaymentByExternalId(db: Db, externalPaymentId: string) {
  const rows = await db.select().from(payments).where(eq(payments.externalPaymentId, externalPaymentId)).limit(1);
  return rows[0] ?? null;
}

export async function getPaymentByExternalIdForUpdate(db: Db, externalPaymentId: string) {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.externalPaymentId, externalPaymentId))
    .for('update')
    .limit(1);
  return rows[0] ?? null;
}

export async function getPaymentBySession(db: Db, sessionId: string) {
  const rows = await db.select().from(payments).where(eq(payments.sessionId, sessionId)).limit(1);
  return rows[0] ?? null;
}

export async function insertPayment(
  db: Db,
  data: { id: string; externalPaymentId: string; provider: 'demo' | 'mercadopago'; machineId: string; sessionId: string; amount: number; status: PaymentStatus; rawStatus: string | null },
) {
  const rows = await db.insert(payments).values({ ...data }).returning();
  return rows[0] as (typeof rows)[number];
}

export async function setPaymentStatus(
  db: Db,
  id: string,
  status: PaymentStatus,
  rawStatus: string | null,
) {
  const rows = await db
    .update(payments)
    .set({ status, rawStatus, updatedAt: new Date() })
    .where(eq(payments.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function listPayments(db: Db, opts: { machineId?: string; status?: PaymentStatus; limit?: number } = {}) {
  const conds = [];
  if (opts.machineId) conds.push(eq(payments.machineId, opts.machineId));
  if (opts.status) conds.push(eq(payments.status, opts.status));
  const rows = conds.length
    ? await db
        .select()
        .from(payments)
        .where(and(...conds))
        .orderBy(desc(payments.createdAt))
        .limit(opts.limit ?? 100)
    : await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(opts.limit ?? 100);
  return rows;
}

export async function paymentsSince(db: Db, date: Date, status?: PaymentStatus) {
  const conds = [gte(payments.createdAt, date)];
  if (status) conds.push(eq(payments.status, status));
  return db.select().from(payments).where(and(...conds));
}

// ---------------------------------------------------------------- authorizations
export async function getAuthorizationByIdForUpdate(db: Db, id: string) {
  const rows = await db.select().from(authorizations).where(eq(authorizations.id, id)).for('update').limit(1);
  return rows[0] ?? null;
}

export async function getAuthorizationByPayment(db: Db, paymentId: string) {
  const rows = await db.select().from(authorizations).where(eq(authorizations.paymentId, paymentId)).limit(1);
  return rows[0] ?? null;
}

export async function getActiveAuthorizationForMachine(db: Db, machineId: string, now: Date) {
  const rows = await db
    .select()
    .from(authorizations)
    .where(and(eq(authorizations.machineId, machineId), eq(authorizations.status, 'AUTHORIZED'), sql`${authorizations.expiresAt} > ${now}`))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertAuthorization(
  db: Db,
  data: { id: string; sessionId: string; machineId: string; paymentId: string; expiresAt: Date; status: AuthorizationStatus },
) {
  const rows = await db.insert(authorizations).values({ ...data }).returning();
  return rows[0] as (typeof rows)[number];
}

export async function setAuthorizationStatus(
  db: Db,
  id: string,
  status: 'AUTHORIZED' | 'CONSUMED' | 'EXPIRED' | 'REVOKED',
  extra: Partial<{ consumedAt: Date }> = {},
) {
  const rows = await db.update(authorizations).set({ status, ...extra }).where(eq(authorizations.id, id)).returning();
  return rows[0] ?? null;
}

export async function revokeAuthorizationsForMachine(db: Db, machineId: string) {
  return db
    .update(authorizations)
    .set({ status: 'REVOKED' as const })
    .where(and(eq(authorizations.machineId, machineId), eq(authorizations.status, 'AUTHORIZED')))
    .returning();
}

export async function listExpiredAuthorizations(db: Db, now: Date) {
  return db
    .select()
    .from(authorizations)
    .where(and(eq(authorizations.status, 'AUTHORIZED'), sql`${authorizations.expiresAt} <= ${now}`));
}

// ---------------------------------------------------------------- eventos / auditoría / comandos / settings
export async function insertDeviceEvent(
  db: Db,
  data: { machineId: string; deviceId: string; sessionId: string | null; type: string; payload?: Record<string, unknown> | null },
) {
  const rows = await db
    .insert(deviceEvents)
    .values({ id: uuid(), ...data, payload: data.payload ?? null })
    .returning();
  return rows[0] as (typeof rows)[number];
}

export async function listDeviceEventsForSession(db: Db, sessionId: string) {
  return db
    .select()
    .from(deviceEvents)
    .where(eq(deviceEvents.sessionId, sessionId))
    .orderBy(deviceEvents.createdAt);
}

export async function listDeviceEvents(db: Db, limit = 200) {
  return db.select().from(deviceEvents).orderBy(desc(deviceEvents.createdAt)).limit(limit);
}

export async function insertAudit(
  db: Db,
  data: { actor: string; action: string; entity: string; entityId?: string | null; metadata?: Record<string, unknown> | null },
) {
  const rows = await db
    .insert(auditLogs)
    .values({ id: uuid(), ...data, entityId: data.entityId ?? null, metadata: data.metadata ?? null })
    .returning();
  return rows[0] as (typeof rows)[number];
}

export async function listAudit(db: Db, opts: { entity?: string; entityId?: string; action?: string; limit?: number } = {}) {
  const conds = [];
  if (opts.entity) conds.push(eq(auditLogs.entity, opts.entity));
  if (opts.entityId) conds.push(eq(auditLogs.entityId, opts.entityId));
  if (opts.action) conds.push(eq(auditLogs.action, opts.action));
  const rows = conds.length
    ? await db
        .select()
        .from(auditLogs)
        .where(and(...conds))
        .orderBy(desc(auditLogs.createdAt))
        .limit(opts.limit ?? 200)
    : await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(opts.limit ?? 200);
  return rows;
}

/** Auditoría relacionada a una sesión (entity=session directo o metadata.sessionId). */
export async function listAuditForSession(db: Db, sessionId: string) {
  return db
    .select()
    .from(auditLogs)
    .where(
      sql`(${auditLogs.entity} = 'session' AND ${auditLogs.entityId} = ${sessionId}) OR (${auditLogs.metadata}->>'sessionId' = ${sessionId})`,
    )
    .orderBy(auditLogs.createdAt);
}

// ---------------------------------------------------------------- comandos
export async function insertCommand(
  db: Db,
  data: { deviceId: string; machineId: string; type: string; payload?: Record<string, unknown> | null },
) {
  const rows = await db
    .insert(deviceCommands)
    .values({ id: uuid(), ...data, payload: data.payload ?? null })
    .returning();
  return rows[0] as (typeof rows)[number];
}

export async function pendingCommandsForMachine(db: Db, machineId: string) {
  return db
    .select()
    .from(deviceCommands)
    .where(and(eq(deviceCommands.machineId, machineId), eq(deviceCommands.status, 'PENDING')))
    .orderBy(deviceCommands.createdAt);
}

export async function ackCommand(db: Db, commandId: string, deviceId: string) {
  const rows = await db
    .update(deviceCommands)
    .set({ status: 'DELIVERED' as const, deliveredAt: new Date() })
    .where(and(eq(deviceCommands.id, commandId), eq(deviceCommands.deviceId, deviceId)))
    .returning();
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- settings
export async function getSetting(db: Db, key: string): Promise<unknown | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function getAllSettings(db: Db) {
  return db.select().from(settings);
}

export async function setSetting(db: Db, key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
