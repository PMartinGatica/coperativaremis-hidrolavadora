# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-10 · HEAD `920a8b1` (+ commits pendientes de esta sesión)
> · detalle completo en `ADR.md` (014–035)

## Arranque de la próxima sesión (después de borrar el chat)
1. Entrá a `Madre/mundos/hidro-self-service/`, cargá SOLO este `ESTADO.md` + `CLAUDE.md` del
   Mundo (nunca dos Mundos en la misma sesión). `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack (ya fijado en
   `.claude/settings.json`, verificar si algo resuelve raro).
2. **Deploy single-domain construido y verificado en vivo (ADR-035).** `apps/api` ahora sirve
   el estático de `apps/web` (pipeline completo `/office-hours` → `/autoplan` → Build →
   verificación Edge headless contra el build real). En el camino, el Eng review encontró y
   arregló una fuga real: `dev-autologin.html` (password demo hardcodeada) se hubiera
   publicado en el link de producción — movido fuera de `apps/web/public/`. 84 tests
   preexistentes siguen verdes, `tsc` limpio, `npm run build` limpio.
3. **Falta un solo paso para que `hidro-api.insolvadev.com` muestre el producto completo:**
   que Pablo cree la app en Coolify (`docs/deploy-coolify.md`, sin acceso propio). Hoy ese
   link sigue en 404 — la app nunca se creó (ADR-021).
4. **Leé `pendientes-manual.md` antes de asumir qué sigue.** La puerta (b) de Fase 1 sigue
   sin el veredicto de Pablo, y ahora además necesita confirmar el camino `approved` de la
   UI de reconciliación con una cuenta NO-default (ADR-034).

## Dónde estamos
Código y memoria juntos acá, repo propio privado, todo pusheado a `main` (sin ramas/PRs — este
repo nunca usó ese flujo). Firmware **compila**, Build = Claude. Reconciliación de pagos (Fase 1,
ADR-033/034) tiene UI real en el admin panel. Un solo dominio (`hidro-api.insolvadev.com`) ya
está listo para servir TODO — API + panel admin + flujo del cliente (ADR-035) — apenas se cree
la app en Coolify.

## Riesgos abiertos (en orden de daño)
- **Mesa de entrada no tiene cuentas `admin_users` individuales todavía.** La UI de
  reconciliación (ADR-034) está construida y correcta, pero con la cuenta compartida por
  defecto TODO intento devuelve `default_admin_forbidden` (ADR-028/029, a propósito) — sin
  uso real hasta que el dueño diga cuántas cuentas y con qué email (`pendientes-manual.md` §3).
- ⚡ **ADR-015.** `RELAY_ACTIVE_LEVEL HIGH` contra módulo activo-bajo = motor arranca solo en el
  boot. Probar polaridad en banco, sin contactor. `[STOP-HUMANO]`.
- **Fase 1.5 (medido, sin construir):** cupo diario cuenta fallas del sistema (ADR-024); falta
  que el arranque **falle** con credenciales default en producción (ADR-025/026, guía de deploy
  ya corregida mientras tanto); `TRUST_PROXY=1` con 3 proxies puede agrupar clientes en una
  cuota (ADR-022); instrumentar frecuencia real de `PAYMENT_EXPIRED` (TODOS.md, 2026-09-07).
- `refundPayment()` sigue stub — política de reembolso pendiente del dueño (premisa 5, Fase 1).
- Firmware compila pero **nunca corrió en hardware**.
- TOCTOU angosto en la recuperación de `PAYMENT_EXPIRED` (ADR-030), residual aceptado en
  `TODOS.md`, no cerrado.

## Pendientes humanos (en paralelo al Build)
Ver `pendientes-manual.md` (filtrado a lo que bloquea seguir construyendo, se reescribe
solo, no acá). Resumen de una línea: crear la app en Coolify (único paso para el link
visual completo), puerta (b) de Fase 1 sin correr, política de reembolso y ADR-007 sin
decidir, credenciales de MP y cuentas de `admin_users` pendientes, puesta en marcha del
hardware fuera de mi alcance.
