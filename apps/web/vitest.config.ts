import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests de lógica del front (hooks, helpers). No hay tests visuales: la pantalla se prueba
// con scripts/browser-e2e.mjs contra el sistema corriendo.
export default defineConfig({
  resolve: {
    alias: {
      '@hidro/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@hidro/state-machine': fileURLToPath(new URL('../../packages/state-machine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
