import { Router } from 'express';
import { AppError, SimulatorActionSchema } from '@hidro/shared';
import { sql } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { ah } from '../asyncHandler.js';

/** Página /demo/device: control del ESP32 simulado (DEMO MODE). */
export function demoRoutes(ctx: AppContext): Router {
  const r = Router();

  r.use((_req, _res, next) => {
    if (!ctx.config.deviceSimulator || !ctx.simulator) {
      throw new AppError('SIMULATOR_DISABLED', 'El simulador de dispositivo no está habilitado (DEVICE_SIMULATOR).');
    }
    next();
  });

  /** Limpia los datos operativos DEMO (solo desarrollo): deja máquinas, dispositivos y admin. */
  r.post('/reset', ah(async (_req, res) => {
    if (ctx.config.nodeEnv === 'production' || ctx.config.paymentProvider !== 'demo') {
      throw new AppError('DEMO_MODE_REQUIRED', 'Reset solo disponible en DEMO MODE de desarrollo.');
    }
    await ctx.db.execute(sql`TRUNCATE TABLE "device_commands", "device_events", "audit_logs", "authorizations", "payments", "sessions" CASCADE`);
    ctx.logger.info('demo data reset');
    res.json({ ok: true });
  }));

  r.get('/device', ah(async (_req, res) => {
    res.json({ simulators: ctx.simulator!.snapshotAll() });
  }));

  r.get('/device/:machineId/state', ah(async (req, res) => {
    res.json({ simulator: await ctx.simulator!.snapshot(req.params.machineId as string) });
  }));

  r.post('/device/:machineId/action', ah(async (req, res) => {
    const { action } = SimulatorActionSchema.parse(req.body);
    res.json({ simulator: await ctx.simulator!.action(req.params.machineId as string, action) });
  }));

  return r;
}
