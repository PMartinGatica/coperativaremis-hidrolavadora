import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, type AppConfig } from '../src/config.js';
import {
  createTestApp,
  deviceHeaders,
  DEVICE_SECRETS,
  payAndAuthorize,
  waitMachineStatus,
  waitSessionStatus,
  type TestCtx,
} from './helpers.js';

/**
 * MODO DEMO EN PRODUCCIÓN (ADR-047).
 * El dueño de la cooperativa tiene que poder recorrer el flujo entero desde la URL pública
 * sin un ESP32 físico. Lo que NO puede pasar: que esa misma variable le dé lavados gratis a
 * un ESP32 real, que escriba secrets en claro en el volumen, ni que conviva con plata real.
 */

const STRONG = {
  jwtSecret: 'j'.repeat(48),
  deviceAuthSecret: 'd'.repeat(48),
  adminPassword: 'clave-admin-larga-2026',
};

/** createTestApp() con configuración de PRODUCCIÓN válida + simulador prendido a propósito. */
function prodDemoConfig(): Partial<AppConfig> {
  return {
    nodeEnv: 'production',
    ...STRONG,
    deviceSimulator: true,
    paymentProvider: 'demo',
    seedOverrides: {
      deviceSecrets: DEVICE_SECRETS,
      adminEmail: 'admin@test.local',
      adminPassword: STRONG.adminPassword,
    },
  };
}

let t: TestCtx;

describe('modo demo en producción (ADR-047)', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('el simulador arranca sin devices.json: descifra el secret de la base', async () => {
    t = await createTestApp(prodDemoConfig());
    // Si el fallback no funcionara, el hub saltearía la máquina y nunca habría heartbeat.
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    // Y el secret en claro NO toca el disco en producción.
    expect(fs.existsSync(path.join(t.ctx.config.dataDir, 'devices.json'))).toBe(false);
  });

  it('flujo completo hasta RUNNING con la máquina simulada', async () => {
    t = await createTestApp(prodDemoConfig());
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');

    const machine = await t.machineInfo('HIDRO-01');
    expect(machine.simulatedDevice).toBe(true);
    expect(machine.availability).toBe('AVAILABLE');

    const { sessionId } = await payAndAuthorize(t);
    // El paso que antes quedaba colgado para siempre: la autorización llega al dispositivo.
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON');
    const press = await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(press.ok).toBe(true);
    await waitSessionStatus(t, sessionId, 'RUNNING');
  });

  it('un ESP32 REAL sigue sin recibir autorizaciones de pagos demo', async () => {
    t = await createTestApp(prodDemoConfig());
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON');

    // Mismo momento, misma autorización viva, pero pidiéndola por HTTP con HMAC (el único
    // camino de una placa física): se la niega igual que antes del modo demo.
    const url = '/api/device/authorization';
    const res = await t.api.get(url).set(deviceHeaders('HIDRO-01', 'GET', url)).expect(200);
    expect(res.body.authorization).toBeNull();
  });

});

// Sin fixture: son pruebas puras de configuración (no levantan app ni base).
describe('configuración del modo demo (ADR-047)', () => {
  it('simulador + Mercado Pago real: la API no arranca', () => {
    expect(() =>
      loadConfig({
        ...prodDemoConfig(),
        paymentProvider: 'mercadopago',
      }),
    ).toThrow(/DEVICE_SIMULATOR/);
  });

  it('en producción el simulador está apagado salvo variable explícita', () => {
    const touched = ['NODE_ENV', 'JWT_SECRET', 'DEVICE_AUTH_SECRET', 'ADMIN_PASSWORD', 'PAYMENT_PROVIDER', 'DEVICE_SIMULATOR'];
    const saved = new Map(touched.map((k) => [k, process.env[k]]));
    // loadConfig() lee el .env del cwd: desde apps/api ese archivo trae DEVICE_SIMULATOR=true
    // y taparía el default que justamente queremos probar.
    const cwd = process.cwd();
    try {
      process.chdir(os.tmpdir());
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = STRONG.jwtSecret;
      process.env.DEVICE_AUTH_SECRET = STRONG.deviceAuthSecret;
      process.env.ADMIN_PASSWORD = STRONG.adminPassword;
      process.env.PAYMENT_PROVIDER = 'demo';

      delete process.env.DEVICE_SIMULATOR;
      expect(loadConfig().deviceSimulator).toBe(false);

      process.env.DEVICE_SIMULATOR = 'false';
      expect(loadConfig().deviceSimulator).toBe(false);

      process.env.DEVICE_SIMULATOR = 'true';
      expect(loadConfig().deviceSimulator).toBe(true);
    } finally {
      process.chdir(cwd);
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
