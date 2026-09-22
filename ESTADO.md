# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-22 · detalle en `ADR.md` (014–052)

## Arranque de la próxima sesión

1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **Webhook de MP cerrado del lado del código (ADR-052)**, pero lo que más importa de esa sesión
   es un pendiente humano: **la cuenta real de la cooperativa se va a estrenar sin el webhook dado
   de alta en su panel**, y sin eso no hay firma secreta y ningún pago se avisa. Está como paso 1
   de `pendientes-manual.md` **C2b**, que agrupa todo lo que necesita "un día de MP real".
3. **Pendiente con fecha: re-correr `/autoplan` (CEO + Eng) con Codex a partir del 2026-09-28.**
   El review del 2026-09-22 corrió con una sola voz (Codex sin cuota). Está en `TODOS.md`.
4. **El próximo candidato fuerte de construcción** (elegido como segundo en el gate): confirmación
   por pull. Hoy, si el aviso de MP no llega, el cliente puede quedar hasta 120 s frente a la
   máquina mirando una pantalla quieta. `searchByExternalReference` ya existe; falta dispararlo al
   volver del pago. Es feature nueva: pasa por su propio `/autoplan`.
5. **MODO DEMO sigue prendido y verificado en producción** (ADR-048/049). Sigue esperando el
   feedback del dueño. Para que vea las 3 tarifas hay que registrar patentes desde `/admin`.

## Dónde estamos

Producción corre en DEMO y no cobra plata real todavía. El webhook de Mercado Pago quedó
contestando bien las dos vías que MP usa, con la API negándose a arrancar si falta
`MERCADOPAGO_WEBHOOK_SECRET`, y con `WEBHOOK_MISSING` avisando cuando un pago se recupera por un
camino que no es el webhook. **140/140 tests verdes** (123 + 17 nuevos, corrida limpia del
2026-09-22), incluida la primera suite HTTP del endpoint de webhook, que no existía.
Firmware compila, nunca corrió en hardware real.
Cadencia: 1 (manual).
⚠️ **La suite hay que correrla sola**: con otra corrida de vitest en paralelo aparecen fallos por
tiempos que no se reproducen suelto (pasó el 2026-09-22 y costó una hora entenderlo).

## Riesgos abiertos (en orden de daño)

- 🔴 **El alta del webhook en el panel de la cuenta nueva** (C2b paso 1). Sin eso, ningún pago se
  avisa. La guarda de arranque lo transforma en un deploy que falla, no en un cliente esperando.
- 🔴 **Apagar `DEVICE_SIMULATOR` antes de conectar el ESP32 real (D1)**, o conviven una máquina
  fantasma y la real sobre HIDRO-01.
- 🔴 **Healthcheck de Coolify apagado** mientras la base sea PGlite (TODOS.md).
- ⚡ **ADR-015.** Polaridad del relay: probar en banco sin contactor. `[STOP-HUMANO]`.
- **Ventana anti-replay de 300 s** (`mercadoPagoProvider.ts`): el review sospecha que rechaza los
  reintentos de MP sobre la vía firmada y haría perder un pago real. Decisión de Pablo: no tocar
  hasta verificarlo con un pago de prueba (está en C2b).
- `refundPayment()` stub — política de reembolso pendiente del dueño (B2).
- Con simulador en producción, rotar el secret desde el admin recién surte efecto al reiniciar.
- Mesa de entrada sin cuentas `admin_users` individuales ni UI de cambio de clave (C1).
- Fase 1.5 sin construir: cupo diario cuenta fallas (ADR-024); frecuencia de `PAYMENT_EXPIRED`.
- HTTP sin redirect a HTTPS en el subdominio (decisión de Pablo, C3).
- Preferences API marcada por MP para "descontinuar" a favor de Orders API (ADR-050).

## Pendientes humanos

Ver `pendientes-manual.md`. Parte A y C2/C4 cerradas. B0 mandado; falta confirmar B1/B2.
Quedan **C2b (el día de MP real, nuevo y el más importante)**, C1, C3, D0 y D1.
