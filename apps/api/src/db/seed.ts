import fs from 'node:fs';
import path from 'node:path';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_PRICE_EXTERNO_ARS,
  DEFAULT_PRICE_REMIS_ARS,
  DEFAULT_PRICE_SOCIO_ARS,
  type MachineStatus,
} from '@hidro/shared';
import type { Db } from './client.js';
import { adminUsers, devices, machines, vehicles, type DeviceRow } from './schema.js';
import { newDeviceSecret, uuid } from '../ids.js';
import type { AppConfig } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('seed');

export interface SeedResult {
  devicesFile: string;
  deviceSecrets: Record<string, string>; // machineId -> secret (solo demo/dev)
}

/** Hash de CONTRASEÑAS con scrypt (irreversible — para usuarios admin).
 *  Salt ALEATORIO por usuario (16 bytes), almacenado en el propio string.
 *  NO hay pepper externo: el hash es autocontenido (salt + hash en el string),
 *  por eso verificar no necesita más que el secret + el stored. */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(secret, salt, 64).toString('hex');
  return `${salt}$${hash}`;
}

/** Verifica un hash generado por hashSecret(). El salt se lee del propio string,
 *  así que los hashes generados antes (salt fijo o aleatorio) siguen validando. */
export function verifySecret(secret: string, stored: string): boolean {
  const [salt, expected] = stored.split('$');
  if (!salt || !expected) return false;
  const actual = scryptSync(secret, salt, 64);
  const expectedBuf = Buffer.from(expected, 'hex');
  return actual.length === expectedBuf.length && timingSafeEqual(actual, expectedBuf);
}

/**
 * Cifrado REVERSIBLE para secrets de dispositivo (necesario para verificar HMAC).
 * AES-256-GCM, clave derivada de DEVICE_AUTH_SECRET.
 */
function aesKey(pepper: string): Buffer {
  return createHash('sha256').update(`hidro-aes-key:${pepper}`).digest();
}

