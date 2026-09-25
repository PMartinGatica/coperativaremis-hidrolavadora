import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Permission, Role } from '@hidro/shared';
import { api } from '../api/client.js';

export interface Me {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  mustChangePassword: boolean;
  permissions: Permission[];
}

interface SessionValue {
  /** null mientras `/auth/me` no respondió: el panel no dibuja acciones antes de saber el rol. */
  me: Me | null;
  can(permission: Permission): boolean;
  refresh(): Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  me: null,
  can: () => false,
  refresh: async () => undefined,
});

/** Quién entró y qué puede hacer, según el servidor (ADR-062). Ocultar botones es comodidad:
 *  el que protege es el servidor, acción por acción. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/admin/auth/me'));
    } catch {
      // 401: client.ts ya limpió el token y mandó al login.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionValue>(
    () => ({ me, can: (p) => me?.permissions.includes(p) ?? false, refresh }),
    [me, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

/** Para pruebas y pantallas sueltas: un valor de sesión fijo. */
export function StaticSession({ me, children }: { me: Me | null; children: ReactNode }) {
  const value = useMemo<SessionValue>(
    () => ({ me, can: (p) => me?.permissions.includes(p) ?? false, refresh: async () => undefined }),
    [me],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Línea que acompaña una pantalla de solo lectura. */
export function ReadOnlyNote({ children = 'Solo un administrador puede cambiar esto.' }: { children?: ReactNode }) {
  return (
    <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted" data-testid="read-only-note">
      {children}
    </p>
  );
}
