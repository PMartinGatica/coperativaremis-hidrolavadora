import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { adminUsers, devices, machines, vehicles } from '../src/db/schema.js';
import { runSeed } from '../src/db/seed.js';
import { createTestApp, type TestCtx } from './helpers.js';

let t: TestCtx;

describe('seed: instalación base vs. datos demo', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('seedDemo:false crea máquinas, dispositivos y admin, pero no patentes demo', async () => {
    t = await createTestApp({ seedDemo: false });
    const machineIds = (await t.ctx.db.select().from(machines)).map((m) => m.id).sort();
    expect(machineIds).toEqual(['HIDRO-01', 'HIDRO-02']);
    expect(await t.ctx.db.select().from(devices)).toHaveLength(2);
    const admins = await t.ctx.db.select().from(adminUsers);
    expect(admins.map((a) => a.email)).toEqual(['admin@test.local']);
    expect(await t.ctx.db.select().from(vehicles)).toHaveLength(0);
  });

  it('una patente demo borrada no reaparece al volver a sembrar con seedDemo:false', async () => {
    t = await createTestApp();
    await t.ctx.db.delete(vehicles).where(eq(vehicles.plate, 'AE100AA'));
    await runSeed(t.ctx.db, { ...t.ctx.config, seedDemo: false });
    expect(await t.ctx.db.select().from(vehicles).where(eq(vehicles.plate, 'AE100AA'))).toHaveLength(0);
  });

  it('la clave del admin sembrado se sincroniza desde la configuración', async () => {
    t = await createTestApp();
    await runSeed(t.ctx.db, {
      ...t.ctx.config,
      seedOverrides: { ...t.ctx.config.seedOverrides, adminPassword: 'otra-clave-123' },
    });
    await t.api.post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'otra-clave-123' }).expect(200);
    await t.api.post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'admin-pass' }).expect(401);
  });
});
