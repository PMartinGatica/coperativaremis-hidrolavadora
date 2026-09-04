import { useEffect, useState } from 'react';

/** Polling ligero con cleanup (el frontend consulta al BACKEND, nunca a Mercado Pago). */
export function usePolling<T>(fn: () => Promise<T | null>, intervalMs: number, enabled = true): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    const tick = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      try {
        const v = await fn();
        if (alive) setValue(v);
      } catch {
        /* reintenta en el próximo tick */
      } finally {
        inFlight = false;
        if (alive) timer = setTimeout(tick, intervalMs);
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs]);
  return value;
}

/** Reloj de 1s sincronizado con serverTime (corrige skew del reloj del cliente). */
export function useNow(serverTimeIso?: string | null): { now: number; skew: number } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const skew = serverTimeIso ? Date.parse(serverTimeIso) - now : 0;
  return { now: now + skew, skew };
}
