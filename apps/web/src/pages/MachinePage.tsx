import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Car, Check, CircleAlert, Droplets, Radio, RotateCcw, Zap } from 'lucide-react';
import { PLATE_CATEGORY_LABELS, type CheckoutResponse, type PlateQuote, type PublicMachineInfo, type PublicSessionState, type SessionStatus } from '@hidro/shared';
import { api, ApiError } from '../api/client.js';
import { usePolling, useNow } from '../lib/usePolling.js';
import { formatArs, formatClock, formatMinutes, timeAgo } from '../lib/format.js';
import { AvailabilityBadge, DemoBanner, Led } from '../components/ui.js';

interface Step {
  id: string;
  label: string;
  done: boolean;
}

const FLOW_STEPS: Array<{ id: string; label: string }> = [
  { id: 'machine_found', label: 'Máquina encontrada' },
  { id: 'machine_online', label: 'Máquina online' },
  { id: 'price_confirmed', label: 'Precio confirmado' },
  { id: 'payment_created', label: 'Pago creado' },
  { id: 'payment_approved', label: 'Pago aprobado' },
  { id: 'auth_generated', label: 'Autorización generada' },
  { id: 'device_ack', label: 'ESP32 recibió autorización' },
  { id: 'button_pressed', label: 'Pulsador presionado' },
  { id: 'ready', label: 'Máquina lista para comenzar' },
];

function buildSteps(status: SessionStatus | null | undefined, hasDeviceAck: boolean): Step[] {
  const order: SessionStatus[] = ['PAYMENT_PENDING', 'PAYMENT_APPROVED', 'AUTHORIZED', 'WAITING_FOR_BUTTON', 'RUNNING', 'FINISHED'];
  const idx = status ? order.indexOf(status) : -1;
  const approved = idx >= 0;
  const authorized = idx >= 2;
  const acked = hasDeviceAck || idx >= 3;
  const running = idx >= 4;
  const finished = idx >= 5;
  return FLOW_STEPS.map((s, i) => {
    let done = false;
    if (i === 0 && approved) done = true;
    if (i === 1 && approved) done = true;
    if (i === 2 && approved) done = true;
    if (i === 3 && approved) done = true;
    if (i === 4 && authorized) done = true;
    if (i === 5 && authorized) done = true;
    if (i === 6 && acked) done = true;
    if (i === 7 && running) done = true;
    if (i === 8 && finished) done = true;
    return { ...s, done };
  });
}

