import { useCallback, useState } from 'react';
import { Car, KeyRound, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { formatDateTime } from '../../lib/format.js';
import { EmptyState } from '../../components/ui.js';

interface VehicleRow {
  id: string;
  plate: string;
  category: 'remis' | 'socio';
  ownerName: string | null;
  hasPin: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABEL: Record<string, string> = { remis: 'Remis', socio: 'Socio' };

export default function VehiclesPage() {
  const [search, setSearch] = useState('');
  const [plate, setPlate] = useState('');
  const [category, setCategory] = useState<'remis' | 'socio'>('remis');
  const [ownerName, setOwnerName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const r = await api<{ vehicles: VehicleRow[] }>(`/admin/vehicles${q}`);
      return r.vehicles;
    } catch {
      return null;
    }
  }, [search]);
  const vehicles = usePolling(load, 5000);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      // pin ausente (undefined) si el campo quedó vacío: no toca un PIN ya cargado en esa
      // patente (tri-estado, ver docs/designs/pin-patente-remis-socio.md).
      await api('/admin/vehicles', { method: 'POST', body: { plate, category, ownerName, pin: pin || undefined } });
      setPlate('');
      setOwnerName('');
      setPin('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: string) {
    await api(`/admin/vehicles/${p}`, { method: 'DELETE' });
  }

  async function removePin(v: VehicleRow) {
    await api('/admin/vehicles', {
      method: 'POST',
      body: { plate: v.plate, category: v.category, ownerName: v.ownerName ?? undefined, pin: null },
    });
  }

  return (
    <div className="stagger space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-wide">Patentes</h1>
        <p className="text-sm text-dim">
          Registro de remises y autos de socios. Toda patente NO registrada cotiza como{' '}
          <span className="text-err">externo ($8.000)</span>.
        </p>
      </header>

      {/* alta / re-categorización */}
      <form onSubmit={save} className="card space-y-3 p-5">
        <div className="text-[0.68rem] uppercase tracking-[0.24em] text-faint">Registrar patente (o cambiar su categoría)</div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Patente</label>
            <input
              className="input num text-center uppercase tracking-[0.15em]"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="AE123CD"
              maxLength={10}
            />
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Categoría</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as 'remis' | 'socio')}>
              <option value="remis">Remis de la cooperativa ($500)</option>
              <option value="socio">Auto de socio ($2.000)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Titular (opcional)</label>
            <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Nombre / interno" />
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">PIN (4 dígitos)</label>
            <input
              className="input num text-center tracking-[0.3em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Sin cambios"
              inputMode="numeric"
              maxLength={4}
            />
          </div>
        </div>
        {error ? <div className="text-sm text-err">{error}</div> : null}
        <button className="btn btn-aqua gap-2 px-5 py-2.5 text-sm" disabled={busy || plate.trim().length === 0}>
          <Plus size={14} /> {saved ? '✓ GUARDADO' : 'GUARDAR PATENTE'}
        </button>
      </form>

      {/* búsqueda */}
      <div>
        <input
          className="input max-w-xs"
          placeholder="Buscar patente o titular…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {vehicles === null ? (
        <div className="card p-10 text-center text-dim">CARGANDO…</div>
      ) : vehicles.length === 0 ? (
        <EmptyState icon={<Car size={22} />} title="Sin patentes registradas" sub="Registrá remises y autos de socios acá." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[0.62rem] uppercase tracking-[0.18em] text-faint">
                <th className="px-4 py-3">Patente</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Tarifa</th>
                <th className="px-4 py-3">Titular</th>
                <th className="px-4 py-3">PIN</th>
                <th className="px-4 py-3">Alta</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-line/50 hover:bg-white/[0.02]">
                  <td className="num px-4 py-3 font-semibold tracking-[0.1em]">{v.plate}</td>
                  <td className="px-4 py-3">
                    <span className={`chip ${v.category === 'remis' ? 'text-ok border-ok/30 bg-ok/10' : 'text-aqua border-aqua/30 bg-aqua/10'}`}>
                      {CATEGORY_LABEL[v.category]}
                    </span>
                  </td>
                  <td className="num px-4 py-3">{v.category === 'remis' ? '$500' : '$2.000'}</td>
                  <td className="px-4 py-3 text-xs text-dim">{v.ownerName ?? '—'}</td>
                  <td className="px-4 py-3">
                    {v.hasPin ? (
                      <button
                        className="chip gap-1 text-ok border-ok/30 bg-ok/10"
                        onClick={() => void removePin(v)}
                        title="Quitar PIN de esta patente"
                      >
                        <KeyRound size={11} /> CONFIGURADO
                      </button>
                    ) : (
                      <span className="text-xs text-faint">— sin PIN</span>
                    )}
                  </td>
                  <td className="num px-4 py-3 text-xs text-faint">{formatDateTime(v.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="btn btn-danger h-8 w-8 rounded-lg" onClick={() => void remove(v.plate)} title="Eliminar registro (pasa a externo)">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[0.68rem] text-faint">
        Eliminar un registro hace que esa patente vuelva a cotizar como externo ($8.000). El límite de{' '}
        <b>2 lavados por día por patente</b> se aplica a todas las categorías (configurable en Ajustes).
        Si una persona tiene 2 autos (su remis + su particular), cargá el <b>mismo PIN en las 2
        patentes</b> — así el auto particular cobra tarifa de socio ($2.000) en vez de externo.
        Sin PIN, la patente sigue funcionando como hasta ahora (sin exigirlo).
      </p>
    </div>
  );
}
