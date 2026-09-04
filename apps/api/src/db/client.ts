import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from './schema.js';
import type { AppConfig } from '../config.js';
import { createLogger } from '../logger.js';

export type Db = PgliteDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  kind: 'pglite' | 'postgres';
  /** Cliente nativo para queries multi-statement (migraciones). */
  raw: PGlite | Client;
  close(): Promise<void>;
}

const log = createLogger('db');

/**
 * PostgreSQL real si DATABASE_URL está definido (producción).
 * Si no, PostgreSQL 16 EMBEBIDO (PGlite, motor PostgreSQL dentro del proceso)
 * persistido en dataDir — DEMO MODE sin servidor externo.
 */
export async function createDb(config: AppConfig): Promise<DbHandle> {
  if (config.databaseUrl) {
    const client = new Client({ connectionString: config.databaseUrl });
    await client.connect();
    const db = pgDrizzle(client, { schema }) as unknown as Db;
    log.info('database connected', { kind: 'postgres' });
    return { db, kind: 'postgres', raw: client, close: () => client.end() };
  }

  const memory = config.dataDir === ':memory:' || config.dataDir.endsWith(':memory:');
  const dir = path.resolve(config.dataDir, 'pg');
  if (!memory) fs.mkdirSync(dir, { recursive: true });
  // Durabilidad relajada SOLO en tests en memoria; en archivo, commits confiables.
  const pg = new PGlite(memory ? undefined : dir, { relaxedDurability: memory });
  const db = drizzle(pg, { schema });
  log.info('database connected', { kind: 'pglite-embedded', memory, dir: memory ? null : dir });
  return { db, kind: 'pglite', raw: pg, close: async () => pg.close() };
}
