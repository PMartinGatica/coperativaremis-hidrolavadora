import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import { PERMISSIONS, type Permission, type Role } from '@hidro/shared';
import { adminUsers } from '../src/db/schema.js';
import { DEMO_ADMIN_PASSWORD } from '../src/config.js';
import { adminToken, createPanelUser, createTestApp, type TestCtx } from './helpers.js';

/**
 * Roles y usuarios del panel (ADR-062, docs/designs/roles-usuarios.md). Todo entra por el login
 * real: nada de tokens fabricados (lección del ADR-054).
 */

type Route = { method: 'get' | 'post' | 'patch' | 'delete'; path: string; body?: unknown; permission: Permission };

/**
 * Cada ruta del panel con el permiso que exige. Los cuerpos son válidos pero inofensivos: lo que
 * se mide es 403 o no-403, no el resultado de la acción. La matriz esperada sale de
 * `PERMISSIONS`, la misma tabla que usa el servidor — y abajo hay un test que fija la tabla.
 */
const ROUTES: Route[] = [
  { method: 'get', path: '/api/admin/overview', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/machines', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/machines/HIDRO-01', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/machines/HIDRO-01/qr', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/devices', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/sessions', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/sessions/no-existe', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/payments', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/logs', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/vehicles', permission: 'panel.ver' },
  { method: 'get', path: '/api/admin/settings', permission: 'panel.ver' },
  { method: 'post', path: '/api/admin/sessions/no-existe/reconcile/auto', body: {}, permission: 'pagos.destrabar' },
  { method: 'post', path: '/api/admin/sessions/no-existe/reconcile/manual', body: { paymentId: 'x' }, permission: 'pagos.destrabar' },
  { method: 'post', path: '/api/admin/machines/NO-EXISTE/emergency-stop', body: { confirmation: 'DETENER' }, permission: 'maquina.parada_emergencia' },
  { method: 'post', path: '/api/admin/vehicles', body: { plate: 'AB123CD', category: 'socio' }, permission: 'patentes.editar' },
  { method: 'delete', path: '/api/admin/vehicles/ZZ000ZZ', permission: 'patentes.editar' },
  { method: 'patch', path: '/api/admin/machines/NO-EXISTE', body: { name: 'x' }, permission: 'maquina.configurar' },
  { method: 'patch', path: '/api/admin/settings', body: { dailyWashLimit: 2 }, permission: 'ajustes.negocio' },
  { method: 'patch', path: '/api/admin/settings', body: { heartbeatIntervalMs: 5000 }, permission: 'ajustes.tecnicos' },
  { method: 'post', path: '/api/admin/devices/NO-EXISTE/rotate-secret', permission: 'dispositivo.rotar_clave' },
  { method: 'get', path: '/api/admin/users', permission: 'usuarios.gestionar' },
  { method: 'post', path: '/api/admin/users', body: { email: 'x' }, permission: 'usuarios.gestionar' },
  { method: 'patch', path: '/api/admin/users/no-existe', body: { name: 'x' }, permission: 'usuarios.gestionar' },
];

describe('matriz de permisos', () => {
  it('la tabla es la aprobada con Javier (cambiarla es una decisión, no un refactor)', () => {
    expect(PERMISSIONS).toEqual({
      'panel.ver': ['operador', 'admin', 'tecnico'],
      'pagos.destrabar': ['operador', 'admin'],
      'maquina.parada_emergencia': ['operador', 'admin', 'tecnico'],
      'patentes.editar': ['admin', 'tecnico'],
      'maquina.configurar': ['admin', 'tecnico'],
      'ajustes.negocio': ['admin', 'tecnico'],
      'ajustes.tecnicos': ['tecnico'],
      'dispositivo.rotar_clave': ['tecnico'],
      'usuarios.gestionar': ['admin', 'tecnico'],
    });
  });

  describe('cada ruta × cada rol, por el login real', () => {
    let t: TestCtx;
    const tokens = {} as Record<Role, string>;

    beforeAll(async () => {
      t = await createTestApp();
      tokens.tecnico = await adminToken(t);
      tokens.admin = (await createPanelUser(t, { email: 'javier@coop.local', role: 'admin' })).token;
      tokens.operador = (await createPanelUser(t, { email: 'op@coop.local', role: 'operador' })).token;
    });
    afterAll(async () => {
      await t?.close();
    });

    for (const role of ['operador', 'admin', 'tecnico'] as const) {
      for (const route of ROUTES) {
        const allowed = (PERMISSIONS[route.permission] as readonly string[]).includes(role);
        it(`${role} ${route.method.toUpperCase()} ${route.path} ${JSON.stringify(route.body ?? '')} -> ${allowed ? 'pasa' : '403'}`, async () => {
          let req = t.api[route.method](route.path).set('Authorization', `Bearer ${tokens[role]}`);
          if (route.body !== undefined) req = req.send(route.body as object);
          const res = await req;
          if (allowed) {
            expect(res.status, JSON.stringify(res.body)).not.toBe(403);
            expect(res.status).not.toBe(401);
          } else {
            expect(res.status, JSON.stringify(res.body)).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
          }
        });
      }
    }
  });
});

describe('usuarios del panel', () => {
  let t: TestCtx | undefined;
  afterEach(async () => {
    const ctx = t;
    t = undefined;
    await ctx?.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('/auth/me devuelve nombre, rol y permisos desde la base', async () => {
    t = await createTestApp();
    const op = await createPanelUser(t, { email: 'op@coop.local', role: 'operador', name: 'Pedro' });
    const me = await t.api.get('/api/admin/auth/me').set(auth(op.token)).expect(200);
    expect(me.body).toMatchObject({ email: 'op@coop.local', name: 'Pedro', role: 'operador', mustChangePassword: false });
    expect(me.body.permissions).toEqual(['panel.ver', 'pagos.destrabar', 'maquina.parada_emergencia']);
  });

  it('clave inicial: todo 403 PASSWORD_CHANGE_REQUIRED salvo /auth/me y /me/password', async () => {
    t = await createTestApp();
    const tecnico = await adminToken(t);
    await t.api
      .post('/api/admin/users')
      .set(auth(tecnico))
      .send({ email: 'nuevo@coop.local', name: 'Nuevo', role: 'operador', password: 'clave-inicial-1' })
      .expect(201);
    const login = await t.api.post('/api/admin/auth/login').send({ email: 'nuevo@coop.local', password: 'clave-inicial-1' }).expect(200);
    expect(login.body.mustChangePassword).toBe(true);
    const res = await t.api.get('/api/admin/overview').set(auth(login.body.token)).expect(403);
    expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await t.api.get('/api/admin/auth/me').set(auth(login.body.token)).expect(200);
    const changed = await t.api
      .patch('/api/admin/me/password')
      .set(auth(login.body.token))
      .send({ currentPassword: 'clave-inicial-1', newPassword: 'clave-propia-22' })
      .expect(200);
    await t.api.get('/api/admin/overview').set(auth(changed.body.token)).expect(200);
  });

  it('mi clave: actual mal -> 400 (no echa); éxito -> token nuevo y el viejo da 401', async () => {
    t = await createTestApp();
    const op = await createPanelUser(t, { email: 'op@coop.local', role: 'operador' });
    const wrong = await t.api
      .patch('/api/admin/me/password')
      .set(auth(op.token))
      .send({ currentPassword: 'no-es-esta', newPassword: 'otra-clave-99' })
      .expect(400);
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    await t.api.get('/api/admin/overview').set(auth(op.token)).expect(200);

    const ok = await t.api
      .patch('/api/admin/me/password')
      .set(auth(op.token))
      .send({ currentPassword: op.password, newPassword: 'otra-clave-99' })
      .expect(200);
    await t.api.get('/api/admin/overview').set(auth(ok.body.token)).expect(200);
    const old = await t.api.get('/api/admin/overview').set(auth(op.token)).expect(401);
    expect(old.body.error.details.reason).toBe('session_changed');
  });

  it('mi clave: rate limit propio por cuenta (el 11º intento en 15 min -> 429)', async () => {
    t = await createTestApp();
    const op = await createPanelUser(t, { email: 'op@coop.local', role: 'operador' });
    // createPanelUser ya usó 1 intento de este contador (el cambio de la clave inicial).
    for (let i = 0; i < 9; i++) {
      await t.api
        .patch('/api/admin/me/password')
        .set(auth(op.token))
        .send({ currentPassword: 'no-es-esta', newPassword: 'otra-clave-99' })
        .expect(400);
    }
    await t.api
      .patch('/api/admin/me/password')
      .set(auth(op.token))
      .send({ currentPassword: 'no-es-esta', newPassword: 'otra-clave-99' })
      .expect(429);
    // El login tiene su propio cupo: sigue entrando.
    await t.api.post('/api/admin/auth/login').send({ email: op.email, password: op.password }).expect(200);
  });

  it('la cuenta técnica no cambia su clave desde la app', async () => {
    t = await createTestApp();
    const tecnico = await adminToken(t);
    await t.api
      .patch('/api/admin/me/password')
      .set(auth(tecnico))
      .send({ currentPassword: 'admin-pass', newPassword: 'otra-clave-99' })
      .expect(403);
  });

  it('un admin VE la cuenta técnica pero no la puede modificar ni crear técnicos', async () => {
    t = await createTestApp();
    const admin = await createPanelUser(t, { email: 'javier@coop.local', role: 'admin' });
    const list = await t.api.get('/api/admin/users').set(auth(admin.token)).expect(200);
    const tecnico = (list.body.users as Array<{ id: string; role: string; email: string }>).find((u) => u.role === 'tecnico');
    expect(tecnico?.email).toBe('admin@test.local');

    await t.api.patch(`/api/admin/users/${tecnico!.id}`).set(auth(admin.token)).send({ active: false }).expect(403);
    await t.api.patch(`/api/admin/users/${tecnico!.id}`).set(auth(admin.token)).send({ password: 'clave-robada-1' }).expect(403);
    await t.api
      .post('/api/admin/users')
      .set(auth(admin.token))
      .send({ email: 'otro@x.local', name: 'x', role: 'tecnico', password: 'clave-larga-1' })
      .expect(400);
    await t.api
      .post('/api/admin/users')
      .set(auth(admin.token))
      .send({ email: 'otro@x.local', name: 'x', role: 'operador', password: 'clave-larga-1', tokenVersion: 5 })
      .expect(400);
  });

  it('nadie se cambia el rol ni se desactiva a sí mismo', async () => {
    t = await createTestApp();
    const admin = await createPanelUser(t, { email: 'javier@coop.local', role: 'admin' });
    await t.api.patch(`/api/admin/users/${admin.id}`).set(auth(admin.token)).send({ role: 'operador' }).expect(400);
    await t.api.patch(`/api/admin/users/${admin.id}`).set(auth(admin.token)).send({ active: false }).expect(400);
    // El nombre sí.
    await t.api.patch(`/api/admin/users/${admin.id}`).set(auth(admin.token)).send({ name: 'Javier R.' }).expect(200);
  });

  it('nunca quedan cero admins activos (secuencial)', async () => {
    t = await createTestApp();
    const tecnico = await adminToken(t);
    const a1 = await createPanelUser(t, { email: 'a1@coop.local', role: 'admin' });
    const a2 = await createPanelUser(t, { email: 'a2@coop.local', role: 'admin' });
    await t.api.patch(`/api/admin/users/${a2.id}`).set(auth(a1.token)).send({ active: false }).expect(200);
    // a1 es el último admin: el técnico no lo puede bajar a operador ni desactivarlo.
    await t.api.patch(`/api/admin/users/${a1.id}`).set(auth(tecnico)).send({ role: 'operador' }).expect(400);
    await t.api.patch(`/api/admin/users/${a1.id}`).set(auth(tecnico)).send({ active: false }).expect(400);
  });

  it('nunca quedan cero admins activos (dos cambios a la vez)', async () => {
    t = await createTestApp();
    const tecnico = await adminToken(t);
    const a1 = await createPanelUser(t, { email: 'a1@coop.local', role: 'admin' });
    const a2 = await createPanelUser(t, { email: 'a2@coop.local', role: 'admin' });
    const results = await Promise.all([
      t.api.patch(`/api/admin/users/${a1.id}`).set(auth(tecnico)).send({ active: false }),
      t.api.patch(`/api/admin/users/${a2.id}`).set(auth(tecnico)).send({ active: false }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const activos = (await t.ctx.db.select().from(adminUsers)).filter((u) => u.role === 'admin' && u.active);
    expect(activos).toHaveLength(1);
  });

  it('cambiar el rol corta la sesión; el siguiente pedido ya usa el rol nuevo', async () => {
    t = await createTestApp();
    const admin = await createPanelUser(t, { email: 'javier@coop.local', role: 'admin' });
    const op = await createPanelUser(t, { email: 'op@coop.local', role: 'operador' });
    await t.api.patch(`/api/admin/users/${op.id}`).set(auth(admin.token)).send({ role: 'admin' }).expect(200);
    const res = await t.api.get('/api/admin/overview').set(auth(op.token)).expect(401);
    expect(res.body.error.details.reason).toBe('session_changed');
    const login = await t.api.post('/api/admin/auth/login').send({ email: op.email, password: op.password }).expect(200);
    expect(login.body.role).toBe('admin');
  });

  it('resetear la clave: corta la sesión y obliga a cambiarla al entrar', async () => {
    t = await createTestApp();
    const admin = await createPanelUser(t, { email: 'javier@coop.local', role: 'admin' });
    const op = await createPanelUser(t, { email: 'op@coop.local', role: 'operador' });
    await t.api.patch(`/api/admin/users/${op.id}`).set(auth(admin.token)).send({ password: 'clave-reseteada-1' }).expect(200);
    await t.api.get('/api/admin/overview').set(auth(op.token)).expect(401);
    const login = await t.api.post('/api/admin/auth/login').send({ email: op.email, password: 'clave-reseteada-1' }).expect(200);
    expect(login.body.mustChangePassword).toBe(true);
  });

  it('email repetido (aunque cambien las mayúsculas) -> 409; clave corta -> 400', async () => {
    t = await createTestApp();
    const tecnico = await adminToken(t);
    const body = { email: 'Pedro@Coop.Local', name: 'Pedro', role: 'operador', password: 'clave-larga-1' };
    const created = await t.api.post('/api/admin/users').set(auth(tecnico)).send(body).expect(201);
    expect(created.body.user.email).toBe('pedro@coop.local');
    await t.api.post('/api/admin/users').set(auth(tecnico)).send({ ...body, email: 'pedro@coop.local' }).expect(409);
    await t.api.post('/api/admin/users').set(auth(tecnico)).send({ ...body, email: 'otro@coop.local', password: 'corta' }).expect(400);
  });

  it('en producción no se acepta la clave demo como clave de una cuenta', async () => {
    t = await createTestApp();
    const tecnico = await adminToken(t);
    t.ctx.config.nodeEnv = 'production';
    try {
      const res = await t.api
        .post('/api/admin/users')
        .set(auth(tecnico))
        .send({ email: 'x@coop.local', name: 'x', role: 'operador', password: DEMO_ADMIN_PASSWORD })
        .expect(400);
      expect(res.body.error.message).toContain('no se puede usar');
    } finally {
      t.ctx.config.nodeEnv = 'test';
    }
  });

  it('login de una cuenta desactivada: el mismo error que una clave incorrecta', async () => {
    t = await createTestApp();
    const tecnico = await adminToken(t);
    const op = await createPanelUser(t, { email: 'op@coop.local', role: 'operador' });
    await t.api.patch(`/api/admin/users/${op.id}`).set(auth(tecnico)).send({ active: false }).expect(200);
    const inactive = await t.api.post('/api/admin/auth/login').send({ email: op.email, password: op.password }).expect(401);
    const wrong = await t.api.post('/api/admin/auth/login').send({ email: op.email, password: 'no-es-esta' }).expect(401);
    const ghost = await t.api.post('/api/admin/auth/login').send({ email: 'nadie@coop.local', password: 'no-es-esta' }).expect(401);
    expect(inactive.body.error.message).toBe(wrong.body.error.message);
    expect(ghost.body.error.message).toBe(wrong.body.error.message);
  });

  it('la auditoría registra alta, cambio y reset sin claves', async () => {
    t = await createTestApp();
    const tecnico = await adminToken(t);
    const op = await createPanelUser(t, { email: 'op@coop.local', role: 'operador' });
    await t.api.patch(`/api/admin/users/${op.id}`).set(auth(tecnico)).send({ name: 'Otro', password: 'clave-reseteada-1' }).expect(200);
    const logs = await t.api.get('/api/admin/logs').set(auth(tecnico)).expect(200);
    const rows = logs.body.logs as Array<{ type: string; payload: unknown }>;
    const types = rows.map((l) => l.type);
    expect(types).toEqual(expect.arrayContaining(['USER_CREATED', 'USER_UPDATED', 'USER_PASSWORD_RESET', 'PASSWORD_CHANGED']));
    expect(JSON.stringify(rows)).not.toContain('clave-reseteada-1');
    expect(JSON.stringify(rows)).not.toContain('clave-inicial-123');
  });
});

describe('migración 0003', () => {
  it('una fila previa con rol admin queda técnica, entra y no destraba; el SQL es re-ejecutable', async () => {
    const t = await createTestApp();
    try {
      // Simula la base de producción ANTES del deploy: sin el CHECK y con la fila como 'admin'.
      const raw = (t.ctx.dbHandle as unknown as { raw: PGlite }).raw;
      await raw.exec(`ALTER TABLE "admin_users" DROP CONSTRAINT "admin_users_role_check";
                      UPDATE "admin_users" SET "role" = 'admin', "must_change_password" = false;`);
      const file = fs.readFileSync(fileURLToPath(new URL('../drizzle/0003_admin_roles.sql', import.meta.url)), 'utf8');
      await raw.exec(file);

      const [row] = await t.ctx.db.select().from(adminUsers).where(eq(adminUsers.email, 'admin@test.local'));
      expect(row?.role).toBe('tecnico');
      expect(row?.mustChangePassword).toBe(false);
      const token = await adminToken(t);
      await t.api.post('/api/admin/sessions/x/reconcile/auto').set('Authorization', `Bearer ${token}`).send({}).expect(403);
      // El CHECK del rol existe: un valor inventado no entra.
      await expect(t.ctx.db.update(adminUsers).set({ role: 'superadmin' }).where(eq(adminUsers.id, row!.id))).rejects.toThrow();
    } finally {
      await t.close();
    }
  });
});
