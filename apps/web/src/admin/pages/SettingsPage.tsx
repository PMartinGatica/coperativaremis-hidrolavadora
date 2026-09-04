import { useCallback, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { DemoBanner } from '../../components/ui.js';

interface SettingsInfo {
  nodeEnv: string;
  paymentProvider: string;
  demoMode: boolean;
  simulatorEnabled: boolean;
  publicAppUrl: string;
  adminEmail: string;
  demoSpeedFactor: number;
  authTtlSeconds: number;
  heartbeatIntervalMs: number;
  paymentPendingTimeoutSeconds: number;
  dailyWashLimit: number;
  notes: string[];
}

export default function SettingsPage() {
  const [speed, setSpeed] = useState('10');
  const [ttl, setTtl] = useState('300');
  const [heartbeat, setHeartbeat] = useState('5000');
  const [timeout, setTimeoutVal] = useState('600');
  const [washLimit, setWashLimit] = useState('2');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<SettingsInfo>('/admin/settings');
      setSpeed(String(s.demoSpeedFactor));
      setTtl(String(s.authTtlSeconds));
      setHeartbeat(String(s.heartbeatIntervalMs));
      setTimeoutVal(String(s.paymentPendingTimeoutSeconds));
      setWashLimit(String(s.dailyWashLimit));
      return s;
    } catch {
      return null;
    }
  }, []);
  const settings = usePolling(load, 30_000);

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await api('/admin/settings', {
        method: 'PATCH',
        body: {
          demoSpeedFactor: Number(speed),
          authTtlSeconds: Number(ttl),
          heartbeatIntervalMs: Number(heartbeat),
          paymentPendingTimeoutSeconds: Number(timeout),
          dailyWashLimit: Number(washLimit),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    }
  }

  return (
    <div className="stagger max-w-2xl space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-wide">Ajustes</h1>
        <p className="text-sm text-dim">Configuración operativa del sistema</p>
      </header>

      {settings?.demoMode ? <DemoBanner /> : null}

      <section className="card p-5">
        <h2 className="mb-4 text-[0.68rem] uppercase tracking-[0.24em] text-faint">Entorno</h2>
        <dl className="space-y-2 text-sm">
          {[
            ['Modo', settings?.nodeEnv ?? '—'],
            ['Proveedor de pagos', settings?.paymentProvider ?? '—'],
            ['Simulador ESP32', settings ? (settings.simulatorEnabled ? 'ACTIVO' : 'APAGADO') : '—'],
            ['URL pública (QR y retorno MP)', settings?.publicAppUrl ?? '—'],
            ['Email administrador', settings?.adminEmail ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line/50 pb-2">
              <span className="text-dim">{k}</span>
              <span className="num text-right">{v}</span>
            </div>
          ))}
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-[0.68rem] uppercase tracking-[0.24em] text-faint">Parámetros operativos</h2>
        <p className="mb-4 text-xs text-faint">Los cambios se aplican sin reiniciar. Cambiar precio/duración se hace por máquina.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Factor de aceleración DEMO (solo testing)" value={speed} onChange={setSpeed} hint="1 = real · 10 = 18s · 60 = 3s. Forzado a 1 en producción." />
          <Field label="TTL de autorización (segundos)" value={ttl} onChange={setTtl} hint="Tiempo entre el pago y el pulsador." />
          <Field label="Intervalo de heartbeat (ms)" value={heartbeat} onChange={setHeartbeat} hint="El ESP32 reporta estado en este intervalo." />
          <Field label="Timeout de pago pendiente (segundos)" value={timeout} onChange={setTimeoutVal} hint="Vencida, la sesión pasa a PAYMENT_EXPIRED." />
          <Field label="Lavados por día POR PATENTE" value={washLimit} onChange={setWashLimit} hint="Decisión del cliente: 2. Evita abusos de la tarifa de remis." />
        </div>
        {error ? <div className="mt-3 rounded-xl border border-err/30 bg-err/10 p-3 text-sm text-err">{error}</div> : null}
        <button className="btn btn-aqua mt-4 gap-2 px-5 py-2.5 text-sm" onClick={save}>
          <Save size={14} /> {saved ? '✓ GUARDADO' : 'GUARDAR'}
        </button>
      </section>

      <section className="card border-warn/25 p-5">
        <h2 className="mb-3 text-[0.68rem] uppercase tracking-[0.24em] text-warn">PENDING CLIENT DECISION</h2>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-dim">
          {(settings?.notes ?? []).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <div>
      <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">{label}</label>
      <input className="input num" value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" />
      <div className="mt-1 text-[0.65rem] text-faint">{hint}</div>
    </div>
  );
}
