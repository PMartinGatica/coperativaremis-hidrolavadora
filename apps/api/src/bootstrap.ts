import { loadConfig, type AppConfig } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { createLogger } from './logger.js';
import { createPaymentProvider } from './payments/index.js';
import { getDemoTimeScale } from './services/settingsService.js';
import { sweepExpired } from './services/sessionService.js';
import { recomputeMachineStatuses } from './services/machineService.js';
import type { SimulatorHub } from './simulator/hub.js';
import type { AppContext } from './context.js';

/**
 * Construcción del contexto con inyección de dependencias.
 * Los tests usan createContext() con dataDir ':memory:' y speed factor alto.
 */
export async function createContext(overrides: Partial<AppConfig> = {}): Promise<AppContext> {
  const config = loadConfig(overrides);
  const dbHandle = await createDb(config);
  try {
    await runMigrations(dbHandle);
    await runSeed(dbHandle.db, config);
  } catch (err) {
    await dbHandle.close().catch(() => {});
    throw err;
  }

  const logger = createLogger('api', config.logLevel);
  const provider = createPaymentProvider(config);

  const ctx: AppContext = {
    config,
    dbHandle,
    db: dbHandle.db,
    logger,
    provider,
    simulator: null,
    getSpeedFactor: () => getDemoTimeScale(dbHandle.db, config),
    close: async () => {
      ctx.simulator?.stop();
      clearInterval(sweeper);
      await dbHandle.close();
    },
  };

  // Barrido periódico: pagos vencidos, autorizaciones vencidas y estados ONLINE/DEGRADED/OFFLINE.
  // Vive en el contexto (no en index.ts) para que los tests también lo tengan.
  const sweeper = setInterval(() => {
    void sweepExpired(ctx, new Date())
      .then(() => recomputeMachineStatuses(ctx, new Date()))
      .catch((err) => logger.error('sweep failed', { err: String(err) }));
  }, config.nodeEnv === 'test' ? 2000 : 15_000);
  sweeper.unref?.();

  if (config.deviceSimulator) {
    const { SimulatorHub } = await import('./simulator/hub.js');
    const hub: SimulatorHub = new SimulatorHub(ctx);
    await hub.start();
    ctx.simulator = hub;
  }

  return ctx;
}
