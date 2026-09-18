# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-18 · detalle en `ADR.md` (014–048)

## Arranque de la próxima sesión

1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **Lo primero: preguntarle a Pablo si prendió `DEVICE_SIMULATOR=true` en Coolify** (paso C4 de
   `pendientes-manual.md`). El código del MODO DEMO ya está hecho y mergeado (ADR-048, resuelve el
   ADR-047 por la opción (a)): con esa variable prendida, su cliente entra a
   `https://hidro-api.insolvadev.com/`, ve HIDRO-01 **Disponible** con un cartel amarillo "MODO
   DEMO — MÁQUINA SIMULADA", y recorre todo el flujo (patente → tarifa → pago falso → pulsador
   simulado → 180 s) sin ESP32. Es lo único que faltaba para que el dueño pueda pulir la interfaz.
   Si ya lo probó, lo que sigue es escuchar su feedback de interfaz y anotarlo.
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

Ver `pendientes-manual.md`. Parte A cerrada. B0 mandado; falta confirmar B1/B2. **C4 = prender la
variable en Coolify** (lo único que separa al dueño de ver la demo). D = banco (D0) y hardware
(D1), esperando piezas.
