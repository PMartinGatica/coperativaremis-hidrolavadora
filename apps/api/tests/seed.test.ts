import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { adminUsers, devices, machines, vehicles } from '../src/db/schema.js';
import { DEMO_ADMIN_PASSWORD } from '../src/config.js';
import { hashSecret, runSeed, verifySecret } from '../src/db/seed.js';
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

  it('en producción bloquea cuentas con la clave demo y avisa por SEED_DEMO y cuentas extra, sin borrar', async () => {
    t = await createTestApp();
    await t.ctx.db.insert(adminUsers).values([
      { id: 'admin-viejo', email: 'viejo@test.local', passwordHash: hashSecret('otra-clave-larga'), role: 'admin' },
      { id: 'admin-demo', email: 'admin@hidro.local', passwordHash: hashSecret(DEMO_ADMIN_PASSWORD), role: 'admin' },
    ]);
    const stdout = vi.spyOn(process.stdout, 'write');
    try {
      await runSeed(t.ctx.db, { ...t.ctx.config, nodeEnv: 'production', seedDemo: true });
      const out = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(out).toContain('SEED_DEMO activo en producción');
      expect(out).toContain('cuentas admin con la clave demo bloqueadas');
      expect(out).toContain('hay cuentas admin distintas de ADMIN_EMAIL');
    } finally {
      stdout.mockRestore();
    }
    const rows = await t.ctx.db.select().from(adminUsers);
    expect(rows).toHaveLength(3);
    const demoRow = rows.find((row) => row.id === 'admin-demo');
    expect(verifySecret(DEMO_ADMIN_PASSWORD, demoRow!.passwordHash)).toBe(false);
    const oldRow = rows.find((row) => row.id === 'admin-viejo');
    expect(verifySecret('otra-clave-larga', oldRow!.passwordHash)).toBe(true);
    await t.api.post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'admin-pass' }).expect(200);
  });

  it('un device secret cifrado con otro DEVICE_AUTH_SECRET avisa y no se reemplaza', async () => {
    t = await createTestApp();
    const [before] = await t.ctx.db.select().from(devices).where(eq(devices.machineId, 'HIDRO-01'));
    const stdout = vi.spyOn(process.stdout, 'write');
    try {
      await runSeed(t.ctx.db, { ...t.ctx.config, deviceAuthSecret: 'x'.repeat(40) });
      const out = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(out).toContain('device secret no descifra');
    } finally {
      stdout.mockRestore();
    }
    const [after] = await t.ctx.db.select().from(devices).where(eq(devices.machineId, 'HIDRO-01'));
    expect(after?.secretEnc).toBe(before?.secretEnc);
  });
});
