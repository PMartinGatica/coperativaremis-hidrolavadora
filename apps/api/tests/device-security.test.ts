import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { deviceEvents, devices } from '../src/db/schema.js';
import { getAuthorizationForDevice } from '../src/services/deviceService.js';
import {
  createTestApp,
  deviceHeaders,
  DEVICE_IDS,
  payAndAuthorize,
  sessionStatus,
  waitMachineStatus,
  waitSessionStatus,
  type TestCtx,
} from './helpers.js';

let t: TestCtx;

describe('seguridad del protocolo de dispositivo', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('heartbeat sin firma válida -> 401 y máquina sigue OFFLINE', async () => {
    t = await createTestApp();
    const body = {
      machine_id: 'HIDRO-01',
      device_id: DEVICE_IDS['HIDRO-01'],
      firmware_version: '1.0.0',
      status: 'ONLINE',
      uptime: 10,
      current_session_id: null,
      relay_state: true,
      wifi_rssi: -50,
      timestamp: Date.now(),
    };
    await t.api.post('/api/device/heartbeat').send(body).expect(401);
    // firma calculada sobre OTRO body (manipulado) -> el servidor la rechaza
    const tampered = { ...body, relay_state: !body.relay_state };
    await t.api
      .post('/api/device/heartbeat')
      .set(deviceHeaders('HIDRO-01', 'POST', '/api/device/heartbeat', tampered))
      .send(body)
      .expect(401);
  });

  it('heartbeat autenticado correcto -> máquina ONLINE y relay reflejado', async () => {
    t = await createTestApp();
    const body = {
      machine_id: 'HIDRO-01',
      device_id: DEVICE_IDS['HIDRO-01'],
      firmware_version: '1.0.0',
      status: 'ONLINE',
      uptime: 10,
      current_session_id: null,
      relay_state: false,
      wifi_rssi: -56,
      timestamp: Date.now(),
    };
    const res = await t.api
      .post('/api/device/heartbeat')
      .set(deviceHeaders('HIDRO-01', 'POST', '/api/device/heartbeat', body))
      .send(body)
      .expect(200);
    expect(res.body.commands).toEqual([]);
    const machine = await t.machineInfo('HIDRO-01');
    expect(machine.status).toBe('ONLINE');
    expect(machine.relayState).toBe(false);
  });

  it('dispositivo no registrado -> 401', async () => {
    t = await createTestApp();
    await t.api
      .get('/api/device/authorization')
      .set({ 'x-device-id': 'ESP32-DESCONOCIDO', 'x-device-ts': String(Date.now()), 'x-device-sig': 'aaaa' })
      .expect(401);
  });

  it('botón sin pago -> relay NUNCA se activa (sesión inexistente)', async () => {
    t = await createTestApp();
    const body = {
      machine_id: 'HIDRO-01',
      session_id: 'HS-NOEXISTE',
      authorization_id: 'auth-noexiste',
      relay_expected_state: true,
    };
    await t.api
      .post('/api/device/session/start')
      .set(deviceHeaders('HIDRO-01', 'POST', '/api/device/session/start', body))
      .send(body)
      .expect(404);
    const machine = await t.machineInfo('HIDRO-01');
    expect(machine.relayState).toBe(false);
    const events = await t.ctx.db.select().from(deviceEvents).where(eq(deviceEvents.type, 'BUTTON_PRESSED_WITHOUT_AUTH'));
    expect(events.length).toBeGreaterThan(0);
  });

  it('autorización de HIDRO-01 NO funciona en HIDRO-02', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t, 'HIDRO-01');
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    // El dispositivo de HIDRO-02 intenta arrancar la sesión de HIDRO-01
    const body = {
      machine_id: 'HIDRO-02',
      session_id: sessionId,
      authorization_id: 'cualquiera',
      relay_expected_state: true,
    };
    await t.api
      .post('/api/device/session/start')
      .set(deviceHeaders('HIDRO-02', 'POST', '/api/device/session/start', body))
      .send(body)
      .expect(403);
    expect(await sessionStatus(t, sessionId)).toBe('WAITING_FOR_BUTTON');
    const machine = await t.machineInfo('HIDRO-02');
    expect(machine.relayState).toBe(false);
  });

  it('doble pulsación -> un solo ciclo (la 2da es rechazada)', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    const first = await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(first.ok).toBe(true);
    const second = await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(second.ok).toBe(false);
    const events = await t.ctx.db.select().from(deviceEvents).where(eq(deviceEvents.type, 'SESSION_STARTED'));
    expect(events.length).toBe(1);
  });

  it('en producción con pagos DEMO el dispositivo no recibe la autorización, salvo opt-in explícito', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    // Sin simulador consumiendo la autorización, la sesión queda AUTHORIZED para inspeccionarla.
    t.ctx.simulator?.stop();
    const { sessionId } = await payAndAuthorize(t);
    const [device] = await t.ctx.db.select().from(devices).where(eq(devices.machineId, 'HIDRO-01'));

    const prod = { ...t.ctx.config, nodeEnv: 'production' as const, paymentProvider: 'demo' as const };
    const withheld = await getAuthorizationForDevice({ ...t.ctx, config: prod }, device!);
    expect(withheld.authorization).toBeNull();
    expect(await sessionStatus(t, sessionId)).toBe('AUTHORIZED');

    const allowed = await getAuthorizationForDevice(
      { ...t.ctx, config: { ...prod, allowDemoPaymentsOnDevice: true } },
      device!,
    );
    expect(allowed.authorization?.session_id).toBe(sessionId);
  });
});
