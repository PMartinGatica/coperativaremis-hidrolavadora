import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, CircleAlert, Clock, Cpu, Globe, Hand, Lock, RotateCcw, ShieldCheck, WifiOff } from 'lucide-react';
import {
  PLATE_CATEGORY_LABELS,
  PIN_REGEX,
  PLATE_INVALID_MESSAGE,
  normalizePlate,
  plateOrigin,
  type CheckoutResponse,
  type PlateQuote,
  type PublicMachineInfo,
  type PublicSessionState,
  type SessionStatus,
} from '@hidro/shared';
import { api, ApiError } from '../api/client.js';
import { useNow, usePollingState } from '../lib/usePolling.js';
import { LAST_MACHINE_KEY, safeGet, safeRemove, safeSet } from '../lib/storage.js';
import { formatArs, formatClock, formatMinutes } from '../lib/format.js';
import { BRAND } from '../brand.js';
import { BrandLogo, SimulationBanner, ThemeToggle } from '../components/ui.js';

/** Sin respuesta del servidor durante más de esto, se avisa "sin conexión". */
const OFFLINE_AFTER_MS = 3000;
/** Pago pendiente más de esto: se ofrece salida ("¿ya pagaste?"). */
const PENDING_HELP_AFTER_MS = 60_000;

type Stage = 'plate' | 'quote' | 'approved';
const STAGE_STEP: Record<Stage, number> = { plate: 1, quote: 2, approved: 3 };

