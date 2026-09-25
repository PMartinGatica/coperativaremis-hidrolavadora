import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import supertest from 'supertest';
import { createContext } from '../src/bootstrap.js';
import { buildApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';
import type { AppConfig } from '../src/config.js';
import { signDeviceRequest } from '../src/auth/deviceAuth.js';

export interface TestCtx {
  ctx: AppContext;
  app: Express;
  api: ReturnType<typeof supertest>;
  close(): Promise<void>;
  machineInfo(machineId: string): Promise<Record<string, unknown>>;
}

export const DEVICE_SECRETS: Record<string, string> = {
  'HIDRO-01': 'test-secret-hidro-01',
  'HIDRO-02': 'test-secret-hidro-02',
};
export const DEVICE_IDS: Record<string, string> = {
  'HIDRO-01': 'ESP32-HIDRO-01',
  'HIDRO-02': 'ESP32-HIDRO-02',
};

export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestCtx> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-test-'));
  const ctx = await createContext({
    nodeEnv: 'test',
    dataDir,
    databaseUrl: null,
    paymentProvider: 'demo',
    deviceSimulator: true,
    testSpeedFactor: 60, // 180s -> 3s reales
    heartbeatIntervalMs: 500,
    deviceOnlineThresholdMs: 2000,
    deviceDegradedThresholdMs: 6000,
    authTtlSeconds: 300,
    seedDemo: true,
    logLevel: 'error',
    adminEmail: 'admin@test.local',
    adminPassword: 'admin-pass',
    seedOverrides: {
      deviceSecrets: DEVICE_SECRETS,
      adminEmail: 'admin@test.local',
      adminPassword: 'admin-pass',
    },
    ...overrides,
  });
  const app = buildApp(ctx);
  const api = supertest(app);
  return {
    ctx,
    app,
    api,
    machineInfo: async (machineId: string) => {
      const res = await api.get(`/api/public/machines/${machineId}`).expect(200);
      return res.body.machine as Record<string, unknown>;
    },
    close: async () => {
      await ctx.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Headers HMAC autenticados para llamadas directas al protocolo de dispositivo. */
export function deviceHeaders(machineId: string, method: string, url: string, body: unknown = null): Record<string, string> {
  const secret = DEVICE_SECRETS[machineId] as string;
  const deviceId = DEVICE_IDS[machineId] as string;
  const ts = Date.now();
  const bodyStr = body === null ? '' : JSON.stringify(body);
  return {
    'content-type': 'application/json',
    'x-device-id': deviceId,
    'x-device-ts': String(ts),
    'x-device-sig': signDeviceRequest(secret, deviceId, ts, method, url, bodyStr),
  };
}

export async function waitFor<T>(
  fn: () => Promise<T | null | false | undefined>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeout = opts.timeoutMs ?? 10_000;
  const interval = opts.intervalMs ?? 100;
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value as T;
    await new Promise((r) => setTimeout(r, interval));
    last = value;
  }
  throw new Error(`waitFor timeout (${opts.label ?? 'condition'}). Last value: ${JSON.stringify(last)}`);
}

/** Patentes DEMO del seed: AE100AA remis ($500), AE200AA socio ($2.000); otra = externo ($8.000). */
export const PLATES = {
  remis: 'AE100AA',
  socio: 'AE200AA',
  externo: 'ZZ999ZZ',
};

/** Flujo de pago DEMO hasta WAITING_FOR_BUTTON (el simulador hace el polling). */
export async function payAndAuthorize(t: TestCtx, machineId = 'HIDRO-01', plate = PLATES.remis) {
  await waitMachineStatus(t, machineId, 'ONLINE');
  const res = await t.api.post(`/api/public/machines/${machineId}/sessions`).send({ plate }).expect(201);
  const checkout = res.body.checkout as { sessionId: string; payment: { externalPaymentId: string } };
  await t.api
    .post(`/api/public/payments/${checkout.payment.externalPaymentId}/simulate`)
    .send({ action: 'approve' })
    .expect(200);
  return { sessionId: checkout.sessionId, externalPaymentId: checkout.payment.externalPaymentId };
}

export async function waitMachineStatus(t: TestCtx, machineId: string, status: string, timeoutMs = 10_000): Promise<void> {
  await waitFor(async () => (((await t.machineInfo(machineId)).status as string) === status ? true : false), {
    timeoutMs,
    label: `machine ${machineId} ${status}`,
  });
}

export async function sessionStatus(t: TestCtx, sessionId: string): Promise<string> {
  const res = await t.api.get(`/api/public/sessions/${sessionId}`).expect(200);
  return res.body.session.status as string;
}

export async function waitSessionStatus(t: TestCtx, sessionId: string, status: string, timeoutMs = 10_000): Promise<void> {
  await waitFor(async () => ((await sessionStatus(t, sessionId)) === status ? true : false), {
    timeoutMs,
    label: `session ${status}`,
  });
}

/** Token de la cuenta del seed (ADMIN_EMAIL), que desde el ADR-062 es la cuenta `tecnico`. */
export async function adminToken(t: TestCtx, email = 'admin@test.local', password = 'admin-pass'): Promise<string> {
  const res = await t.api.post('/api/admin/auth/login').send({ email, password }).expect(200);
  return res.body.token as string;
}

export interface PanelUser {
  id: string;
  email: string;
  password: string;
  token: string;
}

/**
 * Da de alta una cuenta POR LA PUERTA REAL (ADR-062): quien la crea (por defecto la técnica)
 * usa `POST /admin/users`, la cuenta nueva entra por el login y cambia la clave inicial
 * (`must_change_password`). Devuelve el token ya libre para usar el panel.
 */
export async function createPanelUser(
  t: TestCtx,
  opts: { email: string; role: 'admin' | 'operador'; name?: string; creatorToken?: string },
): Promise<PanelUser> {
  const creator = opts.creatorToken ?? (await adminToken(t));
  const initial = 'clave-inicial-123';
  const password = 'clave-propia-456';
  const created = await t.api
    .post('/api/admin/users')
    .set('Authorization', `Bearer ${creator}`)
    .send({ email: opts.email, name: opts.name ?? opts.email.split('@')[0], role: opts.role, password: initial })
    .expect(201);
  const email = created.body.user.email as string;
  const first = await t.api.post('/api/admin/auth/login').send({ email, password: initial }).expect(200);
  const changed = await t.api
    .patch('/api/admin/me/password')
    .set('Authorization', `Bearer ${first.body.token}`)
    .send({ currentPassword: initial, newPassword: password })
    .expect(200);
  return { id: created.body.user.id as string, email, password, token: changed.body.token as string };
}
