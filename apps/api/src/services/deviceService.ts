import { AppError } from '@hidro/shared';
import type {
  AuthorizationDto,
  DeviceAuthResponse,
  DeviceEventPayload,
  DeviceRow,
  HeartbeatPayload,
  SessionFinishPayload,
  SessionInterruptedPayload,
  SessionStartPayload,
} from '@hidro/shared';
import type { Db } from '../db/client.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import {
  ackCommand,
  getActiveAuthorizationForMachine,
  getActiveSessionForMachine,
  getAuthorizationByIdForUpdate,
  getDeviceByMachine,
  getMachine,
  getSession,
  getSessionForUpdate,
  insertAudit,
  insertCommand,
  insertDeviceEvent,
  pendingCommandsForMachine,
  revokeAuthorizationsForMachine,
  setAuthorizationStatus,
  updateDevice,
} from '../repositories/repos.js';
import { updateMachine as updateMachineRepo } from './machineService.js';
import { finishSession as finishSessionDomain, interruptSession as interruptSessionDomain } from './sessionService.js';
import { transitionSession } from './transition.js';
import { getHeartbeatIntervalMs } from './settingsService.js';

export interface DeviceDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
}

const lastPersistedEvent = new Map<string, Date>(); // machineId -> última inserción de heartbeat

export async function registerHeartbeat(deps: DeviceDeps, device: DeviceRow, payload: HeartbeatPayload): Promise<DeviceAuthResponse> {
  const { db } = deps;
  const now = new Date();
  const deviceStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' =
    payload.status === 'ERROR' ? 'DEGRADED' : (payload.status === 'DEGRADED' ? 'DEGRADED' : 'ONLINE');

  const relayChanged = device.lastRelayState !== payload.relay_state;
  const sessionChanged = device.currentSessionId !== payload.current_session_id;

  await updateDevice(db, device.id, {
    lastHeartbeatAt: now,
    status: deviceStatus,
    firmwareVersion: payload.firmware_version,
    lastRelayState: payload.relay_state,
    lastWifiRssi: payload.wifi_rssi,
    lastUptime: payload.uptime,
    currentSessionId: payload.current_session_id,
  });

  // Estado derivado de máquina: ONLINE / DEGRADED / OFFLINE según heartbeat
  const machine = await getMachine(db, payload.machine_id);
  if (machine && machine.enabled) {
    const next: 'ONLINE' | 'DEGRADED' = payload.status === 'ERROR' || payload.status === 'DEGRADED' ? 'DEGRADED' : 'ONLINE';
    if (machine.status !== next) {
      await updateMachineRepo(db, machine.id, { status: next });
      await insertAudit(db, {
        actor: 'device',
        action: next === 'ONLINE' ? 'DEVICE_ONLINE' : 'DEVICE_DEGRADED',
        entity: 'machine',
        entityId: machine.id,
        metadata: { previous: machine.status, rssi: payload.wifi_rssi },
      });
    }
  }

  // Eventos persistidos con throttle (heartbeat 1/min salvo cambios)
  const key = payload.machine_id;
  const lastAt = lastPersistedEvent.get(key);
  if (relayChanged || sessionChanged || deviceStatus !== device.status || !lastAt || now.getTime() - lastAt.getTime() > 60_000) {
    lastPersistedEvent.set(key, now);
    await insertDeviceEvent(db, {
      machineId: payload.machine_id,
      deviceId: device.id,
      sessionId: payload.current_session_id,
      type: 'HEARTBEAT',
      payload: { rssi: payload.wifi_rssi, uptime: payload.uptime, relay: payload.relay_state, firmware: payload.firmware_version },
    });
  }
  if (relayChanged) {
    await insertDeviceEvent(db, {
      machineId: payload.machine_id,
      deviceId: device.id,
      sessionId: payload.current_session_id,
      type: payload.relay_state ? 'RELAY_ON' : 'RELAY_OFF',
      payload: { source: 'heartbeat' },
    });
  }

  const commands = await pendingCommandsForMachine(db, payload.machine_id);
  return {
    device_id: device.id,
    machine_id: payload.machine_id,
    server_time: now.getTime(),
    commands: commands.map((c) => ({ id: c.id, type: c.type as 'EMERGENCY_STOP', payload: c.payload })),
    heartbeat_interval_ms: await getHeartbeatIntervalMs(db, deps.config),
  };
}

/** GET /api/device/authorization — el ESP32 pregunta si tiene autorización pendiente. */
export async function getAuthorizationForDevice(deps: DeviceDeps, device: DeviceRow): Promise<{ authorization: AuthorizationDto | null; server_time: number }> {
  const { db } = deps;
  const now = new Date();
  const auth = await getActiveAuthorizationForMachine(db, device.machineId, now);
  if (!auth) {
    return { authorization: null, server_time: now.getTime() };
  }
  const session = await getSession(db, auth.sessionId);
  if (!session) {
    return { authorization: null, server_time: now.getTime() };
  }
  if (session.status === 'AUTHORIZED') {
    // Primera entrega: la máquina quedó habilitada y esperando el pulsador.
    await transitionSession(db, session.id, 'AUTHORIZED', 'WAITING_FOR_BUTTON');
    await insertDeviceEvent(db, {
      machineId: device.machineId,
      deviceId: device.id,
      sessionId: session.id,
      type: 'AUTHORIZATION_FETCHED',
    });
  }
  return {
    authorization: {
      authorization_id: auth.id,
      session_id: auth.sessionId,
      machine_id: auth.machineId,
      duration_seconds: session.durationSeconds,
      expires_at: auth.expiresAt.toISOString(),
      status: auth.status,
    },
    server_time: now.getTime(),
  };
}

