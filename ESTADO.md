# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-23 · detalle en `ADR.md` (014–055)

## Arranque de la próxima sesión

1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. 🔴 **Verificar C3 en producción** (ADR-053): `curl -I http://hidro-api.insolvadev.com/admin`
   tiene que dar **302** a `https://`. Si da 200, `CF-Visitor` no atraviesa el túnel + Traefik y
   el redirect no hace nada **y no avisa** (trampa del ADR-051). Hasta ahí, C3 está desplegado,
   no confirmado.
3. **Próximo build: C1 mesa de entrada**, con `/office-hours` + `/autoplan` propios. Ya no espera
   a Javi (sus nombres solo llenan el formulario). Detrás viene "confirmación por pull".
4. **Con fecha: re-correr `/autoplan` (CEO + Eng) con Codex a partir del 2026-09-28** — el review
   del 2026-09-22 corrió con una sola voz. Está en `TODOS.md`.

## Dónde estamos

Producción en DEMO, sin plata real. Webhook de MP cerrado del lado del código (ADR-052): la API
no arranca sin `MERCADOPAGO_WEBHOOK_SECRET` y `WEBHOOK_MISSING` avisa si un pago se recupera por
otro camino. El 2026-09-23 se cerró **C3** por código y el **QA de C1** destapó dos agujeros de
permisos (abajo). MODO DEMO verificado en producción (ADR-048/049), esperando feedback del dueño;
para que vea las 3 tarifas hay que registrar patentes desde `/admin`.
**158/158 tests verdes** (corrida limpia y sola, 712 s). Firmware compila, nunca corrió en
hardware real. Cadencia: 1 (manual). ⚠️ **La suite se corre SOLA**: en paralelo con otro vitest
aparecen fallos por tiempos que no se reproducen sueltos (2026-09-22, costó una hora).

## Riesgos abiertos (en orden de daño)

- 🔴 **Alta del webhook en el panel de la cuenta nueva** (C2b paso 1). Sin eso ningún pago se
  avisa; la guarda de arranque lo vuelve un deploy que falla, no un cliente esperando.
- 🔴 **Nadie puede destrabar un pago colgado** (ADR-054): la única cuenta que existe es la del
  seed y tiene prohibido reconciliar; no hay pantalla para crear una segunda (C1).
- 🔴 **No hay niveles de permiso** (ADR-055): toda cuenta admin puede marcar patentes como
  `remis` ($500 en vez de $8.000), cambiar tarifas y rotar el secret del ESP32. Resolverlo ANTES
  de crear la primera cuenta de mesa de entrada. Lo anotó Codex el 2026-09-05.
- 🔴 **Apagar `DEVICE_SIMULATOR` antes del ESP32 real (D1)**, o conviven máquina fantasma y real.
- 🔴 **Healthcheck de Coolify apagado** mientras la base sea PGlite (TODOS.md).
- ⚡ **ADR-015.** Polaridad del relay: probar en banco sin contactor. `[STOP-HUMANO]`.
- **Ventana anti-replay de 300 s**: se sospecha que rechaza los reintentos de MP sobre la vía
  firmada. Decisión de Pablo: no tocar hasta verificarlo con un pago de prueba (C2b).
- Un JWT de admin vale 12 h aunque se borre la cuenta (aceptado a esta escala).
- Fase 1.5 sin construir (ADR-024). `refundPayment()` ya NO hace falta: Javi eligió crédito
  automático + caso por caso desde MP. Preferences API a discontinuar por MP (ADR-050).

## Pendientes humanos

Ver `pendientes-manual.md`. Partes A y C2/C3/C4 cerradas. B0 mandado; falta B1/B2. Quedan
**C2b (el día de MP real con Javi)**, C1 (ya es build, no espera), D0 y D1.
