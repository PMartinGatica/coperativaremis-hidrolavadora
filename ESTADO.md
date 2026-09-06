# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-05 · HEAD `f67e773` · detalle completo en `ADR.md` (014–032)

## Arranque de la próxima sesión (después de borrar el chat)
1. Entrá a `Madre/mundos/hidro-self-service/`, cargá SOLO este `ESTADO.md` + `CLAUDE.md` del
   Mundo (nunca dos Mundos en la misma sesión). `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack (ya fijado en
   `.claude/settings.json`, verificar si algo resuelve raro).
2. **Trabajo siguiente: Build de la Fase 1.** Ya pasó `/office-hours` + `/autoplan`
   (`## GSTACK REVIEW REPORT` = CLEARED en `docs/designs/reconciliacion-pagos.md`) — arrancás
   directo a implementar las tareas **T1-T8** de ese doc, sin releer la spec entera. Cierra con
   `/review` + `/cso` + `/qa` → `/ship` → `/retro`. No depende de nadie más (premisa 2).

## Dónde estamos
Código y memoria juntos acá, repo propio privado, todo pusheado. Firmware **compila**, Build = Claude.
58 tests verdes · `tsc` limpio · `npm audit` sin HIGH · Docker responde `/health`. Red (ADR-021):
`hidro-api.insolvadev.com` vivo, falta la app en Coolify. TLS (ADR-016) y tarifa por defecto
(ADR-002) confirmados. Camino al motor sólido (ADR-001): pulsador valida máquina, lock atómico.

## Riesgos abiertos (en orden de daño)
- 💸 **ADR-023 → resuelto en diseño (Fase 1, aún no construido).** Carrera contra
  `uq_sessions_active_machine` al recuperar `PAYMENT_EXPIRED`: se guarda por recencia
  (`idx_sessions_machine_created`), no por liveness — ADR-030. Residual TOCTOU angosto en
  `TODOS.md`, no cerrado (tocaría `createSessionWithPayment`, fuera de blast radius).
- ⚡ **ADR-015.** `RELAY_ACTIVE_LEVEL HIGH` contra módulo activo-bajo = motor arranca solo en el
  boot. Probar polaridad en banco, sin contactor. `[STOP-HUMANO]`.
- **Fase 1.5 (medido, sin construir):** cupo diario cuenta fallas del sistema (ADR-024); falta
  que el arranque **falle** con credenciales default en producción (ADR-025/026, guía de deploy
  ya corregida mientras tanto); `TRUST_PROXY=1` con 3 proxies puede agrupar clientes en una
  cuota (ADR-022).
- `refundPayment()` sigue stub — política de reembolso pendiente del dueño (premisa 5, Fase 1).
- Firmware compila pero **nunca corrió en hardware**.

## Pendientes humanos (en paralelo al Build)
- App en Coolify → `docs/deploy-coolify.md`. Único paso para tener el backend vivo.
- Respuestas de `mensajes/`: técnicos (relay + contactor) y dueño (ADR-007 + reembolso + cupo
  diario + cuenta de MP). Aprovisionar cuentas individuales de `admin_users` para mesa de entrada
  antes de producción (ADR-030/031).
- Cuenta de desarrollador de MP + usuarios de prueba (ADR-018).
- Puesta en marcha del hardware con Pablo presente, timer viejo como red.
