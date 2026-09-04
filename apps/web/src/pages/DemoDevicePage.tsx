import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Cpu, Hand, Power, RefreshCcw, Wifi, WifiOff, Zap } from 'lucide-react';
import type { SimulatorAction, SimulatorSnapshot } from '@hidro/shared';
import { api } from '../api/client.js';
import { usePolling } from '../lib/usePolling.js';
import { formatClock, timeAgo } from '../lib/format.js';
import { DemoBanner } from '../components/ui.js';

const MACHINES = ['HIDRO-01', 'HIDRO-02'];

const LED_LABEL: Record<string, string> = {
  OFF: 'APAGADO (sin autorización)',
  GREEN: 'VERDE FIJO (pago aprobado, esperando pulsador)',
  GREEN_BLINK: 'VERDE PARPADEANDO (lavado en curso)',
  RED: 'ROJO (error)',
};

const ACTIONS: Array<{ action: SimulatorAction; label: string; icon: 'hand' | 'wifi' | 'wifiOff' | 'reboot' | 'internet' | 'power' | 'error' | 'clear' }> = [
  { action: 'press_button', label: 'PRESIONAR PULSADOR', icon: 'hand' },
  { action: 'disconnect', label: 'DESCONECTAR ESP32', icon: 'wifiOff' },
  { action: 'reconnect', label: 'RECONECTAR', icon: 'wifi' },
  { action: 'reboot', label: 'SIMULAR REBOOT', icon: 'reboot' },
  { action: 'internet_cut', label: 'SIMULAR CORTE DE INTERNET', icon: 'internet' },
  { action: 'internet_restore', label: 'RESTAURAR INTERNET', icon: 'wifi' },
  { action: 'power_cut', label: 'SIMULAR CORTE ELÉCTRICO', icon: 'power' },
  { action: 'device_error', label: 'SIMULAR ERROR', icon: 'error' },
  { action: 'clear_error', label: 'LIMPIAR ERROR', icon: 'clear' },
];

function iconOf(kind: string, size = 15) {
  switch (kind) {
    case 'hand': return <Hand size={size} />;
    case 'wifi': return <Wifi size={size} />;
    case 'wifiOff': return <WifiOff size={size} />;
    case 'reboot': return <RefreshCcw size={size} />;
    case 'internet': return <WifiOff size={size} />;
    case 'power': return <Power size={size} />;
    case 'error': return <Zap size={size} />;
    default: return <Cpu size={size} />;
  }
}

