# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-05 · HEAD `9586e9c` · detalle completo en `ADR.md` (014–032)

## Dónde estamos
Código y memoria juntos acá, repo propio privado, todo pusheado. Firmware **compila**, Build = Claude.
**Fase 1 (reconciliación de pagos) pasó `/office-hours` + `/autoplan` completos (2026-09-05):** design
doc APPROVED, CEO+Eng review, `## GSTACK REVIEW REPORT` = CLEARED, tareas concretas T1-T8 listas en
`docs/designs/reconciliacion-pagos.md`. **Siguiente: Build.**

## Verificado ejecutando (no leyendo)
- 58 tests verdes · `tsc` limpio · `npm audit` sin HIGH · Docker responde `/health`.
- **Red (ADR-021):** hostname **`hidro-api.insolvadev.com`** vivo, falta solo la app en Coolify.
- **TLS (ADR-016 cerrado).** **Tarifa por defecto (ADR-002):** confirmada, sin bug.
- **El camino al motor está sólido** (ADR-001): pulsador valida máquina, lock de fila, atómico.

## Riesgos abiertos (en orden de daño)
- 💸 **ADR-023 → resuelto en diseño (Fase 1, aún no construido).** Carrera contra
  `uq_sessions_active_machine` al recuperar `PAYMENT_EXPIRED`: se guarda por recencia
  (`idx_sessions_machine_created`), no por liveness — ADR-030. Residual TOCTOU angosto documentado en
  `TODOS.md`, no cerrado (tocaría `createSessionWithPayment`, fuera de blast radius).
- ⚡ **ADR-015.** `RELAY_ACTIVE_LEVEL HIGH` contra módulo activo-bajo = motor arranca solo en el boot.
  Probar polaridad en banco, sin contactor. `[STOP-HUMANO]`.
- **ADR-024.** Cupo diario cuenta fallas del sistema como si fueran del cliente → **Fase 1.5**.
- 🔴 **ADR-025/026 (antes de desplegar) → Fase 1.5.** `NODE_ENV=production` no opcional (guía ya
  corregida); falta el arreglo real: que el arranque **falle** con credenciales default en producción.
- **ADR-022 → Fase 1.5.** `TRUST_PROXY=1` con 3 proxies puede agrupar clientes en una cuota.
- `refundPayment()` sigue stub — política de reembolso pendiente del dueño (premisa 5, Fase 1).
- Firmware compila pero **nunca corrió en hardware**.

## Próximo paso concreto
1. **Build de la Fase 1** sobre las tareas T1-T8 de `docs/designs/reconciliacion-pagos.md` → luego
   `/review` + `/cso` + `/qa` → `/ship` → `/retro`. No depende de nadie más (premisa 2).
2. **[HUMANO]** App en Coolify → `docs/deploy-coolify.md`. Único paso para tener el backend vivo.
3. **[HUMANO]** Respuestas de `mensajes/`: técnicos (relay + contactor) y dueño (ADR-007 + reembolso
   + cupo diario + cuenta de MP). **Nuevo:** aprovisionar cuentas individuales de `admin_users` para
   mesa de entrada antes de que la Fase 1 llegue a producción (ADR-030/031).
4. **[HUMANO]** Cuenta de desarrollador de MP + usuarios de prueba (ADR-018).
5. Puesta en marcha del hardware con Pablo presente, timer viejo como red.