export default function MachinePage() {
  const { machineId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionKey = `hidro.session.${machineId}`;
  const plateKey = `hidro.plate.${machineId}`;
  const [sessionId, setSessionId] = useState<string | null>(() => searchParams.get('session') ?? safeGet(sessionKey));
  const [plate, setPlate] = useState<string>(() => safeGet(plateKey) ?? '');
  const [pin, setPin] = useState('');
  const [quote, setQuote] = useState<PlateQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [machineMissing, setMachineMissing] = useState(false);

  const loadMachine = useCallback(async () => {
    try {
      const r = await api<{ machine: PublicMachineInfo }>(`/public/machines/${machineId}`);
      setMachineMissing(false);
      return r.machine;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setMachineMissing(true);
        return null;
      }
      throw err; // red caída: usePolling conserva la última máquina conocida
    }
  }, [machineId]);

  const loadSession = useCallback(async () => {
    if (!sessionId) return null;
    try {
      return await api<PublicSessionState>(`/public/sessions/${sessionId}`);
    } catch (err) {
      // Sesión inexistente (reset demo, expiración): limpiar y volver al inicio.
      if (err instanceof ApiError && err.status === 404) {
        safeRemove(sessionKey);
        setSessionId(null);
        navigate(`/machine/${machineId}`, { replace: true });
        return null;
      }
      // Cualquier otro error (red) se relanza: se conserva lo último que se vio, así un
      // corte de 1 s durante el lavado no hace volver la pantalla al paso 1 (ADR-057, D8).
      throw err;
    }
  }, [sessionId, sessionKey, machineId, navigate]);

  const machinePoll = usePollingState(loadMachine, 3000, true, machineId);
  const sessionPoll = usePollingState(loadSession, 1000, !!sessionId, sessionId);
  const machine = machinePoll.value;
  const session = sessionPoll.value;
  const { now } = useNow(session?.serverTime);

  const lastOk = sessionId ? sessionPoll.lastOkAt : machinePoll.lastOkAt;
  const offline = Boolean((sessionId ? sessionPoll.error : machinePoll.error) && lastOk && Date.now() - lastOk > OFFLINE_AFTER_MS);

  useEffect(() => {
    if (machineId) safeSet(LAST_MACHINE_KEY, machineId);
  }, [machineId]);

  // La vuelta de Mercado Pago trae ?session=<id>. Se guarda y se borra de la barra: si la
  // app se instala desde esta pantalla, no tiene que quedar atada a esa sesión (Eng E1).
  useEffect(() => {
    const param = searchParams.get('session');
    if (!param) return;
    safeSet(sessionKey, param);
    if (param !== sessionId) setSessionId(param);
    navigate(`/machine/${machineId}`, { replace: true });
  }, [searchParams, sessionId, sessionKey, machineId, navigate]);

  /** Cotización de tarifa por patente (no crea nada ni cobra). */
  async function getQuote() {
    if (!plate.trim() || quoting) return;
    // La API contesta cualquier 400 con un genérico: un PIN a medio escribir se mostraría
    // como "patente inválida". Se frena acá con el mensaje correcto.
    if (pin && !PIN_REGEX.test(pin)) {
      setQuoteError('El PIN son 4 dígitos.');
      return;
    }
    setQuoting(true);
    setQuoteError(null);
    setQuote(null);
    setError(null);
    try {
      const r = await api<{ quote: PlateQuote }>(`/public/machines/${machineId}/quote`, {
        method: 'POST',
        body: { plate, pin: pin || undefined },
      });
      setQuote(r.quote);
      safeSet(plateKey, r.quote.plate);
      setPlate(r.quote.plate);
    } catch (err) {
      if (err instanceof ApiError) {
        setQuoteError(err.status === 400 ? PLATE_INVALID_MESSAGE : err.message);
      } else {
        setQuoteError('Sin conexión. Probá de nuevo.');
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
      safeSet(sessionKey, r.checkout.sessionId);
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
        setError('La máquina está temporalmente fuera de servicio. No se realizó ningún cobro.');
      } else if (err instanceof ApiError && err.code === 'PLATE_LIMIT_REACHED') {
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Sin conexión. No se realizó ningún cobro, probá de nuevo.');
      }
      setStarting(false);
    }
    // Si salió bien no se vuelve a habilitar el botón: la página se va a Mercado Pago.
  }

  function reset() {
    safeRemove(sessionKey);
    setSessionId(null);
    setError(null);
    setQuote(null);
    setQuoteError(null);
    setPin('');
    navigate(`/machine/${machineId}`, { replace: true });
  }

  const status = session?.session.status ?? null;
  const stage: Stage | null = !status ? (quote ? 'quote' : 'plate') : ['PAYMENT_APPROVED', 'AUTHORIZED', 'WAITING_FOR_BUTTON'].includes(status) ? 'approved' : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-110 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3">
        <BrandLogo size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold leading-tight">{BRAND.appName}</div>
          <div className="text-[0.8rem] leading-tight text-muted">{BRAND.subtitle}</div>
        </div>
        {machine?.demoMode ? <span className="chip border-transparent bg-warn-soft text-warn">Demo</span> : null}
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-5">
        {offline ? (
          <div role="status" className="flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
            <WifiOff size={16} aria-hidden="true" />
            {status === 'RUNNING' ? 'Sin conexión. La máquina sigue funcionando.' : 'Sin conexión. Reintentando…'}
          </div>
        ) : null}

        {machineMissing && !machine ? (
          <Notice tone="err" icon={<CircleAlert size={28} aria-hidden="true" />} title="Esta máquina no existe" testId="machine-missing">
            No encontramos la máquina <span className="plate">{machineId}</span>. Revisá el código QR o avisá a la cooperativa.
          </Notice>
        ) : !machine ? (
          <div className="space-y-4" aria-busy="true">
            <p className="text-muted">{machinePoll.error ? 'No pudimos conectar con la máquina. Reintentando…' : 'Conectando con la máquina…'}</p>
            <div className="skeleton h-10 w-2/3 rounded-xl" />
            <div className="skeleton h-16 rounded-2xl" />
            <div className="skeleton h-14 rounded-2xl" />
          </div>
        ) : (
          <>
            {machine.simulatedDevice ? (
              <SimulationBanner>
                <Link to="/demo/device" className="btn btn-ghost mt-2.5 min-h-11 w-full text-sm">
                  <Cpu size={15} aria-hidden="true" /> Abrir la máquina simulada (pulsador)
                </Link>
              </SimulationBanner>
            ) : null}

            {/* Sin sesión y con la máquina ocupada o apagada, el aviso reemplaza al paso 1. */}
            {stage && (status || machine.availability === 'AVAILABLE') ? <StepBar step={STAGE_STEP[stage]} machine={machine} /> : null}

            <div aria-live="polite" className="flex flex-1 flex-col gap-5" data-testid={`stage-${status ?? stage}`}>
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
                  setError(null);
                }}
                onPay={startPayment}
                onReset={reset}
              />
            </div>
          </>
        )}
      </main>

      <footer className="px-5 pb-6 text-center text-sm leading-relaxed text-muted">
        Ante cualquier problema, avisá a la cooperativa con el código de tu lavado. Si un pago no se completa, no se cobra.
      </footer>
    </div>
  );
}

