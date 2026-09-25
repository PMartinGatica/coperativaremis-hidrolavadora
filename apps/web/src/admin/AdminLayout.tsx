import { useCallback } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Car, Cpu, CreditCard, FileText, LayoutDashboard, ListChecks, LogOut, Settings, UserRound, Users, WashingMachine } from 'lucide-react';
import { ROLE_LABELS, type Permission } from '@hidro/shared';
import { api, clearToken } from '../api/client.js';
import { useSession } from './session.js';
import { usePolling } from '../lib/usePolling.js';
import { BRAND } from '../brand.js';
import { BrandLogo, ThemeToggle } from '../components/ui.js';

const NAV: Array<{ to: string; end?: boolean; label: string; icon: typeof Car; permission: Permission }> = [
  { to: '/admin', end: true, label: 'Dashboard', icon: LayoutDashboard, permission: 'panel.ver' },
  { to: '/admin/machines', label: 'Máquinas', icon: WashingMachine, permission: 'panel.ver' },
  { to: '/admin/vehicles', label: 'Patentes', icon: Car, permission: 'panel.ver' },
  { to: '/admin/sessions', label: 'Sesiones', icon: ListChecks, permission: 'panel.ver' },
  { to: '/admin/payments', label: 'Pagos', icon: CreditCard, permission: 'panel.ver' },
  { to: '/admin/logs', label: 'Registros', icon: FileText, permission: 'panel.ver' },
  { to: '/admin/settings', label: 'Ajustes', icon: Settings, permission: 'panel.ver' },
  // Al final y solo para quien gestiona cuentas (ADR-062).
  { to: '/admin/users', label: 'Usuarios', icon: Users, permission: 'usuarios.gestionar' },
];

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] transition-colors ${
    isActive ? 'bg-primary-soft font-semibold text-primary-soft-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
  }`;

const navChip = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-10 flex-none items-center rounded-lg px-3 text-sm ${isActive ? 'bg-primary-soft font-semibold text-primary-soft-ink' : 'text-muted'}`;

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, can } = useSession();
  const mustChange = me?.mustChangePassword ?? false;

  const loadHealth = useCallback(async () => {
    try {
      return await api<{ demoMode: boolean }>('/admin/overview');
    } catch {
      return null;
    }
  }, []);
  // Con la clave inicial pendiente el servidor responde 403 a todo menos "Mi cuenta": no consultar.
  const overview = usePolling(loadHealth, 8000, me !== null && !mustChange);
  const nav = me && !mustChange ? NAV.filter((item) => can(item.permission)) : [];

  function logout() {
    clearToken();
    navigate('/admin/login');
  }

  if (mustChange && location.pathname !== '/admin/account') {
    return <Navigate to="/admin/account" replace />;
  }

  const userChip = me ? (
    <Link
      to="/admin/account"
      className="flex min-h-10 max-w-[9rem] items-center sm:max-w-[16rem] gap-2 rounded-full border border-line px-3 text-sm hover:bg-surface-2"
      data-testid="user-chip"
      title="Mi cuenta"
    >
      <UserRound size={15} aria-hidden="true" className="flex-none text-muted" />
      <span className="min-w-0 truncate">
        <span className="font-semibold">{me.name ?? me.email}</span>
        <span className="hidden text-muted sm:inline"> · {ROLE_LABELS[me.role]}</span>
      </span>
    </Link>
  ) : (
    <span className="h-10 w-24 animate-pulse sm:w-40 rounded-full bg-surface-2" aria-hidden="true" />
  );

  const navSkeleton = (
    <div className="flex flex-col gap-2" aria-hidden="true" data-testid="nav-skeleton">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="h-9 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );

  const modeChip = overview ? (
    overview.demoMode ? (
      <span className="chip border-transparent bg-warn-soft text-warn">Pagos: demo</span>
    ) : (
      <span className="chip border-transparent bg-primary-soft text-primary-soft-ink">Pagos: Mercado Pago</span>
    )
  ) : null;

  return (
    <div className="flex min-h-screen">
      {/* escritorio: menú lateral */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-none flex-col gap-6 border-r border-line bg-surface px-4 py-5 lg:flex">
        <Link to="/admin" className="flex items-center gap-3 px-1">
          <BrandLogo size={44} />
          <span className="min-w-0">
            <span className="block font-display text-[0.95rem] font-semibold leading-tight">{BRAND.appName}</span>
            <span className="block text-[0.8rem] leading-tight text-muted">{BRAND.subtitle}</span>
          </span>
        </Link>
        <nav aria-label="Secciones del panel" className="flex flex-col gap-0.5">
          {me === null ? navSkeleton : null}
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navItem}>
              <item.icon size={18} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-4">
          <Link to="/demo/device" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] text-muted hover:bg-surface-2 hover:text-ink">
            <Cpu size={18} aria-hidden="true" />
            Simulador de la máquina
          </Link>
          <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[0.95rem] text-muted hover:bg-surface-2 hover:text-err" onClick={logout}>
            <LogOut size={18} aria-hidden="true" />
            Salir
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* barra superior: en escritorio solo modo de pago + tema; en celular también el menú */}
        <div className="sticky top-0 z-40 border-b border-line bg-surface">
          <div className="flex items-center gap-3 px-4 py-2 lg:justify-end lg:px-8">
            <Link to="/admin" className="flex items-center gap-2 lg:hidden">
              <BrandLogo size={36} />
              <span className="font-display text-sm font-semibold">{BRAND.appName}</span>
            </Link>
            <div className="ml-auto flex min-w-0 items-center gap-2 lg:ml-0">
              {userChip}
              {modeChip}
              <ThemeToggle />
            </div>
          </div>
          <nav aria-label="Secciones del panel" className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] lg:hidden">
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navChip}>
                {item.label}
              </NavLink>
            ))}
            <Link to="/demo/device" className="flex min-h-10 flex-none items-center rounded-lg px-3 text-sm text-muted">Simulador</Link>
            <button type="button" className="flex min-h-10 flex-none items-center rounded-lg px-3 text-sm text-err" onClick={logout}>Salir</button>
          </nav>
        </div>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
