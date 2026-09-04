/**
 * Seed manual idempotente: node dist/scripts/seed.js
 * (el boot de la API también ejecuta el seed cuando SEED_DEMO=true)
 */
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await createDb(config);
  try {
    await runMigrations(db);
    const result = await runSeed(db.db, config);
    // eslint-disable-next-line no-console
    console.log('Seed OK. Machines: HIDRO-01 (enabled), HIDRO-02 (disabled).');
    // eslint-disable-next-line no-console
    console.log('Device secrets (solo demo/dev):', result.devicesFile);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
