import { desc, eq } from 'drizzle-orm';
import {
  AppError,
  DEVICE_DEGRADED_THRESHOLD_MS,
  DEVICE_ONLINE_THRESHOLD_MS,
  PLATE_CATEGORY_LABELS,
  type Availability,
  type MachineStatus,
  type PlateCategory,
  type PlateQuote,
  type PublicMachineInfo,
} from '@hidro/shared';
import type { Db } from '../db/client.js';
import type { AppConfig } from '../config.js';
import { sessions as sessionsTable } from '../db/schema.js';
import { verifySecret } from '../db/seed.js';
import {
  countWashesToday,
  getActiveSessionForMachine,
  getDeviceByMachine,
  getMachine,
  getMachineForUpdate,
  getVehicleByPlate,
  insertAudit,
  listMachines,
  updateDevice,
  updateMachine,
} from '../repositories/repos.js';
import { getDailyWashLimit } from './settingsService.js';

export { updateMachine };

export interface MachineDeps {
  config: AppConfig;
  db: Db;
}

export function deriveAvailability(
  machine: { enabled: boolean; status: MachineStatus },
  hasActiveSession: boolean,
): Availability {
  if (!machine.enabled || machine.status === 'DISABLED') return 'OUT_OF_SERVICE';
  if (machine.status === 'OFFLINE') return 'OUT_OF_SERVICE';
  if (hasActiveSession) return 'BUSY';
  return 'AVAILABLE';
}

export function deriveStatusFromHeartbeat(
  lastHeartbeatAt: Date | null,
  now: Date,
  onlineThresholdMs = DEVICE_ONLINE_THRESHOLD_MS,
  degradedThresholdMs = DEVICE_DEGRADED_THRESHOLD_MS,
): MachineStatus {
  if (!lastHeartbeatAt) return 'OFFLINE';
  const age = now.getTime() - lastHeartbeatAt.getTime();
  if (age <= onlineThresholdMs) return 'ONLINE';
  if (age <= degradedThresholdMs) return 'DEGRADED';
  return 'OFFLINE';
}

export async function getPublicMachineInfo(deps: MachineDeps, machineId: string): Promise<PublicMachineInfo> {
  const machine = await getMachine(deps.db, machineId);
  if (!machine) throw new AppError('MACHINE_NOT_FOUND', `Máquina no encontrada: ${machineId}`);
  const device = await getDeviceByMachine(deps.db, machineId);
  const active = await getActiveSessionForMachine(deps.db, machineId);
  return {
    id: machine.id,
    name: machine.name,
    description: machine.description,
    priceRemisArs: machine.priceRemisArs,
    priceSocioArs: machine.priceSocioArs,
    priceExternoArs: machine.priceExternoArs,
    durationSeconds: machine.durationSeconds,
    status: machine.status,
    enabled: machine.enabled,
    availability: deriveAvailability(machine, active !== null),
    lastHeartbeatAt: device?.lastHeartbeatAt?.toISOString() ?? null,
    firmwareVersion: device?.firmwareVersion ?? null,
    relayState: device?.lastRelayState ?? false,
    wifiRssi: device?.lastWifiRssi ?? null,
    currentSessionId: active?.id ?? null,
    currentSessionStatus: active?.status ?? null,
    demoMode: deps.config.paymentProvider === 'demo',
    simulatedDevice: deps.config.deviceSimulator,
  };
}

export async function listPublicMachines(deps: MachineDeps) {
  const machines = await listMachines(deps.db);
  const result = [];
  for (const m of machines) {
    const active = await getActiveSessionForMachine(deps.db, m.id);
    result.push({
      id: m.id,
      name: m.name,
      priceRemisArs: m.priceRemisArs,
      priceSocioArs: m.priceSocioArs,
      priceExternoArs: m.priceExternoArs,
      durationSeconds: m.durationSeconds,
      availability: deriveAvailability(m, active !== null),
      demoMode: deps.config.paymentProvider === 'demo',
      simulatedDevice: deps.config.deviceSimulator,
    });
  }
  return result;
}

/** El PIN es prueba de posesión de la patente (remis/socio), no identidad fuerte.
 *  Grandfather clause: una fila sin PIN seteado no lo exige (ADR pendiente de numerar). */
function pinOk(vehicle: { pin: string | null } | null, providedPin?: string): boolean {
  if (!vehicle?.pin) return true;
  return providedPin != null && verifySecret(providedPin, vehicle.pin);
}

/** Categoría y tarifa de una patente (registro de admin; lo no registrado = externo).
 *  PIN incorrecto/faltante en una patente que SÍ tiene PIN cae al mismo camino que una
 *  patente no registrada — nunca revela que esa patente es remis/socio a quien no tiene
 *  el PIN correcto. */
export function categoryAndPriceOf(
  vehicle: { category: 'remis' | 'socio'; enabled: boolean; pin: string | null } | null,
  machine: { priceRemisArs: number; priceSocioArs: number; priceExternoArs: number },
  providedPin?: string,
): { category: PlateCategory; priceArs: number } {
  const eligible = vehicle && vehicle.enabled && pinOk(vehicle, providedPin);
  if (eligible && vehicle.category === 'remis') {
    return { category: 'remis', priceArs: machine.priceRemisArs };
  }
  if (eligible && vehicle.category === 'socio') {
    return { category: 'socio', priceArs: machine.priceSocioArs };
  }
  return { category: 'externo', priceArs: machine.priceExternoArs };
}

