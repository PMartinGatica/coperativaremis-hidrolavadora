# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-18 · detalle en `ADR.md` (014–045)

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
5. **Arrancar por acá:** no quedan pendientes bloqueantes de la Fase 1. Preguntarle a Pablo si
   sigue con la **Parte B** (mandar los 2 mensajes ya redactados a técnicos y al dueño) o con
   la Parte C (terceros: cuentas individuales, MP dev, decisión HTTPS).

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
Ver `pendientes-manual.md`. **Fase 1 y A3 cerrados.** Queda B = 2 mensajes listos para mandar;
C/D = terceros y hardware (fuera del alcance de Fase 1).
