import jwt from 'jsonwebtoken';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  AppError,
  ACTIVE_SESSION_STATUSES,
  ERROR_SESSION_STATUSES,
  startOfDayAmericaArgentina,
  type SessionStatus,
} from '@hidro/shared';
import type { Db } from '../db/client.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { PaymentProvider } from '../payments/provider.js';
import { adminUsers, payments, sessions as sessionsTable } from '../db/schema.js';
import {
  deleteVehicle,
  getDeviceByMachine,
  getMachine,
  getPaymentBySession,
  getSession,
  insertAudit,
  listAudit,
  listDeviceEvents,
  listMachines,
  listPayments,
  listSessions,
  listVehicles,
  updateDevice,
  upsertVehicle,
} from '../repositories/repos.js';
import { encryptSecret, hashSecret, verifySecret, updateDeviceSecretFile } from '../db/seed.js';
import { newDeviceSecret } from '../ids.js';
import { buildTimeline } from './sessionService.js';
import { getActiveSessionForMachine } from '../repositories/repos.js';
import { updateMachineFromAdmin } from './machineService.js';
import { emergencyStopFromAdmin } from './deviceService.js';
import { getDynamicSettings, updateDynamicSettings } from './settingsService.js';
import { reconcileSessionAutomatic, reconcileSessionManual, type ReconcileResultType } from './paymentService.js';

export interface AdminDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
  provider: PaymentProvider;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
}

export function issueToken(config: AppConfig, user: { email: string; role: string }): string {
  return jwt.sign({ sub: user.email, role: user.role }, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(config: AppConfig, token: string): AdminUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === 'object' && typeof payload.sub === 'string') {
      return { id: payload.sub, email: payload.sub, role: String(payload.role ?? 'admin') };
    }
    return null;
  } catch {
    return null;
  }
}

export async function login(deps: AdminDeps, email: string, password: string) {
  const rows = await deps.db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase().trim())).limit(1);
  const user = rows[0];
  if (!user || !verifySecret(password, user.passwordHash)) {
    await insertAudit(deps.db, { actor: email, action: 'ADMIN_LOGIN_FAILED', entity: 'admin', metadata: null });
    throw new AppError('UNAUTHORIZED', 'Credenciales inválidas.');
  }
  await insertAudit(deps.db, { actor: email, action: 'ADMIN_LOGIN', entity: 'admin', entityId: user.id, metadata: null });
  return { token: issueToken(deps.config, { email: user.email, role: user.role }), email: user.email, role: user.role };
}

// El "día" del negocio es el de Ushuaia (UTC-3 fijo, sin DST), no el del servidor.
const startOfToday = startOfDayAmericaArgentina;

