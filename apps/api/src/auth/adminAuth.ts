import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { eq } from 'drizzle-orm';
import { AppError, isRole, roleCan, type Permission, type Role } from '@hidro/shared';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/client.js';
import { adminUsers } from '../db/schema.js';
import { insertAudit } from '../repositories/repos.js';
import { verifyToken } from '../services/adminService.js';
import { ah } from '../http/asyncHandler.js';

export interface AdminPrincipal {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  mustChangePassword: boolean;
}

/** Motivo del 401, para que el login le explique a la persona por qué la sacaron. */
export type SessionEndReason = 'expired' | 'session_changed' | 'inactive' | 'invalid';

function unauthorized(reason: SessionEndReason, message: string): AppError {
  return new AppError('UNAUTHORIZED', message, { reason });
}

/** Rutas que una cuenta con clave inicial pendiente de cambio igual puede usar. */
const MUST_CHANGE_ALLOWLIST = new Set(['/auth/me', '/me/password']);

/**
 * Autenticación del panel (ADR-062): JWT Bearer + chequeo en base EN CADA PEDIDO. El rol sale
 * de la fila, nunca del token; una cuenta desactivada o con `token_version` distinto (cambio de
 * rol, de clave o baja) queda afuera en el acto, sin esperar las 12 h del token.
 */
export function requireAdmin(deps: { config: AppConfig; db: Db }): RequestHandler {
  return ah(async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      throw unauthorized('invalid', 'Se requiere autenticación.');
    }
    const claims = verifyToken(deps.config, header.slice(7));
    if (!claims.ok) {
      throw unauthorized(
        claims.reason,
        claims.reason === 'expired' ? 'Tu sesión venció. Volvé a iniciar sesión.' : 'Sesión inválida. Volvé a iniciar sesión.',
      );
    }
    const rows = await deps.db.select().from(adminUsers).where(eq(adminUsers.id, claims.userId)).limit(1);
    const user = rows[0];
    if (!user) throw unauthorized('session_changed', 'Tu cuenta ya no existe. Volvé a iniciar sesión.');
    if (!user.active) throw unauthorized('inactive', 'Tu cuenta fue desactivada.');
    if (user.tokenVersion !== claims.tokenVersion) {
      throw unauthorized('session_changed', 'Tu cuenta fue modificada. Volvé a iniciar sesión.');
    }
    if (!isRole(user.role)) throw unauthorized('session_changed', 'Rol desconocido.');

    req.admin = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
    if (user.mustChangePassword && !MUST_CHANGE_ALLOWLIST.has(req.path)) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED', 'Antes de seguir tenés que cambiar tu clave.');
    }
    next();
  });
}

/** El permiso lo decide el servidor, acción por acción: 403 aunque el pedido se arme a mano. */
export function requirePermission(deps: { db: Db }, permission: Permission): RequestHandler {
  return ah(async (req: Request, _res: Response, next: NextFunction) => {
    await assertPermission(deps, req, permission);
    next();
  });
}

export async function assertPermission(deps: { db: Db }, req: Request, permission: Permission): Promise<void> {
  const admin = req.admin;
  if (admin && roleCan(admin.role, permission)) return;
  // Solo se audita lo que intentaba modificar: los GET son de todos y una pestaña vieja
  // consultando cada pocos segundos inundaría la auditoría.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    await insertAudit(deps.db, {
      actor: admin?.email ?? 'anon',
      action: 'PERMISSION_DENIED',
      entity: 'admin',
      entityId: admin?.id ?? null,
      metadata: { permission, method: req.method, path: req.originalUrl.split('?')[0] },
    });
  }
  throw new AppError('FORBIDDEN', 'No tenés permiso para hacer esto.', { permission });
}
