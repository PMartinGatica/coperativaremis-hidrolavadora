# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-17 · detalle en `ADR.md` (014–044)

## Arranque de la próxima sesión
1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **FASE 1 CERRADA DEL TODO (ADR-044).** A4b corrida con Pablo en el navegador con su propia
   cuenta: los 4 casos UI + el caso terminal (reintentar sobre sesión ya recuperada) salieron OK.
   El único caso no reproducible a mano (pago aprobado justo antes de vencer, vía botón) está
   confirmado por código como límite del proveedor DEMO, cubierto por test automático. Veredicto
   humano marcado en `qa/FASE-1-manual.md`. **No hay pendientes de código de Fase 1.**
3. **Bug encontrado y corregido en la guía (no en el código):** el servidor en modo dev
   (`npm run dev -w @hidro/api` = `node dist/index.js`) NO lee `.env` — no hay `dotenv` en el
   código. Para simular una cuenta admin NO-default hay que exportar `ADMIN_EMAIL` en la terminal
   antes de levantar el server, no editar `.env`. Ya corregido en `qa/FASE-1-manual.md`
   (Preparación, punto 2). Si en algún momento se agrega carga real de `.env` en dev, revisar que
   esa guía siga siendo correcta.
4. **Arrancar por acá:** preguntarle a Pablo si sigue con **A3** (chequeo de IP real detrás de
   Cloudflare, no crítico, se puede dejar) o con la **Parte B** (mandar los 2 mensajes ya
   redactados a técnicos y al dueño). Ninguno de los dos toca producción ni bloquea nada.

## Dónde estamos
Producción (`hidro-api.insolvadev.com`) corre con el fix de seguridad desplegado y validado
punta a punta (ADR-039/040): claves propias, volumen persistente confirmado en real, login demo
bloqueado, bundle limpio, patentes demo eliminadas. `/qa` confirmó el invariante de seguridad #1
contra el dispositivo real y arregló un detalle de timestamp (ADR-041, ya en producción, `/health`
verificado). Firmware compila, nunca corrió en hardware. Fase de cadencia: 1 (manual, modo DEMO).

## Riesgos abiertos (en orden de daño)
- 🔴 **Healthcheck de Coolify debe quedar apagado** mientras la base sea PGlite (TODOS.md).
- ⚡ **ADR-015.** Polaridad del relay: probar en banco sin contactor. `[STOP-HUMANO]`.
- Mesa de entrada sin cuentas `admin_users` individuales ni UI de cambio de clave (TODOS.md).
- Fase 1.5 sin construir: cupo diario cuenta fallas (ADR-024); `TRUST_PROXY=1` con 3 proxies
  (ADR-022, chequeo A3; también afecta el rate limit de login); frecuencia de `PAYMENT_EXPIRED`.
- HTTP sin redirect a HTTPS en el subdominio (decisión de Pablo, C3 en `pendientes-manual.md`).
- `refundPayment()` stub — política de reembolso pendiente del dueño.
- `drizzle-kit generate` desincronizado (sin snapshots) — no afecta producción.
- `.env` no se carga en modo dev (sin `dotenv`) — no afecta producción (Coolify inyecta env vars
  reales), pero cualquier guía que diga "editar `.env` y reiniciar" está mal para desarrollo local.

## Pendientes humanos
Ver `pendientes-manual.md`. **Fase 1 cerrada.** Queda A3 (chequea IP real, no crítico); B = 2
mensajes listos para mandar; C/D = terceros y hardware (fuera del alcance de Fase 1).
