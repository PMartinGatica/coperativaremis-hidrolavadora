import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, Droplets, Zap } from 'lucide-react';
import { api } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { formatArs, timeAgo } from '../../lib/format.js';
import { Card, DemoBanner, MachineBadge, Stat, StatusBadge } from '../../components/ui.js';
import type { SessionStatus } from '@hidro/shared';

interface Overview {
  stats: {
    machinesOnline: number;
    machinesDegraded: number;
    machinesOffline: number;
    machinesDisabled: number;
    washesToday: number;
    revenueToday: number;
    activeSessions: number;
    byCategory: {
      remis: { washes: number; revenue: number };
      socio: { washes: number; revenue: number };
      externo: { washes: number; revenue: number };
    };
  };
  machines: Array<{
    id: string;
    name: string;
    status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'DISABLED';
    enabled: boolean;
    priceRemisArs: number;
    priceSocioArs: number;
    priceExternoArs: number;
    durationSeconds: number;
    relayState: boolean;
    wifiRssi: number | null;
    firmwareVersion: string | null;
    lastHeartbeatAt: string | null;
    activeSessionStatus: SessionStatus | null;
    washesToday: number;
    revenueToday: number;
  }>;
  recentErrors: Array<{ id: string; machineId: string; status: SessionStatus; reason: string | null; updatedAt: string }>;
  demoMode: boolean;
  simulatorEnabled: boolean;
}

export default function DashboardPage() {
  const load = useCallback(async () => {
    try {
      return await api<Overview>('/admin/overview');
    } catch {
      return null;
    }
  }, []);
  const data = usePolling(load, 5000);

  if (!data) {
    return <div className="card scan-zone p-10 text-center text-dim">CARGANDO PANEL…</div>;
  }

  const s = data.stats;

  return (
    <div className="stagger space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide">Dashboard</h1>
          <p className="text-sm text-dim">Estado del sistema en tiempo real</p>
        </div>
        {data.demoMode ? <DemoBanner /> : <span className="chip text-ok border-ok/30 bg-ok/10">MERCADO PAGO</span>}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Máquinas online" value={s.machinesOnline} tone="ok" sub={`${s.machinesDegraded} degradadas`} />
        <Stat label="Máquinas offline" value={s.machinesOffline} tone={s.machinesOffline > 0 ? 'error' : undefined} sub={`${s.machinesDisabled} deshabilitadas`} />
        <Stat label="Lavados de hoy" value={s.washesToday} />
        <Stat label="Ingresos de hoy" value={formatArs(s.revenueToday)} tone="ok" />
        <Stat label="Sesiones activas" value={s.activeSessions} tone={s.activeSessions > 0 ? 'warn' : undefined} />
        <Stat label="Errores" value={data.recentErrors.length} tone={data.recentErrors.length > 0 ? 'error' : undefined} />
      </section>

      {/* desglose por categoría de patente */}
      <section className="card grid grid-cols-3 divide-x divide-line p-4 text-center">
        <div>
          <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Remis</div>
          <div className="num mt-1 text-lg">{s.byCategory.remis.washes} lavados</div>
          <div className="num text-sm text-ok">{formatArs(s.byCategory.remis.revenue)}</div>
        </div>
        <div>
          <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Socios</div>
          <div className="num mt-1 text-lg">{s.byCategory.socio.washes} lavados</div>
          <div className="num text-sm text-aqua">{formatArs(s.byCategory.socio.revenue)}</div>
        </div>
        <div>
          <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Externos</div>
          <div className="num mt-1 text-lg">{s.byCategory.externo.washes} lavados</div>
          <div className="num text-sm text-warn">{formatArs(s.byCategory.externo.revenue)}</div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[0.68rem] uppercase tracking-[0.24em] text-faint">Máquinas</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.machines.map((m) => (
            <Card key={m.id} hover className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-xl font-semibold">{m.id}</div>
                  <div className="text-xs text-dim">{m.name}</div>
                </div>
                <MachineBadge status={m.status} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="chip justify-between">
                  <Zap size={11} className={m.relayState ? 'text-warn' : 'text-faint'} />
                  RELAY {m.relayState ? 'ON' : 'OFF'}
                </div>
                <div className="chip justify-between">SESIÓN {m.activeSessionStatus ?? 'IDLE'}</div>
                <div className="chip justify-between">WiFi {m.wifiRssi !== null ? `${m.wifiRssi} dBm` : '—'}</div>
                <div className="chip justify-between">HB {timeAgo(m.lastHeartbeatAt)}</div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                <div>
                  <div className="text-[0.6rem] uppercase tracking-widest text-faint">Tarifas</div>
                  <div className="num mt-0.5 text-[0.68rem] leading-tight">
                    <div>{formatArs(m.priceRemisArs)}</div>
                    <div className="text-dim">{formatArs(m.priceSocioArs)}</div>
                    <div className="text-aqua">{formatArs(m.priceExternoArs)}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[0.6rem] uppercase tracking-widest text-faint">Lavados hoy</div>
                  <div className="num mt-0.5 text-sm">{m.washesToday}</div>
                </div>
                <div>
                  <div className="text-[0.6rem] uppercase tracking-widest text-faint">Ingresos hoy</div>
                  <div className="num mt-0.5 text-sm text-aqua">{formatArs(m.revenueToday)}</div>
                </div>
              </div>

              <Link to={`/admin/machines`} className="btn btn-ghost mt-4 w-full py-2 text-xs">
                GESTIONAR {m.id}
              </Link>
            </Card>
          ))}
        </div>
      </section>

      {data.recentErrors.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.24em] text-faint">
            <CircleAlert size={13} className="text-err" /> Errores recientes
          </h2>
          <div className="space-y-2">
            {data.recentErrors.map((e) => (
              <div key={e.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
                <div className="flex items-center gap-3">
                  <Droplets size={14} className="text-faint" />
                  <span className="font-display">{e.machineId}</span>
                  <StatusBadge status={e.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-dim">
                  <span className="hidden sm:inline">{e.reason ?? '—'}</span>
                  <Link to={`/admin/sessions/${e.id}`} className="text-aqua">ver</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
