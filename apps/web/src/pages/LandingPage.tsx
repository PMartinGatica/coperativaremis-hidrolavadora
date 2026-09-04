import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Cpu, Droplets, ShieldCheck } from 'lucide-react';
import { api } from '../api/client.js';
import { formatArs, formatMinutes } from '../lib/format.js';
import { AvailabilityBadge } from '../components/ui.js';

interface MachineListItem {
  id: string;
  name: string;
  priceRemisArs: number;
  durationSeconds: number;
  availability: 'AVAILABLE' | 'BUSY' | 'OUT_OF_SERVICE';
  demoMode: boolean;
}

export default function LandingPage() {
  const [machines, setMachines] = useState<MachineListItem[] | null>(null);

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
      if (alive) setMachines(m);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-10">
      <header className="stagger mb-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-aqua/40 bg-aqua/10 shadow-[0_0_50px_-12px_rgba(46,230,200,0.6)]">
          <Droplets size={26} className="text-aqua" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-[0.14em]">
          HIDRO <span className="text-aqua">SELF-SERVICE</span>
        </h1>
        <p className="mt-2 text-sm text-dim">
          Lavado autoservicio para la cooperativa de remises.
          <br />
          Escaneá el QR de la máquina o elegila acá abajo.
        </p>
      </header>

      <main className="stagger space-y-3">
        {machines === null ? (
          <div className="card scan-zone p-10 text-center text-dim">
            <div className="num text-xs tracking-[0.3em]">CONSULTANDO MÁQUINAS…</div>
          </div>
        ) : (
          machines.map((m) => (
            <Link key={m.id} to={`/machine/${m.id}`} className="card card-hover block p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[0.62rem] uppercase tracking-[0.24em] text-faint">Hidrolavadora</div>
                  <div className="font-display text-xl font-semibold">{m.id}</div>
                  <div className="text-xs text-dim">{m.name}</div>
                </div>
                <AvailabilityBadge availability={m.availability} />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
                <div className="num text-dim">
                  {formatMinutes(m.durationSeconds)} · desde <span className="text-aqua">{formatArs(m.priceRemisArs)}</span>
                </div>
                <span className="flex items-center gap-1 text-aqua">
                  USAR <ArrowRight size={13} />
                </span>
              </div>
            </Link>
          ))
        )}
      </main>

      <footer className="mt-8 space-y-3">
        <Link to="/demo/device" className="card card-hover flex items-center gap-3 p-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-line2 bg-white/[0.03]">
            <Cpu size={16} className="text-dim" />
          </span>
          <div>
            <div className="text-sm">Simulador de ESP32</div>
            <div className="text-xs text-faint">Probar el sistema sin hardware físico</div>
          </div>
        </Link>
        <Link to="/admin" className="card card-hover flex items-center gap-3 p-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-line2 bg-white/[0.03]">
            <ShieldCheck size={16} className="text-dim" />
          </span>
          <div>
            <div className="text-sm">Panel de administración</div>
            <div className="text-xs text-faint">Máquinas, sesiones, pagos y logs</div>
          </div>
        </Link>
      </footer>
    </div>
  );
}
