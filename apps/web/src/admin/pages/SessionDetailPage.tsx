import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, CreditCard, Hand, RefreshCw, ShieldCheck, Wrench, Zap } from 'lucide-react';
import { api, ApiError } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { formatArs, formatDateTime, formatTime } from '../../lib/format.js';
import { Card, StatusBadge } from '../../components/ui.js';
import type { ReconcileResultType, SessionTimelineEvent, SessionStatus } from '@hidro/shared';

interface ReconcileResponse {
  result: ReconcileResultType;
  sessionId: string;
  authorizationId?: string;
  message: string;
}

interface ReconcileFeedback {
  text: string;
  tone: 'ok' | 'warn' | 'err';
}

interface SessionDetail {
  id: string;
  machineId: string;
  machineName: string;
  plate: string | null;
  plateCategory: 'remis' | 'socio' | 'externo' | null;
  status: SessionStatus;
  durationSeconds: number;
  startedAt: string | null;
  finishedAt: string | null;
  interruptionReason: string | null;
  createdAt: string;
  payment: {
    id: string;
    externalPaymentId: string;
    provider: string;
    status: string;
    amount: number;
    rawStatus: string | null;
  } | null;
  timeline: SessionTimelineEvent[];
}

function timelineIcon(type: string) {
  if (type.includes('RELAY_ON')) return <Zap size={13} className="text-warn" />;
  if (type.includes('RELAY_OFF')) return <Zap size={13} className="text-faint" />;
  if (type.includes('BUTTON')) return <Hand size={13} className="text-aqua" />;
  if (type.includes('AUTH') || type.includes('AUTHORIZATION')) return <ShieldCheck size={13} className="text-ok" />;
  if (type.includes('PAYMENT') || type.includes('WEBHOOK')) return <CreditCard size={13} className="text-dim" />;
  if (type.includes('ERROR') || type.includes('STOP') || type.includes('INTERRUPTED')) return <AlertTriangle size={13} className="text-err" />;
  if (type.includes('SESSION_FINISHED')) return <Check size={13} className="text-ok" />;
  return <Wrench size={13} className="text-faint" />;
}

function timelineTone(type: string): string {
  if (type.includes('ERROR') || type.includes('STOP') || type.includes('REJECTED') || type.includes('INTERRUPTED')) return 'text-err';
  if (type.includes('RELAY_ON') || type.includes('EXPIRED')) return 'text-warn';
  if (type.includes('APPROVED') || type.includes('FINISHED') || type.includes('CONSUMED') || type.includes('FETCHED') || type.includes('CREATED')) return 'text-ink';
  return 'text-dim';
}

