import { useCallback, useState } from 'react';
import { FileText } from 'lucide-react';
import { api } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { formatDateTime } from '../../lib/format.js';
import { EmptyState } from '../../components/ui.js';

interface LogRow {
  id: string;
  at: string;
  source: 'system' | 'device';
  type: string;
  actor: string;
  entity: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
}

export default function LogsPage() {
  const [source, setSource] = useState<'all' | 'system' | 'device'>('all');

  const load = useCallback(async () => {
    try {
      const r = await api<{ logs: LogRow[] }>(`/admin/logs?source=${source}`);
      return r.logs;
    } catch {
      return null;
    }
  }, [source]);
  const logs = usePolling(load, 4000);

  return (
    <div className="stagger space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide">Logs</h1>
          <p className="text-sm text-dim">Auditoría del sistema + eventos del dispositivo (estructurados, no console.log)</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-line bg-panel p-1">
          {(['all', 'system', 'device'] as const).map((s) => (
            <button
              key={s}
              className={`rounded-lg px-3 py-1.5 text-xs ${source === s ? 'bg-aqua/15 text-aqua' : 'text-dim'}`}
              onClick={() => setSource(s)}
            >
              {s === 'all' ? 'Todos' : s === 'system' ? 'Sistema' : 'Dispositivo'}
            </button>
          ))}
        </div>
      </header>

      {logs === null ? (
        <div className="card p-10 text-center text-dim">CARGANDO…</div>
      ) : logs.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="Sin eventos" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[0.62rem] uppercase tracking-[0.18em] text-faint">
                <th className="px-4 py-3">Hora</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Entidad</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-line/50 hover:bg-surface-2">
                  <td className="num px-4 py-2.5 text-xs text-dim">{formatDateTime(l.at)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`chip ${l.source === 'device' ? 'text-aqua border-aqua/30 bg-aqua/10' : 'text-dim border-line2'}`}>
                      {l.source}
                    </span>
                  </td>
                  <td className="num px-4 py-2.5 text-xs">{l.type}</td>
                  <td className="px-4 py-2.5 text-xs text-dim">{l.actor}</td>
                  <td className="num px-4 py-2.5 text-xs text-dim">{l.entity}{l.entityId ? `/${l.entityId}` : ''}</td>
                  <td className="num max-w-[280px] truncate px-4 py-2.5 text-[0.65rem] text-faint">
                    {l.payload ? JSON.stringify(l.payload) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
