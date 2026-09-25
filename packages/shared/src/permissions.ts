/**
 * Matriz de permisos del panel (ADR-062, docs/designs/roles-usuarios.md).
 *
 * UNA sola tabla: la API la usa para autorizar cada ruta (`requirePermission`) y el panel para
 * decidir qué menú y botones mostrar (`can`). El servidor es el que protege; el panel solo
 * evita mostrar lo que igual respondería 403.
 *
 * Roles:
 *  - `tecnico`  — Insolva (la cuenta de ADMIN_EMAIL). Visible para la cooperativa, intocable.
 *  - `admin`    — la cooperativa: todo lo del negocio, incluidas las cuentas admin/operador.
 *  - `operador` — lo básico del día a día: mirar, destrabar pagos, parada de emergencia.
 */
export const ROLES = ['tecnico', 'admin', 'operador'] as const;
export type Role = (typeof ROLES)[number];

/** Roles que un admin puede ver en el selector y asignar. `tecnico` no se asigna desde el panel. */
export const ASSIGNABLE_ROLES = ['admin', 'operador'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  tecnico: 'Soporte técnico (Insolva)',
  admin: 'Administrador',
  operador: 'Operador',
};

export const PERMISSIONS = {
  'panel.ver': ['operador', 'admin', 'tecnico'],
  // La cuenta técnica no destraba pagos: en la auditoría tiene que quedar el nombre de alguien
  // de la cooperativa (objetivo del ADR-054).
  'pagos.destrabar': ['operador', 'admin'],
  'maquina.parada_emergencia': ['operador', 'admin', 'tecnico'],
  'patentes.editar': ['admin', 'tecnico'],
  'maquina.configurar': ['admin', 'tecnico'],
  'ajustes.negocio': ['admin', 'tecnico'],
  'ajustes.tecnicos': ['tecnico'],
  'dispositivo.rotar_clave': ['tecnico'],
  'usuarios.gestionar': ['admin', 'tecnico'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function roleCan(role: string | null | undefined, permission: Permission): boolean {
  if (!isRole(role)) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsOf(role: string | null | undefined): Permission[] {
  return ALL_PERMISSIONS.filter((p) => roleCan(role, p));
}

/** Qué permiso exige cada campo de `PATCH /admin/settings`. Si un pedido trae un campo sin su
 *  permiso, se rechaza entero (no se aplica a medias). */
export const SETTINGS_FIELD_PERMISSION = {
  dailyWashLimit: 'ajustes.negocio',
  demoSpeedFactor: 'ajustes.tecnicos',
  authTtlSeconds: 'ajustes.tecnicos',
  heartbeatIntervalMs: 'ajustes.tecnicos',
  paymentPendingTimeoutSeconds: 'ajustes.tecnicos',
} as const satisfies Record<string, Permission>;

export type SettingsField = keyof typeof SETTINGS_FIELD_PERMISSION;

/** Largo mínimo de una clave del panel (alta, reset y "mi cuenta"). */
export const MIN_PASSWORD_LENGTH = 10;
