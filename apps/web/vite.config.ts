import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

// Sirve dev-only/dev-autologin.html SOLO bajo `vite dev` (configureServer nunca corre en
// `vite build`). A propósito fuera de public/: ese directorio se copia tal cual a dist/, y
// este archivo tiene la password demo hardcodeada — no puede terminar en el build que se
// despliega (ver docs/designs/deploy-web-estatico.md, hallazgo de seguridad de /autoplan).
function devAutologinOnly(): Plugin {
  const filePath = fileURLToPath(new URL('./dev-only/dev-autologin.html', import.meta.url));
  return {
    name: 'dev-autologin-only',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/dev-autologin.html') {
          res.setHeader('content-type', 'text/html');
          res.end(readFileSync(filePath));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devAutologinOnly()],
  resolve: {
    alias: {
      '@hidro/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@hidro/state-machine': fileURLToPath(new URL('../../packages/state-machine/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:3020', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:3020', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
});
