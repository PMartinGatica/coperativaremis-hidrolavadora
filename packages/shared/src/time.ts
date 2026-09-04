/**
 * Tiempo del negocio. La cooperativa opera en Ushuaia (Tierra del Fuego):
 * UTC-3 fijo, SIN horario de verano. No usar setHours() con la TZ del proceso:
 * en un contenedor UTC el "día" cortaría a las 21:00 hora local.
 */

const ARGENTINA_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3 (Tierra del Fuego, sin DST)
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Inicio del día (00:00:00.000) en hora de Ushuaia, como Date UTC.
 *
 * Cálculo: hora local = UTC + offset (offset = −3 h). Para "ver" la hora local
 * en la recta UTC se SUMA el offset; el piso del día se hace sobre esa recta, y
 * el resultado se vuelve a UTC RESTANDO el offset. Invertir los signos corre el
 * corte del día 3 h (p. ej. a las 21:00 UTC = 18:00 de Ushuaia). Ver
 * tests/time.test.ts (casos con ISO literales, independientes de la TZ del proceso).
 */
export function startOfDayAmericaArgentina(now: Date = new Date()): Date {
  const t = now.getTime();
  const shifted = t + ARGENTINA_OFFSET_MS; // hora local de Ushuaia, en la recta UTC
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(dayStart - ARGENTINA_OFFSET_MS);
}
