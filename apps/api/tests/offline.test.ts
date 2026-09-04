import { afterEach, describe, expect, it } from 'vitest';
import { payments } from '../src/db/schema.js';
import { createTestApp, PLATES, waitMachineStatus, type TestCtx } from './helpers.js';

let t: TestCtx;

describe('máquina offline: nunca se cobra', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('máquina OFFLINE -> 503 y NINGÚN pago generado', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    await t.ctx.simulator!.action('HIDRO-01', 'disconnect');
    await waitMachineStatus(t, 'HIDRO-01', 'OFFLINE', 12_000);
    const machine = await t.machineInfo('HIDRO-01');
    expect(machine.status).toBe('OFFLINE');
    expect(machine.availability).toBe('OUT_OF_SERVICE');

    const res = await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(503);
    expect(res.body.error.code).toBe('MACHINE_OFFLINE');
    const rows = await t.ctx.db.select().from(payments);
    expect(rows.length).toBe(0);
  });

  it('reconectar -> ONLINE -> se puede pagar de nuevo', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    await t.ctx.simulator!.action('HIDRO-01', 'disconnect');
    await waitMachineStatus(t, 'HIDRO-01', 'OFFLINE', 12_000);
    await t.ctx.simulator!.action('HIDRO-01', 'reconnect');
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE', 12_000);
    await t.api.post('/api/public/machines/HIDRO-01/sessions').send({ plate: PLATES.remis }).expect(201);
  });

  it('HIDRO-02 deshabilitada -> OUT_OF_SERVICE aunque su dispositivo esté online', async () => {
    t = await createTestApp();
    const machine = await t.machineInfo('HIDRO-02');
    expect(machine.availability).toBe('OUT_OF_SERVICE');
    const res = await t.api.post('/api/public/machines/HIDRO-02/sessions').send({ plate: PLATES.remis }).expect(403);
    expect(res.body.error.code).toBe('MACHINE_DISABLED');
  });
});
