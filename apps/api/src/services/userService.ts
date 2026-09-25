import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { AppError, type AssignableRole } from '@hidro/shared';
import type { Db } from '../db/client.js';
import { DEMO_ADMIN_PASSWORD, type AppConfig } from '../config.js';
import { adminUsers, type AdminUserRow } from '../db/schema.js';
import { hashSecret, verifySecret } from '../db/seed.js';
import { insertAudit } from '../repositories/repos.js';
import { uuid } from '../ids.js';
import type { AdminPrincipal } from '../auth/adminAuth.js';
import { sessionPayload } from './adminService.js';

/**
 * Cuentas del panel (ADR-062). Reglas del servidor, no del panel:
 *  - un admin VE las cuentas técnicas pero no las crea ni las modifica (403);
 *  - nadie se cambia el rol ni se desactiva a sí mismo;
 *  - ningún cambio deja la cantidad de admins activos en 0 si había al menos uno;
 *  - desactivar, cambiar rol o resetear clave incrementa token_version: la sesión se corta ya.
 */
export interface UserDeps {
  db: Db;
  config: AppConfig;
}

export interface UserCreateInput {
  email: string;
  name: string;
  role: AssignableRole;
  password: string;
}

export interface UserPatchInput {
  name?: string;
  role?: AssignableRole;
  active?: boolean;
  password?: string;
}

function toDto(row: AdminUserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
  };
}

export type UserDto = ReturnType<typeof toDto>;

function isEmailTaken(err: unknown): boolean {
  for (const candidate of [err, err instanceof Error ? err.cause : undefined]) {
    if (!(candidate instanceof Error)) continue;
    const withCode = candidate as Error & { code?: string };
    if (withCode.code === '23505') return true;
    if (/duplicate key|unique constraint/i.test(candidate.message)) return true;
  }
  return false;
}

/** En producción la clave demo se bloquea sola en cada arranque (seed): aceptarla acá dejaría
 *  una cuenta que se rompe al reiniciar. */
function rejectDemoPassword(config: AppConfig, password: string): void {
  if (config.nodeEnv === 'production' && password === DEMO_ADMIN_PASSWORD) {
    throw new AppError('BAD_REQUEST', 'Esa clave no se puede usar. Elegí otra.');
  }
}

export async function listUsers(deps: UserDeps): Promise<UserDto[]> {
  const rows = await deps.db
    .select()
    .from(adminUsers)
    .orderBy(desc(adminUsers.active), asc(sql`lower(coalesce(${adminUsers.name}, ${adminUsers.email}))`));
  return rows.map(toDto);
}

export async function createUser(deps: UserDeps, actor: AdminPrincipal, input: UserCreateInput): Promise<UserDto> {
  rejectDemoPassword(deps.config, input.password);
  const existing = await deps.db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, input.email)).limit(1);
  if (existing.length > 0) throw new AppError('CONFLICT', 'Ya existe una cuenta con ese email.');
  let row: AdminUserRow;
  try {
    const rows = await deps.db
      .insert(adminUsers)
      .values({
        id: uuid(),
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash: hashSecret(input.password),
        active: true,
        mustChangePassword: true,
      })
      .returning();
    row = rows[0] as AdminUserRow;
  } catch (err) {
    // Doble clic en "Crear": el segundo choca con el UNIQUE del email.
    if (isEmailTaken(err)) throw new AppError('CONFLICT', 'Ya existe una cuenta con ese email.');
    throw err;
  }
  await insertAudit(deps.db, {
    actor: actor.email,
    action: 'USER_CREATED',
    entity: 'admin_user',
    entityId: row.id,
    metadata: { email: row.email, name: row.name, role: row.role },
  });
  return toDto(row);
}