export function encryptSecret(secret: string, pepper: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey(pepper), iv);
  const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptSecret(stored: string, pepper: string): string | null {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'enc') return null;
  try {
    const iv = Buffer.from(parts[1] as string, 'base64url');
    const tag = Buffer.from(parts[2] as string, 'base64url');
    const data = Buffer.from(parts[3] as string, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', aesKey(pepper), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

interface SeedMachineSpec {
  id: string;
  name: string;
  description: string;
  priceRemisArs: number;
  priceSocioArs: number;
  priceExternoArs: number;
  durationSeconds: number;
  enabled: boolean;
}

/**
 * Tarifas definidas por el cliente:
 *   $500 remis de la cooperativa · $2.000 auto de socio · $8.000 particular
 */
export const DEMO_MACHINES: SeedMachineSpec[] = [
  {
    id: 'HIDRO-01',
    name: 'Hidrolavadora 10 HP',
    description: 'Hidrolavadora principal — motor 10 HP (10 HP: dato del cliente)',
    priceRemisArs: DEFAULT_PRICE_REMIS_ARS,
    priceSocioArs: DEFAULT_PRICE_SOCIO_ARS,
    priceExternoArs: DEFAULT_PRICE_EXTERNO_ARS,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    enabled: true,
  },
  {
    id: 'HIDRO-02',
    name: 'Hidrolavadora 5 HP',
    description: 'Segunda hidrolavadora — motor 5 HP (PENDING CLIENT DECISION). Deshabilitada por defecto.',
    priceRemisArs: DEFAULT_PRICE_REMIS_ARS,
    priceSocioArs: DEFAULT_PRICE_SOCIO_ARS,
    priceExternoArs: DEFAULT_PRICE_EXTERNO_ARS,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    enabled: false,
  },
];

/** Patentes DEMO registradas para probar las tarifas (editable desde admin). */
export const DEMO_VEHICLES: Array<{ plate: string; category: 'remis' | 'socio'; ownerName: string }> = [
  { plate: 'AE100AA', category: 'remis', ownerName: 'DEMO — remis de la cooperativa' },
  { plate: 'AE200AA', category: 'socio', ownerName: 'DEMO — auto de socio' },
];

export async function runSeed(db: Db, config: AppConfig): Promise<SeedResult> {
  const deviceSecrets: Record<string, string> = {};

  for (const spec of DEMO_MACHINES) {
    const existing = await db.select().from(machines).where(eq(machines.id, spec.id)).limit(1);
    if (existing.length === 0) {
      await db.insert(machines).values({
        id: spec.id,
        name: spec.name,
        description: spec.description,
        status: 'OFFLINE' as MachineStatus,
        priceRemisArs: spec.priceRemisArs,
        priceSocioArs: spec.priceSocioArs,
        priceExternoArs: spec.priceExternoArs,
        durationSeconds: spec.durationSeconds,
        enabled: spec.enabled,
      });
      log.info('machine seeded', { machineId: spec.id, enabled: spec.enabled });
    }

    // Dispositivo (ESP32) por máquina con secret propio — nunca una clave global.
    const deviceRows = await db.select().from(devices).where(eq(devices.machineId, spec.id)).limit(1);
    const existingDevice = deviceRows[0];
    if (existingDevice && decryptSecret(existingDevice.secretEnc, config.deviceAuthSecret) === null) {
      // Base cifrada con otro DEVICE_AUTH_SECRET: el ESP32 va a recibir DEVICE_UNAUTHORIZED.
      log.warn('device secret no descifra con DEVICE_AUTH_SECRET actual; rotar desde admin', {
        machineId: spec.id,
      });
    }
    if (!existingDevice) {
      const secret =
        config.seedOverrides.deviceSecrets?.[spec.id] ?? newDeviceSecret();
      deviceSecrets[spec.id] = secret;
      const row: typeof devices.$inferInsert = {
        id: uuid(),
        machineId: spec.id,
        deviceIdentifier: `ESP32-${spec.id}`,
        firmwareVersion: null,
        status: 'OFFLINE',
        secretEnc: encryptSecret(secret, config.deviceAuthSecret),
      };
      await db.insert(devices).values(row);
      log.info('device seeded', { machineId: spec.id, deviceIdentifier: row.deviceIdentifier });
    }
  }

  // Patentes DEMO (idempotente): registradas como remis/socio; lo demás es externo.
  if (config.seedDemo) {
    if (config.nodeEnv === 'production') {
      log.warn('SEED_DEMO activo en producción: se siembran patentes demo con tarifa remis/socio');
    }
    for (const v of DEMO_VEHICLES) {
      const existing = await db.select().from(vehicles).where(eq(vehicles.plate, v.plate)).limit(1);
      if (existing.length === 0) {
        await db.insert(vehicles).values({
          id: uuid(),
          plate: v.plate,
          category: v.category,
          ownerName: v.ownerName,
        });
        log.info('vehicle seeded', { plate: v.plate, category: v.category });
      }
    }
  }

  // Email SIEMPRE normalizado a minúsculas: el login compara lowercase, así que el seed no
  // puede crear un email inlogueable.
  const adminEmail = (config.seedOverrides.adminEmail ?? config.adminEmail).toLowerCase().trim();
  const adminPassword = config.seedOverrides.adminPassword ?? config.adminPassword;
  const admins = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, adminEmail))
    .limit(1);
  const admin = admins[0];
  if (!admin) {
    await db.insert(adminUsers).values({
      id: uuid(),
      email: adminEmail,
      passwordHash: hashSecret(adminPassword),
      role: 'admin',
    });
    log.info('admin user seeded', { email: adminEmail });
  } else if (!verifySecret(adminPassword, admin.passwordHash)) {
    // No hay pantalla de cambio de contraseña: el env es la única forma de rotarla.
    await db
      .update(adminUsers)
      .set({ passwordHash: hashSecret(adminPassword) })
      .where(eq(adminUsers.id, admin.id));
    log.info('admin password synced from env', { email: adminEmail });
  }

  if (config.nodeEnv === 'production') {
    // Una cuenta con email viejo sigue entrando y ya no cuenta como "la cuenta por defecto".
    const others = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(ne(adminUsers.email, adminEmail));
    if (others.length > 0) {
      log.warn('hay cuentas admin distintas de ADMIN_EMAIL', { count: others.length });
    }
  }

  // Persiste los secrets de dispositivos en texto plano SOLO cuando corre el
  // SIMULADOR (DEMO MODE). En producción los secrets viajan únicamente al ESP32
  // en el momento del flashing (la respuesta de "Rotar secret" los muestra una vez).
  const devicesFile = path.resolve(config.dataDir, 'devices.json');
  if (config.deviceSimulator) {
    let stored: Record<string, string> = {};
    if (fs.existsSync(devicesFile)) {
      try {
        stored = JSON.parse(fs.readFileSync(devicesFile, 'utf8'));
      } catch {
        stored = {};
      }
    }
    const merged = { ...stored, ...deviceSecrets };
    fs.mkdirSync(path.dirname(devicesFile), { recursive: true });
    fs.writeFileSync(devicesFile, JSON.stringify(merged, null, 2));
  }

  return { devicesFile, deviceSecrets: config.deviceSimulator ? readDeviceSecrets(devicesFile) : {} };
}

function readDeviceSecrets(devicesFile: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(devicesFile, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function loadDeviceSecret(machineId: string, dataDir: string): Promise<string | null> {
  const file = path.resolve(dataDir, 'devices.json');
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
    return data[machineId] ?? null;
  } catch {
    return null;
  }
}

export async function updateDeviceSecretFile(machineId: string, secret: string, dataDir: string): Promise<void> {
  const file = path.resolve(dataDir, 'devices.json');
  let data: Record<string, string> = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  } catch {
    data = {};
  }
  data[machineId] = secret;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/** Actualiza estado derivado de máquina en base al heartbeat más reciente. */
export function deviceStatusOf(row: Pick<DeviceRow, 'status'>): MachineStatus {
  return row.status as MachineStatus;
}
