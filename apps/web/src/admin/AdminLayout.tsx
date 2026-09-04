import { useCallback } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Car,
  Cpu,
  CreditCard,
  Droplets,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  WashingMachine,
} from 'lucide-react';
import { api, clearToken } from '../api/client.js';
import { usePolling } from '../lib/usePolling.js';

const NAV = [
  { to: '/admin', end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/machines', label: 'Máquinas', icon: WashingMachine },
  { to: '/admin/vehicles', label: 'Patentes', icon: Car },
  { to: '/admin/sessions', label: 'Sesiones', icon: ListChecks },
  { to: '/admin/payments', label: 'Pagos', icon: CreditCard },
  { to: '/admin/logs', label: 'Logs', icon: FileText },
  { to: '/admin/settings', label: 'Ajustes', icon: Settings },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  const loadHealth = useCallback(async () => {
    try {
      const r = await api<{ demoMode: boolean; stats: { machinesOnline: number; machinesOffline: number; machinesDegraded: number; machinesDisabled: number } }>('/admin/overview');
      return r;
    } catch {
      return null;
    }
  }, []);
  const overview = usePolling(loadHealth, 8000);

  function logout() {
    clearToken();
    navigate('/admin/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* sidebar escritorio */}
      <aside className="sticky top-0 hidden h-screen w-56 flex-none flex-col border-r border-line bg-panel/60 p-4 backdrop-blur lg:flex">
        <Link to="/admin" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-aqua/40 bg-aqua/10">
            <Droplets size={15} className="text-aqua" />
          </span>
          <span className="font-display text-xs font-semibold tracking-[0.2em]">HIDRO ADMIN</span>
        </Link>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  isActive ? 'bg-aqua/10 text-aqua' : 'text-dim hover:bg-white/5 hover:text-ink'
                }`
              }
            >
              <item.icon size={15} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 space-y-1 border-t border-line pt-4">
          <Link to="/demo/device" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-dim hover:bg-white/5 hover:text-ink">
            <Cpu size={15} />
            Demo ESP32
          </Link>
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-dim hover:bg-white/5 hover:text-err" onClick={logout}>
            <LogOut size={15} />
            Salir
          </button>
        </div>
        <div className="mt-auto pt-4 text-[0.62rem] leading-relaxed text-faint">
          {overview?.demoMode ? 'PAGOS: DEMO' : 'PAGOS: MERCADO PAGO'}
          <br />
          {overview ? `ONLINE ${overview.stats.machinesOnline}/${overview.stats.machinesOnline + overview.stats.machinesOffline + overview.stats.machinesDegraded + overview.stats.machinesDisabled}` : ''}
        </div>
      </aside>

      {/* móvil: top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 flex items-center gap-2 overflow-x-auto border-b border-line bg-carbon/90 px-3 py-2 backdrop-blur lg:hidden">
          <Link to="/admin" className="mr-1 flex items-center gap-1.5 font-display text-[0.7rem] font-semibold tracking-[0.15em]">
            <Droplets size={14} className="text-aqua" /> HIDRO
          </Link>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex-none rounded-lg px-3 py-1.5 text-xs ${isActive ? 'bg-aqua/15 text-aqua' : 'text-dim'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Link to="/demo/device" className="flex-none rounded-lg px-3 py-1.5 text-xs text-dim">Demo ESP32</Link>
          <button className="flex-none rounded-lg px-3 py-1.5 text-xs text-err" onClick={logout}>Salir</button>
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
