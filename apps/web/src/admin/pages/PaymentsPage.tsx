import { useCallback } from 'react';
import { CreditCard } from 'lucide-react';
import { api } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { formatArs, formatDateTime } from '../../lib/format.js';
import { EmptyState } from '../../components/ui.js';

interface PaymentRow {
  id: string;
  externalPaymentId: string;
  provider: string;
  machineId: string;
  machineName: string;
  sessionId: string;
  plate: string | null;
  plateCategory: 'remis' | 'socio' | 'externo' | null;
  amount: number;
  status: string;
  rawStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CLS: Record<string, string> = {
  APPROVED: 'text-ok border-ok/30 bg-ok/10',
  PENDING: 'text-warn border-warn/30 bg-warn/10',
  REJECTED: 'text-err border-err/30 bg-err/10',
  EXPIRED: 'text-dim border-line2 bg-white/5',
  REFUNDED: 'text-aqua border-aqua/30 bg-aqua/10',
};

export default function PaymentsPage() {
  const load = useCallback(async () => {
    try {
      const r = await api<{ payments: PaymentRow[] }>('/admin/payments');
      return r.payments;
    } catch {
      return null;
    }
  }, []);
  const payments = usePolling(load, 5000);

  return (
    <div className="stagger space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-wide">Pagos</h1>
        <p className="text-sm text-dim">Órdenes de cobro y su estado real en el proveedor</p>
      </header>

      {payments === null ? (
        <div className="card p-10 text-center text-dim">CARGANDO…</div>
      ) : payments.length === 0 ? (
        <EmptyState icon={<CreditCard size={22} />} title="Sin pagos" sub="Todavía no hay órdenes de cobro." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[0.62rem] uppercase tracking-[0.18em] text-faint">
                <th className="px-4 py-3">Creado</th>
                <th className="px-4 py-3">Id externo</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Máquina</th>
                <th className="px-4 py-3">Patente</th>
                <th className="px-4 py-3">Sesión</th>
                <th className="px-4 py-3">Importe</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Raw</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-line/50 hover:bg-white/[0.02]">
                  <td className="num px-4 py-3 text-xs text-dim">{formatDateTime(p.createdAt)}</td>
                  <td className="num px-4 py-3 text-xs text-dim">{p.externalPaymentId}</td>
                  <td className="px-4 py-3 text-xs">{p.provider}</td>
                  <td className="px-4 py-3 font-display">{p.machineId}</td>
                  <td className="px-4 py-3">
                    {p.plate ? <span className="chip num tracking-[0.08em]">{p.plate}</span> : <span className="text-faint">—</span>}
                  </td>
                  <td className="num px-4 py-3 text-xs text-aqua">{p.sessionId}</td>
                  <td className="num px-4 py-3">{formatArs(p.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`chip ${STATUS_CLS[p.status] ?? 'text-dim border-line2'}`}>{p.status}</span>
                  </td>
                  <td className="num px-4 py-3 text-xs text-faint">{p.rawStatus ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