export default function SessionDetailPage() {
  const { sessionId = '' } = useParams();

  const load = useCallback(async () => {
    try {
      const r = await api<{ session: SessionDetail }>(`/admin/sessions/${sessionId}`);
      return r.session;
    } catch {
      return null;
    }
  }, [sessionId]);
  const polled = usePolling(load, 2000);

  // Un poll fallido después de haber cargado con éxito NO debe tirar abajo la página:
  // usePolling propaga cualquier `null` de load() como valor nuevo (usePolling.ts:16),
  // así que sin esto un blip de red revertía toda la pantalla al skeleton de carga en
  // medio de una reconciliación (autoplan Eng review, hallazgo #1, 2026-09-07).
  const [lastGood, setLastGood] = useState<SessionDetail | null>(null);
  useEffect(() => {
    if (polled) setLastGood(polled);
  }, [polled]);
  const session = polled ?? lastGood;
  const stale = polled === null && lastGood !== null;

  const [reconcileBusy, setReconcileBusy] = useState<'auto' | 'manual' | null>(null);
  const [reconcileFeedback, setReconcileFeedback] = useState<ReconcileFeedback | null>(null);
  const [manualPaymentId, setManualPaymentId] = useState('');

  const applyReconcileResult = useCallback((r: ReconcileResponse) => {
    setReconcileFeedback({ text: r.message, tone: r.result === 'approved' ? 'ok' : 'warn' });
  }, []);

  const handleReconcileAuto = useCallback(async () => {
    setReconcileBusy('auto');
    setReconcileFeedback(null);
    try {
      const r = await api<ReconcileResponse>(`/admin/sessions/${sessionId}/reconcile/auto`, { method: 'POST' });
      applyReconcileResult(r);
    } catch (err) {
      setReconcileFeedback({ text: err instanceof ApiError ? err.message : 'Error al reconciliar. Reintentá.', tone: 'err' });
    } finally {
      setReconcileBusy(null);
    }
  }, [sessionId, applyReconcileResult]);

  const handleReconcileManual = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setReconcileBusy('manual');
    setReconcileFeedback(null);
    try {
      const r = await api<ReconcileResponse>(`/admin/sessions/${sessionId}/reconcile/manual`, {
        method: 'POST',
        body: { paymentId: manualPaymentId },
      });
      applyReconcileResult(r);
    } catch (err) {
      setReconcileFeedback({ text: err instanceof ApiError ? err.message : 'Error al reconciliar. Reintentá.', tone: 'err' });
    } finally {
      setReconcileBusy(null);
    }
  }, [sessionId, manualPaymentId, applyReconcileResult]);

  if (!session) {
    return (
      <div>
        <Link to="/admin/sessions" className="mb-4 inline-flex items-center gap-1.5 text-sm text-dim hover:text-ink">
          <ArrowLeft size={14} /> Volver
        </Link>
        <div className="card p-10 text-center text-dim">CARGANDO SESIÓN…</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {stale ? (
        <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 p-2.5 text-xs text-warn">
          <RefreshCw size={13} className="animate-spin" /> Actualización pausada — reintentando…
        </div>
      ) : null}
      <header>
        <Link to="/admin/sessions" className="mb-2 inline-flex items-center gap-1.5 text-sm text-dim hover:text-ink">
          <ArrowLeft size={14} /> Volver a sesiones
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="num font-display text-2xl font-semibold tracking-wide">{session.id}</h1>
            <p className="text-sm text-dim">
              {session.machineId} · {session.machineName}
            </p>
            {session.plate ? (
              <div className="mt-1.5">
                <span className="chip num tracking-[0.1em] text-aqua border-aqua/30 bg-aqua/10">
                  🚗 {session.plate}
                  {session.plateCategory ? ` · ${session.plateCategory}` : ''}
                </span>
              </div>
            ) : null}
          </div>
          <StatusBadge status={session.status} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Creación</div>
          <div className="num mt-1 text-sm">{formatDateTime(session.createdAt)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Inicio / Fin</div>
          <div className="num mt-1 text-sm">
            {session.startedAt ? formatTime(session.startedAt) : '—'} → {session.finishedAt ? formatTime(session.finishedAt) : '—'}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Pago</div>
          {session.payment ? (
            <div className="mt-1 text-sm">
              <span className="num text-aqua">{formatArs(session.payment.amount)}</span>{' '}
              <span className="num text-xs text-dim">({session.payment.externalPaymentId})</span>
              <div className="text-xs text-dim">estado: {session.payment.status} · {session.payment.provider}</div>
            </div>
          ) : (
            <div className="mt-1 text-sm text-dim">Sin pago asociado</div>
          )}
        </Card>
      </div>

      {session.status === 'PAYMENT_EXPIRED' ? (
        <Card className="space-y-3 p-5">
          <div className="text-[0.68rem] uppercase tracking-[0.24em] text-faint">Reconciliación</div>
          <button
            className="btn btn-aqua gap-2 px-5 py-2.5 text-sm"
            disabled={reconcileBusy !== null}
            onClick={() => void handleReconcileAuto()}
          >
            {reconcileBusy === 'auto' ? 'Reintentando…' : 'Reintentar automático'}
          </button>
          <form onSubmit={(e) => void handleReconcileManual(e)} className="space-y-2 border-t border-line pt-3">
            <p className="text-xs text-dim">
              Si no se resuelve solo, aprobalo con el ID de pago real de Mercado Pago.
            </p>
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-50">
                <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">
                  ID de pago (Mercado Pago)
                </label>
                <input
                  className="input num"
                  value={manualPaymentId}
                  onChange={(e) => setManualPaymentId(e.target.value)}
                  placeholder="Ej: 1330000000"
                  maxLength={64}
                />
              </div>
              <button
                className="btn btn-ghost self-end gap-2 px-5 py-2.5 text-sm"
                disabled={reconcileBusy !== null || manualPaymentId.trim().length === 0}
              >
                {reconcileBusy === 'manual' ? 'Aprobando…' : 'Aprobar con este ID de pago'}
              </button>
            </div>
          </form>
          {reconcileFeedback ? (
            <div
              className={`text-sm ${
                reconcileFeedback.tone === 'ok' ? 'text-ok' : reconcileFeedback.tone === 'err' ? 'text-err' : 'text-warn'
              }`}
            >
              {reconcileFeedback.text}
            </div>
          ) : null}
        </Card>
      ) : null}

      {session.interruptionReason ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          Motivo de interrupción: {session.interruptionReason}
        </div>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-4 text-[0.68rem] uppercase tracking-[0.24em] text-faint">Timeline completa</h2>
        <ol className="relative space-y-4 border-l border-line pl-5">
          {session.timeline.map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative">
              <span className="absolute -left-[26.5px] top-0.5 grid h-4 w-4 place-items-center rounded-full border border-line bg-panel">
                {timelineIcon(e.type)}
              </span>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="num text-xs text-faint">{formatTime(e.at)}</span>
                <span className={`text-sm ${timelineTone(e.type)}`}>{e.label}</span>
                <span className="chip text-[0.58rem]">{e.source}</span>
              </div>
              {e.payload && Object.keys(e.payload).length > 0 && !e.label.includes('→') ? (
                <div className="num mt-0.5 text-[0.65rem] text-faint">{JSON.stringify(e.payload)}</div>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
