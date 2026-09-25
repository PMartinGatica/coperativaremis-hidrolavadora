import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, applyTheme } from '../src/lib/useTheme.js';

// Bajo jsdom, import.meta.url no es file:, así que se resuelve desde la raíz de apps/web
// (vitest corre con ese cwd, sea por `npm test -w` o desde la carpeta).
const initScript = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8');
const runInit = () => new Function(initScript)();

describe('theme-init.js (antes de React)', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
    document.documentElement.removeAttribute('data-theme');
  });
  afterEach(() => window.localStorage.clear());

  it('sin nada guardado arranca en claro, aunque el sistema esté en oscuro', () => {
    runInit();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#F7F5EE');
  });

  it('respeta el oscuro elegido con el botón', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runInit();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0E1411');
  });

  it('un valor basura guardado cae a claro (no se copia al atributo)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, '"><script>alert(1)</script>');
    runInit();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('applyTheme', () => {
  it('cambia el atributo y el color de la barra del navegador', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0E1411');
    applyTheme('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#F7F5EE');
  });
});