export async function updateUser(deps: UserDeps, actor: AdminPrincipal, userId: string, patch: UserPatchInput): Promise<UserDto> {
  if (patch.password !== undefined) rejectDemoPassword(deps.config, patch.password);

  const result = await deps.db.transaction(async (tx) => {
    // Bloquea las filas de admins activos: dos cambios simultáneos que bajan admins se
    // serializan acá y el segundo ya ve el conteo real (regla "nunca cero admins").
    const activeAdmins = await tx
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(eq(adminUsers.role, 'admin'), eq(adminUsers.active, true)))
      .for('update');
    const rows = await tx.select().from(adminUsers).where(eq(adminUsers.id, userId)).limit(1);
    const target = rows[0];
    if (!target) throw new AppError('USER_NOT_FOUND', 'No existe esa cuenta.');

    if (target.role === 'tecnico' && actor.role !== 'tecnico') {
      throw new AppError('FORBIDDEN', 'La cuenta de soporte técnico de Insolva no se puede modificar desde acá.');
    }

    const isSelf = target.id === actor.id;
    const roleChanges = patch.role !== undefined && patch.role !== target.role;
    const deactivates = patch.active === false && target.active;
    if (isSelf && roleChanges) throw new AppError('BAD_REQUEST', 'No podés cambiarte el rol a vos mismo.');
    if (isSelf && deactivates) throw new AppError('BAD_REQUEST', 'No podés desactivar tu propia cuenta.');
    if (isSelf && patch.password !== undefined) {
      throw new AppError('BAD_REQUEST', 'Tu propia clave se cambia desde "Mi cuenta".');
    }

    const removesAdmin = target.role === 'admin' && target.active && (deactivates || (roleChanges && patch.role !== 'admin'));
    if (removesAdmin && activeAdmins.every((a) => a.id === target.id)) {
      throw new AppError('BAD_REQUEST', 'Tiene que quedar al menos un administrador activo.');
    }

    const cutsSession = roleChanges || deactivates || patch.password !== undefined;
    const updated = await tx
      .update(adminUsers)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.password !== undefined ? { passwordHash: hashSecret(patch.password), mustChangePassword: true } : {}),
        ...(cutsSession ? { tokenVersion: sql`${adminUsers.tokenVersion} + 1` } : {}),
      })
      .where(eq(adminUsers.id, userId))
      .returning();
    return { before: target, after: updated[0] as AdminUserRow };
  });

  const { before, after } = result;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (patch.name !== undefined && patch.name !== before.name) changes.name = { from: before.name, to: after.name };
  if (patch.role !== undefined && patch.role !== before.role) changes.role = { from: before.role, to: after.role };
  if (patch.active !== undefined && patch.active !== before.active) changes.active = { from: before.active, to: after.active };
  if (Object.keys(changes).length > 0) {
    await insertAudit(deps.db, {
      actor: actor.email,
      action: 'USER_UPDATED',
      entity: 'admin_user',
      entityId: after.id,
      metadata: { email: after.email, changes },
    });
  }
  if (patch.password !== undefined) {
    await insertAudit(deps.db, {
      actor: actor.email,
      action: 'USER_PASSWORD_RESET',
      entity: 'admin_user',
      entityId: after.id,
      metadata: { email: after.email },
    });
  }
  return toDto(after);
}

/** "Mi cuenta": cambia la propia clave y devuelve un token nuevo (el viejo deja de valer). */
export async function changeOwnPassword(
  deps: UserDeps,
  actor: AdminPrincipal,
  input: { currentPassword: string; newPassword: string },
) {
  if (actor.role === 'tecnico') {
    throw new AppError('FORBIDDEN', 'La clave de esta cuenta se gestiona desde el servidor (ADMIN_PASSWORD).');
  }
  rejectDemoPassword(deps.config, input.newPassword);
  const rows = await deps.db.select().from(adminUsers).where(eq(adminUsers.id, actor.id)).limit(1);
  const me = rows[0];
  if (!me) throw new AppError('UNAUTHORIZED', 'Tu cuenta ya no existe.', { reason: 'session_changed' });
  // 400 y no 401: un error de tipeo no tiene que sacar a nadie del panel.
  if (!verifySecret(input.currentPassword, me.passwordHash)) {
    throw new AppError('INVALID_CURRENT_PASSWORD', 'La clave actual no es correcta.');
  }
  if (input.currentPassword === input.newPassword) {
    throw new AppError('BAD_REQUEST', 'La clave nueva tiene que ser distinta de la actual.');
  }
  const updated = await deps.db
    .update(adminUsers)
    .set({
      passwordHash: hashSecret(input.newPassword),
      mustChangePassword: false,
      tokenVersion: sql`${adminUsers.tokenVersion} + 1`,
    })
    .where(eq(adminUsers.id, me.id))
    .returning();
  const row = updated[0] as AdminUserRow;
  await insertAudit(deps.db, {
    actor: row.email,
    action: 'PASSWORD_CHANGED',
    entity: 'admin_user',
    entityId: row.id,
    metadata: null,
  });
  return sessionPayload(deps.config, row);
}
