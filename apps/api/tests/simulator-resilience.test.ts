import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { deviceEvents } from '../src/db/schema.js';
import {
  createTestApp,
  payAndAuthorize,
  sessionStatus,
  waitSessionStatus,
  waitFor,
  type TestCtx,
} from './helpers.js';

let t: TestCtx;

describe('resiliencia del dispositivo (fallas y recuperación segura)', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('internet cae ANTES de arrancar -> el pulsador NO enciende el relay', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.action('HIDRO-01', 'internet_cut');
    const press = await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(press.ok).toBe(false);
    expect(press.reason).toBe('backend_unreachable');
    expect(await sessionStatus(t, sessionId)).toBe('WAITING_FOR_BUTTON');
    const machine = await t.machineInfo('HIDRO-01');
    expect(machine.relayState).toBe(false);
    // al restaurarse internet, el pulsador sí arranca
    await t.ctx.simulator!.action('HIDRO-01', 'internet_restore');
    const press2 = await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(press2.ok).toBe(true);
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');
  });

  it('internet cae DURANTE el lavado -> el timer local completa y corta igual', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');
    await t.ctx.simulator!.action('HIDRO-01', 'internet_cut');
    // El timer local (3s con factor 60) corta el relay aunque no haya internet
    await waitFor(async () => {
      const snap = await t.ctx.simulator!.snapshot('HIDRO-01');
      return snap.relayState === false && snap.state === 'IDLE';
    }, { timeoutMs: 8000, label: 'timer local completado' });
    // El backend todavía no sabe (sin internet) -> RUNNING hasta que se restablezca
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');
    await t.ctx.simulator!.action('HIDRO-01', 'internet_restore');
    await waitSessionStatus(t, sessionId, 'FINISHED', 8000);
  });

  it('ESP32 se reinicia durante el ciclo -> reanuda de forma segura y termina', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');
    await new Promise((r) => setTimeout(r, 500));
    await t.ctx.simulator!.action('HIDRO-01', 'reboot');
    const snap = await t.ctx.simulator!.snapshot('HIDRO-01');
    expect(snap.state).toBe('RUNNING'); // reanudó desde NVS
    expect(snap.relayState).toBe(true);
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');
    await waitSessionStatus(t, sessionId, 'FINISHED', 8000);
  });

  it('corte eléctrico durante el ciclo -> relay OFF + SESSION_INTERRUPTED (seguridad primero)', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');
    await new Promise((r) => setTimeout(r, 500));
    await t.ctx.simulator!.action('HIDRO-01', 'power_cut');
    await waitSessionStatus(t, sessionId, 'SESSION_INTERRUPTED', 8000);
    const snap = await t.ctx.simulator!.snapshot('HIDRO-01');
    expect(snap.relayState).toBe(false);
    const res = await t.api.get(`/api/public/sessions/${sessionId}`).expect(200);
    expect(res.body.session.interruptionReason).toContain('power_cut');
  });

  it('error de dispositivo durante el ciclo -> relay OFF + DEVICE_ERROR', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');
    await t.ctx.simulator!.action('HIDRO-01', 'device_error');
    await waitSessionStatus(t, sessionId, 'DEVICE_ERROR', 8000);
    const snap = await t.ctx.simulator!.snapshot('HIDRO-01');
    expect(snap.relayState).toBe(false);
    expect(snap.ledState).toBe('RED');
  });

  it('emergency stop desde admin durante RUNNING -> relay OFF + EMERGENCY_STOP + comando entregado', async () => {
    t = await createTestApp();
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');
    const { adminToken } = await import('./helpers.js');
    const token = await adminToken(t);
    const res = await t.api
      .post('/api/admin/machines/HIDRO-01/emergency-stop')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmation: 'DETENER', reason: 'prueba' })
      .expect(200);
    expect(res.body.sessionId).toBe(sessionId);
    expect(await sessionStatus(t, sessionId)).toBe('EMERGENCY_STOP');
    // el comando viaja al ESP32 por el próximo heartbeat (<= 500ms en tests)
    await waitFor(async () => {
      const snap = await t.ctx.simulator!.snapshot('HIDRO-01');
      return snap.relayState === false;
    }, { timeoutMs: 5000, label: 'relay OFF tras emergency stop' });
    // el simulador acusa el comando en su próximo heartbeat
    await waitFor(async () => {
      const { pendingCommandsForMachine } = await import('../src/repositories/repos.js');
      const pending = await pendingCommandsForMachine(t.ctx.db, 'HIDRO-01');
      return pending.length === 0 ? true : false;
    }, { timeoutMs: 8000, label: 'command delivered' });
    const events = await t.ctx.db.select().from(deviceEvents).where(eq(deviceEvents.type, 'EMERGENCY_STOP'));
    expect(events.length).toBeGreaterThan(0);
  });
});
