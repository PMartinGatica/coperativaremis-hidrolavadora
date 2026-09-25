# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-25 · detalle en `ADR.md` (014–059)

## Arranque de la próxima sesión

1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **Fase "Identidad visual + app instalable": puertas (a)(c) verdes, (b) casi — falta el deploy.**
   `/review` (2 bugs propios encontrados y arreglados: "Lavar de nuevo" cobraba $8.000 a un socio
   sin PIN; el chip de la máquina mostraba verde con la máquina ocupada/offline) y `/cso` (0
   hallazgos) ya corridos sobre el diff sin commitear. `qa/FASE-identidad-visual-manual.md`
   reescrita copy-paste literal (PowerShell paso a paso) y validada a mano: pasos 1–10b y los 8
   casos borde OK. **Faltan los pasos 11–14 (celular + versión publicada) — recién se pueden hacer
   después del deploy.** Después: `/ship` → correr 11–14 en el celular → `/retro` → storyline en
   `redessociales-hidro-self-service.md`. Sin commit todavía.
3. ⚠️ **Los `.env` locales tienen `PAYMENT_PROVIDER=mercadopago`.** Para probar en local:
   `cd apps/api && PAYMENT_PROVIDER=demo node dist/index.js`. **Para bajar ese proceso: SIEMPRE
   Ctrl+C, nunca "Estop-Process -Force"/Finalizar tarea** — un force-kill corrompió el PGlite
   local esta sesión (`FATAL RuntimeError` de wasm) y hubo que borrar `apps/api/.data/pg/` para
   que se regenere sola (gitignored, sin datos reales — es seguro borrarla).
4. **Pedirle a Pablo el logo en alta resolución** (el actual es 200×200; íconos de 512 blandos).
5. **ADR-059 (nuevo):** el desarrollador dijo la dirección para ADR-056 — VPS Hostinger + Coolify
   + base en Supabase Cloud. **No confirmado con Pablo, reabre la decisión cerrada del Universo**
   ("servidor propio junto a Hermes") — avisar al Universo antes de mover algo real.
6. Pendientes de antes: mesa de entrada / llamada con Javi (C1/C2b), decidir PIN obligatorio en
   TODAS las patentes de socio/remis reales (`TODOS.md`, hallazgo de esta sesión), re-correr
   `/autoplan` con Codex desde el 2026-09-28.

## Dónde estamos

Producción en DEMO, sin plata real. Marca de la cooperativa (marfil `#F7F5EE` + verde `#1E7E48`),
tema oscuro con botón y recordado, app instalable (manifest, sin service worker), patentes de 4 a
10 caracteres, cliente y Dashboard rediseñados según el canvas. **204/204 tests + 10 nuevos de
`apps/web` verdes**, `npm run build` y `check:bundle` verdes. Firmware NO tocado. Cadencia: 1
(manual).

## Riesgos abiertos (en orden de daño)

- 🔴 Patente de socio/remis sin PIN cargado = descuento para cualquiera que sepa la patente
  (arriba, `TODOS.md`) · Alta del webhook en el panel de MP (C2b) · pagos colgados sin niveles de
  permiso (ADR-054/055) · apagar `DEVICE_SIMULATOR` antes del ESP32 (D1).
- ⚡ ADR-015: polaridad del relay en banco sin contactor `[STOP-HUMANO]`. E2E del navegador no
  corre en CI: correrlo a mano antes de deploy (`THEME=dark node scripts/browser-e2e.mjs` también).
