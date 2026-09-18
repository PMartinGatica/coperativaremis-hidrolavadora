import fs from 'node:fs';
import path from 'node:path';
import { AppError, type DeviceRow, type SimulatorAction, type SimulatorSnapshot } from '@hidro/shared';
import type { AppContext } from '../context.js';
import { getDeviceByIdentifier } from '../repositories/repos.js';
import { loadDeviceSecret } from '../db/seed.js';
import { createLogger, type Logger } from '../logger.js';
import {
  finishSessionFromDevice,
  getAuthorizationForDevice,
  interruptSessionFromDevice,
  recordDeviceEvent,
  registerHeartbeat,
  startSessionFromDevice,
  acknowledgeCommand,
} from '../services/deviceService.js';

const log = createLogger('sim');

type SimState = 'BOOT' | 'OFFLINE' | 'IDLE' | 'ARMED' | 'RUNNING' | 'ERROR';

interface NvsRecord {
  machineId: string;
  state: 'RUNNING';
  sessionId: string;
  authorizationId: string;
  durationSeconds: number;
  deadlineMs: number;
  scale: number;
  lastTickMs: number;
}

type QueuedItem =
  | { kind: 'event'; type: string; payload: Record<string, unknown> | null; retries: number }
  | { kind: 'finish'; sessionId: string; durationSeconds: number; retries: number }
  | { kind: 'interrupted'; sessionId: string; reason: string; retries: number };

const REBOOT_RESUME_MAX_GAP_MS = 5000;

/**
 * SIMULADOR DE ESP32 (DEMO MODE). Réplica fiel del firmware:
 * heartbeat periódico, polling de autorización, LED, pulsador, relay, timer LOCAL
 * (independiente del backend), persistencia tipo NVS y fail-safe (relay OFF al boot).
 * Todas las decisiones de seguridad replican docs/device-protocol.md.
 */
export class SimDevice {
  readonly machineId: string;
  readonly deviceIdentifier: string;
  private secret: string;
  wifiConnected = true;
  backendReachable = true;
  state: SimState = 'BOOT';
  relayState = false;
  private auth: { authorizationId: string; sessionId: string; durationSeconds: number; expiresAtMs: number } | null = null;
  private runningSessionId: string | null = null;
  private deadlineMs: number | null = null;
  private durationSeconds = 0;
  private scale = 1;
  private bootedAtMs = Date.now();
  private lastHeartbeatMs = 0;
  private lastAuthPollMs = 0;
  private lastNvsPersistMs = 0;
  private queue: QueuedItem[] = [];
  private nvsPath: string;
  lastError: string | null = null;
  private logger: Logger;

  constructor(
    private ctx: AppContext,
    machineId: string,
    device: DeviceRow,
    secret: string,
    nvsDir: string,
  ) {
    this.machineId = machineId;
    this.deviceIdentifier = device.deviceIdentifier;
    this.secret = secret;
    this.nvsPath = path.join(nvsDir, `${machineId}.json`);
    this.logger = log.child({ machineId, deviceId: device.deviceIdentifier });
  }

  ledState(): 'OFF' | 'GREEN' | 'GREEN_BLINK' | 'RED' {
    if (this.state === 'ERROR' || !this.wifiConnected) return 'RED';
    if (this.state === 'RUNNING') return 'GREEN_BLINK';
    if (this.state === 'ARMED') return 'GREEN';
    return 'OFF';
  }

  private loadNvs(): NvsRecord | null {
    try {
      const raw = fs.readFileSync(this.nvsPath, 'utf8');
      return JSON.parse(raw) as NvsRecord;
    } catch {
      return null;
    }
  }

  private persistNvs(nowMs: number): void {
    if (!this.deadlineMs || !this.auth) return;
    const record: NvsRecord = {
      machineId: this.machineId,
      state: 'RUNNING',
      sessionId: this.auth.sessionId,
      authorizationId: this.auth.authorizationId,
      durationSeconds: this.durationSeconds,
      deadlineMs: this.deadlineMs,
      scale: 1,
      lastTickMs: nowMs,
    };
    try {
      fs.mkdirSync(path.dirname(this.nvsPath), { recursive: true });
      fs.writeFileSync(this.nvsPath, JSON.stringify(record));
    } catch (err) {
      this.logger.warn('nvs persist failed', { err: String(err) });
    }
  }

  private clearNvs(): void {
    try {
      fs.unlinkSync(this.nvsPath);
    } catch {
      /* no existe */
    }
  }

