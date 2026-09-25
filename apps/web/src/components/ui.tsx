import type { ReactNode } from 'react';
import { Moon, Sun, X } from 'lucide-react';
import { STATUS_LABELS, STATUS_TONES } from '@hidro/state-machine';
import type { StatusTone } from '@hidro/state-machine';
import type { Availability, MachineStatus, SessionStatus } from '@hidro/shared';
import { BRAND } from '../brand.js';
import { useTheme } from '../lib/useTheme.js';

// ---------------- Badge de estado ----------------
// Fondos suaves SÓLIDOS (no transparencias): se leen igual en cualquier tema y teléfono.
const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'text-primary-soft-ink border-transparent bg-primary-soft',
  warn: 'text-warn border-transparent bg-warn-soft',
  error: 'text-err border-transparent bg-err-soft',
  info: 'text-primary-soft-ink border-transparent bg-primary-soft',
  neutral: 'text-muted border-line bg-surface-2',
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  return (
    <span className={`chip ${TONE_CLASS[tone]}`}>
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
  ONLINE: 'En línea',
  DEGRADED: 'Con fallas',
  OFFLINE: 'Sin conexión',
  DISABLED: 'Deshabilitada',
};

export function MachineBadge({ status }: { status: MachineStatus }) {
  const tone = MACHINE_TONE[status] ?? 'neutral';
  return (
    <span className={`chip ${TONE_CLASS[tone]}`}>
      <Led tone={tone} />
      {MACHINE_LABEL[status] ?? status}
    </span>
  );
}

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  if (availability === 'BUSY') {
    return <span className={`chip ${TONE_CLASS.warn}`}>En uso</span>;
  }
  if (availability === 'OUT_OF_SERVICE') {
    return <span className={`chip ${TONE_CLASS.error}`}>Fuera de servicio</span>;
  }
  return <span className={`chip ${TONE_CLASS.ok}`}>Disponible</span>;
}

// ---------------- LED ----------------
export function Led({ tone }: { tone: StatusTone }) {
  const cls = tone === 'ok' ? 'led-ok' : tone === 'warn' ? 'led-warn' : tone === 'error' ? 'led-err' : tone === 'info' ? 'led-aqua' : 'led-off';
  return <span className={`led ${cls}`} aria-hidden="true" />;
}

// ---------------- Marca y tema ----------------
export function BrandLogo({ size = 44 }: { size?: number }) {
  return (
    <span
      className="block flex-none overflow-hidden rounded-full border border-line bg-white"
      style={{ width: size, height: size }}
    >
      <img src={BRAND.logoSrc} alt={BRAND.logoAlt} width={size} height={size} className="h-full w-full object-cover" />
    </span>
  );
}

/** Botón sol/luna. Arranca en claro; el oscuro queda recordado en este dispositivo. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      className={`btn btn-ghost h-11 w-11 flex-none rounded-xl p-0 ${className}`}
    >
      {dark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
    </button>
  );
}

// ---------------- Primitivas ----------------
export function Card({ children, className = '', hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>;
}

const STAT_TONE: Record<StatusTone, string> = {
  ok: 'text-primary',
  warn: 'text-warn',
  error: 'text-err',
  info: 'text-primary',
  neutral: 'text-ink',
};

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: StatusTone }) {
  return (
    <div className="card flex flex-col gap-1.5 p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`num text-3xl font-semibold leading-none tracking-tight ${tone ? STAT_TONE[tone] : 'text-ink'}`}>{value}</div>
      {sub ? <div className="text-sm text-muted">{sub}</div> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${width} max-h-[88vh] overflow-y-auto p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button type="button" className="btn btn-ghost h-9 w-9 rounded-lg p-0 text-muted" onClick={onClose} aria-label="Cerrar">
            <X size={16} aria-hidden="true" />
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
      <div className="text-muted">{icon}</div>
      <div className="font-display text-base font-semibold">{title}</div>
      {sub ? <div className="text-sm text-muted">{sub}</div> : null}
    </div>
  );
}

/** Aviso grande y difícil de ignorar: lo que se ve NO es una máquina real (ADR-047).
 *  Se muestra cuando la API informa `simulatedDevice`, o sea DEVICE_SIMULATOR=true. */
export function SimulationBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-xl bg-warn-soft p-3 text-left">
      <div className="flex items-center gap-2 text-sm font-semibold text-warn">
        <span className="led led-warn" aria-hidden="true" />
        Modo demo: máquina simulada
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink">
        No hay una hidrolavadora conectada: el cobro es de mentira y no se enciende ningún motor.
        Esta pantalla es para ver y ajustar cómo queda el sistema.
      </p>
      {children}
    </div>
  );
}

export function DemoBanner({ text = 'Modo demo: sin credenciales de Mercado Pago ni máquina física' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
      <span className="led led-warn" aria-hidden="true" />
      {text}
    </div>
  );
}
