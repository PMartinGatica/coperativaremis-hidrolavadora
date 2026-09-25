import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { permissionsOf, type Role } from '@hidro/shared';
import { getToken, handleAuthFailure, storeToken, takeLogoutReason } from '../src/api/client.js';
import { StaticSession, type Me } from '../src/admin/session.js';
import AdminLayout from '../src/admin/AdminLayout.js';
import VehiclesPage from '../src/admin/pages/VehiclesPage.js';
import { settingsPatch } from '../src/admin/pages/SettingsPage.js';
import { credentialsMessage, sortUsers, userActionState, type PanelUser } from '../src/admin/userRules.js';
import { generatePassword } from '../src/admin/passwordFields.js';

function meAs(role: Role, extra: Partial<Me> = {}): Me {
  return { id: `id-${role}`, email: `${role}@coop.local`, name: role, role, mustChangePassword: false, permissions: permissionsOf(role), ...extra };
}

/** window.location.href de jsdom no navega; se reemplaza por un objeto espiable. */
function stubLocation(pathname: string) {
  const loc = { pathname, href: `http://localhost${pathname}` };
  vi.stubGlobal('location', loc);
  Object.defineProperty(window, 'location', { value: loc, configurable: true, writable: true });
  return loc;
}

describe('client.ts: cortes de sesión (ADR-062)', () => {
  const realLocation = window.location;
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: realLocation, configurable: true, writable: true });
    vi.unstubAllGlobals();
  });

  it('401 con el token vigente: lo borra, guarda el motivo y manda al login', () => {
    const loc = stubLocation('/admin/machines');
    storeToken('tok-A');
    handleAuthFailure('/admin/overview', 401, 'UNAUTHORIZED', { reason: 'inactive' }, 'tok-A');
    expect(getToken()).toBeNull();
    expect(loc.href).toBe('/admin/login');
    expect(takeLogoutReason()).toBe('inactive');
    expect(takeLogoutReason()).toBeNull(); // se lee una sola vez
  });

  it('401 de un pedido viejo en vuelo NO borra el token nuevo (cambio de clave)', () => {
    const loc = stubLocation('/admin/account');
    storeToken('tok-NUEVO');
    handleAuthFailure('/admin/overview', 401, 'UNAUTHORIZED', { reason: 'session_changed' }, 'tok-VIEJO');
    expect(getToken()).toBe('tok-NUEVO');
    expect(loc.href).toBe('http://localhost/admin/account');
  });

  it('401 de /auth/me también saca al login (un usuario desactivado no queda en el esqueleto)', () => {
    const loc = stubLocation('/admin');
    storeToken('tok-A');
    handleAuthFailure('/admin/auth/me', 401, 'UNAUTHORIZED', { reason: 'inactive' }, 'tok-A');
    expect(loc.href).toBe('/admin/login');
  });

  it('401 del propio login (clave mal) no toca nada', () => {
    const loc = stubLocation('/admin/login');
    handleAuthFailure('/admin/auth/login', 401, 'UNAUTHORIZED', undefined, null);
    expect(loc.href).toBe('http://localhost/admin/login');
    expect(takeLogoutReason()).toBeNull();
  });

  it('403 PASSWORD_CHANGE_REQUIRED manda a Mi cuenta; otro 403 no', () => {
    const loc = stubLocation('/admin/machines');
    handleAuthFailure('/admin/vehicles', 403, 'FORBIDDEN', undefined, 'tok');
    expect(loc.href).toBe('http://localhost/admin/machines');
    handleAuthFailure('/admin/overview', 403, 'PASSWORD_CHANGE_REQUIRED', undefined, 'tok');
    expect(loc.href).toBe('/admin/account');
  });
});

describe('menú según el rol', () => {
  afterEach(cleanup);

  function renderLayout(me: Me | null) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ demoMode: true }), { status: 200 })));
    return render(
      <StaticSession me={me}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<div>inicio</div>} />
            </Route>
            <Route path="/admin/account" element={<div>mi-cuenta</div>} />
          </Routes>
        </MemoryRouter>
      </StaticSession>,
    );
  }

  it('antes de saber el rol: esqueleto, ningún ítem del menú', () => {
    renderLayout(null);
    expect(screen.getByTestId('nav-skeleton')).toBeTruthy();
    expect(screen.queryAllByRole('link', { name: 'Máquinas' })).toHaveLength(0);
  });

  it('operador: sin Usuarios; chip con nombre y rol', () => {
    renderLayout(meAs('operador', { name: 'Pedro' }));
    expect(screen.getAllByRole('link', { name: 'Máquinas' }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: 'Usuarios' })).toHaveLength(0);
    expect(screen.getByTestId('user-chip').textContent).toContain('Pedro');
    expect(screen.getByTestId('user-chip').textContent).toContain('Operador');
  });

  it('admin: con Usuarios', () => {
    renderLayout(meAs('admin'));
    expect(screen.getAllByRole('link', { name: 'Usuarios' }).length).toBeGreaterThan(0);
  });

  it('clave inicial pendiente: va directo a Mi cuenta', () => {
    renderLayout(meAs('operador', { mustChangePassword: true }));
    expect(screen.getByText('mi-cuenta')).toBeTruthy();
  });
});

