import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DEMO_ADMIN_PASSWORD } from '../src/config.js';
import { auditLogs } from '../src/db/schema.js';
import { login } from '../src/services/adminService.js';
import {
  createTestApp,
  adminToken,
  payAndAuthorize,
  waitSessionStatus,
  waitMachineStatus,
  DEVICE_SECRETS,
  type TestCtx,
} from './helpers.js';

let t: TestCtx;

describe('panel administrativo', () => {
  afterEach(async () => {
    await t?.close();
  });

  it('login inválido -> 401; login válido -> token + me', async () => {
    t = await createTestApp();
    await t.api.post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'mala' }).expect(401);
    const token = await adminToken(t);
    const me = await t.api.get('/api/admin/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.email).toBe('admin@test.local');
    await t.api.get('/api/admin/overview').expect(401); // sin token no pasa
  });

  it('overview refleja máquinas, lavados e ingresos del día', async () => {
    t = await createTestApp();
    const token = await adminToken(t);
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    await waitSessionStatus(t, sessionId, 'FINISHED', 10_000);
    const res = await t.api.get('/api/admin/overview').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.stats.washesToday).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.revenueToday).toBeGreaterThanOrEqual(500);
    expect(res.body.machines[0].activeSessionStatus).toBeNull();
  });

  it('cambiar precio con sesión RUNNING -> bloqueado (SETTINGS_LOCKED_WHILE_RUNNING)', async () => {
    t = await createTestApp();
    const token = await adminToken(t);
    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    const res = await t.api
      .patch('/api/admin/machines/HIDRO-01')
      .set('Authorization', `Bearer ${token}`)
      .send({ priceRemisArs: 999 })
      .expect(409);
    expect(res.body.error.code).toBe('SETTINGS_LOCKED_WHILE_RUNNING');
  });

  it('cambiar precio sin sesión activa -> ok; QR apunta a la máquina', async () => {
    t = await createTestApp();
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    const token = await adminToken(t);
    await t.api
      .patch('/api/admin/machines/HIDRO-01')
      .set('Authorization', `Bearer ${token}`)
      .send({ priceRemisArs: 1750, durationSeconds: 240 })
      .expect(200);
    const machine = await t.machineInfo('HIDRO-01');
    expect(machine.priceRemisArs).toBe(1750);
    expect(machine.durationSeconds).toBe(240);
    const qr = await t.api.get('/api/admin/machines/HIDRO-01/qr').set('Authorization', `Bearer ${token}`).expect(200);
    expect(qr.body.url).toContain('/machine/HIDRO-01');
  });

  it('rotar secret del dispositivo: el viejo deja de funcionar, el nuevo sí', async () => {
    t = await createTestApp();
    const token = await adminToken(t);
    const res = await t.api
      .post('/api/admin/devices/HIDRO-01/rotate-secret')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const newSecret = res.body.secret as string;
    expect(newSecret).toBeTruthy();
    // el secret viejo ya no firma
    const { signDeviceRequest } = await import('../src/auth/deviceAuth.js');
    let ts = Date.now();
    const oldSig = signDeviceRequest('test-secret-hidro-01', 'ESP32-HIDRO-01', ts, 'GET', '/api/device/authorization', '');
    await t.api.get('/api/device/authorization').set({
      'x-device-id': 'ESP32-HIDRO-01',
      'x-device-ts': String(ts),
      'x-device-sig': oldSig,
    }).expect(401);
    // el nuevo sí (revocar HIDRO-01 no afecta HIDRO-02)
    ts = Date.now();
    const newSig = signDeviceRequest(newSecret, 'ESP32-HIDRO-01', ts, 'GET', '/api/device/authorization', '');
    await t.api.get('/api/device/authorization').set({
      'x-device-id': 'ESP32-HIDRO-01',
      'x-device-ts': String(ts),
      'x-device-sig': newSig,
    }).expect(200);
  });

  it('settings: leer y cambiar factor de aceleración (solo desarrollo)', async () => {
    t = await createTestApp();
    const token = await adminToken(t);
    const res = await t.api.get('/api/admin/settings').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.demoMode).toBe(true);
    await t.api
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ demoSpeedFactor: 60, dailyWashLimit: 3 })
      .expect(200);
  });

  it('patentes: registrar remis/socio, listar y eliminar', async () => {
    t = await createTestApp();
    const token = await adminToken(t);

    // registrar un remis nuevo
    const created = await t.api
      .post('/api/admin/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'AE300AA', category: 'remis', ownerName: 'Fulanito' })
      .expect(200);
    expect(created.body.vehicle.plate).toBe('AE300AA');

    // la cotización cambia de externo a remis
    const quote = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'AE300AA' }).expect(200);
    expect(quote.body.quote.category).toBe('remis');
    expect(quote.body.quote.priceArs).toBe(500);

    // listar (con búsqueda)
    const list = await t.api.get('/api/admin/vehicles?search=AE300').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.vehicles.length).toBe(1);

    // re-categorizar como socio
    await t.api
      .post('/api/admin/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'AE300AA', category: 'socio' })
      .expect(200);
    const quote2 = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'AE300AA' }).expect(200);
    expect(quote2.body.quote.priceArs).toBe(2000);

    // eliminar -> vuelve a ser externo ($8.000)
    await t.api.delete('/api/admin/vehicles/AE300AA').set('Authorization', `Bearer ${token}`).expect(200);
    const quote3 = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'AE300AA' }).expect(200);
    expect(quote3.body.quote.category).toBe('externo');
    expect(quote3.body.quote.priceArs).toBe(8000);
  });

  it('PIN por patente: grandfather sin PIN, exige PIN correcto una vez seteado, cotización y cobro coinciden', async () => {
    t = await createTestApp();
    const token = await adminToken(t);
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');

    // sin PIN seteado: grandfather clause, sigue funcionando como antes
    await t.api
      .post('/api/admin/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'AE400AA', category: 'socio' })
      .expect(200);
    const noPinYet = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'AE400AA' }).expect(200);
    expect(noPinYet.body.quote.category).toBe('socio');

    // se le asigna un PIN
    const upserted = await t.api
      .post('/api/admin/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'AE400AA', category: 'socio', pin: '1234' })
      .expect(200);
    expect(upserted.body.vehicle.hasPin).toBe(true);

    // sin PIN o PIN incorrecto -> cae a externo (mismo camino que no registrada, no filtra nada)
    const missingPin = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'AE400AA' }).expect(200);
    expect(missingPin.body.quote).toMatchObject({ category: 'externo', priceArs: 8000 });
    const wrongPin = await t.api
      .post('/api/public/machines/HIDRO-01/quote')
      .send({ plate: 'AE400AA', pin: '0000' })
      .expect(200);
    expect(wrongPin.body.quote).toMatchObject({ category: 'externo', priceArs: 8000 });

    // PIN correcto -> tarifa de socio
    const rightPin = await t.api
      .post('/api/public/machines/HIDRO-01/quote')
      .send({ plate: 'AE400AA', pin: '1234' })
      .expect(200);
    expect(rightPin.body.quote).toMatchObject({ category: 'socio', priceArs: 2000 });

    // cobro (creación de sesión) respeta la MISMA lógica que la cotización
    const sessionWrongPin = await t.api
      .post('/api/public/machines/HIDRO-01/sessions')
      .send({ plate: 'AE400AA', pin: '9999' })
      .expect(201);
    expect(sessionWrongPin.body.checkout.plateCategory).toBe('externo');
    expect(sessionWrongPin.body.checkout.payment.amount).toBe(8000);

    // re-guardar SIN mandar pin no lo borra (tri-estado: ausente = no tocar)
    await t.api
      .post('/api/admin/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'AE400AA', category: 'socio' })
      .expect(200);
    const stillHasPin = await t.api
      .post('/api/public/machines/HIDRO-01/quote')
      .send({ plate: 'AE400AA', pin: '1234' })
      .expect(200);
    expect(stillHasPin.body.quote.category).toBe('socio');

    // borrado explícito (pin: null) sí lo quita -> vuelve a la grandfather clause
    const cleared = await t.api
      .post('/api/admin/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'AE400AA', category: 'socio', pin: null })
      .expect(200);
    expect(cleared.body.vehicle.hasPin).toBe(false);
    const noPinNeeded = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'AE400AA' }).expect(200);
    expect(noPinNeeded.body.quote.category).toBe('socio');
  });

  it('PIN por patente: mismo PIN en 2 patentes de una persona (remis + particular)', async () => {
    t = await createTestApp();
    const token = await adminToken(t);
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');

    await t.api
      .post('/api/admin/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'AE500AA', category: 'remis', pin: '7777' })
      .expect(200);
    await t.api
      .post('/api/admin/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'AE510AA', category: 'socio', pin: '7777' })
      .expect(200);

    const remisQuote = await t.api
      .post('/api/public/machines/HIDRO-01/quote')
      .send({ plate: 'AE500AA', pin: '7777' })
      .expect(200);
    expect(remisQuote.body.quote).toMatchObject({ category: 'remis', priceArs: 500 });

    const socioQuote = await t.api
      .post('/api/public/machines/HIDRO-01/quote')
      .send({ plate: 'AE510AA', pin: '7777' })
      .expect(200);
    expect(socioQuote.body.quote).toMatchObject({ category: 'socio', priceArs: 2000 });
  });

  it('PIN por patente: rate limit por patente en /quote (no bloquea otras patentes)', async () => {
    t = await createTestApp();
    const token = await adminToken(t);
    await waitMachineStatus(t, 'HIDRO-01', 'ONLINE');
    await t.api
      .post('/api/admin/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ plate: 'AE600AA', category: 'socio', pin: '1111' })
      .expect(200);

    for (let i = 0; i < 10; i++) {
      await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'AE600AA', pin: '0000' }).expect(200);
    }
    const limited = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'AE600AA', pin: '1111' });
    expect(limited.status).toBe(429);

    // otra patente no comparte el cupo agotado
    const otherPlate = await t.api.post('/api/public/machines/HIDRO-01/quote').send({ plate: 'AE601AA' }).expect(200);
    expect(otherPlate.body.quote.category).toBe('externo');
  });

  it('en producción la clave demo no entra con ninguna cuenta, aunque esté guardada en la base', async () => {
    t = await createTestApp({
      adminPassword: DEMO_ADMIN_PASSWORD,
      seedOverrides: { deviceSecrets: DEVICE_SECRETS, adminEmail: 'admin@test.local', adminPassword: DEMO_ADMIN_PASSWORD },
    });
    await expect(login(t.ctx, 'admin@test.local', DEMO_ADMIN_PASSWORD)).resolves.toMatchObject({
      email: 'admin@test.local',
    });

    const prodDeps = { ...t.ctx, config: { ...t.ctx.config, nodeEnv: 'production' as const } };
    await expect(login(prodDeps, 'admin@test.local', DEMO_ADMIN_PASSWORD)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    const failed = await t.ctx.db.select().from(auditLogs).where(eq(auditLogs.action, 'ADMIN_LOGIN_FAILED'));
    expect(failed.map((row) => row.metadata)).toContainEqual({ reason: 'demo_password_blocked' });
  });

  it('en producción una clave normal sigue entrando (el bloqueo no deja afuera al admin real)', async () => {
    t = await createTestApp();
    const prodDeps = { ...t.ctx, config: { ...t.ctx.config, nodeEnv: 'production' as const } };
    await expect(login(prodDeps, 'admin@test.local', 'admin-pass')).resolves.toMatchObject({
      email: 'admin@test.local',
    });
  });
});