// ============================================================

function StepBar({ step, machine }: { step: number; machine: PublicMachineInfo }) {
  // En el paso 3 la máquina figura BUSY porque está reservada para quien acaba de pagar.
  const [label, led, chip] =
    step === 3
      ? ['Habilitada para vos', 'led-ok', 'bg-primary-soft text-primary-soft-ink']
      : machine.availability === 'AVAILABLE'
        ? ['Disponible', 'led-ok', 'bg-primary-soft text-primary-soft-ink']
        : machine.availability === 'BUSY'
          ? ['En uso', 'led-warn', 'bg-warn-soft text-warn']
          : ['Fuera de servicio', 'led-err', 'bg-err-soft text-err'];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`chip border-transparent ${chip}`} data-testid="machine-status">
          <span className={`led ${led}`} aria-hidden="true" />
          {machine.id} · {label}
        </span>
        <span className="text-sm text-muted">Paso {step} de 3</span>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-primary' : 'bg-line'}`} />
        ))}
      </div>
    </div>
  );
}

function Notice({ tone, icon, title, children, testId }: { tone: 'ok' | 'warn' | 'err'; icon: ReactNode; title: string; children?: ReactNode; testId?: string }) {
  const ring = tone === 'ok' ? 'bg-primary-soft text-primary' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-err-soft text-err';
  return (
    <section className="flex flex-col items-center gap-3 pt-4 text-center" data-testid={testId}>
      <span className={`grid h-20 w-20 place-items-center rounded-full ${ring}`}>{icon}</span>
      <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight">{title}</h1>
      {children ? <div className="max-w-[320px] leading-relaxed text-muted">{children}</div> : null}
    </section>
  );
}

