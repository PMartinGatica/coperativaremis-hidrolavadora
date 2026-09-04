import { createContext } from './bootstrap.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const ctx = await createContext();

  const app = buildApp(ctx);
  // Host configurable: 127.0.0.1 en desarrollo; 0.0.0.0 en producción (contenedor/reverse proxy).
  // En desarrollo usamos loopback explícito porque el wildcard IPv6 (::) puede estar ocupado.
  const server = app.listen(ctx.config.apiPort, ctx.config.apiHost, () => {
    const mode = ctx.config.paymentProvider === 'demo' ? 'DEMO MODE' : 'MERCADO PAGO';
    ctx.logger.info('===========================================================');
    ctx.logger.info('HIDRO SELF-SERVICE API', {
      url: `http://localhost:${ctx.config.apiPort}`,
      health: `http://localhost:${ctx.config.apiPort}/health`,
      payments: mode,
      db: ctx.config.databaseUrl ? 'postgres (server)' : 'postgres embebido (PGlite)',
      simulator: ctx.config.deviceSimulator ? 'ENABLED' : 'DISABLED',
      speedFactor: ctx.config.testSpeedFactor,
      admin: ctx.config.adminEmail,
    });
    ctx.logger.info('===========================================================');
  });
  server.on('error', (err) => {
    ctx.logger.error('listen error', { err: String(err) });
    void ctx.close().finally(() => process.exit(1));
  });

  // El barrido periódico (pagos/authorizaciones vencidas + estados de máquina)
  // corre dentro del contexto (src/bootstrap.ts).

  const shutdown = async (signal: string) => {
    ctx.logger.info('shutdown', { signal });
    server.close(() => {
      void ctx.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('FATAL', err);
  process.exit(1);
});