export default function MachinePage() {
  const { machineId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionKey = `hidro.session.${machineId}`;
  const plateKey = `hidro.plate.${machineId}`;
  const [sessionId, setSessionId] = useState<string | null>(() => searchParams.get('session') ?? localStorage.getItem(sessionKey));
  const [plate, setPlate] = useState<string>(() => localStorage.getItem(plateKey) ?? '');
  const [pin, setPin] = useState('');
  const [quote, setQuote] = useState<PlateQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMachine = useCallback(async () => {
    try {
      const r = await api<{ machine: PublicMachineInfo }>(`/public/machines/${machineId}`);
      return r.machine;
    } catch {
      return null;
    }
  }, [machineId]);

  const loadSession = useCallback(async () => {
    if (!sessionId) return null;
    try {
      return await api<PublicSessionState>(`/public/sessions/${sessionId}`);
    } catch (err) {
      // Sesión inexistente (reset demo, expiración): limpiar y volver al inicio.
      if (err instanceof ApiError && err.status === 404) {
        localStorage.removeItem(sessionKey);
        setSessionId(null);
        navigate(`/machine/${machineId}`, { replace: true });
      }
      return null;
    }
  }, [sessionId, sessionKey, machineId, navigate]);

  const machine = usePolling(loadMachine, 3000);
  const session = usePolling(loadSession, 1000, !!sessionId);
  const { now } = useNow(session?.serverTime);

  useEffect(() => {
    const param = searchParams.get('session');
    if (param && param !== sessionId) {
      localStorage.setItem(sessionKey, param);
      setSessionId(param);
    }
  }, [searchParams, sessionId, sessionKey]);

  const hasDeviceAck = useMemo(
    () => (session?.events ?? []).some((e) => e.type === 'AUTHORIZATION_FETCHED'),
    [session],
  );
  const steps = useMemo(
    () => buildSteps(session?.session.status ?? null, hasDeviceAck),
    [session, hasDeviceAck],
  );

  /** Cotización de tarifa por patente (no crea nada ni cobra). */
  async function getQuote() {
    if (!plate.trim() || quoting) return;
    setQuoting(true);
    setQuoteError(null);
    setQuote(null);
    try {
      const r = await api<{ quote: PlateQuote }>(`/public/machines/${machineId}/quote`, {
        method: 'POST',
        body: { plate, pin: pin || undefined },
      });
      setQuote(r.quote);
      localStorage.setItem(plateKey, r.quote.plate);
      setPlate(r.quote.plate);
    } catch (err) {
      if (err instanceof ApiError) {
        setQuoteError(err.status === 400 ? 'Patente inválida. Ejemplo: AE123CD.' : err.message);
      } else {
        setQuoteError('No se pudo cotizar la tarifa. Reintentá.');
      }
    } finally {
      setQuoting(false);
    }
  }

  async function startPayment() {
    if (!machine || starting || !quote || quote.remainingToday <= 0) return;
    setStarting(true);
    setError(null);
    try {
      const r = await api<{ checkout: CheckoutResponse }>(`/public/machines/${machineId}/sessions`, {
        method: 'POST',
        // Mismo pin que se usó en la cotización: lo que se vio es lo que se cobra.
        body: { plate: quote.plate, pin: pin || undefined },
      });
      localStorage.setItem(sessionKey, r.checkout.sessionId);
      setSessionId(r.checkout.sessionId);
      if (r.checkout.payment.initPoint) {
        window.location.href = r.checkout.payment.initPoint; // Mercado Pago real
      } else {
        navigate(`/pay/${r.checkout.payment.externalPaymentId}?machine=${machineId}&session=${r.checkout.sessionId}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MACHINE_BUSY') {
        setError('La máquina está en uso en este momento. No se realizó ningún cobro.');
      } else if (err instanceof ApiError && err.code === 'MACHINE_OFFLINE') {
        setError('La máquina está temporalmente fuera de servicio.');
      } else if (err instanceof ApiError && err.code === 'PLATE_LIMIT_REACHED') {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo iniciar el pago.');
      }
    } finally {
      setStarting(false);
    }
  }

  function reset() {
    localStorage.removeItem(sessionKey);
    setSessionId(null);
    setError(null);
    setQuote(null);
    setQuoteError(null);
    setPin('');
    navigate(`/machine/${machineId}`, { replace: true });
  }

  // ---------- render ----------
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-5">
      {/* header */}
      <header className="mb-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-aqua/40 bg-aqua/10">
            <Droplets size={18} className="text-aqua" />
          </span>
          <span className="font-display text-sm font-semibold tracking-[0.22em] text-ink">
            HIDRO <span className="text-aqua">SELF-SERVICE</span>
          </span>
        </Link>
        {machine?.demoMode ? <span className="chip text-warn border-warn/30 bg-warn/10">DEMO</span> : null}
      </header>

      {!machine ? (
        <div className="card scan-zone p-10 text-center text-dim">
          <div className="num text-xs tracking-[0.3em]">BUSCANDO MÁQUINA {machineId}…</div>
        </div>
      ) : (
        <main className="stagger flex flex-col gap-3">
          {/* tarjeta de máquina */}
          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-faint">Hidrolavadora</div>
                <h1 className="font-display text-3xl font-bold tracking-wide">{machine.id}</h1>
                <div className="mt-0.5 text-sm text-dim">{machine.name}</div>
              </div>
              <AvailabilityBadge availability={machine.availability} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-white/[0.02] p-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Duración</div>
                <div className="num mt-1 text-lg text-ink">{formatMinutes(machine.durationSeconds)}</div>
              </div>
              <div className="rounded-xl border border-line bg-white/[0.02] p-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">Tarifas</div>
                <div className="num mt-1 space-y-0.5 text-[0.72rem] leading-tight">
                  <div className="flex justify-between gap-2"><span className="text-dim">Remis</span><span className="text-ink">{formatArs(machine.priceRemisArs)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-dim">Socio</span><span className="text-ink">{formatArs(machine.priceSocioArs)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-dim">Externo</span><span className="text-aqua">{formatArs(machine.priceExternoArs)}</span></div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem] text-dim">
              <span className="chip">
                <Radio size={11} className={machine.wifiRssi !== null ? 'text-ok' : 'text-err'} />
                {machine.wifiRssi !== null ? `${machine.wifiRssi} dBm` : 'sin señal'}
              </span>
              <span className="chip">
                <Zap size={11} className={machine.relayState ? 'text-warn' : 'text-faint'} />
                RELAY {machine.relayState ? 'ON' : 'OFF'}
              </span>
              <span className="chip">HB {timeAgo(machine.lastHeartbeatAt)}</span>
            </div>
          </section>

          <FlowStage
            machine={machine}
            session={session}
            now={now}
            error={error}
            starting={starting}
            plate={plate}
            setPlate={setPlate}
            pin={pin}
            setPin={setPin}
            quote={quote}
            quoting={quoting}
            quoteError={quoteError}
            onQuote={getQuote}
            onChangePlate={() => {
              setQuote(null);
              setQuoteError(null);
            }}
            onPay={startPayment}
            onReset={reset}
          />

          {session ? <ChecklistCard steps={steps} status={session.session.status} /> : null}
        </main>
      )}

      <footer className="mt-auto pt-8 text-center text-[0.65rem] leading-relaxed text-faint">
        <div>Cooperativa de remises — lavado autoservicio</div>
        <div className="mt-1">Ante cualquier problema, contactá al administrador. Los cobros no realizados no generan cargo.</div>
      </footer>
    </div>
  );
}

// ============================================================

interface FlowStageProps {
  machine: PublicMachineInfo;
  session: PublicSessionState | null;
  now: number;
  error: string | null;
  starting: boolean;
  plate: string;
  setPlate: (v: string) => void;
  pin: string;
  setPin: (v: string) => void;
  quote: PlateQuote | null;
  quoting: boolean;
  quoteError: string | null;
  onQuote: () => void;
  onChangePlate: () => void;
  onPay: () => void;
  onReset: () => void;
}

function FlowStage({
  machine,
  session,
  now,
  error,
  starting,
  plate,
  setPlate,
  pin,
  setPin,
  quote,
  quoting,
  quoteError,
  onQuote,
  onChangePlate,
  onPay,
  onReset,
}: FlowStageProps) {
  const status = session?.session.status ?? null;
  const duration = session?.session.durationSeconds ?? machine.durationSeconds;
  const scale = session?.session.demoTimeScale ?? 1;

  // countdowns
  const authRemaining = session?.session.authorizationExpiresAt
    ? Math.max(0, (Date.parse(session.session.authorizationExpiresAt) - now) / 1000)
    : null;
  const washRemaining =
    status === 'RUNNING' && session?.session.startedAt
      ? Math.max(0, duration - ((now - Date.parse(session.session.startedAt)) / 1000) * scale)
      : null;

  const plateChip = session?.session.plate ? (
    <div className="chip mx-auto mt-3 justify-center gap-1.5 text-aqua border-aqua/30 bg-aqua/10">
      <Car size={11} />
      {session.session.plate}
      {session.session.plateCategory ? ` · ${PLATE_CATEGORY_LABELS[session.session.plateCategory]}` : ''}
    </div>
  ) : null;

  // ---------- sin sesión activa ----------
  if (!status && machine.availability === 'AVAILABLE') {
    if (!quote) {
      return (
        <section className="card relative overflow-hidden p-6 text-center">
          <div className="scan-zone pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-ok/30 bg-ok/10">
              <Led tone="ok" />
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-wide">MÁQUINA DISPONIBLE</h2>
            <p className="mt-2 text-sm leading-relaxed text-dim">
              Ingresá la patente de tu vehículo para ver tu tarifa. El lavado dura{' '}
              <span className="text-ink">{formatMinutes(machine.durationSeconds)}</span>.
            </p>

            <div className="mt-5 text-left">
              <label className="mb-1 block text-[0.62rem] uppercase tracking-[0.24em] text-faint">Patente</label>
              <input
                className="input num text-center text-lg uppercase tracking-[0.2em]"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onQuote();
                }}
                placeholder="AE123CD"
                maxLength={10}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>

            <div className="mt-3 text-left">
              <label className="mb-1 block text-[0.62rem] uppercase tracking-[0.24em] text-faint">
                PIN (solo socios y remis)
              </label>
              <input
                className="input num text-center tracking-[0.3em]"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onQuote();
                }}
                placeholder="Opcional"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
              />
            </div>

            {import.meta.env.DEV && machine.demoMode ? (
              <div className="mt-2 text-[0.68rem] text-faint">
                DEMO: probá con <span className="num text-aqua">AE100AA</span> (remis),{' '}
                <span className="num text-aqua">AE200AA</span> (socio) o cualquier otra (externo).
              </div>
            ) : null}

            {quoteError ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-err/30 bg-err/10 p-3 text-left text-sm text-err">
                <CircleAlert size={16} className="mt-0.5 flex-none" />
                {quoteError}
              </div>
            ) : null}

            <button
              className="btn btn-aqua mt-5 w-full py-4 text-base"
              onClick={onQuote}
              disabled={quoting || plate.trim().length === 0}
            >
              {quoting ? 'CONSULTANDO TARIFA…' : 'VER MI TARIFA'}
              {!quoting ? <ArrowRight size={18} /> : null}
            </button>
          </div>
        </section>
      );
    }

    // Tarifa cotizada: mostrar categoría, precio y lavados restantes del día
    const limitReached = quote.remainingToday <= 0;
    return (
      <section className="card relative overflow-hidden p-6 text-center">
        <div className="scan-zone pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative">
          <div className="chip mx-auto justify-center gap-1.5">
            <Car size={11} />
            {quote.plate}
          </div>
          <h2 className="mt-3 font-display text-xl font-semibold tracking-wide">{quote.categoryLabel.toUpperCase()}</h2>
          <div className="num mt-2 text-5xl font-semibold text-aqua">{formatArs(quote.priceArs)}</div>
          {quote.category === 'externo' ? (
            <p className="mt-2 text-[0.68rem] text-faint">¿Sos socio o remisero? Verificá tu patente y PIN.</p>
          ) : null}
          <div className="mt-2 text-xs text-dim">
            {limitReached ? (
              <span className="text-err">
                Límite diario alcanzado: {quote.limit} lavados por día por patente. Volvé mañana.
              </span>
            ) : (
              <>
                Te quedan <span className="num text-ink">{quote.remainingToday}</span> de{' '}
                <span className="num text-ink">{quote.limit}</span> lavados hoy.
              </>
            )}
          </div>

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-err/30 bg-err/10 p-3 text-left text-sm text-err">
              <CircleAlert size={16} className="mt-0.5 flex-none" />
              {error}
            </div>
          ) : null}

          <button className="btn btn-aqua mt-5 w-full py-4 text-base" onClick={onPay} disabled={starting || limitReached}>
            {starting ? 'PREPARANDO PAGO…' : `PAGAR Y HABILITAR ${formatArs(quote.priceArs)}`}
            {!starting ? <ArrowRight size={18} /> : null}
          </button>
          <button className="btn btn-ghost mt-2 w-full py-2.5 text-xs" onClick={onChangePlate}>
            CAMBIAR PATENTE
          </button>
          <div className="mt-3 text-[0.68rem] text-faint">
            {machine.demoMode ? 'Pago simulado (DEMO MODE) — no se cobra dinero real.' : 'Serás redirigido a Mercado Pago.'}
          </div>
        </div>
      </section>
    );
  }

  if (!status && machine.availability === 'BUSY') {
    return (
      <section className="card border-warn/25 p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-warn/30 bg-warn/10">
          <Led tone="warn" />
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-wide text-warn">MÁQUINA EN USO</h2>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          Hay un lavado en curso. Esperá a que termine y esta pantalla se actualizará sola.
        </p>
        <button className="btn btn-ghost mt-5 w-full py-3 text-sm" disabled>
          ESPERANDO LIBERACIÓN…
        </button>
      </section>
    );
  }

  if (!status && machine.availability === 'OUT_OF_SERVICE') {
    return (
      <section className="card border-err/25 p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-err/30 bg-err/10">
          <Led tone="error" />
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-wide text-err">MÁQUINA TEMPORALMENTE FUERA DE SERVICIO</h2>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          La máquina no está conectada. No se puede pagar en este momento — no se generará ningún cobro.
        </p>
        <button className="btn btn-ghost mt-5 w-full py-3 text-sm" disabled>
          REINTENTANDO AUTOMÁTICAMENTE…
        </button>
      </section>
    );
  }

  // ---------- con sesión activa ----------
  if (status === 'PAYMENT_PENDING' || status === 'IDLE') {
    return (
      <section className="card scan-zone relative overflow-hidden p-6 text-center">
        <div className="relative">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-aqua/30 bg-aqua/10">
            <Led tone="info" />
          </div>
          <h2 className="font-display text-xl font-semibold tracking-wide">Preparando pago…</h2>
          <p className="mt-2 text-sm text-dim">
            Esperando confirmación de Mercado Pago<span className="text-faint"> (DEMO: usá la pantalla de pago simulado)</span>.
          </p>
          <div className="num mt-4 text-xs tracking-[0.25em] text-faint">CONSULTANDO ESTADO…</div>
          <button className="btn btn-ghost mt-4 w-full py-2.5 text-xs" onClick={onReset}>
            CANCELAR
          </button>
        </div>
      </section>
    );
  }

  if (status === 'PAYMENT_FAILED') {
    return <ErrorStage title="PAGO RECHAZADO" tone="error" onReset={onReset} text="El pago no fue aprobado. No se realizó ningún cargo ni se habilitó la máquina." />;
  }
  if (status === 'PAYMENT_EXPIRED') {
    return <ErrorStage title="PAGO VENCIDO" tone="warn" onReset={onReset} text="La orden de pago venció sin confirmación. Podés intentarlo nuevamente." />;
  }
  if (status === 'AUTHORIZATION_EXPIRED') {
    return <ErrorStage title="AUTORIZACIÓN VENCIDA" tone="warn" onReset={onReset} text="Pasó demasiado tiempo entre el pago y el pulsador. Pagá nuevamente para habilitar la máquina." />;
  }
  if (status === 'MACHINE_OFFLINE') {
    return <ErrorStage title="MÁQUINA FUERA DE SERVICIO" tone="warn" onReset={onReset} text="La máquina se desconectó después del pago. Contactá al administrador — tu pago quedó registrado." />;
  }
  if (status === 'SESSION_INTERRUPTED') {
    return <ErrorStage title="LAVADO INTERRUMPIDO" tone="warn" onReset={onReset} text="El ciclo se interrumpió por una falla. Contactá al administrador — tu pago quedó registrado." />;
  }
  if (status === 'EMERGENCY_STOP') {
    return <ErrorStage title="PARADA DE EMERGENCIA" tone="error" onReset={onReset} text="La máquina fue detenida por el administrador. Contactalo antes de volver a pagar." />;
  }
  if (status === 'DEVICE_ERROR') {
    return <ErrorStage title="ERROR DE DISPOSITIVO" tone="error" onReset={onReset} text="La máquina reportó un error y cortó el relay por seguridad. Contactá al administrador." />;
  }

  if (status === 'PAYMENT_APPROVED' || status === 'AUTHORIZED' || status === 'WAITING_FOR_BUTTON') {
    return (
      <section className="card relative overflow-hidden border-ok/30 p-6 text-center" style={{ boxShadow: '0 0 60px -24px rgba(52,209,126,0.5)' }}>
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-ok/40 bg-ok/15">
          <Check size={22} className="text-ok" />
        </div>
        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-ok">✓ Pago aprobado</div>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-wide">MÁQUINA HABILITADA</h2>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          Presioná el <span className="text-ink">botón físico</span> de la hidrolavadora para comenzar el lavado.
        </p>
        {plateChip}
        {authRemaining !== null ? (
          <div className="mt-5">
            <div className="text-[0.62rem] uppercase tracking-[0.24em] text-faint">Autorización válida durante</div>
            <div className={`num mt-1 text-5xl font-semibold ${authRemaining < 60 ? 'text-warn' : 'text-ink'}`}>
              {formatClock(authRemaining)}
            </div>
            <div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-ok transition-all duration-1000"
                style={{ width: `${Math.min(100, (authRemaining / 300) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
        <button className="btn btn-ghost mt-6 w-full py-2.5 text-xs" onClick={onReset}>
          CANCELAR
        </button>
      </section>
    );
  }

  if (status === 'RUNNING') {
    return (
      <section className="card relative overflow-hidden border-aqua/35 p-6 text-center" style={{ boxShadow: '0 0 70px -22px rgba(46,230,200,0.55)' }}>
        <div className="scan-zone pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative">
          <div className="text-[0.65rem] uppercase tracking-[0.3em] text-aqua">● relay activo</div>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-wide">LAVADO EN CURSO</h2>
          {plateChip}
          {washRemaining !== null ? (
            <>
              <div className="num mt-4 text-6xl font-semibold tabular-nums text-ink">{formatClock(washRemaining)}</div>
              <div className="mx-auto mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-aqua-deep to-aqua transition-all duration-1000"
                  style={{ width: `${Math.min(100, 100 - (washRemaining / duration) * 100)}%` }}
                />
              </div>
            </>
          ) : null}
          <p className="mt-4 text-sm text-dim">
            La máquina se apagará sola al finalizar. Mantenete cerca del equipo.
          </p>
        </div>
      </section>
    );
  }

  if (status === 'FINISHED') {
    return (
      <section className="card border-ok/30 p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-ok/40 bg-ok/15">
          <Check size={22} className="text-ok" />
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-wide">LAVADO FINALIZADO</h2>
        <p className="mt-2 text-sm leading-relaxed text-dim">Gracias por utilizar el servicio. ¡Buen viaje! 🚕</p>
        {plateChip}
        <div className="num mt-4 text-xs tracking-[0.2em] text-faint">SESIÓN {session?.session.id}</div>
        <button className="btn btn-ghost mt-6 w-full py-2.5 text-xs" onClick={onReset}>
          <RotateCcw size={13} /> VOLVER AL INICIO
        </button>
      </section>
    );
  }

  return (
    <section className="card p-6 text-center text-dim">
      <div className="num text-xs tracking-[0.3em]">PROCESANDO…</div>
    </section>
  );
}

function ErrorStage({ title, text, tone, onReset }: { title: string; text: string; tone: 'warn' | 'error'; onReset: () => void }) {
  return (
    <section className="card border-err/25 p-6 text-center">
      <div className={`mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border ${tone === 'warn' ? 'border-warn/30 bg-warn/10' : 'border-err/30 bg-err/10'}`}>
        <Led tone={tone} />
      </div>
      <h2 className={`font-display text-2xl font-semibold tracking-wide ${tone === 'warn' ? 'text-warn' : 'text-err'}`}>{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-dim">{text}</p>
      <button className="btn btn-ghost mt-6 w-full py-3 text-sm" onClick={onReset}>
        <RotateCcw size={14} /> VOLVER A INTENTAR
      </button>
    </section>
  );
}

function ChecklistCard({ steps, status }: { steps: Step[]; status: SessionStatus | null }) {
  const doneCount = steps.filter((s) => s.done).length;
  const finished = status === 'FINISHED';
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[0.62rem] uppercase tracking-[0.24em] text-faint">Estado en tiempo real</div>
        <div className="num text-[0.68rem] text-dim">{doneCount}/{steps.length}</div>
      </div>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className={`flex items-center gap-3 text-sm ${step.done ? 'text-dim' : 'text-faint'}`}>
            <span
              className={`grid h-5 w-5 flex-none place-items-center rounded-full border text-[0.6rem] transition-all duration-300 ${
                step.done
                  ? finished
                    ? 'border-ok bg-ok text-carbon'
                    : 'border-aqua bg-aqua text-carbon'
                  : 'border-line2 bg-white/[0.03]'
              }`}
            >
              {step.done ? <Check size={11} strokeWidth={3} /> : ''}
            </span>
            {step.label}
          </li>
        ))}
      </ul>
      {machineBusyNote(status) ? (
        <div className="mt-3 rounded-xl border border-warn/25 bg-warn/10 p-3 text-xs text-warn">
          {machineBusyNote(status)}
        </div>
      ) : null}
    </section>
  );
}

function machineBusyNote(status: SessionStatus | null): string | null {
  if (status === 'PAYMENT_PENDING') return 'Esperando confirmación de Mercado Pago…';
  if (status === 'PAYMENT_APPROVED' || status === 'AUTHORIZED') return 'La autorización se entrega al ESP32 en segundos…';
  if (status === 'WAITING_FOR_BUTTON') return 'LED verde encendido en la máquina: presioná el pulsador físico.';
  if (status === 'RUNNING') return 'El ESP32 controla el relay localmente: corta solo aunque pierda Internet.';
  return null;
}
