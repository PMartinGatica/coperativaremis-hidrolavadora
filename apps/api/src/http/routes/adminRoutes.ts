import { Router } from 'express';
import {
  AppError,
  EmergencyStopSchema,
  MachinePatchSchema,
  PasswordChangeSchema,
  PaymentReconcileManualSchema,
  SETTINGS_FIELD_PERMISSION,
  SettingsPatchSchema,
  UserCreateSchema,
  UserPatchSchema,
  VehicleUpsertSchema,
  type SettingsField,
} from '@hidro/shared';
import type { AppContext } from '../../context.js';
import { assertPermission, requireAdmin, requirePermission } from '../../auth/adminAuth.js';
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
  publicProfile,
  reconcilePaymentAuto,
  reconcilePaymentManual,
  rotateDeviceSecret,
  updateAdminMachine,
  updateSettings,
  upsertAdminVehicle,
} from '../../services/adminService.js';
import { listDevices } from '../../repositories/repos.js';
import { ah } from '../asyncHandler.js';
import { createAdminLoginRateLimit, createPasswordChangeRateLimit } from '../middleware.js';
import { changeOwnPassword, createUser, listUsers, updateUser } from '../../services/userService.js';

export function adminRoutes(ctx: AppContext): Router {
  const r = Router();
  const adminLoginRateLimit = createAdminLoginRateLimit();
  const passwordChangeRateLimit = createPasswordChangeRateLimit();
  const can = (p: Parameters<typeof requirePermission>[1]) => requirePermission(ctx, p);
  const actor = (req: { admin?: { email: string } }) => req.admin?.email ?? 'admin';

  // ---------- auth pública ----------
  r.post('/auth/login', adminLoginRateLimit, ah(async (req, res) => {
    const body = req.body as { email?: string; password?: string };
    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
      throw new AppError('BAD_REQUEST', 'email y password son obligatorios.');
    }
    res.json(await login(ctx, body.email, body.password));
  }));

  // ---------- todo lo demás requiere JWT + cuenta activa (chequeo en base por pedido) ----------
  r.use(requireAdmin(ctx));

  r.get('/auth/me', (req, res) => {
    const admin = req.admin!;
    res.json({ id: admin.id, ...publicProfile(admin) });
  });

  /** "Mi cuenta": cambiar la propia clave. Devuelve un token nuevo (el anterior deja de valer). */
  r.patch('/me/password', passwordChangeRateLimit, ah(async (req, res) => {
    const body = PasswordChangeSchema.parse(req.body);
    res.json(await changeOwnPassword(ctx, req.admin!, body));
  }));

  // ---------- usuarios del panel (ADR-062) ----------
  r.get('/users', can('usuarios.gestionar'), ah(async (_req, res) => {
    res.json({ users: await listUsers(ctx) });
  }));

  r.post('/users', can('usuarios.gestionar'), ah(async (req, res) => {
    const body = UserCreateSchema.parse(req.body);
    res.status(201).json({ user: await createUser(ctx, req.admin!, body) });
  }));

  r.patch('/users/:userId', can('usuarios.gestionar'), ah(async (req, res) => {
    const body = UserPatchSchema.parse(req.body);
    res.json({ user: await updateUser(ctx, req.admin!, req.params.userId as string, body) });
  }));

  // Todo lo que sigue es, como mínimo, de lectura del panel.
  r.use(can('panel.ver'));

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

  r.patch('/machines/:machineId', can('maquina.configurar'), ah(async (req, res) => {
    const patch = MachinePatchSchema.parse(req.body);
    const machine = await updateAdminMachine(ctx, req.params.machineId as string, patch, actor(req));
    res.json({ machine });
  }));

  r.post('/machines/:machineId/emergency-stop', can('maquina.parada_emergencia'), ah(async (req, res) => {
    const body = EmergencyStopSchema.parse(req.body);
    const result = await emergencyStop(ctx, req.params.machineId as string, actor(req), body.reason);
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
  r.post('/devices/:machineId/rotate-secret', can('dispositivo.rotar_clave'), ah(async (req, res) => {
    const result = await rotateDeviceSecret(ctx, req.params.machineId as string, actor(req));
    res.json(result);
  }));

  // ---------- patentes (tarifas remis/socio; lo no registrado = externo) ----------
  r.get('/vehicles', ah(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json({ vehicles: await listAdminVehicles(ctx, search) });
  }));

  r.post('/vehicles', can('patentes.editar'), ah(async (req, res) => {
    const body = VehicleUpsertSchema.parse(req.body);
    res.json({ vehicle: await upsertAdminVehicle(ctx, body, actor(req)) });
  }));

  r.delete('/vehicles/:plate', can('patentes.editar'), ah(async (req, res) => {
    const plate = (req.params.plate as string).toUpperCase().replace(/[\s.-]/g, '');
    res.json(await deleteAdminVehicle(ctx, plate, actor(req)));
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

  // ---------- reconciliación de pagos (Fase 1) — nunca autoriza sin consultar a MP ----------
  /** Paso 1: "reintentar automáticamente" — sin ID, sin tipeo. */
  r.post('/sessions/:sessionId/reconcile/auto', can('pagos.destrabar'), ah(async (req, res) => {
    const result = await reconcilePaymentAuto(ctx, req.params.sessionId as string, actor(req));
    res.json(result);
  }));

  /** Paso 2: aprobación manual con el ID real de pago de Mercado Pago. */
  r.post('/sessions/:sessionId/reconcile/manual', can('pagos.destrabar'), ah(async (req, res) => {
    const body = PaymentReconcileManualSchema.parse(req.body);
    const result = await reconcilePaymentManual(ctx, req.params.sessionId as string, body.paymentId, actor(req));
    res.json(result);
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
    // Permiso POR CAMPO: si trae un campo técnico sin `ajustes.tecnicos`, 403 entero (nada a medias).
    const fields = (Object.keys(patch) as SettingsField[]).filter((f) => patch[f] !== undefined);
    if (fields.length === 0) throw new AppError('BAD_REQUEST', 'No hay nada para cambiar.');
    for (const permission of new Set(fields.map((f) => SETTINGS_FIELD_PERMISSION[f]))) {
      await assertPermission(ctx, req, permission);
    }
    res.json(await updateSettings(ctx, patch, actor(req)));
  }));

  return r;
}
