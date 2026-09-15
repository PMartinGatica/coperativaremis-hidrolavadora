import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertProductionConfig,
  DEMO_ADMIN_PASSWORD,
  DEV_SECRET_PLACEHOLDER,
  loadConfig,
  type AppConfig,
} from '../src/config.js';

const VALID = {
  jwtSecret: 'j'.repeat(64),
  deviceAuthSecret: 'd'.repeat(64),
  adminPassword: 'clave-de-prueba-larga',
  seedOverrides: {},
};

function prodConfig(patch: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig({ nodeEnv: 'test' }), ...VALID, nodeEnv: 'production', ...patch };
}

describe('guardas de configuración de producción', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('config de producción válida no tira', () => {
    expect(() => assertProductionConfig(prodConfig())).not.toThrow();
  });

  it.each([
    ['vacío', ''],
    ['placeholder de desarrollo', DEV_SECRET_PLACEHOLDER],
    ['menos de 32 caracteres', 'x'.repeat(31)],
  ])('JWT_SECRET %s -> tira nombrando solo JWT_SECRET', (_label, value) => {
    const run = () => assertProductionConfig(prodConfig({ jwtSecret: value }));
    expect(run).toThrow(/JWT_SECRET/);
    expect(run).not.toThrow(/DEVICE_AUTH_SECRET|ADMIN_PASSWORD/);
  });

  it.each([
    ['vacío', ''],
    ['placeholder de desarrollo', DEV_SECRET_PLACEHOLDER],
    ['menos de 32 caracteres', 'x'.repeat(31)],
  ])('DEVICE_AUTH_SECRET %s -> tira nombrando solo DEVICE_AUTH_SECRET', (_label, value) => {
    const run = () => assertProductionConfig(prodConfig({ deviceAuthSecret: value }));
    expect(run).toThrow(/DEVICE_AUTH_SECRET/);
    expect(run).not.toThrow(/JWT_SECRET|ADMIN_PASSWORD/);
  });

  it.each([
    ['clave demo', DEMO_ADMIN_PASSWORD],
    ['menos de 12 caracteres', 'corta-11-ch'],
  ])('ADMIN_PASSWORD %s -> tira', (_label, value) => {
    expect(() => assertProductionConfig(prodConfig({ adminPassword: value }))).toThrow(/ADMIN_PASSWORD/);
  });

  it('la clave sembrada por seedOverrides también se valida', () => {
    const cfg = prodConfig({ seedOverrides: { adminPassword: DEMO_ADMIN_PASSWORD } });
    expect(() => assertProductionConfig(cfg)).toThrow(/ADMIN_PASSWORD/);
  });

  it('las 3 inválidas juntas -> un solo error que nombra las 3, sin valores', () => {
    const cfg = prodConfig({
      jwtSecret: 'VALOR-JWT-VISIBLE',
      deviceAuthSecret: 'VALOR-DEVICE-VISIBLE',
      adminPassword: 'VALOR-ADMIN',
    });
    let message = '';
    try {
      assertProductionConfig(cfg);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/JWT_SECRET/);
    expect(message).toMatch(/DEVICE_AUTH_SECRET/);
    expect(message).toMatch(/ADMIN_PASSWORD/);
    expect(message).not.toMatch(/VALOR-JWT-VISIBLE|VALOR-DEVICE-VISIBLE|VALOR-ADMIN/);
  });

  it('loadConfig aplica la guarda sobre la config mezclada con overrides', () => {
    expect(() => loadConfig({ nodeEnv: 'production', paymentProvider: 'demo', ...VALID, jwtSecret: '' })).toThrow(
      /JWT_SECRET/,
    );
    expect(() => loadConfig({ nodeEnv: 'production', paymentProvider: 'demo', ...VALID })).not.toThrow();
  });

  it('fuera de producción los valores de desarrollo no tiran', () => {
    expect(() =>
      loadConfig({ nodeEnv: 'test', jwtSecret: DEV_SECRET_PLACEHOLDER, adminPassword: DEMO_ADMIN_PASSWORD }),
    ).not.toThrow();
  });

  it('con NODE_ENV=production real y sin SEED_DEMO, las patentes demo y el simulador quedan apagados', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SEED_DEMO', '');
    vi.stubEnv('DEVICE_SIMULATOR', '');
    const cfg = loadConfig({ paymentProvider: 'demo', ...VALID });
    expect(cfg.nodeEnv).toBe('production');
    expect(cfg.seedDemo).toBe(false);
    expect(cfg.deviceSimulator).toBe(false);
  });

  it('NODE_ENV con un valor desconocido tira', () => {
    vi.stubEnv('NODE_ENV', 'prod');
    expect(() => loadConfig()).toThrow(/NODE_ENV inválido/);
  });
});
