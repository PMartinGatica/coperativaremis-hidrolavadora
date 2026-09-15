# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-15 (noche) · detalle en `ADR.md` (014–040)

## Arranque de la próxima sesión
1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **ADR-038 EN PRODUCCIÓN Y A2b CONFIRMADO (ADR-039/040).** Pablo hizo A1, se corrió
   `/cso --diff` (0 findings), se pusheó y Coolify redesplegó solo. Verificado desde afuera:
   `/health` ok, login demo → 401, bundle sin strings demo. A2b: Pablo borró las patentes demo,
   probó una patente nueva con Redeploy de por medio y confirmó que **el volumen persiste en
   producción real** y las demo no vuelven. Riesgo 🔴 de ADR-037 cerrado del todo.
3. **Arrancar por acá:** correr `/qa` y `/retro` para cerrar formalmente la fase (pipeline
   gstack pendiente; el código y el deploy ya están validados en la práctica).
4. **En paralelo, Pablo sigue con `pendientes-manual.md` desde A3** (chequear IP real detrás de
   Cloudflare) — A1, A2 y A2b ya están tachados.
5. Diseño + review: `docs/designs/guardas-produccion-seed.md`; test plan en
   `~/.gstack/projects/PMartinGatica-hidro-self-service/ga77i-main-test-plan-20260915-130500.md`.

## Dónde estamos
Producción (`hidro-api.insolvadev.com`) corre con el fix de seguridad desplegado y validado
punta a punta (ADR-039/040): claves propias, volumen persistente confirmado en real, login demo
bloqueado, bundle limpio, patentes demo eliminadas. Firmware compila, nunca corrió en hardware.
Fase de cadencia: 1 (manual, modo DEMO).

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
Ver `pendientes-manual.md`. A2b es lo próximo (limpiar patentes demo + probar volumen); A3 chequea
IP real detrás de Cloudflare; A4 cierra la puerta (b) de Fase 1; B = 2 mensajes listos; C/D =
terceros y hardware.