describe('Patentes para un operador', () => {
  afterEach(cleanup);

  it('ve la lista sin formulario ni botones de borrar, con la línea de solo lectura', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            vehicles: [{ id: 'v1', plate: 'AE100AA', category: 'remis', ownerName: null, hasPin: true, enabled: true, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }],
          }),
          { status: 200 },
        ),
      ),
    );
    render(
      <StaticSession me={meAs('operador')}>
        <MemoryRouter>
          <VehiclesPage />
        </MemoryRouter>
      </StaticSession>,
    );
    expect(await screen.findByText('AE100AA')).toBeTruthy();
    expect(screen.getByTestId('read-only-note')).toBeTruthy();
    expect(screen.queryByText('GUARDAR PATENTE')).toBeNull();
    expect(screen.queryByTitle('Eliminar registro (pasa a externo)')).toBeNull();
    expect(screen.queryByTitle('Quitar PIN de esta patente')).toBeNull();
  });
});

describe('Ajustes: manda solo lo cambiado y permitido', () => {
  const initial = { dailyWashLimit: 2, demoSpeedFactor: 1, authTtlSeconds: 300, heartbeatIntervalMs: 5000, paymentPendingTimeoutSeconds: 600 };
  const values = { dailyWashLimit: '3', demoSpeedFactor: '1', authTtlSeconds: '300', heartbeatIntervalMs: '9000', paymentPendingTimeoutSeconds: '600' };

  it('admin: solo dailyWashLimit aunque haya tocado un campo técnico', () => {
    const can = (p: string) => permissionsOf('admin').includes(p as never);
    expect(settingsPatch(values, initial, can)).toEqual({ dailyWashLimit: 3 });
  });

  it('técnico: todo lo que cambió', () => {
    const can = (p: string) => permissionsOf('tecnico').includes(p as never);
    expect(settingsPatch(values, initial, can)).toEqual({ dailyWashLimit: 3, heartbeatIntervalMs: 9000 });
  });

  it('sin cambios: nada', () => {
    const can = () => true;
    const same = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])) as typeof values;
    expect(settingsPatch(same, initial, can)).toEqual({});
  });
});

describe('reglas de la página Usuarios', () => {
  const u = (id: string, role: Role, active = true, name = id): PanelUser => ({
    id, email: `${id}@x`, name, role, active, mustChangePassword: false, createdAt: '2026-09-25T00:00:00Z',
  });

  it('la cuenta técnica queda sin acciones para un admin', () => {
    const all = [u('tec', 'tecnico'), u('javier', 'admin')];
    expect(userActionState(all[0]!, { id: 'javier', role: 'admin' }, all).locked).toBe(true);
  });

  it('sobre uno mismo: rol, desactivar y reset deshabilitados con motivo', () => {
    const all = [u('javier', 'admin'), u('ana', 'admin')];
    const s = userActionState(all[0]!, { id: 'javier', role: 'admin' }, all);
    expect(s.changeRole).toContain('vos mismo');
    expect(s.deactivate).toContain('propia');
    expect(s.resetPassword).toContain('Mi cuenta');
  });

  it('último admin activo: no se desactiva ni se baja de rol', () => {
    const all = [u('javier', 'admin'), u('ana', 'admin', false), u('pedro', 'operador')];
    const s = userActionState(all[0]!, { id: 'tec', role: 'tecnico' }, all);
    expect(s.deactivate).toContain('único administrador');
    expect(s.changeRole).toContain('único administrador');
    expect(userActionState(all[2]!, { id: 'javier', role: 'admin' }, all).deactivate).toBeNull();
  });

  it('orden: activos por nombre, inactivos al final', () => {
    const sorted = sortUsers([u('z', 'operador', false, 'Zoe'), u('b', 'operador', true, 'beto'), u('a', 'admin', true, 'Ana')]);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b', 'z']);
  });

  it('mensaje para pasar la cuenta: lleva link, email y clave', () => {
    const msg = credentialsMessage({ name: 'Pedro', email: 'p@x', password: 'abcd-efgh-jkmn', panelUrl: 'https://x/admin' });
    expect(msg).toContain('https://x/admin');
    expect(msg).toContain('p@x');
    expect(msg).toContain('abcd-efgh-jkmn');
  });

  it('clave generada: 14 caracteres, sin letras que se confunden', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      expect(p).not.toMatch(/[01ilo]/);
    }
  });
});
