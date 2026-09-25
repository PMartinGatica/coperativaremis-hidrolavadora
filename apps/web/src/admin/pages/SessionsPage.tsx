import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { formatArs, formatDateTime } from '../../lib/format.js';
import { EmptyState, StatusBadge } from '../../components/ui.js';
import type { SessionStatus } from '@hidro/shared';
import { ListChecks } from 'lucide-react';

interface SessionRow {
  id: string;
  machineId: string;
  machineName: string;
  status: SessionStatus;
  plate: string | null;
  plateCategory: 'remis' | 'socio' | 'externo' | null;
  amount: number | null;
  paymentExternalId: string | null;
  provider: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number;
  interruptionReason: string | null;
  createdAt: string;
}

export default function SessionsPage() {
  const [machineFilter, setMachineFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (machineFilter) q.set('machineId', machineFilter);
      if (statusFilter) q.set('status', statusFilter);
      const r = await api<{ sessions: SessionRow[] }>(`/admin/sessions?${q.toString()}`);
      return r.sessions;
    } catch {
      return null;
    }
  }, [machineFilter, statusFilter]);
  const sessions = usePolling(load, 4000);

  return (
    <div className="stagger space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide">Sesiones</h1>
          <p className="text-sm text-dim">Historial completo de lavados con trazabilidad total</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-auto py-2 text-xs" value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)}>
            <option value="">Todas las máquinas</option>
            <option value="HIDRO-01">HIDRO-01</option>
            <option value="HIDRO-02">HIDRO-02</option>
          </select>
          <select className="input w-auto py-2 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {['RUNNING', 'FINISHED', 'WAITING_FOR_BUTTON', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'SESSION_INTERRUPTED', 'EMERGENCY_STOP', 'DEVICE_ERROR', 'AUTHORIZATION_EXPIRED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </header>

      {sessions === null ? (
        <div className="card p-10 text-center text-dim">CARGANDO…</div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={<ListChecks size={22} />} title="Sin sesiones" sub="Todavía no hay lavados registrados." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[0.62rem] uppercase tracking-[0.18em] text-faint">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Máquina</th>
                <th className="px-4 py-3">Patente</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Importe</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Inicio</th>
                <th className="px-4 py-3">Fin</th>
                <th className="px-4 py-3">Duración</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-line/50 transition-colors hover:bg-surface-2">
                  <td className="num px-4 py-3 text-xs text-dim">{formatDateTime(s.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/sessions/${s.id}`} className="font-display text-aqua">{s.machineId}</Link>
                  </td>
                  <td className="px-4 py-3">
                    {s.plate ? (
                      <span className="chip num tracking-[0.08em]">{s.plate}</span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="num px-4 py-3 text-xs text-dim">{s.paymentExternalId ?? '—'}</td>
                  <td className="num px-4 py-3">{s.amount !== null ? formatArs(s.amount) : '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="num px-4 py-3 text-xs text-dim">{s.startedAt ? formatDateTime(s.startedAt).slice(10) : '—'}</td>
                  <td className="num px-4 py-3 text-xs text-dim">{s.finishedAt ? formatDateTime(s.finishedAt).slice(10) : '—'}</td>
                  <td className="num px-4 py-3 text-xs">{s.durationSeconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
