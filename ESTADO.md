# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-15 · detalle en `ADR.md` (014–038)

## Arranque de la próxima sesión
1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **ADR-038 construido y commiteado SOLO EN LOCAL, sin push** (guardas de producción
   fail-closed + seed base/demo + clave demo bloqueada + bundle sin strings demo). Puerta (a)
   verde: 107 tests, `tsc`, `check:bundle`, imagen Docker probada. Faltan `/review` + `/cso`,
   `/qa` y `/ship`.
3. **No pushear hasta que Pablo mande "listo el redeploy" con las 3 confirmaciones**
   (`pendientes-manual.md` A2.1) y verificar desde afuera: `/health` ok y login
   `admin@hidro.local`/`hidro-demo-2025` → 401. Con el fix, producción sin sus claves = crash
   loop. Después del deploy: chunk `AdminApp-*.js` sin strings demo y Pablo hace A2b.
4. Diseño + review: `docs/designs/guardas-produccion-seed.md`; test plan en
   `~/.gstack/projects/PMartinGatica-hidro-self-service/ga77i-main-test-plan-20260915-130500.md`.

## Dónde estamos
Producción (`hidro-api.insolvadev.com`) corre desde hace ~2 días con config incompleta: login
admin demo abierto y credenciales demo impresas en `/admin` (ADR-037). Mitigación inmediata en
manos de Pablo (A1: env vars + Volume Mount + Redeploy); fix de fondo listo en local (ADR-038).
Firmware compila, nunca corrió en hardware. Fase de cadencia: 1 (manual, modo DEMO).

## Riesgos abiertos (en orden de daño)
- 🔴 **Admin demo abierto en producción** hasta que Pablo haga A1 (ADR-037).
- 🔴 **Healthcheck de Coolify debe quedar apagado** mientras la base sea PGlite (TODOS.md).
- ⚡ **ADR-015.** Polaridad del relay: probar en banco sin contactor. `[STOP-HUMANO]`.
- Mesa de entrada sin cuentas `admin_users` individuales ni UI de cambio de clave (TODOS.md).
- Fase 1.5 sin construir: cupo diario cuenta fallas (ADR-024); `TRUST_PROXY=1` con 3 proxies
  (ADR-022, chequeo A3; también afecta el rate limit de login); frecuencia de `PAYMENT_EXPIRED`.
- `refundPayment()` stub — política de reembolso pendiente del dueño.
- `drizzle-kit generate` desincronizado (sin snapshots) — no afecta producción.

## Pendientes humanos
Ver `pendientes-manual.md`. A1 Coolify es lo urgente (y desbloquea subir ADR-038); A4 cierra la
puerta (b) de Fase 1; B = 2 mensajes listos; C/D = terceros y hardware.
