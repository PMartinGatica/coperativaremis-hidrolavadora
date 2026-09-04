import { Router } from 'express';
import { AppError, EmergencyStopSchema, MachinePatchSchema, SettingsPatchSchema, VehicleUpsertSchema } from '@hidro/shared';
import type { AppContext } from '../../context.js';
import { requireAdmin } from '../../auth/adminAuth.js';
import {
  deleteAdminVehicle,
  emergencyStop,
  getAdminMachine,
  getAdminSession,
  getOverview,
  getQrUrl,
  getSettings,
  listAdminLogs,
  listAdminMachines,
  listAdminPayments,
  listAdminSessions,
  listAdminVehicles,
  login,
  rotateDeviceSecret,
  updateAdminMachine,
  updateSettings,
  upsertAdminVehicle,
} from '../../services/adminService.js';
import { listDevices } from '../../repositories/repos.js';
import { ah } from '../asyncHandler.js';
import { createAdminLoginRateLimit } from '../middleware.js';

export function adminRoutes(ctx: AppContext): Router {
  const r = Router();
  const adminLoginRateLimit = createAdminLoginRateLimit();

  // ---------- auth pública ----------
  r.post('/auth/login', adminLoginRateLimit, ah(async (req, res) => {
    const body = req.body as { email?: string; password?: string };
    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
      throw new AppError('BAD_REQUEST', 'email y password son obligatorios.');
    }
    res.json(await login(ctx, body.email, body.password));
  }));

  // ---------- todo lo demás requiere JWT ----------
  r.use(requireAdmin(ctx.config));

  r.get('/auth/me', (req, res) => {
    res.json({ email: req.admin?.email ?? null, role: req.admin?.role ?? null });
  });

  r.get('/overview', ah(async (_req, res) => {
    res.json(await getOverview(ctx));
  }));

  // ---------- máquinas ----------
  r.get('/machines', ah(async (_req, res) => {
    res.json({ machines: await listAdminMachines(ctx) });
  }));

  r.get('/machines/:machineId', ah(async (req, res) => {
    res.json({ machine: await getAdminMachine(ctx, req.params.machineId as string) });
  }));

  r.patch('/machines/:machineId', ah(async (req, res) => {
    const patch = MachinePatchSchema.parse(req.body);
    const machine = await updateAdminMachine(ctx, req.params.machineId as string, patch, req.admin?.email ?? 'admin');
    res.json({ machine });
  }));

  r.post('/machines/:machineId/emergency-stop', ah(async (req, res) => {
    const body = EmergencyStopSchema.parse(req.body);
    const result = await emergencyStop(ctx, req.params.machineId as string, req.admin?.email ?? 'admin', body.reason);
    res.json(result);
  }));

  r.get('/machines/:machineId/qr', ah(async (req, res) => {
    res.json(await getQrUrl(ctx, req.params.machineId as string));
  }));

  // ---------- dispositivos ----------
  r.get('/devices', ah(async (_req, res) => {
    const devices = await listDevices(ctx.db);
    res.json({
      devices: devices.map((d) => ({
        id: d.id,
        machineId: d.machineId,
        deviceIdentifier: d.deviceIdentifier,
        firmwareVersion: d.firmwareVersion,
        lastHeartbeatAt: d.lastHeartbeatAt?.toISOString() ?? null,
        status: d.status,
        relayState: d.lastRelayState,
        wifiRssi: d.lastWifiRssi,
        uptime: d.lastUptime,
      })),
    });
  }));

  /** Rota el secret del dispositivo: devuelve el secret UNA sola vez (para flashear el ESP32). */
  r.post('/devices/:machineId/rotate-secret', ah(async (req, res) => {
    const result = await rotateDeviceSecret(ctx, req.params.machineId as string, req.admin?.email ?? 'admin');
    res.json(result);
  }));

  // ---------- patentes (tarifas remis/socio; lo no registrado = externo) ----------
  r.get('/vehicles', ah(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json({ vehicles: await listAdminVehicles(ctx, search) });
  }));

  r.post('/vehicles', ah(async (req, res) => {
    const body = VehicleUpsertSchema.parse(req.body);
    res.json({ vehicle: await upsertAdminVehicle(ctx, body, req.admin?.email ?? 'admin') });
  }));

  r.delete('/vehicles/:plate', ah(async (req, res) => {
    const plate = (req.params.plate as string).toUpperCase().replace(/[\s.-]/g, '');
    res.json(await deleteAdminVehicle(ctx, plate, req.admin?.email ?? 'admin'));
  }));

  // ---------- sesiones ----------
  r.get('/sessions', ah(async (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status ? (req.query.status as never) : undefined;
    const machineId = typeof req.query.machineId === 'string' ? req.query.machineId : undefined;
    res.json({ sessions: await listAdminSessions(ctx, { status, machineId, limit: 100 }) });
  }));

  r.get('/sessions/:sessionId', ah(async (req, res) => {
    res.json({ session: await getAdminSession(ctx, req.params.sessionId as string) });
  }));

  // ---------- pagos ----------
  r.get('/payments', ah(async (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status
      ? (req.query.status as import('@hidro/shared').PaymentStatus)
      : undefined;
    const machineId = typeof req.query.machineId === 'string' ? req.query.machineId : undefined;
    res.json({ payments: await listAdminPayments(ctx, { status, machineId, limit: 100 }) });
  }));

  // ---------- logs ----------
  r.get('/logs', ah(async (req, res) => {
    const source = typeof req.query.source === 'string' ? (req.query.source as 'system' | 'device' | 'all') : 'all';
    const entity = typeof req.query.entity === 'string' ? req.query.entity : undefined;
    res.json({ logs: await listAdminLogs(ctx, { source, entity, limit: 200 }) });
  }));

  // ---------- settings ----------
  r.get('/settings', ah(async (_req, res) => {
    res.json(await getSettings(ctx));
  }));

  r.patch('/settings', ah(async (req, res) => {
    const patch = SettingsPatchSchema.parse(req.body);
    res.json(await updateSettings(ctx, patch, req.admin?.email ?? 'admin'));
  }));

  return r;
}
