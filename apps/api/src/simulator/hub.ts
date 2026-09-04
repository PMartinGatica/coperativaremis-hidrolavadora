import { AppError, type SimulatorAction, type SimulatorSnapshot } from '@hidro/shared';
import type { AppContext } from '../context.js';
import { getDeviceByMachine, listMachines } from '../repositories/repos.js';
import { loadDeviceSecret } from '../db/seed.js';
import { SimDevice } from './simDevice.js';
import { createLogger } from '../logger.js';

const log = createLogger('simulator');

/**
 * Hub del simulador: un SimDevice por máquina con dispositivo registrado.
 * Tick global de 250ms — réplica de los loops del firmware.
 */
export class SimulatorHub {
  private devices = new Map<string, SimDevice>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private ctx: AppContext) {}

  async start(): Promise<void> {
    const machines = await listMachines(this.ctx.db);
    for (const m of machines) {
      const device = await getDeviceByMachine(this.ctx.db, m.id);
      if (!device) continue;
      const secret = await loadDeviceSecret(m.id, this.ctx.config.dataDir);
      if (!secret) {
        log.warn('simulador sin secret de dispositivo', { machineId: m.id });
        continue;
      }
      const sim = new SimDevice(this.ctx, m.id, device, secret, this.ctx.config.dataDir);
      await sim.boot();
      this.devices.set(m.id, sim);
      log.info('simulator device started', { machineId: m.id, device: device.deviceIdentifier });
    }
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const sim of this.devices.values()) void sim.tick(now);
    }, 250);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  has(machineId: string): boolean {
    return this.devices.has(machineId);
  }

  get(machineId: string): SimDevice {
    const sim = this.devices.get(machineId);
    if (!sim) throw new AppError('SIMULATOR_DISABLED', `Sin simulador para ${machineId} (¿DEVICE_SIMULATOR=true?).`);
    return sim;
  }

  async snapshot(machineId: string): Promise<SimulatorSnapshot> {
    return this.get(machineId).snapshot();
  }

  snapshotAll(): SimulatorSnapshot[] {
    return [...this.devices.values()].map((s) => s.snapshot());
  }

  async action(machineId: string, action: SimulatorAction): Promise<SimulatorSnapshot> {
    const sim = this.get(machineId);
    const snap = await sim.action(action);
    log.info('simulator action', { machineId, action });
    return snap;
  }

  /** Solo para tests: acceso programático al pulsador. */
  async pressButton(machineId: string): Promise<{ ok: boolean; reason: string }> {
    return this.get(machineId).pressButton();
  }
}
