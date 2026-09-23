# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-23 · detalle en `ADR.md` (014–055)

## Arranque de la próxima sesión

1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **Webhook de MP cerrado del lado del código (ADR-052)**, pero lo que más importa de esa sesión
   es un pendiente humano: **la cuenta real de la cooperativa se va a estrenar sin el webhook dado
   de alta en su panel**, y sin eso no hay firma secreta y ningún pago se avisa. Está como paso 1
   de `pendientes-manual.md` **C2b**, que agrupa todo lo que necesita "un día de MP real".
3. **Pendiente con fecha: re-correr `/autoplan` (CEO + Eng) con Codex a partir del 2026-09-28.**
   El review del 2026-09-22 corrió con una sola voz (Codex sin cuota). Está en `TODOS.md`.
4. 🔴 **Verificar C3 en producción después del deploy** (ADR-053): `curl -I
   http://hidro-api.insolvadev.com/admin` tiene que dar **302** con `Location` en `https://`.
   Si da 200, el header `CF-Visitor` no está llegando a través del túnel + Traefik y el redirect
   no hace nada en silencio. **Hasta ese chequeo, C3 no está confirmado**, solo desplegado.
5. **Dos candidatos fuertes de construcción, en este orden:**
   (a) **C1 mesa de entrada** — ahora es más urgente: hoy **nadie puede destrabar un pago
   colgado** (ADR-054), y construirlo bien obliga a estrenar niveles de permiso que no existen
   (ADR-055). (b) Confirmación por pull: si el aviso de MP no llega, el cliente puede quedar
   hasta 120 s mirando una pantalla quieta. Las dos son feature nueva: cada una con su
   `/office-hours` + `/autoplan`.
6. **MODO DEMO sigue prendido y verificado en producción** (ADR-048/049). Sigue esperando el
   feedback del dueño. Para que vea las 3 tarifas hay que registrar patentes desde `/admin`.

## Dónde estamos

Producción corre en DEMO y no cobra plata real todavía. El webhook de Mercado Pago quedó
contestando bien las dos vías que MP usa, con la API negándose a arrancar si falta
`MERCADOPAGO_WEBHOOK_SECRET`, y con `WEBHOOK_MISSING` avisando cuando un pago se recupera por un
camino que no es el webhook. El 2026-09-23 se cerró **C3** por código (redirect a https decidido
por `CF-Visitor`, ADR-053) y se corrió el **QA de C1**, que encontró que la reconciliación de
pagos hoy no la puede usar nadie (ADR-054) y que no hay niveles de permiso (ADR-055).
**158/158 tests verdes** (140 + 13 de C3 + 5 de C1, corrida limpia y sola del 2026-09-23, 712 s),
incluida la primera suite HTTP del endpoint de webhook, que no existía.
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
- 🔴 **Nadie puede destrabar un pago colgado** (ADR-054): la única cuenta que existe es la del
  seed y tiene prohibido reconciliar; no hay pantalla para crear una segunda (C1).
- 🔴 **No hay niveles de permiso** (ADR-055): toda cuenta admin puede registrar patentes como
  `remis` ($500 en vez de $8.000), cambiar tarifas y rotar el secret del ESP32. Hay que
  resolverlo ANTES de crear la primera cuenta de mesa de entrada.
- Un JWT de admin sigue valiendo 12 h aunque se borre la cuenta (límite aceptado a esta escala).
- Fase 1.5 sin construir: cupo diario cuenta fallas (ADR-024); frecuencia de `PAYMENT_EXPIRED`.
- Preferences API marcada por MP para "descontinuar" a favor de Orders API (ADR-050).

## Pendientes humanos

Ver `pendientes-manual.md`. Parte A y C2/C3/C4 cerradas (C3 pasó a código, ya no le toca a
Pablo). B0 mandado; falta confirmar B1/B2. Quedan **C2b (el día de MP real, mañana con Javi)**,
C1 (ahora es build, no espera: solo los nombres dependen de Javi), D0 y D1.
