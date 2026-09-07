import type { AppConfig } from '../config.js';
import type { Db } from '../db/client.js';
import { getAllSettings, getSetting, setSetting } from '../repositories/repos.js';

export const SETTING_KEYS = {
  demoSpeedFactor: 'demoSpeedFactor',
  authTtlSeconds: 'authTtlSeconds',
  heartbeatIntervalMs: 'heartbeatIntervalMs',
  paymentPendingTimeoutSeconds: 'paymentPendingTimeoutSeconds',
  dailyWashLimit: 'dailyWashLimit',
} as const;

/** Configuración dinámica: settings de BD sobrescriben los defaults de entorno. */
export async function getDynamicSettings(db: Db, config: AppConfig) {
  const rows = await getAllSettings(db);
  const map = new Map<string, unknown>();
  for (const r of rows) map.set(r.key, r.value);
  return {
    demoSpeedFactor: (map.get(SETTING_KEYS.demoSpeedFactor) as number | null) ?? config.testSpeedFactor,
    authTtlSeconds: (map.get(SETTING_KEYS.authTtlSeconds) as number | null) ?? config.authTtlSeconds,
    heartbeatIntervalMs: (map.get(SETTING_KEYS.heartbeatIntervalMs) as number | null) ?? config.heartbeatIntervalMs,
    paymentPendingTimeoutSeconds:
      (map.get(SETTING_KEYS.paymentPendingTimeoutSeconds) as number | null) ?? config.paymentPendingTimeoutSeconds,
    dailyWashLimit: (map.get(SETTING_KEYS.dailyWashLimit) as number | null) ?? config.dailyWashLimit,
  };
}

export async function getDailyWashLimit(db: Db, config: AppConfig): Promise<number> {
  const v = await getSetting(db, SETTING_KEYS.dailyWashLimit);
  return typeof v === 'number' && v >= 1 ? v : config.dailyWashLimit;
}

export async function getDemoTimeScale(db: Db, config: AppConfig): Promise<number> {
  const v = await getSetting(db, SETTING_KEYS.demoSpeedFactor);
  if (typeof v === 'number' && v > 0) return config.nodeEnv === 'production' ? 1 : v;
  return config.nodeEnv === 'production' ? 1 : config.testSpeedFactor;
}

export async function getAuthTtlSeconds(db: Db, config: AppConfig): Promise<number> {
  const v = await getSetting(db, SETTING_KEYS.authTtlSeconds);
  return typeof v === 'number' && v > 0 ? v : config.authTtlSeconds;
}

export async function getPaymentPendingTimeoutSeconds(db: Db, config: AppConfig): Promise<number> {
  const v = await getSetting(db, SETTING_KEYS.paymentPendingTimeoutSeconds);
  return typeof v === 'number' && v >= 60 ? v : config.paymentPendingTimeoutSeconds;
}

export async function getHeartbeatIntervalMs(db: Db, config: AppConfig): Promise<number> {
  const v = await getSetting(db, SETTING_KEYS.heartbeatIntervalMs);
  return typeof v === 'number' && v >= 1000 ? v : config.heartbeatIntervalMs;
}

export async function updateDynamicSettings(
  db: Db,
  config: AppConfig,
  patch: Partial<{
    demoSpeedFactor: number;
    authTtlSeconds: number;
    heartbeatIntervalMs: number;
    paymentPendingTimeoutSeconds: number;
    dailyWashLimit: number;
  }>,
): Promise<void> {
  if (patch.demoSpeedFactor !== undefined && config.nodeEnv === 'production') {
    throw new Error('TEST_SPEED_FACTOR no puede modificarse en producción');
  }
  if (patch.demoSpeedFactor !== undefined) await setSetting(db, SETTING_KEYS.demoSpeedFactor, patch.demoSpeedFactor);
  if (patch.authTtlSeconds !== undefined) await setSetting(db, SETTING_KEYS.authTtlSeconds, patch.authTtlSeconds);
  if (patch.heartbeatIntervalMs !== undefined) await setSetting(db, SETTING_KEYS.heartbeatIntervalMs, patch.heartbeatIntervalMs);
  if (patch.paymentPendingTimeoutSeconds !== undefined)
    await setSetting(db, SETTING_KEYS.paymentPendingTimeoutSeconds, patch.paymentPendingTimeoutSeconds);
  if (patch.dailyWashLimit !== undefined) await setSetting(db, SETTING_KEYS.dailyWashLimit, patch.dailyWashLimit);
}
