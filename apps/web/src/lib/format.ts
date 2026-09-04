export function formatArs(amount: number): string {
  return `$${amount.toLocaleString('es-AR')}`;
}

export function formatMinutes(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = seconds / 60;
  return Number.isInteger(m) ? `${m} min` : `${m.toFixed(1).replace('.', ',')} min`;
}

/** mm:ss para countdowns */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** "hace 2 s" / "hace 3 min" */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - Date.parse(iso);
  if (diff < 5_000) return 'ahora';
  if (diff < 60_000) return `hace ${Math.floor(diff / 1000)} s`;
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  return `hace ${Math.floor(diff / 3_600_000)} h`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
