import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import type { Client } from 'pg';
import type { DbHandle } from './client.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Runner de migraciones propio (compatible con la carpeta drizzle/):
 * PGlite y node-postgres ejecutan cada archivo .sql como query multi-statement
 * (protocolo simple), algo que el migrator de drizzle-orm no soporta en PGlite.
 * Tabla de tracking: hidro_migrations.
 */
async function rawExec(db: DbHandle, sql: string): Promise<void> {
  if (db.kind === 'pglite') {
    await (db.raw as PGlite).exec(sql);
  } else {
    await (db.raw as Client).query(sql);
  }
}

async function ensureTrackingTable(db: DbHandle): Promise<void> {
  await rawExec(
    db,
    `CREATE TABLE IF NOT EXISTS "hidro_migrations" (
       "name" text PRIMARY KEY NOT NULL,
       "applied_at" timestamp with time zone DEFAULT now() NOT NULL
     );`,
  );
}

async function queryRows(db: DbHandle, sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  if (db.kind === 'pglite') {
    const res = await (db.raw as PGlite).query(sql, params as never[]);
    return res.rows as Array<Record<string, unknown>>;
  }
  const res = await (db.raw as Client).query(sql, params);
  return res.rows as Array<Record<string, unknown>>;
}

async function isApplied(db: DbHandle, name: string): Promise<boolean> {
  const rows = await queryRows(
    db,
    `select count(*)::int as count from "hidro_migrations" where "name" = $1`,
    [name],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function markApplied(db: DbHandle, name: string): Promise<void> {
  if (db.kind === 'pglite') {
    await (db.raw as PGlite).exec(`INSERT INTO "hidro_migrations" ("name") VALUES ('${name.replace(/'/g, "''")}')`);
  } else {
    await (db.raw as Client).query(`INSERT INTO "hidro_migrations" ("name") VALUES ($1)`, [name]);
  }
}

export async function runMigrations(db: DbHandle): Promise<void> {
  await ensureTrackingTable(db);
  const files = fs
    .readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (await isApplied(db, file)) continue;
    const sql = fs.readFileSync(path.join(migrationsFolder, file), 'utf8');
    await rawExec(db, sql);
    await markApplied(db, file);
  }
}
