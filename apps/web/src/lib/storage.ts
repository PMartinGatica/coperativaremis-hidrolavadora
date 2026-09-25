// localStorage puede lanzar (Safari en modo privado, almacenamiento bloqueado, cuota llena).
// Ningún dato guardado acá es imprescindible: si falla, la app sigue sin recordarlo.

/** Última máquina usada: la app instalada (start_url "/?app=1") vuelve directo a ella. */
export const LAST_MACHINE_KEY = 'hidro:lastMachine';

export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: se pierde al recargar, nada más */
  }
}

export function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* idem */
  }
}
