import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Car, CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { PLATE_CATEGORY_LABELS, type PaymentPublicInfo } from '@hidro/shared';
import { api } from '../api/client.js';
import { formatArs } from '../lib/format.js';
import { DemoBanner } from '../components/ui.js';

type SimAction = 'approve' | 'reject' | 'pending' | 'duplicate_webhook' | 'invalid_webhook';

const ACTIONS: Array<{ action: SimAction; label: string; hint: string; cls: string }> = [
  { action: 'approve', label: 'APROBAR', hint: 'Pago aprobado → autorización', cls: 'btn-ok' },
  { action: 'reject', label: 'RECHAZAR', hint: 'Pago rechazado → sin autorización', cls: 'btn-danger' },
  { action: 'pending', label: 'DEJAR PENDIENTE', hint: 'Queda en espera (vencerá solo)', cls: 'btn-ghost' },
  { action: 'duplicate_webhook', label: 'WEBHOOK DUPLICADO', hint: 'Aprueba y reenvía el webhook (idempotencia)', cls: 'btn-ghost' },
  { action: 'invalid_webhook', label: 'WEBHOOK INVÁLIDO', hint: 'Firma inválida → descartado', cls: 'btn-ghost' },
];

export default function PayDemoPage() {
  const { externalId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const machineId = searchParams.get('machine') ?? '';
  const sessionId = searchParams.get('session') ?? '';
  const [info, setInfo] = useState<PaymentPublicInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PaymentPublicInfo>(`/public/payments/by-external/${externalId}`)
      .then(setInfo)
      .catch(() => setError('Pago no encontrado (¿la API está corriendo?).'));
  }, [externalId]);

  async function run(action: SimAction) {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const r = await api<{ result: { result: string; invalidWebhook?: boolean; paymentStatus?: string } }>(
        `/public/payments/${externalId}/simulate`,
        { method: 'POST', body: { action } },
      );
      setResult(r.result.invalidWebhook ? 'invalid_webhook' : r.result.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al simular.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <button className="btn btn-ghost h-9 w-9 rounded-lg" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={16} />
        </button>
        <span className="font-display text-xs font-semibold tracking-[0.25em]">SIMULAR PAGO</span>
        <span className="w-9" />
      </header>

      <div className="mb-3">
        <DemoBanner />
      </div>

      <main className="stagger flex flex-col gap-3">
        <section className="card p-5">
          <div className="text-[0.62rem] uppercase tracking-[0.24em] text-faint">Orden de cobro DEMO</div>
          <div className="num mt-2 text-sm text-dim">{externalId}</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Máquina</div>
              <div className="mt-1 font-display text-lg">{info?.machine?.id ?? machineId}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Importe</div>
              <div className="num mt-1 text-lg text-aqua">{info ? formatArs(info.payment.amount) : '—'}</div>
            </div>
          </div>
          {info?.payment.plate ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip gap-1.5 border-aqua/30 bg-aqua/10 text-aqua">
                <Car size={11} /> {info.payment.plate}
              </span>
              {info.payment.plateCategory ? (
                <span className="chip">{PLATE_CATEGORY_LABELS[info.payment.plateCategory]}</span>
              ) : null}
            </div>
          ) : null}
          {sessionId ? <div className="num mt-3 text-xs text-faint">SESIÓN {sessionId}</div> : null}
        </section>

        <section className="card p-5">
          <div className="mb-3 text-[0.62rem] uppercase tracking-[0.24em] text-faint">Elegí el resultado del pago</div>
          <div className="space-y-2">
            {ACTIONS.map((a) => (
              <button key={a.action} className={`btn ${a.cls} w-full justify-between px-4 py-3 text-sm`} onClick={() => run(a.action)} disabled={busy}>
                <span>{a.label}</span>
                <span className="text-[0.65rem] font-normal opacity-70">{a.hint}</span>
              </button>
            ))}
          </div>
        </section>

        {result ? (
          <section className={`card fade-up border p-5 text-center ${result === 'approved' ? 'border-ok/40' : result === 'rejected' ? 'border-err/40' : ''}`}>
            {result === 'approved' ? (
              <>
                <CheckCircle2 size={26} className="mx-auto text-ok" />
                <div className="mt-2 font-display text-lg text-ok">PAGO APROBADO</div>
                <p className="mt-1 text-xs text-dim">El backend generó la autorización para esta máquina (una sola vez).</p>
              </>
            ) : result === 'duplicated' ? (
              <>
                <ShieldCheck size={26} className="mx-auto text-aqua" />
                <div className="mt-2 font-display text-lg text-aqua">WEBHOOK DUPLICADO — IGNORADO</div>
                <p className="mt-1 text-xs text-dim">Idempotencia: sigue existiendo UNA sola autorización para este pago.</p>
              </>
            ) : result === 'invalid_webhook' ? (
              <>
                <ShieldAlert size={26} className="mx-auto text-warn" />
                <div className="mt-2 font-display text-lg text-warn">WEBHOOK INVÁLIDO DESCARTADO</div>
                <p className="mt-1 text-xs text-dim">Sin cambios de estado. El sistema nunca confía en webhooks sin validar.</p>
              </>
            ) : result === 'rejected' ? (
              <>
                <XCircle size={26} className="mx-auto text-err" />
                <div className="mt-2 font-display text-lg text-err">PAGO RECHAZADO</div>
                <p className="mt-1 text-xs text-dim">La máquina NO se habilita y no se generó autorización.</p>
              </>
            ) : result === 'pending' ? (
              <>
                <div className="font-display text-lg text-warn">PAGO PENDIENTE</div>
                <p className="mt-1 text-xs text-dim">La máquina no se habilita hasta la confirmación.</p>
              </>
            ) : null}

            {['approved', 'duplicated', 'rejected'].includes(result) ? (
              <Link to={`/machine/${machineId}?session=${sessionId}`} className="btn btn-aqua mt-5 w-full py-3 text-sm">
                VOLVER A LA MÁQUINA →
              </Link>
            ) : null}
          </section>
        ) : null}

        {error ? <div className="rounded-xl border border-err/30 bg-err/10 p-3 text-sm text-err">{error}</div> : null}
      </main>
    </div>
  );
}
