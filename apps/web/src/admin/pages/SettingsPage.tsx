import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { SETTINGS_FIELD_PERMISSION, type Permission, type SettingsField } from '@hidro/shared';
import { api } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { DemoBanner } from '../../components/ui.js';
import { ReadOnlyNote, useSession } from '../session.js';

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

type FieldKey = SettingsField;

const FIELDS: Array<{ key: FieldKey; label: string; hint: string }> = [
  { key: 'dailyWashLimit', label: 'Lavados por día POR PATENTE', hint: 'Decisión del cliente: 2. Evita abusos de la tarifa de remis.' },
  { key: 'demoSpeedFactor', label: 'Factor de aceleración DEMO (solo testing)', hint: '1 = real · 10 = 18s · 60 = 3s. Forzado a 1 en producción.' },
  { key: 'authTtlSeconds', label: 'TTL de autorización (segundos)', hint: 'Tiempo entre el pago y el pulsador.' },
  { key: 'heartbeatIntervalMs', label: 'Intervalo de heartbeat (ms)', hint: 'El ESP32 reporta estado en este intervalo.' },
  { key: 'paymentPendingTimeoutSeconds', label: 'Timeout de pago pendiente (segundos)', hint: 'Vencida, la sesión pasa a PAYMENT_EXPIRED.' },
];

/** Solo los campos que cambiaron Y que el rol puede tocar: con el permiso por campo del
 *  servidor (ADR-062), mandar los 5 siempre haría que todo guardado de un admin diera 403. */
export function settingsPatch(
  values: Record<FieldKey, string>,
  initial: Record<FieldKey, number>,
  can: (p: Permission) => boolean,
): Partial<Record<FieldKey, number>> {
  const patch: Partial<Record<FieldKey, number>> = {};
  for (const { key } of FIELDS) {
    if (!can(SETTINGS_FIELD_PERMISSION[key])) continue;
    const n = Number(values[key]);
    if (values[key].trim() === '' || !Number.isFinite(n) || n === initial[key]) continue;
    patch[key] = n;
  }
  return patch;
}

export default function SettingsPage() {
  const { can } = useSession();
  const [values, setValues] = useState<Record<FieldKey, string> | null>(null);
  const [initial, setInitial] = useState<Record<FieldKey, number> | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      return await api<SettingsInfo>('/admin/settings');
    } catch {
      return null;
    }
  }, []);
  const settings = usePolling(load, 30_000);

  // El poll no pisa lo que la persona está escribiendo: los campos se llenan una sola vez.
  useEffect(() => {
    if (!settings || initial) return;
    const snap = Object.fromEntries(FIELDS.map(({ key }) => [key, settings[key]])) as Record<FieldKey, number>;
    setInitial(snap);
    setValues(Object.fromEntries(FIELDS.map(({ key }) => [key, String(snap[key])])) as Record<FieldKey, string>);
  }, [settings, initial]);

  const editable = FIELDS.filter(({ key }) => can(SETTINGS_FIELD_PERMISSION[key]));
  const readOnly = FIELDS.filter(({ key }) => !can(SETTINGS_FIELD_PERMISSION[key]));

  async function save() {
    if (!values || !initial) return;
    setError(null);
    setSaved(false);
    const patch = settingsPatch(values, initial, can);
    if (Object.keys(patch).length === 0) return;
    try {
      const s = await api<SettingsInfo>('/admin/settings', { method: 'PATCH', body: patch });
      setInitial(Object.fromEntries(FIELDS.map(({ key }) => [key, s[key]])) as Record<FieldKey, number>);
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
            ['Cuenta de soporte técnico (Insolva)', settings?.adminEmail ?? '—'],
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
        {editable.length > 0 && values ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {editable.map((f) => (
                <Field
                  key={f.key}
                  id={`setting-${f.key}`}
                  label={f.label}
                  hint={f.hint}
                  value={values[f.key]}
                  onChange={(v) => setValues({ ...values, [f.key]: v })}
                />
              ))}
            </div>
            {error ? <div role="alert" className="mt-3 rounded-xl border border-err/30 bg-err/10 p-3 text-sm text-err">{error}</div> : null}
            <button className="btn btn-aqua mt-4 gap-2 px-5 py-2.5 text-sm" onClick={save} data-testid="settings-save">
              <Save size={14} /> {saved ? '✓ GUARDADO' : 'GUARDAR'}
            </button>
          </>
        ) : null}
        {readOnly.length > 0 ? (
          <div className={editable.length > 0 ? 'mt-5 space-y-3 border-t border-line pt-4' : 'space-y-3'}>
            <ReadOnlyNote>
              {editable.length > 0
                ? 'Los ajustes técnicos los maneja el soporte técnico de Insolva.'
                : 'Solo un administrador puede cambiar esto.'}
            </ReadOnlyNote>
            <dl className="space-y-2 text-sm" data-testid="settings-readonly">
              {readOnly.map((f) => (
                <div key={f.key} className="flex justify-between gap-4 border-b border-line/50 pb-2">
                  <dt className="text-dim">{f.label}</dt>
                  <dd className="num text-right">{settings ? String(settings[f.key]) : '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
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

function Field({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">{label}</label>
      <input id={id} className="input num" value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" />
      <div className="mt-1 text-[0.65rem] text-faint">{hint}</div>
    </div>
  );
}
