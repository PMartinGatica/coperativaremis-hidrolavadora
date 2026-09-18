# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-18 · detalle en `ADR.md` (014–046)

## Arranque de la próxima sesión
1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **FASE 1 CERRADA DEL TODO (ADR-044).** A4b corrida con Pablo en el navegador con su propia
   cuenta. Veredicto humano marcado en `qa/FASE-1-manual.md`. **No hay pendientes de código de
   Fase 1.**
3. **A3 también cerrado (ADR-045) — y se encontró/arregló un bug real en el camino:** el rate
   limit por IP agrupaba a TODOS los visitantes reales bajo un solo cupo (confirmado en vivo:
   wifi y datos móviles caían en el mismo balde). Causa: `TRUST_PROXY=1` no alcanza con las 2
   capas intermedias de producción (túnel de Cloudflare + Traefik/Coolify). Arreglado leyendo
   `CF-Connecting-IP` directo (`apps/api/src/http/middleware.ts`, función `clientIp()`) en los 4
   limitadores que dependían de IP. Ya en `main`, deployado, **re-confirmado en producción**
   (wifi vs. datos móviles ahora dan baldes independientes). Build limpio, 113/113 tests OK.
4. **Bug de guía (no de código, ya corregido):** el servidor en modo dev (`npm run dev -w
   @hidro/api` = `node dist/index.js`) NO lee `.env` — no hay `dotenv`. Para simular una cuenta
   admin NO-default hay que exportar `ADMIN_EMAIL` en la terminal, no editar `.env`. Corregido en
   `qa/FASE-1-manual.md` (Preparación, punto 2).
5. **Compra del hardware armada (ADR-046).** Dato nuevo que no estaba en ningún lado: **la caja
   de la máquina es metálica** (hay agua en el taller) — jaula de Faraday, así que el ESP32 pasó
   de WROOM-32 a **WROOM-32U** con antena externa. Mismo chip, mismo `board = esp32dev`, **el
   firmware no se toca**. Además se corrió el reparto del ADR-014: la electrónica la compra
   Pablo (socio en Buenos Aires), a los técnicos les quedan contactor + instalación, y por eso
   ahora son **2** los datos bloqueantes, no 3. Mensajes listos: `mensaje-compras-gaby.md`
   (nuevo) y `mensaje-tecnicos.md` (reescrito).
6. **Arrancar por acá:** preguntarle a Pablo si ya mandó **B0** (lista de compras a Gaby — lo más
   urgente, una placa estaba en última unidad) y **B1/B2**. Cuando lleguen las piezas, el próximo
   trabajo técnico es **D0**: medir la polaridad del relay en el banco y fijar
   `RELAY_ACTIVE_LEVEL` en `app_config.h` (hoy `HIGH`; probablemente tenga que ser `LOW`,
   ADR-015/046). Guiarlo paso a paso como en A4b.

## Dónde estamos
Producción (`hidro-api.insolvadev.com`) corre con el fix de seguridad desplegado y validado
punta a punta (ADR-039/040), reconciliación de pagos validada desde el panel de admin con cuenta
propia (ADR-044), y el rate-limit por IP arreglado y verificado tras el túnel de Cloudflare
(ADR-045). Firmware compila, nunca corrió en hardware. Fase de cadencia: 1 (manual, modo DEMO).

## Riesgos abiertos (en orden de daño)
- 🔴 **Healthcheck de Coolify debe quedar apagado** mientras la base sea PGlite (TODOS.md).
- ⚡ **ADR-015.** Polaridad del relay: probar en banco sin contactor. `[STOP-HUMANO]`.
- Mesa de entrada sin cuentas `admin_users` individuales ni UI de cambio de clave (TODOS.md).
- Fase 1.5 sin construir: cupo diario cuenta fallas (ADR-024); frecuencia de `PAYMENT_EXPIRED`.
- HTTP sin redirect a HTTPS en el subdominio (decisión de Pablo, C3 en `pendientes-manual.md`).
- `refundPayment()` stub — política de reembolso pendiente del dueño.
- `drizzle-kit generate` desincronizado (sin snapshots) — no afecta producción.
- `.env` no se carga en modo dev (sin `dotenv`) — no afecta producción (Coolify inyecta env vars
  reales), pero cualquier guía que diga "editar `.env` y reiniciar" está mal para desarrollo local.

## Pendientes humanos
Ver `pendientes-manual.md`. **Toda la Parte A cerrada.** Queda B = 3 mensajes listos para mandar
(B0 compras a Gaby ← el más urgente, B1 técnicos, B2 dueño); C = terceros; D = banco (D0) y
hardware (D1), ambos esperando que lleguen las piezas.
