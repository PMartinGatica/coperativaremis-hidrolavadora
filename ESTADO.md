# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-15 (noche) · detalle en `ADR.md` (014–043)

## Arranque de la próxima sesión
1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **`/qa`+`/retro` cerraron el pipeline (ADR-041), fix ya en producción y verificado.** Sin
   pendientes de código de esa parte.
3. **A4 corrido por Pablo en vivo y con éxito (ADR-042/043) — pero NO cierra la Fase 1 solo.**
   Filas 1-5 de `qa/FASE-1-manual.md` quedaron ☑ (mecanismo central de recuperación de pagos
   funciona). Falta la fila 6, 4 casos borde, y sobre todo **probar la reconciliación desde el
   panel de admin con una cuenta NO-default** — eso es lo que de verdad cierra la puerta (b).
   Nuevo ítem **A4b** en `pendientes-manual.md`. **Arrancar por acá:** guiar a Pablo por A4b si
   quiere seguir, o por A3 si prefiere dejarlo para otro día — no hay apuro, no toca producción.
   Aprendizaje: no declarar una fase cerrada sin releer su guía formal (`FASE-N.md` +
   `qa/FASE-N-manual.md`) — un checklist secundario puede estar desactualizado vs. el gate real.

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
Ver `pendientes-manual.md`. A3 chequea IP real; **A4b cierra la Fase 1** (reconciliación desde
la UI, cuenta NO-default); B = 2 mensajes listos; C/D = terceros y hardware.