/**
 * POST /api/device/session/start — pulsador presionado.
 * SOLO arranca si la autorización es válida, no vencida, no consumida y de esta máquina.
 * El consumo de la autorización es atómico: doble pulsación nunca genera dos ciclos.
 * Los intentos inválidos se registran FUERA de la transacción (no se revierten con el error).
 */
export async function startSessionFromDevice(deps: DeviceDeps, device: DeviceRow, payload: SessionStartPayload) {
  const { db } = deps;
  try {
    return await db.transaction(async (tx) => {
      const session = await getSessionForUpdate(tx, payload.session_id);

      if (!session) {
        throw new AppError('SESSION_NOT_FOUND', 'No hay sesión para esta máquina.', { pressReason: 'session_not_found' });
      }
      if (session.machineId !== device.machineId) {
        throw new AppError('AUTH_WRONG_MACHINE', 'La sesión no pertenece a esta máquina.', { pressReason: 'wrong_machine' });
      }

      const auth = payload.authorization_id
        ? await getAuthorizationByIdForUpdate(tx, payload.authorization_id)
        : null;

      if (!auth || auth.sessionId !== session.id) {
        throw new AppError('AUTH_NOT_FOUND', 'Sin autorización válida para esta sesión.', { pressReason: 'authorization_missing' });
      }
      if (auth.status === 'CONSUMED') {
        throw new AppError('AUTH_CONSUMED', 'La autorización ya fue utilizada. Doble pulsación ignorada.', { pressReason: 'already_consumed' });
      }
      if (auth.status === 'REVOKED') {
        throw new AppError('AUTH_REVOKED', 'La autorización fue revocada (parada de emergencia).', { pressReason: 'revoked' });
      }
      if (auth.status === 'EXPIRED' || auth.expiresAt.getTime() <= Date.now()) {
        await setAuthorizationStatus(tx, auth.id, 'EXPIRED');
        if (session.status === 'AUTHORIZED' || session.status === 'WAITING_FOR_BUTTON') {
          await transitionSession(tx, session.id, session.status, 'AUTHORIZATION_EXPIRED');
        }
        throw new AppError('AUTH_EXPIRED', 'La autorización venció. Volvé a pagar para habilitar la máquina.', { pressReason: 'expired' });
      }
      if (session.status === 'RUNNING') {
        throw new AppError('SESSION_ALREADY_RUNNING', 'El ciclo ya está en curso. Doble pulsación ignorada.', { pressReason: 'already_running' });
      }
      if (session.status !== 'WAITING_FOR_BUTTON') {
        throw new AppError('INVALID_TRANSITION', `La sesión no está esperando el pulsador (${session.status}).`, { pressReason: `invalid_status_${session.status}` });
      }

      // ---- Consumo atómico: AUTH CONSUMED + sesión RUNNING ----
      await setAuthorizationStatus(tx, auth.id, 'CONSUMED', { consumedAt: new Date() });
      const startedAt = new Date();
      await transitionSession(tx, session.id, 'WAITING_FOR_BUTTON', 'RUNNING', { startedAt });
      await insertDeviceEvent(tx, {
        machineId: device.machineId,
        deviceId: device.id,
        sessionId: session.id,
        type: 'BUTTON_PRESSED',
        payload: { authorizationId: auth.id },
      });
      await insertDeviceEvent(tx, {
        machineId: device.machineId,
        deviceId: device.id,
        sessionId: session.id,
        type: 'RELAY_ON',
      });
      await insertDeviceEvent(tx, {
        machineId: device.machineId,
        deviceId: device.id,
        sessionId: session.id,
        type: 'SESSION_STARTED',
        payload: { durationSeconds: session.durationSeconds },
      });
      await insertAudit(tx, {
        actor: 'device',
        action: 'AUTH_CONSUMED',
        entity: 'authorization',
        entityId: auth.id,
        metadata: { sessionId: session.id, machineId: device.machineId },
      });
      await insertAudit(tx, {
        actor: 'device',
        action: 'RELAY_ON',
        entity: 'session',
        entityId: session.id,
        metadata: { sessionId: session.id, machineId: device.machineId },
      });

      return {
        ok: true,
        session_id: session.id,
        duration_seconds: session.durationSeconds,
        started_at: startedAt.toISOString(),
      };
    });
  } catch (err) {
    // El intento se registra aunque la transacción haya hecho rollback:
    // trazabilidad de dobles pulsaciones y pulsadores sin autorización.
    if (err instanceof AppError && typeof err.details?.pressReason === 'string') {
      await insertDeviceEvent(db, {
        machineId: device.machineId,
        deviceId: device.id,
        sessionId: payload.session_id,
        type: 'BUTTON_PRESSED_WITHOUT_AUTH',
        payload: { reason: err.details.pressReason },
      });
    }
    throw err;
  }
}

