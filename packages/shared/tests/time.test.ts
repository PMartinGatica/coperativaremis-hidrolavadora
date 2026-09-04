import { describe, expect, it } from 'vitest';
import { startOfDayAmericaArgentina } from '../src/time.js';

/**
 * El corte del día (límite de 2 lavados por patente, recaudación del admin) es a
 * las 00:00 de Ushuaia (UTC-3 fijo, sin DST). Los casos usan ISO literales UTC:
 * el test pasa con el proceso en CUALQUIER zona horaria (no hay setHours ni
 * toLocaleString involucrados en el cálculo del esperado).
 */
describe('startOfDayAmericaArgentina', () => {
  const cases: Array<{ now: string; expected: string; note: string }> = [
    {
      now: '2026-09-03T14:00:00Z', // Ushuaia 11:00 del 3
      expected: '2026-09-03T03:00:00.000Z', // Ushuaia 00:00 del 3
      note: 'mediodía local',
    },
    {
      now: '2026-09-03T02:00:00Z', // Ushuaia 23:00 del 2
      expected: '2026-09-02T03:00:00.000Z', // Ushuaia 00:00 del 2 (día anterior)
      note: 'antes de las 00:00 de Ushuaia = día anterior',
    },
    {
      now: '2026-09-03T02:59:59Z', // Ushuaia 23:59:59 del 2
      expected: '2026-09-02T03:00:00.000Z',
      note: 'un segundo antes del corte',
    },
    {
      now: '2026-09-03T03:00:00Z', // Ushuaia 00:00:00 del 3 (borde exacto)
      expected: '2026-09-03T03:00:00.000Z',
      note: 'borde exacto del día',
    },
  ];

  for (const c of cases) {
    it(`${c.now} (${c.note}) → ${c.expected}`, () => {
      const got = startOfDayAmericaArgentina(new Date(c.now));
      expect(got.toISOString()).toBe(c.expected);
    });
  }
});
