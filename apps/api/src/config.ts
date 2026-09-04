import path from 'node:path';
import {
  DEFAULT_AUTH_TTL_SECONDS,
  DEFAULT_DAILY_WASH_LIMIT,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_PAYMENT_PENDING_TIMEOUT_SECONDS,
  DEVICE_DEGRADED_THRESHOLD_MS,
  DEVICE_ONLINE_THRESHOLD_MS,
} from '@hidro/shared';

export type NodeEnv = 'development' | 'test' | 'production';

export interface SeedOverrides {
  /** machineId -> secret de dispositivo (tests usan secrets conocidos) */
  deviceSecrets?: Record<string, string>;
  adminEmail?: string;
  adminPassword?: string;
}

export interface AppConfig {
  nodeEnv: NodeEnv;
  apiPort: number;
  /** host de escucha: 127.0.0.1 en dev, 0.0.0.0 en producción (contenedor) */
  apiHost: string;
  /** URL pública del FRONTEND (QR, back_urls de Mercado Pago, CORS) */
  publicAppUrl: string;
  /** URL pública de la API (webhooks de Mercado Pago). Fallback: publicAppUrl. */
  publicApiUrl: string;
  /** postgres://... para servidor real; vacío => PostgreSQL embebido (PGlite) */
  databaseUrl: string | null;
  /** directorio de datos locales (DB embebida, secretos demo, NVS del simulador) */
  dataDir: string;
  paymentProvider: 'demo' | 'mercadopago';
  mercadopagoAccessToken: string | null;
  mercadopagoPublicKey: string | null;
  mercadopagoWebhookSecret: string | null;
  jwtSecret: string;
  deviceAuthSecret: string;
  adminEmail: string;
  adminPassword: string;
  deviceSimulator: boolean;
  testSpeedFactor: number;
  heartbeatIntervalMs: number;
  /** Umbrales para ONLINE/DEGRADED/OFFLINE según antigüedad del último heartbeat. */
  deviceOnlineThresholdMs: number;
  deviceDegradedThresholdMs: number;
  authTtlSeconds: number;
  paymentPendingTimeoutSeconds: number;
  /** Límite de lavados por día POR PATENTE (default 2 — decisión del cliente). */
  dailyWashLimit: number;
  /** trust proxy para express-rate-limit (default 1 en producción) */
  trustProxy: number;
  seedDemo: boolean;
  seedOverrides: SeedOverrides;
  corsOrigins: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function str(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : fallback;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  // Carga apps/api/.env si existe (no falla si no existe)
  try {
    process.loadEnvFile(path.resolve(process.cwd(), '.env'));
  } catch {
    /* sin .env: se usan defaults DEMO */
  }

  const nodeEnv = (str(process.env.NODE_ENV, 'development') as NodeEnv) ?? 'development';
  const isProd = nodeEnv === 'production';

  const paymentProvider = str(process.env.PAYMENT_PROVIDER, 'demo') as 'demo' | 'mercadopago';
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || null;
  const mpPublic = process.env.MERCADOPAGO_PUBLIC_KEY?.trim() || null;
  const mpWebhook = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || null;

  if (paymentProvider === 'mercadopago' && (!mpToken || !mpPublic)) {
    throw new Error(
      'PAYMENT_PROVIDER=mercadopago requiere MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_PUBLIC_KEY. Usá PAYMENT_PROVIDER=demo para el modo sin credenciales.',
    );
  }

  const jwtSecret = str(process.env.JWT_SECRET, '');
  if (isProd && jwtSecret === 'dev-only-change-me') {
    throw new Error('En producción JWT_SECRET es obligatorio y no puede ser el valor de desarrollo.');
  }

  const dataDir = path.resolve(process.cwd(), str(process.env.DATA_DIR, './.data'));
  let speed = num(process.env.TEST_SPEED_FACTOR, 10);
  if (isProd && speed !== 1) {
    speed = 1; // NUNCA acelerar el tiempo en producción
  }

  const publicAppUrl = str(process.env.PUBLIC_APP_URL, 'http://localhost:5173').replace(/\/+$/, '');
  const config: AppConfig = {
    nodeEnv,
    apiPort: num(process.env.API_PORT, 3020),
    // loopback en desarrollo; 0.0.0.0 en producción (detrás de reverse proxy/contenedor)
    apiHost: str(process.env.API_HOST, isProd ? '0.0.0.0' : '127.0.0.1'),
    publicAppUrl,
    // Los webhooks de Mercado Pago van a la API, no al frontend.
    publicApiUrl: str(process.env.PUBLIC_API_URL, publicAppUrl).replace(/\/+$/, ''),
    databaseUrl: process.env.DATABASE_URL?.trim() || null,
    dataDir,
    paymentProvider,
    mercadopagoAccessToken: mpToken,
    mercadopagoPublicKey: mpPublic,
    mercadopagoWebhookSecret: mpWebhook,
    jwtSecret: str(jwtSecret, 'dev-only-change-me'),
    deviceAuthSecret: str(process.env.DEVICE_AUTH_SECRET, 'dev-only-change-me'),
    // Normalizado a minúsculas: el login compara lowercase (evita lockout por mayúsculas).
    adminEmail: str(process.env.ADMIN_EMAIL, 'admin@hidro.local').toLowerCase().trim(),
    adminPassword: str(process.env.ADMIN_PASSWORD, 'hidro-demo-2025'),
    deviceSimulator: !isProd && bool(process.env.DEVICE_SIMULATOR, true),
    testSpeedFactor: speed,
    heartbeatIntervalMs: num(process.env.HEARTBEAT_INTERVAL_MS, DEFAULT_HEARTBEAT_INTERVAL_MS),
    deviceOnlineThresholdMs: num(process.env.DEVICE_ONLINE_THRESHOLD_MS, DEVICE_ONLINE_THRESHOLD_MS),
    deviceDegradedThresholdMs: num(process.env.DEVICE_DEGRADED_THRESHOLD_MS, DEVICE_DEGRADED_THRESHOLD_MS),
    authTtlSeconds: num(process.env.AUTH_TTL_SECONDS, DEFAULT_AUTH_TTL_SECONDS),
    paymentPendingTimeoutSeconds: num(
      process.env.PAYMENT_PENDING_TIMEOUT_SECONDS,
      DEFAULT_PAYMENT_PENDING_TIMEOUT_SECONDS,
    ),
    dailyWashLimit: num(process.env.DAILY_WASH_LIMIT, DEFAULT_DAILY_WASH_LIMIT),
    trustProxy: num(process.env.TRUST_PROXY, isProd ? 1 : 0),
    seedDemo: bool(process.env.SEED_DEMO, true),
    seedOverrides: overrides.seedOverrides ?? {},
    corsOrigins: str(process.env.CORS_ORIGINS, 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel: str(process.env.LOG_LEVEL, 'info') as AppConfig['logLevel'],
  };
  return { ...config, ...overrides };
}
