import { useEffect, useRef, useState } from 'react';

export interface PollState<T> {
  value: T | null;
  /** Error del último intento; se limpia con el próximo que salga bien. */
  error: unknown;
  /** Momento (ms) del último intento que salió bien; null si todavía no hubo ninguno. */
  lastOkAt: number | null;
}

const EMPTY: PollState<never> = { value: null, error: null, lastOkAt: null };

/**
 * Polling ligero con cleanup (el frontend consulta al BACKEND, nunca a Mercado Pago).
 *
 * - Siempre llama a la versión más reciente de `fn`: si `fn` cierra sobre un id que cambia
 *   (la sesión A pasa a B con la página abierta), el próximo tick ya consulta B.
 * - `key` reinicia el polling y vacía el valor al cambiar (no se muestra el dato de A
 *   mientras llega el de B). Apagarlo (`enabled=false`) también lo vacía.
 * - Un error NO borra el último valor: queda en `error` hasta el próximo intento bueno.
 *   Así un corte de red de 1 s no hace desaparecer lo que el usuario estaba viendo.
 */
export function usePollingState<T>(fn: () => Promise<T | null>, intervalMs: number, enabled = true, key?: unknown): PollState<T> {
  const fnRef = useRef(fn);
  const [state, setState] = useState<PollState<T>>(EMPTY);

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    setState((s) => (s === EMPTY ? s : EMPTY));
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    const tick = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      try {
        const v = await fnRef.current();
        if (alive) setState({ value: v, error: null, lastOkAt: Date.now() });
      } catch (err) {
        if (alive) setState((s) => ({ ...s, error: err }));
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
  }, [enabled, intervalMs, key]);

  return state;
}

/** Igual que `usePollingState` pero devuelve solo el valor (el uso de todo el panel). */
export function usePolling<T>(fn: () => Promise<T | null>, intervalMs: number, enabled = true, key?: unknown): T | null {
  return usePollingState(fn, intervalMs, enabled, key).value;
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
