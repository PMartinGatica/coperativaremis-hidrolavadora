# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-07 · HEAD `45388dd` · detalle completo en `ADR.md` (014–033)

## Arranque de la próxima sesión (después de borrar el chat)
1. Entrá a `Madre/mundos/hidro-self-service/`, cargá SOLO este `ESTADO.md` + `CLAUDE.md` del
   Mundo (nunca dos Mundos en la misma sesión). `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack (ya fijado en
   `.claude/settings.json`, verificar si algo resuelve raro).
2. **Fase 1 (reconciliación de pagos) construida y pusheada a `main` (ADR-033).** T1-T8
   completas, `/review` + `/cso --code --diff` + `/qa` limpios, 91 tests verdes. Falta
   `/retro` para cerrar formalmente el sprint — arrancá por ahí si no hay otra prioridad.
3. **Puerta (b) todavía abierta:** `qa/FASE-1-manual.md` está escrito pero **nadie lo corrió
   a mano todavía** — necesita el veredicto de Pablo (o el dueño) antes de dar la fase por
   cerrada en los hechos, no solo en el código.

## Dónde estamos
Código y memoria juntos acá, repo propio privado, todo pusheado (`main`, sin ramas/PRs — este
repo nunca usó ese flujo). Firmware **compila**, Build = Claude. 91 tests verdes (`@hidro/api` +
`@hidro/state-machine`) · `tsc` limpio en las 4 workspaces. Red (ADR-021): `hidro-api.insolvadev.com`
vivo, falta la app en Coolify. Reconciliación de pagos (Fase 1) resuelve el agujero de ADR-023:
un webhook perdido o un pago lento ya no pierde plata en silencio — se recupera solo (barrido) o
mesa de entrada lo reconcilia a mano (dos rutas admin nuevas, sin UI todavía, ver abajo).

## Riesgos abiertos (en orden de daño)
- **Fase 1 sin UI de admin panel.** Las dos rutas nuevas (`/admin/sessions/:id/reconcile/auto`
  y `/manual`) solo se usan por `curl` (`qa/FASE-1-manual.md`) — mesa de entrada no tiene botón
  todavía. Backlog, no bloqueante para que el backend esté correcto.
- ⚡ **ADR-015.** `RELAY_ACTIVE_LEVEL HIGH` contra módulo activo-bajo = motor arranca solo en el
  boot. Probar polaridad en banco, sin contactor. `[STOP-HUMANO]`.
- **Fase 1.5 (medido, sin construir):** cupo diario cuenta fallas del sistema (ADR-024); falta
  que el arranque **falle** con credenciales default en producción (ADR-025/026, guía de deploy
  ya corregida mientras tanto); `TRUST_PROXY=1` con 3 proxies puede agrupar clientes en una
  cuota (ADR-022).
- `refundPayment()` sigue stub — política de reembolso pendiente del dueño (premisa 5, Fase 1).
- Firmware compila pero **nunca corrió en hardware**.
- TOCTOU angosto en la recuperación de `PAYMENT_EXPIRED` (ADR-030), residual aceptado en
  `TODOS.md`, no cerrado.

## Pendientes humanos (en paralelo al Build)
- **Correr `qa/FASE-1-manual.md` y marcar el veredicto** (puerta b, ver arriba).
- App en Coolify → `docs/deploy-coolify.md`. Único paso para tener el backend vivo.
- Respuestas de `mensajes/`: técnicos (relay + contactor) y dueño (ADR-007 + reembolso + cupo
  diario + cuenta de MP). Aprovisionar cuentas individuales de `admin_users` para mesa de entrada
  antes de producción (ADR-030/031) — hoy no hay ninguna ruta para crear una segunda cuenta.
- Cuenta de desarrollador de MP + usuarios de prueba (ADR-018).
- Puesta en marcha del hardware con Pablo presente, timer viejo como red.