  /** Arranque estilo ESP32: relay SIEMPRE off; recuperación desde NVS si es confiable. */
  async boot(forcedGapMs?: number): Promise<void> {
    this.relayState = false; // FAIL-SAFE: relay OFF en boot (incluye watchdog reset)
    const nvs = this.loadNvs();
    this.queueEvent('DEVICE_REBOOT', { resumed: false });
    if (nvs && nvs.state === 'RUNNING') {
      const gap = forcedGapMs ?? Date.now() - nvs.lastTickMs;
      const remaining = nvs.deadlineMs - Date.now();
      if (gap < REBOOT_RESUME_MAX_GAP_MS && remaining > 0) {
        // reinicio muy corto y tiempo reconstruible: reanudar el ciclo
        this.state = 'RUNNING';
        this.relayState = true;
        this.runningSessionId = nvs.sessionId;
        this.deadlineMs = nvs.deadlineMs;
        this.durationSeconds = nvs.durationSeconds;
        this.auth = {
          authorizationId: nvs.authorizationId,
          sessionId: nvs.sessionId,
          durationSeconds: nvs.durationSeconds,
          expiresAtMs: 0,
        };
        this.queueEvent('DEVICE_REBOOT', { resumed: true, remainingMs: Math.round(remaining) });
      } else {
        // corte eléctrico o estado no reconstruible: SEGURIDAD PRIMERO -> interrumpido
        this.state = 'IDLE';
        this.queueInterrupted(nvs.sessionId, gap >= REBOOT_RESUME_MAX_GAP_MS ? 'power_cut_during_session' : 'reboot_unreliable');
        this.clearNvs();
      }
    } else {
      this.state = 'IDLE';
    }
    this.bootedAtMs = Date.now();
    this.lastError = null;
  }

  private queueEvent(type: string, payload: Record<string, unknown> | null): void {
    this.queue.push({ kind: 'event', type, payload, retries: 0 });
  }

  private queueInterrupted(sessionId: string, reason: string): void {
    this.queue.push({ kind: 'interrupted', sessionId, reason, retries: 0 });
  }

  private queueFinish(sessionId: string, durationSeconds: number): void {
    this.queue.push({ kind: 'finish', sessionId, durationSeconds, retries: 0 });
  }

  private async deviceRow(): Promise<DeviceRow | null> {
    return getDeviceByIdentifier(this.ctx.db, this.deviceIdentifier);
  }

  private async reloadSecret(): Promise<void> {
    const s = await loadDeviceSecret(this.machineId, this.ctx.config.dataDir);
    if (s) this.secret = s;
  }

  private async doHeartbeat(): Promise<void> {
    try {
      const device = await this.deviceRow();
      if (!device) return;
      await this.reloadSecret();
      const resp = await registerHeartbeat(this.ctx, device, {
        machine_id: this.machineId,
        device_id: device.id,
        firmware_version: 'sim-1.0.0',
        status: this.state === 'ERROR' ? 'ERROR' : 'ONLINE',
        uptime: Math.floor((Date.now() - this.bootedAtMs) / 1000),
        current_session_id: this.state === 'RUNNING' ? this.runningSessionId : this.state === 'ARMED' ? (this.auth?.sessionId ?? null) : null,
        relay_state: this.relayState,
        wifi_rssi: this.wifiConnected ? -56 - Math.floor(Math.random() * 8) : -90,
        timestamp: Date.now(),
      });
      // comandos pendientes (EMERGENCY STOP tiene prioridad absoluta)
      for (const cmd of resp.commands) {
        if (cmd.type === 'EMERGENCY_STOP') {
          this.relayState = false;
          if (this.state === 'RUNNING' && this.runningSessionId) {
            this.queueInterrupted(this.runningSessionId, 'emergency_stop');
          }
          this.auth = null;
          this.runningSessionId = null;
          this.deadlineMs = null;
          this.state = 'IDLE';
          this.queueEvent('EMERGENCY_STOP', { commandId: cmd.id });
          await acknowledgeCommand(this.ctx, device, cmd.id);
        }
      }
      this.backendReachable = true;
      this.lastHeartbeatMs = Date.now();
    } catch (err) {
      this.backendReachable = false;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  private async pollAuthorization(): Promise<void> {
    try {
      const device = await this.deviceRow();
      if (!device) return;
      const { authorization } = await getAuthorizationForDevice(this.ctx, device, { simulated: true });
      if (authorization && authorization.status === 'AUTHORIZED') {
        this.auth = {
          authorizationId: authorization.authorization_id,
          sessionId: authorization.session_id,
          durationSeconds: authorization.duration_seconds,
          expiresAtMs: Date.parse(authorization.expires_at),
        };
        if (this.state === 'IDLE') this.state = 'ARMED';
      } else {
        if (this.state === 'ARMED') this.state = 'IDLE';
        this.auth = null;
      }
      this.backendReachable = true;
      this.lastAuthPollMs = Date.now();
    } catch {
      this.backendReachable = false;
    }
  }

  private async flushQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.queue[0] as QueuedItem;
      try {
        const device = await this.deviceRow();
        if (!device) {
          this.queue.shift();
          continue;
        }
        if (item.kind === 'event') {
          await recordDeviceEvent(this.ctx, device, {
            machine_id: this.machineId,
            session_id: null,
            type: item.type as never,
            data: item.payload ?? undefined,
          });
        } else if (item.kind === 'finish') {
          await finishSessionFromDevice(
            this.ctx,
            device,
            { machine_id: this.machineId, session_id: item.sessionId, reason: 'timer_completed', duration_seconds: item.durationSeconds },
          );
        } else {
          await interruptSessionFromDevice(
            this.ctx,
            device,
            { machine_id: this.machineId, session_id: item.sessionId, reason: item.reason },
          );
        }
        this.queue.shift();
      } catch (err) {
        item.retries += 1;
        if (item.retries > 3 || (err instanceof AppError && err.code !== 'INTERNAL')) {
          this.logger.warn('queued item dropped', { kind: item.kind, err: String(err) });
          this.queue.shift();
        } else {
          break;
        }
      }
    }
  }

