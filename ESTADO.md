# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-20 · detalle en `ADR.md` (014–051)

## Arranque de la próxima sesión

1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **Mercado Pago real: los 3 SPIKE validados contra sandbox, en local** (ADR-050/051). El
   webhook **tenía un bug que lo rompía entero** (leía `data.id`, MP manda `resource`): ningún
   pago real habría autorizado la máquina por webhook. Arreglado, con tests, verificado con un
   pago real de sandbox. Guía para repetirlo con la cuenta de la cooperativa: `pendientes-manual.md` C2.
3. **MODO DEMO prendido y verificado en producción** (ADR-048/049). `hidro-api.insolvadev.com`
   muestra HIDRO-01 Disponible con cartel "MODO DEMO". **Sigue: escuchar el feedback del dueño.**
   Para que vea las 3 tarifas hay que registrar patentes remis/socio desde `/admin`.
4. **Fase 1 cerrada del todo** (ADR-044); A3 cerrado con bug real arreglado (ADR-045).
5. **Compra de hardware armada** (ADR-046): ESP32-**WROOM-32U** con antena externa. B0 mandado
   el 2026-09-18; falta confirmar B1 (técnicos).

## Dónde estamos

Producción corre con el fix de seguridad (ADR-039/040), reconciliación desde admin (ADR-044) y
rate-limit por IP arreglado (ADR-045). El simulador puede correr en producción con
`DEVICE_SIMULATOR=true` explícito y solo con pagos DEMO: con MP real la API se niega a arrancar
(ADR-048). Pagos reales probados solo en local contra sandbox — producción sigue en DEMO.
Firmware compila, nunca corrió en hardware real. Cadencia: 1 (manual).

## Riesgos abiertos (en orden de daño)

- 🔴 **Apagar `DEVICE_SIMULATOR` antes de conectar el ESP32 real (D1)**, o conviven una máquina
  fantasma y la real mandando heartbeats sobre HIDRO-01.
- 🔴 **Healthcheck de Coolify apagado** mientras la base sea PGlite (TODOS.md).
- ⚡ **ADR-015.** Polaridad del relay: probar en banco sin contactor. `[STOP-HUMANO]`.
- `refundPayment()` stub — política de reembolso pendiente del dueño (B2).
- La vía IPN legada del webhook sigue devolviendo 401 (ADR-051): inofensivo hoy (MP recibe 200 por
  la vía nueva), pero entenderlo antes de cobrar plata real por si MP da de baja el webhook.
- Con simulador en producción, rotar el secret desde el admin recién surte efecto al reiniciar.
- Mesa de entrada sin cuentas `admin_users` individuales ni UI de cambio de clave (C1).
- Fase 1.5 sin construir: cupo diario cuenta fallas (ADR-024); frecuencia de `PAYMENT_EXPIRED`.
- HTTP sin redirect a HTTPS en el subdominio (decisión de Pablo, C3).
- Preferences API marcada por MP para "descontinuar" a favor de Orders API — sin fecha ni
  decisión tomada (ADR-050); migrar sería cambio de arquitectura, pasa por `/autoplan`.

## Pendientes humanos

Ver `pendientes-manual.md`. Parte A y **C2 cerradas**. B0 mandado; falta confirmar B1/B2.
**C4 HECHO**. Quedan C1 (cuentas mesa de entrada), C3 (HTTPS), D0 (banco) y D1 (hardware),
estos últimos esperando piezas.
