import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { machines } from '../src/db/schema.js';
import {
  createTestApp,
  payAndAuthorize,
  waitFor,
  waitSessionStatus,
  type TestCtx,
} from './helpers.js';

let t: TestCtx;

describe('finishedAt reconstruye la hora real de corte (no la hora de reporte)', () => {
  afterEach(async () => {
    await t?.close();
  });

  // Regression: session.finishedAt usaba `new Date()` en el momento en que el
  // dispositivo REPORTA el fin del ciclo. El timer es LOCAL (corta puntual aunque
  // no haya internet, ver simulator-resilience.test.ts), pero si el reporte llega
  // tarde (reconexión demorada) finishedAt quedaba con la hora de reconexión, no la
  // hora real de corte del relay -> duración de sesión inflada en logs/auditoría.
  // Found by /qa on 2026-09-15
  // Report: .gstack/qa-reports/qa-report-hidro-self-service-local-2026-09-15.md
  it('con internet cortado durante el corte, finishedAt queda cerca de startedAt+duración, no de la hora de reconexión', async () => {
    t = await createTestApp({ testSpeedFactor: 1 }); // sin aceleración: duración nominal == tiempo real
    await t.ctx.db.update(machines).set({ durationSeconds: 2 }).where(eq(machines.id, 'HIDRO-01'));

    const { sessionId } = await payAndAuthorize(t);
    await waitSessionStatus(t, sessionId, 'WAITING_FOR_BUTTON', 5000);
    await t.ctx.simulator!.pressButton('HIDRO-01');
    const startedAt = Date.now();

    // Corte de internet ANTES de que el timer local (2s) complete.
    await t.ctx.simulator!.action('HIDRO-01', 'internet_cut');

    // El timer local corta el relay igual, sin conexión.
    await waitFor(async () => {
      const snap = await t.ctx.simulator!.snapshot('HIDRO-01');
      return snap.relayState === false && snap.state === 'IDLE';
    }, { timeoutMs: 4000, label: 'timer local completado sin internet' });

    // Se mantiene desconectado un rato más para simular una reconexión demorada:
    // al reportar, ya pasó bastante más que la duración nominal (2s).
    await new Promise((r) => setTimeout(r, 1500));
    const beforeReconnect = Date.now();

    await t.ctx.simulator!.action('HIDRO-01', 'internet_restore');
    await waitSessionStatus(t, sessionId, 'FINISHED', 8000);

    const res = await t.api.get(`/api/public/sessions/${sessionId}`).expect(200);
    const finishedAt = new Date(res.body.session.finishedAt as string).getTime();

    // La reconstrucción debe caer cerca del corte real (startedAt + 2s),
    // muy por delante de la hora de reconexión (que ya está >1.5s más tarde).
    expect(finishedAt).toBeLessThan(beforeReconnect - 800);
    expect(Math.abs(finishedAt - (startedAt + 2000))).toBeLessThan(800);
  });
});
