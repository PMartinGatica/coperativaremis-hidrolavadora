import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePollingState } from '../src/lib/usePolling.js';

describe('usePollingState', () => {
  // Desmontar cada hook: si no, su polling sigue corriendo después de que termina la prueba.
  afterEach(cleanup);

  it('cuando cambia la key consulta con la función nueva y no muestra el valor viejo', async () => {
    const load = (id: string) => vi.fn(async () => `sesion-${id}`);
    const loadA = load('A');
    const loadB = load('B');
    const { result, rerender } = renderHook(({ fn, key }) => usePollingState(fn, 20, true, key), {
      initialProps: { fn: loadA, key: 'A' },
    });
    await waitFor(() => expect(result.current.value).toBe('sesion-A'));

    rerender({ fn: loadB, key: 'B' });
    expect(result.current.value).toBeNull();
    await waitFor(() => expect(result.current.value).toBe('sesion-B'));
    const callsA = loadA.mock.calls.length;
    await new Promise((r) => setTimeout(r, 80));
    expect(loadA.mock.calls.length).toBe(callsA);
  });

  it('un error conserva el último valor y lo informa; el próximo acierto lo limpia', async () => {
    let fail = false;
    const fn = vi.fn(async () => {
      if (fail) throw new Error('sin red');
      return 'RUNNING';
    });
    const { result } = renderHook(() => usePollingState(fn, 20));
    await waitFor(() => expect(result.current.value).toBe('RUNNING'));
    expect(result.current.lastOkAt).not.toBeNull();

    fail = true;
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    // Mientras sigue fallando, el valor queda y la hora del último acierto no avanza.
    const okAt = result.current.lastOkAt;
    const failedCalls = fn.mock.calls.length;
    await waitFor(() => expect(fn.mock.calls.length).toBeGreaterThan(failedCalls + 1));
    expect(result.current.value).toBe('RUNNING');
    expect(result.current.lastOkAt).toBe(okAt);

    fail = false;
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.value).toBe('RUNNING');
  });

  it('apagarlo vacía el valor y deja de consultar', async () => {
    const fn = vi.fn(async () => 'dato');
    const { result, rerender } = renderHook(({ on }) => usePollingState(fn, 20, on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.value).toBe('dato'));

    rerender({ on: false });
    expect(result.current.value).toBeNull();
    const calls = fn.mock.calls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(fn.mock.calls.length).toBe(calls);
  });

  it('sin key usa igual la función más reciente (el panel no necesita cambios)', async () => {
    let n = 0;
    const { result, rerender } = renderHook(({ fn }) => usePollingState(fn, 20), {
      initialProps: { fn: async () => `v1-${n++}` },
    });
    await waitFor(() => expect(String(result.current.value)).toMatch(/^v1-/));
    rerender({ fn: async () => 'v2' });
    await waitFor(() => expect(result.current.value).toBe('v2'));
  });
});
