import { Router } from 'express';
import {
  AppError,
  DeviceEventPayloadSchema,
  HeartbeatPayloadSchema,
  SessionFinishPayloadSchema,
  SessionInterruptedPayloadSchema,
  SessionStartPayloadSchema,
} from '@hidro/shared';
import type { AppContext } from '../../context.js';
import { authenticateDevice } from '../../auth/deviceAuth.js';
import {
  acknowledgeCommand,
  finishSessionFromDevice,
  getAuthorizationForDevice,
  interruptSessionFromDevice,
  recordDeviceEvent,
  registerHeartbeat,
  startSessionFromDevice,
} from '../../services/deviceService.js';
import { ah } from '../asyncHandler.js';

/**
 * Protocolo de dispositivo (REST + HMAC por dispositivo).
 * El ESP32 siempre inicia las conexiones hacia el backend (nunca al revés).
 * Ver docs/device-protocol.md.
 */
export function deviceRoutes(ctx: AppContext): Router {
  const r = Router();

  // Autenticación HMAC obligatoria en TODOS los endpoints de dispositivo.
  r.use(ah(async (req, res, next) => {
    const device = await authenticateDevice(ctx.db, ctx.config, req);
    req.device = device;
    next();
  }));

  const assertMachine = (deviceMachineId: string, payloadMachineId: string) => {
    if (deviceMachineId !== payloadMachineId) {
      throw new AppError('DEVICE_MACHINE_MISMATCH', 'El dispositivo no pertenece a la máquina indicada.', {
        deviceMachineId,
        payloadMachineId,
      });
    }
  };

  r.post('/heartbeat', ah(async (req, res) => {
    const payload = HeartbeatPayloadSchema.parse(req.body);
    assertMachine(req.device?.machineId ?? '', payload.machine_id);
    const resp = await registerHeartbeat(ctx, req.device!, payload);
    res.json(resp);
  }));

  r.get('/authorization', ah(async (_req, res) => {
    const resp = await getAuthorizationForDevice(ctx, _req.device!);
    res.json(resp);
  }));

  r.post('/session/start', ah(async (req, res) => {
    const payload = SessionStartPayloadSchema.parse(req.body);
    assertMachine(req.device?.machineId ?? '', payload.machine_id);
    res.json(await startSessionFromDevice(ctx, req.device!, payload));
  }));

  r.post('/session/finish', ah(async (req, res) => {
    const payload = SessionFinishPayloadSchema.parse(req.body);
    assertMachine(req.device?.machineId ?? '', payload.machine_id);
    res.json(await finishSessionFromDevice(ctx, req.device!, payload));
  }));

  r.post('/session/interrupted', ah(async (req, res) => {
    const payload = SessionInterruptedPayloadSchema.parse(req.body);
    assertMachine(req.device?.machineId ?? '', payload.machine_id);
    res.json(await interruptSessionFromDevice(ctx, req.device!, payload));
  }));

  r.post('/events', ah(async (req, res) => {
    const payload = DeviceEventPayloadSchema.parse(req.body);
    assertMachine(req.device?.machineId ?? '', payload.machine_id);
    res.json(await recordDeviceEvent(ctx, req.device!, payload));
  }));

  r.post('/commands/:commandId/ack', ah(async (req, res) => {
    res.json(await acknowledgeCommand(ctx, req.device!, req.params.commandId as string));
  }));

  return r;
}
