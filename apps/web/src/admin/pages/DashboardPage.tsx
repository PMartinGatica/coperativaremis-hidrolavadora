import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, ListChecks } from 'lucide-react';
import { PLATE_CATEGORY_LABELS, type PlateCategory, type SessionStatus } from '@hidro/shared';
import { STATUS_LABELS } from '@hidro/state-machine';
import { api } from '../../api/client.js';
import { useNow, usePollingState } from '../../lib/usePolling.js';
import { formatArs, timeAgo } from '../../lib/format.js';
import { DemoBanner, MachineBadge, Stat, StatusBadge } from '../../components/ui.js';

interface Overview {
  stats: {
    machinesOnline: number;
    machinesDegraded: number;
    machinesOffline: number;
    machinesDisabled: number;
    washesToday: number;
    revenueToday: number;
    activeSessions: number;
    byCategory: Record<PlateCategory, { washes: number; revenue: number }>;
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

interface SessionRow {
  id: string;
  machineId: string;
  status: SessionStatus;
  plate: string | null;
  plateCategory: PlateCategory | null;
  amount: number | null;
  createdAt: string;
}

/** Pasado este tiempo sin un dato nuevo, el panel avisa que lo que se ve está viejo. */
const STALE_AFTER_MS = 30_000;
const LATEST_SESSIONS = 5;

function hourOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardPage() {
  const load = useCallback(() => api<Overview>('/admin/overview'), []);
  const overview = usePollingState(load, 5000);
  const loadSessions = useCallback(async () => (await api<{ sessions: SessionRow[] }>('/admin/sessions')).sessions, []);
  const sessions = usePollingState(loadSessions, 5000);
  const { now } = useNow();

  const data = overview.value;
  if (!data) {
    return overview.error ? (
      <div role="alert" className="card p-8 text-center">
        <div className="font-display text-lg font-semibold">No se pudo cargar el panel</div>
        <p className="mt-1 text-muted">Revisá la conexión. Se reintenta solo cada 5 segundos.</p>
      </div>
    ) : (
      <div className="space-y-5" aria-busy="true" aria-label="Cargando el panel">
        <div className="skeleton h-12 w-64 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const s = data.stats;
  const age = overview.lastOkAt ? now - overview.lastOkAt : 0;
  const stale = age > STALE_AFTER_MS;
  const latest = (sessions.value ?? []).slice(0, LATEST_SESSIONS);

  return (
    <div className="space-y-6" data-testid="dashboard">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted">Estado de las máquinas y los lavados de hoy</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.demoMode ? <DemoBanner /> : null}
          <span className={`chip ${stale ? 'border-transparent bg-warn-soft text-warn' : ''}`} aria-live="polite">
            <span className={`led ${stale ? 'led-warn' : 'led-ok'}`} aria-hidden="true" />
            {stale ? 'Datos desactualizados' : `Actualizado ${timeAgo(new Date(overview.lastOkAt ?? now).toISOString())}`}
          </span>
        </div>
      </header>

      <section aria-label="Resumen de hoy" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Máquinas en línea" value={s.machinesOnline} tone="ok" sub={`${s.machinesDegraded} con fallas`} />
        <Stat label="Máquinas sin conexión" value={s.machinesOffline} tone={s.machinesOffline > 0 ? 'error' : undefined} sub={`${s.machinesDisabled} deshabilitadas`} />
        <Stat label="Lavados de hoy" value={s.washesToday} sub="en todas las máquinas" />
        <Stat label="Ingresos de hoy" value={formatArs(s.revenueToday)} tone="ok" sub="pagos aprobados" />
        <Stat label="Sesiones activas" value={s.activeSessions} tone={s.activeSessions > 0 ? 'warn' : undefined} sub="en curso ahora" />
        <Stat label="Errores" value={data.recentErrors.length} tone={data.recentErrors.length > 0 ? 'error' : undefined} sub="recientes" />
      </section>

      <section aria-label="Lavados de hoy por categoría" className="card grid grid-cols-3 divide-x divide-line">
        {(['remis', 'socio', 'externo'] as const).map((cat) => (
          <div key={cat} className="px-4 py-3">
            <div className="text-sm text-muted">{PLATE_CATEGORY_LABELS[cat]}</div>
            <div className="num mt-1 text-lg font-semibold">
              {s.byCategory[cat].washes} <span className="text-sm font-normal text-muted">lavados</span>
            </div>
            <div className="num text-sm text-primary">{formatArs(s.byCategory[cat].revenue)}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section aria-labelledby="dash-machines" className="xl:col-span-2">
          <h2 id="dash-machines" className="mb-3 font-display text-base font-semibold">Máquinas</h2>
          {data.machines.length === 0 ? (
            <div className="card p-6 text-center text-muted">Todavía no hay máquinas cargadas.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.machines.map((m) => (
                <article key={m.id} className="card flex flex-col gap-4 p-5" data-testid={`machine-card-${m.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display text-lg font-semibold">{m.id}</div>
                      <div className="text-sm text-muted">
                        {m.name} · último latido {timeAgo(m.lastHeartbeatAt)}
                      </div>
                    </div>
                    <MachineBadge status={m.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-surface-2 px-3 py-2">
                      <dt className="text-sm text-muted">Relé</dt>
                      <dd className="font-semibold">{m.relayState ? 'Encendido' : 'Apagado'}</dd>
                    </div>
                    <div className="rounded-xl bg-surface-2 px-3 py-2">
                      <dt className="text-sm text-muted">Sesión</dt>
                      <dd className="font-semibold">{m.activeSessionStatus ? STATUS_LABELS[m.activeSessionStatus] : 'Libre'}</dd>
                    </div>
                    <div className="rounded-xl bg-surface-2 px-3 py-2">
                      <dt className="text-sm text-muted">Lavados hoy</dt>
                      <dd className="num text-lg font-semibold">{m.washesToday}</dd>
                    </div>
                    <div className="rounded-xl bg-surface-2 px-3 py-2">
                      <dt className="text-sm text-muted">Ingresos hoy</dt>
                      <dd className="num text-lg font-semibold">{formatArs(m.revenueToday)}</dd>
                    </div>
                  </dl>
                  <div className="flex items-center justify-between gap-2 text-sm text-muted">
                    <span className="num">
                      {formatArs(m.priceRemisArs)} · {formatArs(m.priceSocioArs)} · {formatArs(m.priceExternoArs)}
                    </span>
                    <span>Wi-Fi {m.wifiRssi !== null ? `${m.wifiRssi} dBm` : '—'}</span>
                  </div>
                  <Link to="/admin/machines" className="btn btn-ghost min-h-11 w-full text-sm">
                    Gestionar {m.id}
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="dash-errors">
          <h2 id="dash-errors" className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
            <CircleAlert size={17} className="text-err" aria-hidden="true" /> Errores recientes
          </h2>
          {data.recentErrors.length === 0 ? (
            <div className="card p-5 text-muted">Sin errores recientes.</div>
          ) : (
            <ul className="space-y-2">
              {data.recentErrors.map((e) => (
                <li key={e.id} className="rounded-2xl bg-err-soft p-4">
                  <div className="flex items-center justify-between gap-2 text-sm font-semibold text-err">
                    <span>
                      {e.machineId} · {STATUS_LABELS[e.status]}
                    </span>
                    <span className="num font-normal">{hourOf(e.updatedAt)}</span>
                  </div>
                  {e.reason ? <p className="mt-1 text-sm text-ink">{e.reason}</p> : null}
                  <Link to={`/admin/sessions/${e.id}`} className="mt-1 inline-flex min-h-8 items-center text-sm font-semibold text-primary">
                    Ver sesión
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="dash-latest" className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="dash-latest" className="font-display text-base font-semibold">Últimas sesiones</h2>
          <Link to="/admin/sessions" className="text-sm font-semibold text-primary">
            Ver todas
          </Link>
        </div>
        {sessions.value === null ? (
          <div className="p-5 text-muted">{sessions.error ? 'No se pudieron cargar las sesiones.' : 'Cargando…'}</div>
        ) : latest.length === 0 ? (
          <div className="flex items-center gap-2 p-5 text-muted">
            <ListChecks size={17} aria-hidden="true" /> Todavía no hubo sesiones.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left">
              <thead className="bg-surface-2 text-sm text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2 font-semibold">Hora</th>
                  <th scope="col" className="px-5 py-2 font-semibold">Patente</th>
                  <th scope="col" className="px-5 py-2 font-semibold">Categoría</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">Monto</th>
                  <th scope="col" className="px-5 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((r) => (
                  <tr key={r.id} className="border-t border-line hover:bg-surface-2">
                    <td className="num px-5 py-2.5 text-muted">
                      <Link to={`/admin/sessions/${r.id}`}>{hourOf(r.createdAt)}</Link>
                    </td>
                    <td className="plate px-5 py-2.5">{r.plate ?? '—'}</td>
                    <td className="px-5 py-2.5">{r.plateCategory ? PLATE_CATEGORY_LABELS[r.plateCategory] : '—'}</td>
                    <td className="num px-5 py-2.5 text-right">{r.amount !== null ? formatArs(r.amount) : '—'}</td>
                    <td className="px-5 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
