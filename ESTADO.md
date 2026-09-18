# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-18 · detalle en `ADR.md` (014–048)

## Arranque de la próxima sesión

1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **MODO DEMO PRENDIDO Y VERIFICADO EN PRODUCCIÓN** (ADR-048/049, cierra el ADR-047 por la
   opción (a)). Pablo cargó `DEVICE_SIMULATOR=true` en Coolify y el deploy quedó arriba el
   2026-09-18: `hidro-api.insolvadev.com` muestra HIDRO-01 **Disponible** con cartel "MODO DEMO —
   MÁQUINA SIMULADA" y el flujo entero corre (cotizar → pago demo → autorización → pulsador
   simulado → RELAY ON → 180 s → corta solo → máquina libre). **Lo que sigue: escuchar el feedback
   de interfaz del dueño y anotarlo** — para eso se hizo. Para que vea las 3 tarifas hay que
   registrar patentes remis/socio desde `/admin`; sin registrar, todo cotiza externo $8.000.
3. **Fase 1 cerrada del todo** (ADR-044) y A3 cerrado con bug real arreglado (ADR-045). No hay
   pendientes de código de Fase 1.
4. **Compra del hardware armada** (ADR-046): caja metálica → ESP32-**WROOM-32U** con antena
   externa (no toca firmware). B0 mandado a Gaby el 2026-09-18; falta confirmar B1 (técnicos).

## Dónde estamos

Producción (`hidro-api.insolvadev.com`) corre con el fix de seguridad (ADR-039/040), la
reconciliación desde admin (ADR-044) y el rate-limit por IP arreglado (ADR-045). **Nuevo: el
simulador de dispositivo YA puede correr en producción**, pero solo con `DEVICE_SIMULATOR=true`
explícito y solo con pagos DEMO — con Mercado Pago real la API se niega a arrancar (ADR-048).
Firmware compila, nunca corrió en hardware real. Fase de cadencia: 1 (manual).

## Riesgos abiertos (en orden de daño)

- 🔴 **Apagar `DEVICE_SIMULATOR` antes de conectar el ESP32 real (D1)**, o van a convivir una
  máquina fantasma simulada y la real mandando heartbeats sobre HIDRO-01.
- 🔴 **Healthcheck de Coolify debe quedar apagado** mientras la base sea PGlite (TODOS.md).
- ⚡ **ADR-015.** Polaridad del relay: probar en banco sin contactor. `[STOP-HUMANO]`.
- Con el simulador prendido en producción, rotar el secret de un dispositivo desde el admin no
  surte efecto hasta reiniciar la app (ADR-048).
- Mesa de entrada sin cuentas `admin_users` individuales ni UI de cambio de clave (TODOS.md).
- Fase 1.5 sin construir: cupo diario cuenta fallas (ADR-024); frecuencia de `PAYMENT_EXPIRED`.
- HTTP sin redirect a HTTPS en el subdominio (decisión de Pablo, C3 en `pendientes-manual.md`).
- `refundPayment()` stub — política de reembolso pendiente del dueño.

## Pendientes humanos

Ver `pendientes-manual.md`. Parte A cerrada. B0 mandado; falta confirmar B1/B2. **C4 HECHO**
(variable prendida y verificada en producción el 2026-09-18). D = banco (D0) y hardware (D1),
esperando piezas.
