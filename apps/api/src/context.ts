import type { Db } from './db/client.js';
import type { AppConfig } from './config.js';
import type { Logger } from './logger.js';
import type { PaymentProvider } from './payments/provider.js';

/**
 * Contexto de aplicación con inyección de dependencias.
 * Cada servicio recibe el ctx completo (db, config, logger, provider).
 * El simulador de dispositivo corre dentro del proceso en DEMO MODE.
 */
export interface AppContext {
  config: AppConfig;
  dbHandle: { db: Db; kind: 'pglite' | 'postgres'; close(): Promise<void> };
  db: Db;
  logger: Logger;
  provider: PaymentProvider;
  simulator: import('./simulator/hub.js').SimulatorHub | null;
  /** factor de aceleración DEMO vigente (1 en producción) */
  getSpeedFactor(): Promise<number>;
  close(): Promise<void>;
}