/** Cotización SIN cobrar: el usuario ve su tarifa antes de pagar. */
export async function quotePlate(
  deps: MachineDeps,
  machineId: string,
  plate: string,
  pin?: string,
): Promise<PlateQuote> {
  const machine = await getMachine(deps.db, machineId);
  if (!machine) throw new AppError('MACHINE_NOT_FOUND', `Máquina no encontrada: ${machineId}`);
  if (!machine.enabled || machine.status === 'DISABLED') {
    throw new AppError('MACHINE_DISABLED', 'La máquina está deshabilitada por administración.');
  }
  const vehicle = await getVehicleByPlate(deps.db, plate);
  const { category, priceArs } = categoryAndPriceOf(vehicle, machine, pin);
  const limit = await getDailyWashLimit(deps.db, deps.config);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const used = await countWashesToday(deps.db, plate, today);
  return {
    plate,
    category,
    categoryLabel: PLATE_CATEGORY_LABELS[category],
    priceArs,
    limit,
    remainingToday: Math.max(0, limit - used),
  };
}

/**
 * Verificación previa al cobro. Debe llamarse DENTRO de la transacción con la fila
 * de máquina bloqueada (FOR UPDATE) para evitar carreras con otra creación de sesión.
 */
export async function assertMachinePayable(deps: MachineDeps, machineId: string): Promise<void> {
  const machine = await getMachineForUpdate(deps.db, machineId);
  if (!machine) throw new AppError('MACHINE_NOT_FOUND', `Máquina no encontrada: ${machineId}`);
  if (!machine.enabled || machine.status === 'DISABLED') {
    throw new AppError('MACHINE_DISABLED', 'La máquina está deshabilitada por administración.');
  }
  if (machine.status !== 'ONLINE') {
    throw new AppError(
      'MACHINE_OFFLINE',
      'Máquina temporalmente fuera de servicio. No se realizó ningún cobro.',
      { machineId, machineStatus: machine.status },
    );
  }
  const active = await getActiveSessionForMachine(deps.db, machineId);
  if (active) {
    throw new AppError('MACHINE_BUSY', 'La máquina está en uso por otro cliente. No se realizó ningún cobro.', {
      machineId,
      activeSessionId: active.id,
    });
  }
}

export interface AdminMachinePatch {
  name?: string;
  description?: string | null;
  priceRemisArs?: number;
  priceSocioArs?: number;
  priceExternoArs?: number;
  durationSeconds?: number;
  enabled?: boolean;
}

export async function updateMachineFromAdmin(deps: MachineDeps, machineId: string, patch: AdminMachinePatch, actor: string) {
  const machine = await getMachine(deps.db, machineId);
  if (!machine) throw new AppError('MACHINE_NOT_FOUND', `Máquina no encontrada: ${machineId}`);

  const active = await getActiveSessionForMachine(deps.db, machineId);
  const running = active !== null && active.status !== 'PAYMENT_PENDING' && active.status !== 'IDLE';

  const critical =
    patch.priceRemisArs !== undefined ||
    patch.priceSocioArs !== undefined ||
    patch.priceExternoArs !== undefined ||
    patch.durationSeconds !== undefined ||
    patch.enabled === false;
  if (running && critical) {
    throw new AppError(
      'SETTINGS_LOCKED_WHILE_RUNNING',
      'No se pueden cambiar parámetros críticos con una sesión activa. Usá DETENER MÁQUINA (parada de emergencia) primero.',
      { machineId, activeSessionId: active?.id },
    );
  }

  const updated = await updateMachine(deps.db, machineId, { ...patch });
  if (!updated) throw new AppError('MACHINE_NOT_FOUND', `Máquina no encontrada: ${machineId}`);
  await insertAudit(deps.db, {
    actor,
    action: patch.enabled === true ? 'MACHINE_ENABLED' : patch.enabled === false ? 'MACHINE_DISABLED' : 'SETTINGS_UPDATED',
    entity: 'machine',
    entityId: machineId,
    metadata: { patch },
  });
  return updated;
}

/** Recalcula ONLINE/DEGRADED/OFFLINE de cada máquina según el último heartbeat. */
export async function recomputeMachineStatuses(deps: MachineDeps, now: Date): Promise<void> {
  const machines = await listMachines(deps.db);
  for (const m of machines) {
    const device = await getDeviceByMachine(deps.db, m.id);
    if (!device) continue;
    let next: MachineStatus;
    if (!m.enabled) next = 'DISABLED';
    else next = deriveStatusFromHeartbeat(device.lastHeartbeatAt, now, deps.config.deviceOnlineThresholdMs, deps.config.deviceDegradedThresholdMs);
    if (next !== m.status) {
      await updateMachine(deps.db, m.id, { status: next });
      await insertAudit(deps.db, {
        actor: 'system',
        action: next === 'ONLINE' ? 'DEVICE_ONLINE' : next === 'OFFLINE' ? 'DEVICE_OFFLINE' : 'DEVICE_DEGRADED',
        entity: 'machine',
        entityId: m.id,
        metadata: { previous: m.status, next },
      });
    }
    if (next === 'OFFLINE' && device.status !== 'OFFLINE') {
      await updateDevice(deps.db, device.id, { status: 'OFFLINE' });
    }
  }
}

export async function lastSessionsForMachine(deps: MachineDeps, machineId: string, limit = 5) {
  return deps.db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.machineId, machineId))
    .orderBy(desc(sessionsTable.createdAt))
    .limit(limit);
}