function Alert({ tone, children }: { tone: 'warn' | 'err'; children: ReactNode }) {
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-xl p-3 text-sm ${tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-err-soft text-err'}`}>
      <CircleAlert size={17} className="mt-0.5 flex-none" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function PlateChip({ plate }: { plate: string }) {
  return <span className="plate rounded-lg border-[1.5px] border-ink px-2.5 py-1 text-base">{plate}</span>;
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

/** Mensaje de cada estado de error: qué pasó, qué pasó con la plata, qué hacer (D3). */
const ERROR_STAGES: Partial<Record<SessionStatus, { title: string; what: string; money: string; charged: boolean }>> = {
  PAYMENT_FAILED: { title: 'El pago no fue aprobado', what: 'Mercado Pago rechazó el pago.', money: 'No se te cobró nada.', charged: false },
  PAYMENT_EXPIRED: { title: 'La orden de pago venció', what: 'No llegó la confirmación de Mercado Pago a tiempo.', money: 'No se te cobró nada.', charged: false },
  AUTHORIZATION_EXPIRED: { title: 'Pasaron 5 minutos sin apretar el botón', what: 'La máquina se volvió a bloquear.', money: 'Tu pago quedó registrado.', charged: true },
  MACHINE_OFFLINE: { title: 'La máquina se desconectó', what: 'Perdió la conexión después de tu pago.', money: 'Tu pago quedó registrado.', charged: true },
  SESSION_INTERRUPTED: { title: 'El lavado se cortó', what: 'La máquina tuvo una falla durante el lavado.', money: 'Tu pago quedó registrado.', charged: true },
  EMERGENCY_STOP: { title: 'La cooperativa detuvo la máquina', what: 'Se activó la parada de emergencia.', money: 'Tu pago quedó registrado.', charged: true },
  DEVICE_ERROR: { title: 'La máquina reportó un error', what: 'Se apagó sola por seguridad.', money: 'Tu pago quedó registrado.', charged: true },
};

function FlowStage(props: FlowStageProps) {
  const { machine, session, now, quote, onReset } = props;
  const status = session?.session.status ?? null;
  const duration = session?.session.durationSeconds ?? machine.durationSeconds;
  const scale = session?.session.demoTimeScale ?? 1;

  // ---------- sin sesión: patente / tarifa ----------
  if (!status) {
    if (machine.availability !== 'AVAILABLE') {
      const busy = machine.availability === 'BUSY';
      return (
        <Notice
          tone={busy ? 'warn' : 'err'}
          icon={busy ? <Clock size={30} aria-hidden="true" /> : <CircleAlert size={30} aria-hidden="true" />}
          title={busy ? 'La máquina está en uso' : 'Máquina fuera de servicio'}
          testId={busy ? 'machine-busy' : 'machine-out'}
        >
          {busy
            ? 'Hay un lavado en curso. Esperá a que termine: esta pantalla se actualiza sola.'
            : 'La máquina no está conectada. No se puede pagar ahora y no se genera ningún cobro.'}
        </Notice>
      );
    }
    return quote ? <QuoteStage {...props} quote={quote} /> : <PlateStage {...props} />;
  }

  // ---------- con sesión ----------
  if (status === 'PAYMENT_PENDING' || status === 'IDLE') {
    return <PendingStage onReset={onReset} demo={machine.demoMode} />;
  }

  const failure = ERROR_STAGES[status];
  if (failure) {
    const code = (session?.session.id ?? '').slice(0, 8).toUpperCase();
    return (
      <>
        <Notice tone={failure.charged ? 'warn' : 'err'} icon={<CircleAlert size={30} aria-hidden="true" />} title={failure.title} testId="stage-error">
          {failure.what}
        </Notice>
        <div className={`rounded-xl p-4 text-center font-semibold ${failure.charged ? 'bg-warn-soft text-warn' : 'bg-primary-soft text-primary-soft-ink'}`}>
          {failure.money}
        </div>
        {failure.charged ? (
          <div className="card p-4 text-center">
            <div className="text-sm text-muted">Avisá a la cooperativa con este código</div>
            <div className="plate mt-1 text-2xl" data-testid="session-code">{code}</div>
          </div>
        ) : null}
        <div className="flex-1" />
        <button type="button" className="btn btn-ghost min-h-13 w-full text-base" onClick={onReset}>
          <RotateCcw size={17} aria-hidden="true" /> {failure.charged ? 'Volver al inicio' : 'Probar de nuevo'}
        </button>
      </>
    );
  }

  if (status === 'PAYMENT_APPROVED' || status === 'AUTHORIZED' || status === 'WAITING_FOR_BUTTON') {
    const authRemaining = session?.session.authorizationExpiresAt
      ? Math.max(0, (Date.parse(session.session.authorizationExpiresAt) - now) / 1000)
      : null;
    const lightOn = status === 'WAITING_FOR_BUTTON';
    return (
      <>
        <Notice tone="ok" icon={<Check size={40} strokeWidth={2.4} aria-hidden="true" />} title="Pago aprobado" testId="stage-approved">
          {lightOn ? 'La luz verde de la máquina está encendida.' : 'Estamos avisándole a la máquina. En segundos se prende la luz verde.'}
        </Notice>
        <section className="card flex items-center gap-4 p-4">
          <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-primary text-on-primary">
            <Hand size={28} aria-hidden="true" />
          </span>
          <div>
            <div className="font-display text-lg font-semibold leading-tight">Cuando veas la luz verde, apretá el botón</div>
            {authRemaining !== null ? (
              <div className="mt-1 text-muted">
                Tenés{' '}
                <span className={`num font-semibold ${authRemaining < 60 ? 'text-warn' : 'text-ink'}`} data-testid="auth-clock">
                  {formatClock(authRemaining)}
                </span>{' '}
                para arrancar el lavado.
              </div>
            ) : null}
          </div>
        </section>
        {machine.simulatedDevice ? (
          <Link to="/demo/device" className="btn btn-ghost min-h-11 w-full text-sm">
            <Cpu size={15} aria-hidden="true" /> Modo demo: apretar el pulsador simulado
          </Link>
        ) : null}
        <ul className="space-y-2 rounded-2xl bg-surface-2 p-4 text-muted">
          <li className="flex gap-2.5">
            <Clock size={18} className="mt-0.5 flex-none" aria-hidden="true" />
            Al apretar, la hidrolavadora funciona {formatMinutes(duration)} y se apaga sola.
          </li>
          <li className="flex gap-2.5">
            <ShieldCheck size={18} className="mt-0.5 flex-none" aria-hidden="true" />
            Si se corta internet, el lavado igual termina: el tiempo lo cuenta la máquina.
          </li>
        </ul>
        <div className="flex-1" />
        <button type="button" className="btn btn-ghost min-h-12 w-full text-sm" onClick={onReset}>
          Cancelar
        </button>
      </>
    );
  }

  if (status === 'RUNNING') {
    const washRemaining = session?.session.startedAt
      ? Math.max(0, duration - ((now - Date.parse(session.session.startedAt)) / 1000) * scale)
      : duration;
    return (
      <>
        <div className="flex justify-center">
          <span className="chip border-transparent bg-primary-soft text-primary-soft-ink">
            <span className="led led-ok" aria-hidden="true" /> Lavando · {machine.id}
          </span>
        </div>
        <CountdownRing remaining={washRemaining} total={duration} />
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">¡A lavar!</h1>
          <p className="mt-1 text-muted">La máquina se apaga sola al llegar a cero. Podés cerrar esta pantalla.</p>
        </div>
        <div className="flex-1" />
        <SessionSummary session={session} />
      </>
    );
  }

  if (status === 'FINISHED') {
    const left = quote ? Math.max(0, quote.remainingToday - 1) : null;
    return (
      <>
        <Notice tone="ok" icon={<Check size={40} strokeWidth={2.4} aria-hidden="true" />} title="¡Listo!" testId="stage-finished">
          Gracias por usar la hidrolavadora de la cooperativa.
          {left !== null && quote ? (
            <>
              {' '}
              Te {left === 1 ? 'queda' : 'quedan'} <span className="num font-semibold text-ink">{left}</span> de {quote.limit} lavados hoy.
            </>
          ) : null}
        </Notice>
        <SessionSummary session={session} />
        <div className="flex-1" />
        {/* Vuelve al paso 1 con la patente cargada y el PIN vacío: re-cotizar sin PIN le
            mostraría $8.000 a un socio o remisero (el PIN no sobrevive a la vuelta de MP). */}
        {left !== 0 ? (
          <button type="button" className="btn btn-primary min-h-14 w-full text-lg" onClick={onReset}>
            <RotateCcw size={19} aria-hidden="true" /> Lavar de nuevo
          </button>
        ) : (
          <button type="button" className="btn btn-ghost min-h-12 w-full text-sm" onClick={onReset}>
            Volver al inicio
          </button>
        )}
      </>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted">
      <span className="spinner" aria-hidden="true" /> Procesando…
    </div>
  );
}

function PlateStage({ machine, plate, setPlate, pin, setPin, quoting, quoteError, onQuote }: FlowStageProps) {
  const origin = plate.length >= 4 ? plateOrigin(plate) : null;
  return (
    <form
      className="flex flex-1 flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void onQuote();
      }}
    >
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight">Ingresá tu patente</h1>
        <p className="mt-1 leading-relaxed text-muted">La tarifa depende de si tu vehículo está registrado en la cooperativa.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="plate" className="block font-semibold">Patente</label>
        <input
          id="plate"
          data-testid="plate-input"
          className="input plate h-16 text-center text-[1.75rem]"
          value={plate}
          onChange={(e) => setPlate(normalizePlate(e.target.value))}
          placeholder="AG945RS"
          maxLength={16}
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-describedby="plate-hint"
        />
        <div id="plate-hint" className={`flex items-center gap-1.5 text-sm font-semibold ${origin === 'ar' ? 'text-primary' : origin === 'foreign' ? 'text-warn' : 'text-muted'}`}>
          {origin === 'ar' ? (
            <>
              <Check size={16} aria-hidden="true" /> Patente argentina
            </>
          ) : origin === 'foreign' ? (
            <>
              <Globe size={16} aria-hidden="true" /> Formato de otro país: tarifa de particular
            </>
          ) : plate.length > 0 ? (
            'Seguí escribiendo…'
          ) : (
            'Ejemplo: AG945RS (dos letras, tres números, dos letras)'
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="pin" className="block font-semibold">
          PIN <span className="font-normal text-muted">(solo socios y remises)</span>
        </label>
        <input
          id="pin"
          data-testid="pin-input"
          className="input plate h-13 text-center text-xl tracking-[0.4em]"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          placeholder="••••"
          aria-describedby="pin-hint"
        />
        <div id="pin-hint" className="text-sm text-muted">
          Sin PIN se cobra la tarifa de particular. Si tu patente es de otro país, dejalo vacío.
        </div>
      </div>

      {machine.simulatedDevice ? (
        <p className="text-sm text-muted">
          Una patente que no esté cargada en el panel cotiza como particular. Para ver las tarifas de remis y socio,
          registrala antes desde{' '}
          <Link to="/admin" className="font-semibold text-primary underline">
            el panel de administración
          </Link>
          .
        </p>
      ) : null}

      {quoteError ? <Alert tone="err">{quoteError}</Alert> : null}

      <button type="submit" data-testid="quote-button" className="btn btn-primary min-h-14 w-full text-lg" disabled={quoting || plate.trim().length === 0}>
        {quoting ? <span className="spinner" aria-hidden="true" /> : null}
        {quoting ? 'Consultando…' : 'Ver mi tarifa'}
        {!quoting ? <ArrowRight size={20} aria-hidden="true" /> : null}
      </button>

      <PriceTable machine={machine} />
    </form>
  );
}

function PriceTable({ machine }: { machine: PublicMachineInfo }) {
  const rows: Array<[string, number]> = [
    [PLATE_CATEGORY_LABELS.remis, machine.priceRemisArs],
    [PLATE_CATEGORY_LABELS.socio, machine.priceSocioArs],
    ['Particular o de otro país', machine.priceExternoArs],
  ];
  return (
    <section aria-label="Tarifas" className="card overflow-hidden">
      <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-muted">
        Tarifas por lavado de {formatMinutes(machine.durationSeconds)}
      </div>
      {rows.map(([label, price]) => (
        <div key={label} className="flex justify-between border-b border-line px-4 py-2.5 last:border-b-0">
          <span>{label}</span>
          <span className="num font-semibold">{formatArs(price)}</span>
        </div>
      ))}
    </section>
  );
}

function QuoteStage({ machine, quote, error, starting, onPay, onChangePlate }: FlowStageProps & { quote: PlateQuote }) {
  const limitReached = quote.remainingToday <= 0;
  // Formato argentino pero no registrada: probable error de tipeo de un socio (C4/D5).
  const maybeTypo = quote.category === 'externo' && plateOrigin(quote.plate) === 'ar';
  return (
    <div className="flex flex-1 flex-col gap-5">
      <button type="button" onClick={onChangePlate} className="inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-muted">
        <ArrowRight size={18} className="rotate-180" aria-hidden="true" /> Cambiar patente
      </button>

      <section className="card space-y-5 p-5" data-testid="quote-card">
        <div className="flex items-center justify-between gap-3">
          <PlateChip plate={quote.plate} />
          <span className="chip border-transparent bg-primary-soft text-primary-soft-ink">{quote.categoryLabel}</span>
        </div>
        <div>
          <div className="text-sm text-muted">Total a pagar</div>
          <div className="num text-[3.5rem] font-semibold leading-none tracking-tight" data-testid="price">
            {formatArs(quote.priceArs)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-surface-2 px-3.5 py-3">
            <div className="text-sm text-muted">Duración</div>
            <div className="num text-lg font-semibold">{formatMinutes(machine.durationSeconds)}</div>
          </div>
          <div className="rounded-xl bg-surface-2 px-3.5 py-3">
            <div className="text-sm text-muted">Lavados hoy</div>
            <div className="num text-lg font-semibold">
              {quote.limit - quote.remainingToday} de {quote.limit}
            </div>
          </div>
        </div>
      </section>

      {limitReached ? (
        <Alert tone="err">
          Llegaste al tope de {quote.limit} lavados por día para esta patente. Volvé mañana.
        </Alert>
      ) : null}

      {maybeTypo && !limitReached ? (
        <div role="alert" className="space-y-3 rounded-2xl bg-warn-soft p-4" data-testid="typo-warning">
          <div className="flex items-start gap-2 text-warn">
            <CircleAlert size={18} className="mt-0.5 flex-none" aria-hidden="true" />
            <p className="font-semibold">
              Esta patente no figura registrada en la cooperativa. Si sos socio o remisero, revisá la patente y el PIN.
            </p>
          </div>
          <button type="button" className="btn btn-primary min-h-12 w-full" onClick={onChangePlate}>
            Corregir patente
          </button>
        </div>
      ) : null}

      <ol className="space-y-3">
        {['Pagás con Mercado Pago.', 'Se prende la luz verde de la máquina.', 'Apretás el botón y la hidrolavadora arranca.'].map((t, i) => (
          <li key={t} className="flex items-start gap-3">
            <span className="num grid h-7 w-7 flex-none place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-ink">{i + 1}</span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>

      {error ? <Alert tone="err">{error}</Alert> : null}

      <div className="flex-1" />
      <div className="space-y-2">
        <button
          type="button"
          data-testid="pay-button"
          className={`btn min-h-14 w-full text-lg ${maybeTypo ? 'btn-ghost' : 'btn-primary'}`}
          onClick={onPay}
          disabled={starting || limitReached}
        >
          {starting ? <span className="spinner" aria-hidden="true" /> : <Lock size={19} aria-hidden="true" />}
          {starting ? 'Abriendo Mercado Pago…' : `Pagar ${formatArs(quote.priceArs)} con Mercado Pago`}
        </button>
        <p className="text-center text-sm text-muted">
          {machine.demoMode ? 'Pago simulado (modo demo): no se cobra dinero real.' : 'El pago se hace en Mercado Pago. No guardamos datos de tu tarjeta.'}
        </p>
      </div>
    </div>
  );
}

function PendingStage({ onReset, demo }: { onReset: () => void; demo: boolean }) {
  const since = useRef(Date.now());
  const { now } = useNow();
  const slow = now - since.current > PENDING_HELP_AFTER_MS;
  return (
    <>
      <section className="flex flex-col items-center gap-4 py-8 text-center" data-testid="stage-pending">
        <span className="spinner text-3xl text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Esperando confirmación de Mercado Pago…</h1>
        <p className="max-w-[320px] text-muted">
          {demo ? 'Modo demo: usá la pantalla de pago simulado para aprobar o rechazar.' : 'Apenas Mercado Pago confirme, se habilita la máquina.'}
        </p>
      </section>
      {slow ? (
        <div className="space-y-3 rounded-2xl bg-surface-2 p-4 text-center">
          <p className="font-semibold">¿Ya pagaste? Puede tardar un poco.</p>
          <p className="text-sm text-muted">Si no llegaste a pagar, podés volver a empezar: no se cobra nada.</p>
          <button type="button" className="btn btn-ghost min-h-12 w-full" onClick={onReset}>
            Volver a empezar
          </button>
        </div>
      ) : null}
    </>
  );
}

function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 112;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const minute = Math.ceil(remaining / 60);
  return (
    <div className="relative mx-auto h-[260px] w-[260px]">
      <svg width="260" height="260" viewBox="0 0 260 260" className="-rotate-90" aria-hidden="true">
        <circle cx="130" cy="130" r={r} fill="none" stroke="var(--line)" strokeWidth="14" />
        <circle
          cx="130"
          cy="130"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <div className="num text-[4rem] font-semibold leading-none tracking-tight" data-testid="wash-clock">
          {formatClock(remaining)}
        </div>
        <div className="text-muted">restantes de {formatClock(total)}</div>
      </div>
      {/* Para lectores de pantalla: se anuncia por minuto, no cada segundo. */}
      <span className="sr-only" aria-live="polite">
        {minute > 0 ? `Quedan menos de ${minute} ${minute === 1 ? 'minuto' : 'minutos'} de lavado` : 'Lavado terminado'}
      </span>
    </div>
  );
}

function SessionSummary({ session }: { session: PublicSessionState | null }) {
  if (!session) return null;
  const rows: Array<[string, ReactNode]> = [];
  if (session.session.plate) rows.push(['Patente', <span className="plate">{session.session.plate}</span>]);
  if (session.payment) rows.push(['Pagado', <span className="num font-semibold">{formatArs(session.payment.amount)}</span>]);
  if (session.session.plateCategory) rows.push(['Categoría', PLATE_CATEGORY_LABELS[session.session.plateCategory]]);
  rows.push(['Código', <span className="plate">{session.session.id.slice(0, 8).toUpperCase()}</span>]);
  return (
    <section className="card overflow-hidden">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-line px-4 py-3 last:border-b-0">
          <span className="text-muted">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </section>
  );
}
