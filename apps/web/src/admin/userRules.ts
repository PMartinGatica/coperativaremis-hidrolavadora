import type { Role } from '@hidro/shared';

export interface PanelUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

/** Por qué una acción no está disponible (texto para mostrar al lado del control deshabilitado),
 *  o null si se puede. Son las mismas reglas que aplica el servidor (userService.ts): acá solo
 *  evitan que la persona apriete y reciba un error después. */
export interface UserActionState {
  /** Fila sin ninguna acción (la cuenta técnica para quien no es técnico). */
  locked: boolean;
  changeRole: string | null;
  deactivate: string | null;
  resetPassword: string | null;
}

export function userActionState(target: PanelUser, me: { id: string; role: Role }, all: PanelUser[]): UserActionState {
  if (target.role === 'tecnico' && me.role !== 'tecnico') {
    const reason = 'Cuenta de soporte técnico de Insolva: no se modifica desde acá.';
    return { locked: true, changeRole: reason, deactivate: reason, resetPassword: reason };
  }
  const isSelf = target.id === me.id;
  const lastAdmin =
    target.role === 'admin' && target.active && all.filter((u) => u.role === 'admin' && u.active).length <= 1;
  return {
    locked: false,
    changeRole: isSelf
      ? 'No podés cambiarte el rol a vos mismo.'
      : lastAdmin
        ? 'Es el único administrador activo: tiene que quedar al menos uno.'
        : null,
    deactivate: !target.active
      ? null
      : isSelf
        ? 'No podés desactivar tu propia cuenta.'
        : lastAdmin
          ? 'Es el único administrador activo: tiene que quedar al menos uno.'
          : null,
    resetPassword: isSelf ? 'Tu propia clave se cambia desde "Mi cuenta".' : null,
  };
}

/** Activos primero (por nombre), inactivos al final. */
export function sortUsers(users: PanelUser[]): PanelUser[] {
  const label = (u: PanelUser) => (u.name ?? u.email).toLocaleLowerCase('es');
  return [...users].sort((a, b) => Number(b.active) - Number(a.active) || label(a).localeCompare(label(b), 'es'));
}

/** Mensaje para pasarle la cuenta nueva a la persona (lo manda Javier, por el medio que elija). */
export function credentialsMessage(opts: { name: string; email: string; password: string; panelUrl: string }): string {
  return [
    `Hola ${opts.name}, te creé una cuenta en el panel de la hidrolavadora.`,
    `Entrá en: ${opts.panelUrl}`,
    `Email: ${opts.email}`,
    `Clave inicial: ${opts.password}`,
    'La primera vez te va a pedir que elijas una clave propia.',
  ].join('\n');
}
