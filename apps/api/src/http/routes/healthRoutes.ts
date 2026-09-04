import { Router } from 'express';
import { sql } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { listMachines } from '../../repositories/repos.js';
import { ah } from '../asyncHandler.js';

/** GET /health — estado de subsistemas sin exponer secretos. */
export function healthRoutes(ctx: AppContext): Router {
  const r = Router();

  r.get('/', ah(async (_req, res) => {
    let database = 'OK';
    try {
      await ctx.db.execute(sql`select 1`);
    } catch {
      database = 'ERROR';
    }
    const machines = await listMachines(ctx.db).catch(() => []);
    const online = machines.filter((m) => m.status === 'ONLINE').length;

    res.status(database === 'OK' ? 200 : 503).json({
      status: database === 'OK' ? 'ok' : 'degraded',
      checks: {
        api: 'OK',
        database,
        payments: ctx.config.paymentProvider === 'demo' ? 'DEMO' : 'MERCADOPAGO',
        devices: `ONLINE ${online}/${machines.length}`,
        simulator: ctx.config.deviceSimulator ? 'ENABLED' : 'DISABLED',
        speedFactor: ctx.config.nodeEnv === 'production' ? 1 : ctx.config.testSpeedFactor,
      },
      uptimeSeconds: Math.floor(process.uptime()),
    });
  }));

  return r;
}
