import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Cpu, ShieldCheck } from 'lucide-react';
import { api } from '../api/client.js';
import { formatArs, formatMinutes } from '../lib/format.js';
import { LAST_MACHINE_KEY, safeGet } from '../lib/storage.js';
import { BRAND } from '../brand.js';
import { AvailabilityBadge, BrandLogo, SimulationBanner, ThemeToggle } from '../components/ui.js';

interface MachineListItem {
  id: string;
  name: string;
  priceRemisArs: number;
  durationSeconds: number;
  availability: 'AVAILABLE' | 'BUSY' | 'OUT_OF_SERVICE';
  demoMode: boolean;
  simulatedDevice: boolean;
}

export default function LandingPage() {
  const [searchParams] = useSearchParams();
  const [machines, setMachines] = useState<MachineListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ machines: MachineListItem[] }>('/public/machines');
      return r.machines;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load().then((m) => {
      if (!alive) return;
      setMachines(m);
      setFailed(m === null);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  // Abierta como app instalada (start_url "/?app=1"): ir directo a la última máquina usada.
  const lastMachine = searchParams.get('app') === '1' ? safeGet(LAST_MACHINE_KEY) : null;
  if (lastMachine) return <Navigate to={`/machine/${encodeURIComponent(lastMachine)}`} replace />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-110 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3">
        <BrandLogo size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold leading-tight">{BRAND.appName}</div>
          <div className="text-[0.8rem] leading-tight text-muted">{BRAND.subtitle}</div>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col gap-4 px-5 py-6">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight">Lavado autoservicio</h1>
          <p className="mt-1 text-muted">Escaneá el código QR de la máquina o elegila acá abajo.</p>
        </div>

        {machines?.some((m) => m.simulatedDevice) ? <SimulationBanner /> : null}

        {machines === null ? (
          failed ? (
            <div role="alert" className="card p-5 text-muted">No pudimos cargar las máquinas. Revisá la conexión y recargá la página.</div>
          ) : (
            <div className="space-y-3" aria-busy="true">
              <div className="skeleton h-28 rounded-2xl" />
            </div>
          )
        ) : machines.length === 0 ? (
          <div className="card p-5 text-muted">Todavía no hay máquinas disponibles.</div>
        ) : (
          machines.map((m) => (
            <Link key={m.id} to={`/machine/${m.id}`} className="card card-hover block p-5" data-testid={`landing-machine-${m.id}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-lg font-semibold">{m.id}</div>
                  <div className="text-sm text-muted">{m.name}</div>
                </div>
                <AvailabilityBadge availability={m.availability} />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <div className="num text-sm text-muted">
                  {formatMinutes(m.durationSeconds)} · desde {formatArs(m.priceRemisArs)}
                </div>
                <span className="flex items-center gap-1 font-semibold text-primary">
                  Usar <ArrowRight size={16} aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))
        )}
      </main>

      <footer className="space-y-2 px-5 pb-8">
        {/* Sin simulador corriendo, esta pantalla no tiene nada que mostrar: se oculta en vez
            de dejarle al cliente un link que no lleva a ningún lado. */}
        {machines?.some((m) => m.simulatedDevice) ? (
          <Link to="/demo/device" className="card card-hover flex min-h-14 items-center gap-3 p-4">
            <Cpu size={18} className="text-muted" aria-hidden="true" />
            <div>
              <div className="font-semibold">Simulador de la máquina</div>
              <div className="text-sm text-muted">Probar el sistema sin la máquina real</div>
            </div>
          </Link>
        ) : null}
        <Link to="/admin" className="card card-hover flex min-h-14 items-center gap-3 p-4">
          <ShieldCheck size={18} className="text-muted" aria-hidden="true" />
          <div>
            <div className="font-semibold">Panel de administración</div>
            <div className="text-sm text-muted">Solo para la cooperativa</div>
          </div>
        </Link>
      </footer>
    </div>
  );
}