export default function DemoDevicePage() {
  const [machineId, setMachineId] = useState('HIDRO-01');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ simulator: SimulatorSnapshot }>(`/demo/device/${machineId}/state`);
      return r.simulator;
    } catch {
      return null;
    }
  }, [machineId]);
  const sim = usePolling(load, 500);

  async function run(action: SimulatorAction) {
    setBusy(action);
    try {
      const r = await api<{ simulator: SimulatorSnapshot }>(`/demo/device/${machineId}/action`, { method: 'POST', body: { action } });
      void r;
    } catch {
      /* el poll ya lo muestra */
    } finally {
      setTimeout(() => setBusy(null), 300);
    }
  }

  const ledClass = sim ? (sim.ledState === 'GREEN' ? 'led-big-green' : sim.ledState === 'GREEN_BLINK' ? 'led-big-blink' : sim.ledState === 'RED' ? 'led-big-red' : '') : '';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-10 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <Link to="/" className="btn btn-ghost h-9 w-9 rounded-lg">
          <ArrowLeft size={16} />
        </Link>
        <div className="font-display text-xs font-semibold tracking-[0.25em]">ESP32 SIMULADOR</div>
        <span className="w-9" />
      </header>

      <div className="mb-4">
        <DemoBanner text="DEMO MODE — dispositivo ESP32 simulado dentro de la API (mismo protocolo REST + HMAC que el firmware real)" />
      </div>

      {/* selector de máquina */}
      <div className="mb-4 flex gap-2">
        {MACHINES.map((m) => (
          <button
            key={m}
            className={`btn ${machineId === m ? 'btn-aqua' : 'btn-ghost'} px-4 py-2 text-xs`}
            onClick={() => setMachineId(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {!sim ? (
        <div className="card p-10 text-center text-dim">Simulador no disponible (¿DEVICE_SIMULATOR=true?).</div>
      ) : (
        <main className="stagger grid gap-3 md:grid-cols-2">
          {/* panel visual */}
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[0.62rem] uppercase tracking-[0.24em] text-faint">Dispositivo</div>
                <div className="num text-sm">{sim.deviceId}</div>
              </div>
              <div className={`led-big ${ledClass}`}>
                <div className="led-big-core" />
              </div>
            </div>
            <div className="mt-2 text-xs text-dim">{LED_LABEL[sim.ledState]}</div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="chip justify-between"><Wifi size={12} className={sim.wifiConnected ? 'text-ok' : 'text-err'} /> WiFi {sim.wifiConnected ? '-56 dBm' : 'OFF'}</div>
              <div className="chip justify-between"><Cpu size={12} className={sim.backendReachable ? 'text-ok' : 'text-warn'} /> Backend {sim.backendReachable ? 'OK' : 'sin conexión'}</div>
              <div className="chip justify-between"><Zap size={12} className={sim.relayState ? 'text-warn' : 'text-faint'} /> RELAY {sim.relayState ? 'ON' : 'OFF'}</div>
              <div className="chip justify-between">Estado {sim.state}</div>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-line bg-white/[0.02] p-3 text-xs text-dim">
              <div className="flex justify-between"><span>Heartbeat</span><span className="num">{timeAgo(sim.lastHeartbeatAt)}</span></div>
              <div className="flex justify-between"><span>Uptime</span><span className="num">{sim.uptimeSeconds} s</span></div>
              <div className="flex justify-between"><span>Autorización</span><span className="num">{sim.authorizedSessionId ?? '—'}</span></div>
              {sim.timer ? (
                <div>
                  <div className="flex justify-between">
                    <span>Timer local</span>
                    <span className="num text-aqua">{formatClock(sim.timer.remainingSeconds)} / {formatClock(sim.timer.durationSeconds)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-aqua transition-all" style={{ width: `${(sim.timer.remainingSeconds / sim.timer.durationSeconds) * 100}%` }} />
                  </div>
                </div>
              ) : (
                <div className="flex justify-between"><span>Timer local</span><span className="num">inactivo</span></div>
              )}
              <div className="flex justify-between"><span>Speed factor (solo testing)</span><span className="num text-warn">×{sim.speedFactor}</span></div>
              {sim.lastError ? <div className="flex justify-between gap-3"><span className="text-err">Último error</span><span className="num text-right text-err">{sim.lastError}</span></div> : null}
            </div>
          </section>

          {/* controles */}
          <section className="card p-5">
            <div className="mb-3 text-[0.62rem] uppercase tracking-[0.24em] text-faint">Controles de simulación</div>
            <div className="grid grid-cols-1 gap-2">
              {ACTIONS.map((a) => (
                <button
                  key={a.action}
                  className={`btn btn-ghost justify-start gap-2 px-4 py-2.5 text-xs ${busy === a.action ? 'opacity-50' : ''}`}
                  onClick={() => run(a.action)}
                  disabled={busy !== null}
                >
                  {iconOf(a.icon)}
                  {a.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[0.68rem] leading-relaxed text-faint">
              Cada acción replica el comportamiento del firmware real: el relay arranca SIEMPRE apagado,
              el timer corre localmente, el pulsador no hace nada sin autorización válida y ante cualquier
              ambigüedad la seguridad gana (RELAY OFF).
            </p>
          </section>

          {/* NVS */}
          <section className="card p-5 md:col-span-2">
            <div className="mb-2 text-[0.62rem] uppercase tracking-[0.24em] text-faint">Persistencia NVS (sobrevive reinicios)</div>
            <pre className="num max-h-40 overflow-auto rounded-xl border border-line bg-carbon p-3 text-[0.7rem] text-dim">
              {sim.persistedNvs ? JSON.stringify(sim.persistedNvs, null, 2) : '(vacío — sin sesión en curso)'}
            </pre>
          </section>
        </main>
      )}
    </div>
  );
}
