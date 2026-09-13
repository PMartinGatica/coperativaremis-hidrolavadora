import { Router } from 'express';
import { AppError, CreateSessionParamsSchema, PlateBodySchema, QuoteParamsSchema, SimulatePaymentSchema } from '@hidro/shared';
import type { AppContext } from '../../context.js';
import { getPublicMachineInfo, listPublicMachines, quotePlate } from '../../services/machineService.js';
import { createSessionWithPayment, getSessionState } from '../../services/sessionService.js';
import { getPaymentPublicInfo, simulateDemoPayment } from '../../services/paymentService.js';
import { insertAudit } from '../../repositories/repos.js';
import { ah } from '../asyncHandler.js';
import { createPaymentCreationRateLimit, createPinAttemptRateLimit, createSimulateRateLimit } from '../middleware.js';

export function publicRoutes(ctx: AppContext): Router {
  const r = Router();
  // Fábricas: cada instancia de app tiene sus propios limiters (no se comparte cuota).
  const paymentCreationRateLimit = createPaymentCreationRateLimit();
  const simulateRateLimit = createSimulateRateLimit();
  // Por patente (no por IP): sin esto, agotar los 10.000 PINs contra UNA patente conocida
  // era viable en horas (hallazgo del Eng review, docs/designs/pin-patente-remis-socio.md).
  const pinAttemptRateLimit = createPinAttemptRateLimit();

  r.get('/machines', ah(async (_req, res) => {
    res.json({ machines: await listPublicMachines(ctx) });
  }));

  r.get('/machines/:machineId', ah(async (req, res) => {
    const info = await getPublicMachineInfo(ctx, req.params.machineId as string);
    res.json({ machine: info });
  }));

  /** Cotización de tarifa por patente (NO crea nada, NO cobra). */
  r.post('/machines/:machineId/quote', pinAttemptRateLimit, ah(async (req, res) => {
    const { machineId } = QuoteParamsSchema.parse({ machineId: req.params.machineId });
    const { plate, pin } = PlateBodySchema.parse(req.body);
    res.json({ quote: await quotePlate(ctx, machineId, plate, pin) });
  }));

  /** Crear sesión + cobro. El backend re-valida máquina, tarifa y límite diario de la patente. */
  r.post('/machines/:machineId/sessions', paymentCreationRateLimit, pinAttemptRateLimit, ah(async (req, res) => {
    const { machineId } = CreateSessionParamsSchema.parse({ machineId: req.params.machineId });
    const { plate, pin } = PlateBodySchema.parse(req.body);
    try {
      const checkout = await createSessionWithPayment(ctx, machineId, plate, pin);
      res.status(201).json({ checkout });
    } catch (err) {
      if (err instanceof AppError && err.code === 'MACHINE_BUSY') {
        await insertAudit(ctx.db, {
          actor: 'system',
          action: 'MACHINE_BUSY_REJECTED',
          entity: 'machine',
          entityId: machineId,
          metadata: { plate },
        });
      }
      throw err;
    }
  }));

  /** Estado de sesión (polling de respaldo del frontend; el webhook actualiza el backend). */
  r.get('/sessions/:sessionId', ah(async (req, res) => {
    res.json(await getSessionState(ctx, req.params.sessionId as string));
  }));

  r.get('/payments/by-external/:externalId', ah(async (req, res) => {
    res.json(await getPaymentPublicInfo(ctx, req.params.externalId as string));
  }));

  /** SIMULAR PAGO (solo PAYMENT_PROVIDER=demo). Misma lógica de dominio que MP real. */
  r.post('/payments/:externalId/simulate', simulateRateLimit, ah(async (req, res) => {
    const { action } = SimulatePaymentSchema.parse(req.body);
    const result = await simulateDemoPayment(ctx, req.params.externalId as string, action);
    res.json({ result });
  }));

  return r;
}
