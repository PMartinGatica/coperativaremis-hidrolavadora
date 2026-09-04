import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, adminToken, payAndAuthorize, sessionStatus, waitSessionStatus, waitMachineStatus, waitFor, type TestCtx } from './helpers.js';

let t: TestCtx;

/**
 * E2E DEMO completo (sin servicios externos):
 * máquina ONLINE -> cliente paga (DemoPaymentProvider aprueba) -> autorización ->
 * ESP32 simulado la recibe (LED verde) -> pulsador -> relay ON -> timer -> relay OFF ->
 * FINISHED -> sesión visible en admin con timeline completa.
 */
describe('E2E flujo completo DEMO', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('viaje completo del cliente con verificación en administración', async () => {
    t = await createTestApp();

    // 0) health
    const health = await t.api.get('/health').expect(200);
    expect(health.body.checks.database).toBe('OK');
    expect(health.body.checks.payments).toBe('DEMO');

    // 1) cliente abre /machine/HIDRO-01: máquina disponible
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const machine = await t.machineInfo('HIDRO-01');
    expect(machine.availability).toBe('AVAILABLE');
    expect(machine.status).toBe('ONLINE');
    expect(machine.name).toBe('Hidrolavadora 10 HP');
    expect(machine.durationSeconds).toBe(180);

    // 2) inicia pago
    const { sessionId, externalPaymentId } = await payAndAuthorize(t);
    expect(await sessionStatus(t, sessionId)).toBe('AUTHORIZED');

    // 3) ESP32 simulado recibe la autorización -> LED verde
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    let snap = await t.ctx.simulator!.snapshot('HIDRO-01');
    expect(snap.state).toBe('ARMED');
    expect(snap.ledState).toBe('GREEN');

    // 4) pulsador -> relay ON -> RUNNING
    const press = await t.ctx.simulator!.pressButton('HIDRO-01');
    expect(press.ok).toBe(true);
    snap = await t.ctx.simulator!.snapshot('HIDRO-01');
    expect(snap.relayState).toBe(true);
    expect(snap.ledState).toBe('GREEN_BLINK');
    expect(await sessionStatus(t, sessionId)).toBe('RUNNING');

    // 5) timer (180s con factor 60 -> 3s) -> relay OFF -> FINISHED
    await waitSessionStatus(t, sessionId, 'FINISHED', 10_000);
    snap = await t.ctx.simulator!.snapshot('HIDRO-01');
    expect(snap.relayState).toBe(false);
    expect(snap.state).toBe('IDLE');

    // 6) admin: sesión visible con timeline completa
    const token = await adminToken(t);
    const detail = await t.api.get(`/api/admin/sessions/${sessionId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const labels = (detail.body.session.timeline as Array<{ label: string }>).map((e) => e.label);
    for (const expected of ['Sesión creada', 'Pago creado', 'Pago aprobado', 'Autorización generada', 'ESP32 recibió la autorización', 'Pulsador presionado', 'Relay ON', 'Relay OFF', 'Sesión finalizada']) {
      expect(labels).toContain(expected);
    }
    expect(detail.body.session.payment.externalPaymentId).toBe(externalPaymentId);

    // 7) overview actualizado
    const overview = await t.api.get('/api/admin/overview').set('Authorization', `Bearer ${token}`).expect(200);
    expect(overview.body.stats.washesToday).toBeGreaterThanOrEqual(1);
    expect(overview.body.stats.revenueToday).toBeGreaterThanOrEqual(500);

    // 8) la máquina volvió a quedar disponible para el próximo cliente
    await waitFor(async () => {
      const m = await t.machineInfo('HIDRO-01');
      return m.availability === 'AVAILABLE' ? true : false;
    }, { timeoutMs: 5000, label: 'available again' });
  });
});
