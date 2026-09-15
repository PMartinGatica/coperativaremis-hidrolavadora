import path from 'node:path';
import {
  DEFAULT_AUTH_TTL_SECONDS,
  DEFAULT_DAILY_WASH_LIMIT,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_PAYMENT_PENDING_TIMEOUT_SECONDS,
  DEVICE_DEGRADED_THRESHOLD_MS,
  DEVICE_ONLINE_THRESHOLD_MS,
} from '@hidro/shared';

const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const DEV_SECRET_PLACEHOLDER = 'dev-only-change-me';
export const DEMO_ADMIN_PASSWORD = 'hidro-demo-2025';
const MIN_SECRET_LENGTH = 32;
const MIN_ADMIN_PASSWORD_LENGTH = 12;

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
  /** En producción con pagos DEMO, un ESP32 real no recibe autorizaciones salvo este opt-in (prueba en banco). */
  allowDemoPaymentsOnDevice: boolean;
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

// La clave con la que el seed crea o sincroniza el admin: la guarda valida exactamente esta.
export function effectiveAdminPassword(config: AppConfig): string {
  return config.seedOverrides.adminPassword ?? config.adminPassword;
}

// Un solo error con todos los problemas: se corrigen en un redeploy. Nombra variables, nunca valores.
export function assertProductionConfig(config: AppConfig): void {
  const problems: string[] = [];
  const isWeakSecret = (v: string) => v === DEV_SECRET_PLACEHOLDER || v.length < MIN_SECRET_LENGTH;
  if (isWeakSecret(config.jwtSecret)) {
    problems.push(`JWT_SECRET falta, es el valor de desarrollo o tiene menos de ${MIN_SECRET_LENGTH} caracteres`);
  }
  if (isWeakSecret(config.deviceAuthSecret)) {
    problems.push(
      `DEVICE_AUTH_SECRET falta, es el valor de desarrollo o tiene menos de ${MIN_SECRET_LENGTH} caracteres`,
    );
  }
  if (!isWeakSecret(config.jwtSecret) && config.jwtSecret === config.deviceAuthSecret) {
    problems.push('JWT_SECRET y DEVICE_AUTH_SECRET tienen que ser distintos');
  }
  const adminPassword = effectiveAdminPassword(config);
  if (adminPassword === DEMO_ADMIN_PASSWORD || adminPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
    problems.push(`ADMIN_PASSWORD es la clave demo o tiene menos de ${MIN_ADMIN_PASSWORD_LENGTH} caracteres`);
  }
  if (problems.length > 0) {
    throw new Error(`Configuración de producción inválida:\n- ${problems.join('\n- ')}`);
  }
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  // Carga apps/api/.env si existe (no falla si no existe)
  try {
    process.loadEnvFile(path.resolve(process.cwd(), '.env'));
  } catch {
    /* sin .env: se usan defaults DEMO */
  }

  const rawNodeEnv = str(process.env.NODE_ENV, 'development');
  if (!(NODE_ENVS as readonly string[]).includes(rawNodeEnv)) {
    // Un typo (ej. "prod") apagaría en silencio todas las guardas de producción.
    throw new Error(`NODE_ENV inválido ("${rawNodeEnv}"): usar development, test o production.`);
  }
  const nodeEnv = rawNodeEnv as NodeEnv;
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
    allowDemoPaymentsOnDevice: bool(process.env.ALLOW_DEMO_PAYMENTS_ON_DEVICE, false),
    jwtSecret: str(jwtSecret, DEV_SECRET_PLACEHOLDER),
    deviceAuthSecret: str(process.env.DEVICE_AUTH_SECRET, DEV_SECRET_PLACEHOLDER),
    // Normalizado a minúsculas: el login compara lowercase (evita lockout por mayúsculas).
    adminEmail: str(process.env.ADMIN_EMAIL, 'admin@hidro.local').toLowerCase().trim(),
    adminPassword: str(process.env.ADMIN_PASSWORD, DEMO_ADMIN_PASSWORD),
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
    // Solo las patentes demo dependen de esto; máquinas, dispositivos y admin se siembran siempre.
    seedDemo: bool(process.env.SEED_DEMO, !isProd),
    seedOverrides: overrides.seedOverrides ?? {},
    corsOrigins: str(process.env.CORS_ORIGINS, 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel: str(process.env.LOG_LEVEL, 'info') as AppConfig['logLevel'],
  };
  const merged = { ...config, ...overrides };
  if (merged.nodeEnv === 'production') assertProductionConfig(merged);
  return merged;
}