export async function finishSessionFromDevice(deps: DeviceDeps, device: DeviceRow, payload: SessionFinishPayload) {
  const session = await getSession(deps.db, payload.session_id);
  if (!session) throw new AppError('SESSION_NOT_FOUND', `Sesión no encontrada: ${payload.session_id}`);
  if (session.machineId !== device.machineId) {
    throw new AppError('AUTH_WRONG_MACHINE', 'La sesión no pertenece a esta máquina.', { sessionId: session.id });
  }
  await insertDeviceEvent(deps.db, {
    machineId: device.machineId,
    deviceId: device.id,
    sessionId: session.id,
    type: 'RELAY_OFF',
    payload: { source: 'timer_completed' },
  });
  const res = await finishSessionDomain({ db: deps.db, logger: deps.logger }, payload.machine_id, payload.session_id, payload.duration_seconds);
  return { ok: res.ok, status: 'FINISHED' };
}

export async function interruptSessionFromDevice(deps: DeviceDeps, device: DeviceRow, payload: SessionInterruptedPayload) {
  const session = await getSession(deps.db, payload.session_id);
  if (!session) throw new AppError('SESSION_NOT_FOUND', `Sesión no encontrada: ${payload.session_id}`);
  if (session.machineId !== device.machineId) {
    throw new AppError('AUTH_WRONG_MACHINE', 'La sesión no pertenece a esta máquina.', { sessionId: session.id });
  }
  await insertDeviceEvent(deps.db, {
    machineId: device.machineId,
    deviceId: device.id,
    sessionId: session.id,
    type: 'RELAY_OFF',
    payload: { source: payload.reason },
  });
  const res = await interruptSessionDomain({ db: deps.db, logger: deps.logger }, payload.machine_id, payload.session_id, payload.reason);
  return { ok: res.ok, status: res.status };
}

export async function recordDeviceEvent(deps: DeviceDeps, device: DeviceRow, payload: DeviceEventPayload) {
  await insertDeviceEvent(deps.db, {
    machineId: device.machineId,
    deviceId: device.id,
    sessionId: payload.session_id,
    type: payload.type as never,
    payload: payload.data ?? null,
  });
  if (payload.type === 'EMERGENCY_STOP') {
    // El dispositivo ejecutó la orden: marcar comandos como entregados.
    const pending = await pendingCommandsForMachine(deps.db, device.machineId);
    for (const cmd of pending) {
      if (cmd.type === 'EMERGENCY_STOP') await ackCommand(deps.db, cmd.id, device.id);
    }
    await insertAudit(deps.db, {
      actor: 'device',
      action: 'EMERGENCY_STOP_EXECUTED',
      entity: 'machine',
      entityId: device.machineId,
      metadata: { sessionId: payload.session_id, deviceId: device.id },
    });
  }
  return { ok: true };
}

export async function acknowledgeCommand(deps: DeviceDeps, device: DeviceRow, commandId: string) {
  const row = await ackCommand(deps.db, commandId, device.id);
  if (!row) throw new AppError('BAD_REQUEST', 'Comando no encontrado para este dispositivo.');
  return { ok: true };
}

/** DETENER MÁQUINA desde administración: orden al dispositivo + sesión EMERGENCY_STOP. */
export async function emergencyStopFromAdmin(deps: DeviceDeps, machineId: string, actor: string, reason?: string) {
  const { db } = deps;
  return db.transaction(async (tx) => {
    const machine = await getMachine(tx, machineId);
    if (!machine) throw new AppError('MACHINE_NOT_FOUND', `Máquina no encontrada: ${machineId}`);
    const device = await getDeviceByMachine(tx, machineId);
    const active = await getActiveSessionForMachine(tx, machineId);

    if (active && ['AUTHORIZED', 'WAITING_FOR_BUTTON', 'RUNNING'].includes(active.status)) {
      await transitionSession(tx, active.id, active.status as never, 'EMERGENCY_STOP', {
        finishedAt: new Date(),
        interruptionReason: reason ?? 'admin_emergency_stop',
      });
    }
    await revokeAuthorizationsForMachine(tx, machineId);

    let commandId: string | null = null;
    if (device) {
      const cmd = await insertCommand(tx, {
        deviceId: device.id,
        machineId,
        type: 'EMERGENCY_STOP',
        payload: { reason: reason ?? 'admin_emergency_stop', actor },
      });
      commandId = cmd.id;
    }
    await insertAudit(tx, {
      actor,
      action: 'EMERGENCY_STOP',
      entity: 'machine',
      entityId: machineId,
      metadata: { sessionId: active?.id ?? null, reason: reason ?? null, commandId },
    });
    return { ok: true, commandId, sessionId: active?.id ?? null };
  });
}

export async function getDeviceForMachine(deps: DeviceDeps, machineId: string): Promise<DeviceRow | null> {
  return getDeviceByMachine(deps.db, machineId);
}
