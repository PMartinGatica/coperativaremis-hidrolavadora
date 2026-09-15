# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-15 (noche) · detalle en `ADR.md` (014–041)

## Arranque de la próxima sesión
1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **`/qa` + `/retro` corridos (ADR-041).** `/qa` local confirmó el invariante #1 (timer local
   sobrevive sin internet) contra el dispositivo real, y arregló ISSUE-001 (medium: `finishedAt`
   usaba la hora de reconexión, no la de corte real), con test de regresión, 113/113 verdes.
   `/retro` (7d): 9 commits, test ratio 11% (↑5pp), sin deuda de shortcuts. Storyline actualizado.
3. **Ya pusheado y redesplegado.** El fix de ISSUE-001 (`9f8c6c8`) está en `main` y Coolify
   redesplegó solo; verificado desde afuera: `/health` → 200 OK, `uptimeSeconds` bajo (proceso
   nuevo), sin cambios en `payments`/`devices`/`speedFactor`. **Arrancar por acá:** nada de código
   pendiente — seguir con el punto 4.
4. **Pablo sigue con `pendientes-manual.md` desde A3** (chequear IP real detrás de Cloudflare) —
   A1, A2 y A2b ya están tachados. **A4 es lo único que falta para dar la Fase 1 por cerrada del
   todo** (prueba de "pago que se recupera solo", en la compu de Pablo).

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

## Pendientes humanos
Ver `pendientes-manual.md`. A3 chequea IP real detrás de Cloudflare; **A4 cierra la Fase 1**
(prueba de recuperación de pago, local); B = 2 mensajes listos; C/D = terceros y hardware.
