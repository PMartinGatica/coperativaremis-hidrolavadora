import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeGet, safeRemove, safeSet } from '../src/lib/storage.js';

describe('storage seguro', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('guarda, lee y borra normalmente', () => {
    safeSet('k', 'v');
    expect(safeGet('k')).toBe('v');
    safeRemove('k');
    expect(safeGet('k')).toBeNull();
  });

  it('si localStorage lanza (Safari privado), no rompe: lee null y escribir no hace nada', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(safeGet('k')).toBeNull();
    expect(() => safeSet('k', 'v')).not.toThrow();
    expect(() => safeRemove('k')).not.toThrow();
  });
});