  private completeWash(): void {
    const sessionId = this.runningSessionId;
    const duration = this.durationSeconds;
    this.relayState = false;
    this.auth = null;
    this.runningSessionId = null;
    this.deadlineMs = null;
    this.state = 'IDLE';
    this.clearNvs();
    if (sessionId) {
      if (this.wifiConnected && this.backendReachable) {
        void this.flushFinish(sessionId, duration);
      } else {
        this.queueFinish(sessionId, duration); // timer LOCAL cumplido aunque no haya internet
      }
    }
  }

  private async flushFinish(sessionId: string, durationSeconds: number): Promise<void> {
    try {
      const device = await this.deviceRow();
      if (device) {
        await finishSessionFromDevice(this.ctx, device, {
          machine_id: this.machineId,
          session_id: sessionId,
          reason: 'timer_completed',
          duration_seconds: durationSeconds,
        });
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  async tick(nowMs: number): Promise<void> {
    // Timer LOCAL: completa y corta aunque Internet desaparezca
    if (this.state === 'RUNNING' && this.deadlineMs !== null && nowMs >= this.deadlineMs) {
      this.completeWash();
    }
    if (this.state === 'ARMED' && this.auth && this.auth.expiresAtMs <= nowMs) {
      this.auth = null;
      this.state = 'IDLE'; // autorización vencida localmente: LED off
    }
    if (this.state === 'RUNNING' && nowMs - this.lastNvsPersistMs > 1000) {
      this.persistNvs(nowMs);
      this.lastNvsPersistMs = nowMs;
    }
    if (this.wifiConnected && this.backendReachable) {
      const hbInterval = this.ctx.config.heartbeatIntervalMs;
      if (nowMs - this.lastHeartbeatMs >= hbInterval) await this.doHeartbeat();
      if (nowMs - this.lastAuthPollMs >= 2000) await this.pollAuthorization();
      await this.flushQueue();
    }
  }

  /** Pulsador físico: SOLO actúa con autorización válida, no vencida, no consumida. */
  async pressButton(): Promise<{ ok: boolean; reason: string }> {
    if (this.state === 'ARMED' && this.auth) {
      if (!this.wifiConnected || !this.backendReachable) {
        // FAIL-SAFE: sin confirmación del backend NO se arranca el motor.
        this.queueEvent('BUTTON_PRESSED', { start_blocked: 'backend_unreachable' });
        return { ok: false, reason: 'backend_unreachable' };
      }
      try {
        const device = await this.deviceRow();
        if (!device) return { ok: false, reason: 'device_not_registered' };
        const scale = await this.ctx.getSpeedFactor();
        const res = await startSessionFromDevice(this.ctx, device, {
          machine_id: this.machineId,
          session_id: this.auth.sessionId,
          authorization_id: this.auth.authorizationId,
          relay_expected_state: true,
        });
        this.state = 'RUNNING';
        this.relayState = true;
        this.runningSessionId = res.session_id;
        this.durationSeconds = res.duration_seconds;
        this.scale = scale;
        this.deadlineMs = Date.now() + (res.duration_seconds * 1000) / scale;
        this.persistNvs(Date.now());
        return { ok: true, reason: 'started' };
      } catch (err) {
        if (err instanceof AppError && ['AUTH_EXPIRED', 'AUTH_CONSUMED', 'AUTH_REVOKED', 'AUTH_NOT_FOUND', 'INVALID_TRANSITION', 'SESSION_ALREADY_RUNNING'].includes(err.code)) {
          this.auth = null;
          this.state = 'IDLE';
        }
        this.lastError = err instanceof Error ? err.message : String(err);
        return { ok: false, reason: err instanceof AppError ? err.code : 'error' };
      }
    }
    // Sin autorización: el botón NO hace nada (se registra el intento)
    this.queueEvent('BUTTON_PRESSED_WITHOUT_AUTH', { reason: 'no_authorization' });
    return { ok: false, reason: 'no_authorization' };
  }

  async action(action: SimulatorAction): Promise<SimulatorSnapshot> {
    switch (action) {
      case 'press_button':
        await this.pressButton();
        break;
      case 'disconnect': // ESP32 apagado: relay off + sesión interrumpida
        this.wifiConnected = false;
        this.backendReachable = false;
        this.relayState = false;
        if (this.state === 'RUNNING' && this.runningSessionId) {
          this.queueInterrupted(this.runningSessionId, 'device_disconnected_during_session');
        }
        this.auth = null;
        this.runningSessionId = null;
        this.deadlineMs = null;
        this.state = 'OFFLINE';
        this.clearNvs();
        break;
      case 'reconnect':
        this.wifiConnected = true;
        this.backendReachable = true;
        await this.boot();
        break;
      case 'reboot':
        await this.boot(); // gap corto -> reanuda si es reconstruible
        break;
      case 'internet_cut':
        this.backendReachable = false;
        this.queueEvent('INTERNET_LOST', null);
        break;
      case 'internet_restore':
        this.backendReachable = true;
        this.queueEvent('INTERNET_RESTORED', null);
        break;
      case 'power_cut': // corte eléctrico: NVS no confiable -> interrupción segura
        this.relayState = false;
        await this.boot(REBOOT_RESUME_MAX_GAP_MS + 1);
        this.queueEvent('POWER_CUT', null);
        break;
      case 'device_error':
        this.relayState = false;
        if (this.state === 'RUNNING' && this.runningSessionId) {
          this.queueInterrupted(this.runningSessionId, 'device_error');
        }
        this.auth = null;
        this.runningSessionId = null;
        this.deadlineMs = null;
        this.state = 'ERROR';
        this.lastError = 'simulated device error';
        this.queueEvent('DEVICE_ERROR', { simulated: true });
        break;
      case 'clear_error':
        this.state = 'IDLE';
        this.lastError = null;
        break;
    }
    return this.snapshot();
  }

  snapshot(): SimulatorSnapshot {
    const timer = this.state === 'RUNNING' && this.deadlineMs !== null
      ? {
          running: true,
          durationSeconds: this.durationSeconds,
          remainingSeconds: Math.max(0, Math.round(((this.deadlineMs - Date.now()) / 1000) * this.scale)),
        }
      : null;
    return {
      machineId: this.machineId,
      running: this.state !== 'OFFLINE' && this.state !== 'BOOT',
      deviceId: this.deviceIdentifier,
      wifiConnected: this.wifiConnected,
      backendReachable: this.backendReachable,
      state: this.state,
      relayState: this.relayState,
      ledState: this.ledState(),
      authorizedSessionId: this.auth?.sessionId ?? null,
      authorizationExpiresAt: this.auth ? new Date(this.auth.expiresAtMs).toISOString() : null,
      timer,
      lastHeartbeatAt: this.lastHeartbeatMs > 0 ? new Date(this.lastHeartbeatMs).toISOString() : null,
      uptimeSeconds: Math.floor((Date.now() - this.bootedAtMs) / 1000),
      lastError: this.lastError,
      persistedNvs: this.loadNvs(),
      speedFactor: this.ctx.config.testSpeedFactor,
    };
  }
}