export async function getOverview(deps: AdminDeps) {
  const { db } = deps;
  const machines = await listMachines(db);
  const today = startOfToday();

  const stats = {
    machinesOnline: machines.filter((m) => m.status === 'ONLINE').length,
    machinesDegraded: machines.filter((m) => m.status === 'DEGRADED').length,
    machinesOffline: machines.filter((m) => m.status === 'OFFLINE').length,
    machinesDisabled: machines.filter((m) => !m.enabled || m.status === 'DISABLED').length,
  };

  const washesToday = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsTable)
    .where(and(gte(sessionsTable.startedAt, today)));
  const activeSessions = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsTable)
    .where(inArray(sessionsTable.status, ACTIVE_SESSION_STATUSES));
  const revenue = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amount}),0)::int` })
    .from(payments)
    .where(and(gte(payments.createdAt, today), eq(payments.status, 'APPROVED')));

  const recentErrors = await db
    .select()
    .from(sessionsTable)
    .where(inArray(sessionsTable.status, ERROR_SESSION_STATUSES))
    .orderBy(sql`${sessionsTable.updatedAt} desc`)
    .limit(10);

  // Desglose por categoría de patente (remis / socio / externo)
  const byCategory = async (cat: 'remis' | 'socio' | 'externo') => {
    const washes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionsTable)
      .where(and(gte(sessionsTable.startedAt, today), eq(sessionsTable.plateCategory, cat)));
    const revenueCat = await db
      .select({ total: sql<number>`coalesce(sum(${payments.amount}),0)::int` })
      .from(payments)
      .where(
        and(
          gte(payments.createdAt, today),
          eq(payments.status, 'APPROVED'),
          sql`${payments.sessionId} IN (select id from sessions where plate_category = ${cat})`,
        ),
      );
    return { washes: washes[0]?.count ?? 0, revenue: revenueCat[0]?.total ?? 0 };
  };
  const [catRemis, catSocio, catExterno] = await Promise.all([byCategory('remis'), byCategory('socio'), byCategory('externo')]);

  const machineCards = [];
  for (const m of machines) {
    const device = await getDeviceByMachine(db, m.id);
    const active = await getActiveSessionForMachine(db, m.id);
    const machineWashes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionsTable)
      .where(and(gte(sessionsTable.startedAt, today), eq(sessionsTable.machineId, m.id)));
    const machineRevenue = await db
      .select({ total: sql<number>`coalesce(sum(${payments.amount}),0)::int` })
      .from(payments)
      .where(and(gte(payments.createdAt, today), eq(payments.status, 'APPROVED'), eq(payments.machineId, m.id)));
    machineCards.push({
      id: m.id,
      name: m.name,
      status: m.status,
      enabled: m.enabled,
      priceRemisArs: m.priceRemisArs,
      priceSocioArs: m.priceSocioArs,
      priceExternoArs: m.priceExternoArs,
      durationSeconds: m.durationSeconds,
      relayState: device?.lastRelayState ?? false,
      wifiRssi: device?.lastWifiRssi ?? null,
      firmwareVersion: device?.firmwareVersion ?? null,
      lastHeartbeatAt: device?.lastHeartbeatAt?.toISOString() ?? null,
      activeSessionId: active?.id ?? null,
      activeSessionStatus: active?.status ?? null,
      washesToday: machineWashes[0]?.count ?? 0,
      revenueToday: machineRevenue[0]?.total ?? 0,
    });
  }

  return {
    stats: {
      ...stats,
      washesToday: washesToday[0]?.count ?? 0,
      revenueToday: revenue[0]?.total ?? 0,
      activeSessions: activeSessions[0]?.count ?? 0,
      byCategory: { remis: catRemis, socio: catSocio, externo: catExterno },
    },
    machines: machineCards,
    recentErrors: recentErrors.map((s) => ({
      id: s.id,
      machineId: s.machineId,
      status: s.status,
      reason: s.interruptionReason,
      updatedAt: s.updatedAt.toISOString(),
    })),
    demoMode: deps.config.paymentProvider === 'demo',
    simulatorEnabled: deps.config.deviceSimulator,
  };
}

export async function listAdminMachines(deps: AdminDeps) {
  const machines = await listMachines(deps.db);
  const out = [];
  for (const m of machines) {
    const device = await getDeviceByMachine(deps.db, m.id);
    const active = await getActiveSessionForMachine(deps.db, m.id);
    out.push({
      ...m,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      device: device
        ? {
            id: device.id,
            deviceIdentifier: device.deviceIdentifier,
            firmwareVersion: device.firmwareVersion,
            lastHeartbeatAt: device.lastHeartbeatAt?.toISOString() ?? null,
            status: device.status,
            relayState: device.lastRelayState,
            wifiRssi: device.lastWifiRssi,
            uptime: device.lastUptime,
          }
        : null,
      activeSession: active ? { id: active.id, status: active.status, createdAt: active.createdAt.toISOString() } : null,
    });
  }
  return out;
}

export async function getAdminMachine(deps: AdminDeps, machineId: string) {
  const machine = await getMachine(deps.db, machineId);
  if (!machine) throw new AppError('MACHINE_NOT_FOUND', `Máquina no encontrada: ${machineId}`);
  const device = await getDeviceByMachine(deps.db, machineId);
  const active = await getActiveSessionForMachine(deps.db, machineId);
  const history = await listSessions(deps.db, { machineId, limit: 10 });
  return {
    ...machine,
    createdAt: machine.createdAt.toISOString(),
    updatedAt: machine.updatedAt.toISOString(),
    device: device
      ? {
          id: device.id,
          deviceIdentifier: device.deviceIdentifier,
          firmwareVersion: device.firmwareVersion,
          lastHeartbeatAt: device.lastHeartbeatAt?.toISOString() ?? null,
          status: device.status,
          relayState: device.lastRelayState,
          wifiRssi: device.lastWifiRssi,
          uptime: device.lastUptime,
        }
      : null,
    activeSession: active ? { id: active.id, status: active.status } : null,
    history: history.map((s) => ({
      id: s.id,
      status: s.status,
      startedAt: s.startedAt?.toISOString() ?? null,
      finishedAt: s.finishedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}

export async function updateAdminMachine(deps: AdminDeps, machineId: string, patch: Parameters<typeof updateMachineFromAdmin>[2], actor: string) {
  return updateMachineFromAdmin({ db: deps.db, config: deps.config }, machineId, patch, actor);
}

export async function emergencyStop(deps: AdminDeps, machineId: string, actor: string, reason?: string) {
  return emergencyStopFromAdmin({ db: deps.db, config: deps.config, logger: deps.logger }, machineId, actor, reason);
}

export async function listAdminSessions(deps: AdminDeps, opts: { machineId?: string; status?: SessionStatus; limit?: number } = {}) {
  const rows = await listSessions(deps.db, opts);
  const out = [];
  for (const s of rows) {
    const machine = await getMachine(deps.db, s.machineId);
    const payment = s.paymentId ? await getPaymentBySession(deps.db, s.id) : null;
    out.push({
      id: s.id,
      machineId: s.machineId,
      machineName: machine?.name ?? s.machineId,
      plate: s.plate,
      plateCategory: s.plateCategory,
      status: s.status,
      amount: payment?.amount ?? null,
      paymentExternalId: payment?.externalPaymentId ?? null,
      provider: payment?.provider ?? null,
      startedAt: s.startedAt?.toISOString() ?? null,
      finishedAt: s.finishedAt?.toISOString() ?? null,
      durationSeconds: s.durationSeconds,
      interruptionReason: s.interruptionReason,
      createdAt: s.createdAt.toISOString(),
    });
  }
  return out;
}

export async function getAdminSession(deps: AdminDeps, sessionId: string) {
  const session = await getSession(deps.db, sessionId);
  if (!session) throw new AppError('SESSION_NOT_FOUND', `Sesión no encontrada: ${sessionId}`);
  const machine = await getMachine(deps.db, session.machineId);
  const payment = session.paymentId ? await getPaymentBySession(deps.db, sessionId) : null;
  const timeline = await buildTimeline({ db: deps.db, config: deps.config, logger: deps.logger, provider: undefined as never }, sessionId);
  return {
    id: session.id,
    machineId: session.machineId,
    machineName: machine?.name ?? session.machineId,
    plate: session.plate,
    plateCategory: session.plateCategory,
    status: session.status,
    durationSeconds: session.durationSeconds,
    startedAt: session.startedAt?.toISOString() ?? null,
    finishedAt: session.finishedAt?.toISOString() ?? null,
    interruptionReason: session.interruptionReason,
    createdAt: session.createdAt.toISOString(),
    payment: payment
      ? {
          id: payment.id,
          externalPaymentId: payment.externalPaymentId,
          provider: payment.provider,
          status: payment.status,
          amount: payment.amount,
          rawStatus: payment.rawStatus,
        }
      : null,
    timeline,
  };
}

export async function listAdminPayments(deps: AdminDeps, opts: { machineId?: string; status?: import('@hidro/shared').PaymentStatus; limit?: number } = {}) {
  const rows = await listPayments(deps.db, opts);
  const out = [];
  for (const p of rows) {
    const machine = await getMachine(deps.db, p.machineId);
    const session = await getSession(deps.db, p.sessionId);
    out.push({
      id: p.id,
      externalPaymentId: p.externalPaymentId,
      provider: p.provider,
      machineId: p.machineId,
      machineName: machine?.name ?? p.machineId,
      sessionId: p.sessionId,
      plate: session?.plate ?? null,
      plateCategory: session?.plateCategory ?? null,
      amount: p.amount,
      status: p.status,
      rawStatus: p.rawStatus,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    });
  }
  return out;
}

// ---------------------------------------------------------------- patentes
export async function listAdminVehicles(deps: AdminDeps, search?: string) {
  const rows = await listVehicles(deps.db);
  const normalized = (search ?? '').toUpperCase().replace(/[\s.-]/g, '');
  return rows
    .filter((v) => !normalized || v.plate.includes(normalized) || (v.ownerName ?? '').toUpperCase().includes(search?.toUpperCase() ?? ''))
    .map((v) => ({
      id: v.id,
      plate: v.plate,
      category: v.category,
      ownerName: v.ownerName,
      hasPin: v.pin != null,
      enabled: v.enabled,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    }));
}

export async function upsertAdminVehicle(
  deps: AdminDeps,
  data: {
    plate: string;
    category: 'remis' | 'socio';
    ownerName?: string;
    /** Tri-estado (ver upsertVehicle): undefined = no tocar, null = borrar, string = setear.
     *  Acá llega en claro (validado por VehicleUpsertSchema) — se hashea recién acá, nunca
     *  antes ni en el body de vuelta. */
    pin?: string | null;
  },
  actor: string,
) {
  const pinHash = data.pin === undefined ? undefined : data.pin === null ? null : hashSecret(data.pin);
  const row = await upsertVehicle(deps.db, {
    plate: data.plate,
    category: data.category,
    ownerName: data.ownerName ?? null,
    pinHash,
  });
  await insertAudit(deps.db, {
    actor,
    action: 'VEHICLE_UPDATED',
    entity: 'vehicle',
    entityId: row.id,
    metadata: { plate: data.plate, category: data.category, pinChanged: pinHash !== undefined },
  });
  return {
    id: row.id,
    plate: row.plate,
    category: row.category,
    ownerName: row.ownerName,
    hasPin: row.pin != null,
    enabled: row.enabled,
  };
}

export async function deleteAdminVehicle(deps: AdminDeps, plate: string, actor: string) {
  const rows = await deleteVehicle(deps.db, plate);
  await insertAudit(deps.db, {
    actor,
    action: 'VEHICLE_DELETED',
    entity: 'vehicle',
    entityId: null,
    metadata: { plate, found: rows.length > 0 },
  });
  return { ok: true, deleted: rows.length > 0 };
}

export async function listAdminLogs(deps: AdminDeps, opts: { source?: 'system' | 'device' | 'all'; entity?: string; entityId?: string; limit?: number } = {}) {
  const limit = opts.limit ?? 200;
  const source = opts.source ?? 'all';
  const out: Array<Record<string, unknown>> = [];
  if (source !== 'device') {
    const audits = await listAudit(deps.db, { entity: opts.entity, entityId: opts.entityId, limit });
    for (const a of audits) {
      out.push({
        id: a.id,
        at: a.createdAt.toISOString(),
        source: 'system',
        type: a.action,
        actor: a.actor,
        entity: a.entity,
        entityId: a.entityId,
        payload: a.metadata,
      });
    }
  }
  if (source !== 'system') {
    const events = await listDeviceEvents(deps.db, limit);
    for (const e of events) {
      out.push({
        id: e.id,
        at: e.createdAt.toISOString(),
        source: 'device',
        type: e.type,
        actor: 'device',
        entity: 'machine',
        entityId: e.machineId,
        payload: { ...(e.payload ?? {}), sessionId: e.sessionId, deviceId: e.deviceId },
      });
    }
  }
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return out.slice(0, limit);
}

export async function getSettings(deps: AdminDeps) {
  const dynamic = await getDynamicSettings(deps.db, deps.config);
  return {
    nodeEnv: deps.config.nodeEnv,
    paymentProvider: deps.config.paymentProvider,
    demoMode: deps.config.paymentProvider === 'demo',
    simulatorEnabled: deps.config.deviceSimulator,
    publicAppUrl: deps.config.publicAppUrl,
    adminEmail: deps.config.adminEmail,
    ...dynamic,
    notes: [
      'PENDING CLIENT DECISION: política de reembolso ante corte eléctrico durante sesión paga',
      'PENDING CLIENT DECISION: retiro del timer eléctrico existente tras validar seguridad',
      'PENDING: modelo de contactor, voltaje de bobina y nivel de activación del relay',
    ],
  };
}

export async function updateSettings(deps: AdminDeps, patch: Parameters<typeof updateDynamicSettings>[2], actor: string) {
  await updateDynamicSettings(deps.db, deps.config, patch);
  await insertAudit(deps.db, { actor, action: 'SETTINGS_UPDATED', entity: 'settings', metadata: { patch } });
  return getSettings(deps);
}

export async function rotateDeviceSecret(deps: AdminDeps, machineId: string, actor: string) {
  const device = await getDeviceByMachine(deps.db, machineId);
  if (!device) throw new AppError('DEVICE_NOT_FOUND', `Sin dispositivo registrado para ${machineId}`);
  const secret = newDeviceSecret();
  await updateDevice(deps.db, device.id, { secretEnc: encryptSecret(secret, deps.config.deviceAuthSecret) });
  // El archivo en claro SOLO existe en DEMO MODE (lo consume el simulador).
  // En producción el secret viaja únicamente en la respuesta de este endpoint
  // (se muestra UNA vez, para flashear el ESP32).
  if (deps.config.deviceSimulator) {
    await updateDeviceSecretFile(machineId, secret, deps.config.dataDir);
  }
  await insertAudit(deps.db, {
    actor,
    action: 'DEVICE_SECRET_ROTATED',
    entity: 'device',
    entityId: device.id,
    metadata: { machineId },
  });
  return { deviceId: device.id, deviceIdentifier: device.deviceIdentifier, secret };
}

export async function getQrUrl(deps: AdminDeps, machineId: string): Promise<{ url: string; machineId: string }> {
  const machine = await getMachine(deps.db, machineId);
  if (!machine) throw new AppError('MACHINE_NOT_FOUND', `Máquina no encontrada: ${machineId}`);
  return { url: `${deps.config.publicAppUrl}/machine/${machineId}`, machineId };
}

// ---------------------------------------------------------------- reconciliación de pagos (Fase 1)

/** Mensajes en español para mesa de entrada — "specific error messages", no un genérico. */
const RECONCILE_MESSAGES: Record<ReconcileResultType, string> = {
  approved: 'Pago confirmado: la sesión quedó autorizada de nuevo. Avisale al cliente.',
  duplicated: 'Este pago ya estaba resuelto antes; no se hizo ningún cambio.',
  ignored: 'No se encontró ningún pago registrado para esta sesión.',
  rejected: 'Mercado Pago reporta este pago como RECHAZADO.',
  amount_mismatch: 'El importe informado por Mercado Pago no coincide con el de esta sesión.',
  session_terminal: 'Esta sesión no admite reconciliación (no es un pago vencido recuperable).',
  offline: 'La máquina está fuera de servicio; no se generó ninguna autorización.',
  pending: 'Mercado Pago todavía reporta este pago como PENDIENTE.',
  machine_occupied: 'La máquina ya está siendo usada por otro cliente ahora mismo.',
  machine_used_since: 'La máquina ya se usó para otro cliente desde que este pago venció.',
  not_found: 'Todavía no aparece ningún pago aprobado para esta sesión en Mercado Pago.',
  ambiguous: 'Se encontraron varios pagos aprobados para esta sesión: posible cobro duplicado, requiere revisión manual antes de reconciliar.',
  not_recoverable: 'Esta sesión no está en un estado que se pueda reconciliar.',
  session_id_mismatch: 'Ese ID de pago no corresponde a esta sesión (revisá que sea el correcto).',
  default_admin_forbidden: 'La cuenta de administrador por defecto no puede reconciliar pagos. Usá tu cuenta individual.',
};

export async function reconcilePaymentAuto(deps: AdminDeps, sessionId: string, actorEmail: string) {
  const result = await reconcileSessionAutomatic(deps, sessionId, actorEmail);
  return { ...result, message: RECONCILE_MESSAGES[result.result] };
}

export async function reconcilePaymentManual(deps: AdminDeps, sessionId: string, paymentId: string, actorEmail: string) {
  const result = await reconcileSessionManual(deps, sessionId, paymentId, actorEmail);
  return { ...result, message: RECONCILE_MESSAGES[result.result] };
}
