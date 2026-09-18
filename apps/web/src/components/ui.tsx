import type { ReactNode } from 'react';
import { STATUS_LABELS, STATUS_TONES } from '@hidro/state-machine';
import type { StatusTone } from '@hidro/state-machine';
import type { Availability, MachineStatus, SessionStatus } from '@hidro/shared';

// ---------------- Badge de estado ----------------

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'text-ok border-ok/30 bg-ok/10',
  warn: 'text-warn border-warn/30 bg-warn/10',
  error: 'text-err border-err/30 bg-err/10',
  info: 'text-aqua border-aqua/30 bg-aqua/10',
  neutral: 'text-dim border-line2 bg-white/5',
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  return (
    <span className={`chip uppercase ${TONE_CLASS[tone]}`}>
      <Led tone={tone} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const MACHINE_TONE: Record<MachineStatus, StatusTone> = {
  ONLINE: 'ok',
  DEGRADED: 'warn',
  OFFLINE: 'error',
  DISABLED: 'neutral',
};

const MACHINE_LABEL: Record<MachineStatus, string> = {
  ONLINE: 'Online',
  DEGRADED: 'Degradada',
  OFFLINE: 'Offline',
  DISABLED: 'Deshabilitada',
};

export function MachineBadge({ status }: { status: MachineStatus }) {
  const tone = MACHINE_TONE[status] ?? 'neutral';
  return (
    <span className={`chip uppercase ${TONE_CLASS[tone]}`}>
      <Led tone={tone} />
      {MACHINE_LABEL[status] ?? status}
    </span>
  );
}

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  if (availability === 'BUSY') {
    return <span className="chip uppercase text-warn border-warn/30 bg-warn/10">En uso</span>;
  }
  if (availability === 'OUT_OF_SERVICE') {
    return <span className="chip uppercase text-err border-err/30 bg-err/10">Fuera de servicio</span>;
  }
  return <span className="chip uppercase text-ok border-ok/30 bg-ok/10">Disponible</span>;
}

// ---------------- LED ----------------
export function Led({ tone }: { tone: StatusTone }) {
  const cls = tone === 'ok' ? 'led-ok' : tone === 'warn' ? 'led-warn' : tone === 'error' ? 'led-err' : tone === 'info' ? 'led-aqua' : 'led-off';
  return <span className={`led ${cls}`} />;
}

// ---------------- Primitivas ----------------
export function Card({ children, className = '', hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: StatusTone }) {
  return (
    <div className="card p-4">
      <div className="text-[0.65rem] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className={`mt-1.5 font-display text-xl font-semibold ${tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'error' ? 'text-err' : ''}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-dim">{sub}</div> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className={`card w-full ${width} max-h-[88vh] overflow-y-auto p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button className="btn btn-ghost h-8 w-8 rounded-lg text-dim" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <div className="text-dim">{icon}</div>
      <div className="font-display text-base">{title}</div>
      {sub ? <div className="text-sm text-dim">{sub}</div> : null}
    </div>
  );
}

/** Aviso grande y difícil de ignorar: lo que se ve NO es una máquina real (ADR-047).
 *  Se muestra cuando la API informa `simulatedDevice`, o sea DEVICE_SIMULATOR=true. */
export function SimulationBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-left">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-warn">
        <span className="led led-warn" />
        Modo demo — máquina simulada
      </div>
      <p className="mt-1.5 text-[0.72rem] leading-relaxed text-dim">
        No hay una hidrolavadora conectada: el cobro es de mentira y no se enciende ningún motor.
        Esta pantalla es para ver y ajustar cómo queda el sistema.
      </p>
      {children}
    </div>
  );
}

export function DemoBanner({ text = 'DEMO MODE — sin credenciales de Mercado Pago ni ESP32 físico' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs font-medium tracking-wide text-warn">
      <span className="led led-warn" />
      {text}
    </div>
  );
}
