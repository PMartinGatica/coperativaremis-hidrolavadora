# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-04 · HEAD `3a12d7d` · detalle completo en `ADR.md` (014–024)

## Dónde estamos
Código y memoria juntos acá, repo propio privado, todo pusheado. Firmware **compila**, Build = Claude.
**El software está tan avanzado como puede estar** sin hardware, sin la app desplegada y sin las
respuestas del dueño. Lo que falta está convertido en pedidos escritos o en la spec de la Fase 1.

## Verificado ejecutando (no leyendo)
- 58 tests verdes · `tsc` limpio · `npm audit` sin HIGH · Docker responde `/health`.
- **Red (ADR-021):** hostname **`hidro-api.insolvadev.com`** vivo. Ingress agregado al túnel existente
  (`→ localhost:80`, igual que sm/studio) con backup; CNAME Proxied. **Sin segundo túnel (R1 intacta)**
  y sin migrar el de las cámaras (irreversible). El dominio devuelve el 404 **de Traefik** → la cadena
  está entera, falta solo la app en Coolify (`docs/deploy-coolify.md`).
- **TLS (ADR-016 cerrado):** solo ISRG → `return code 20`; bundle **GTS Root R4 + ISRG Root X1** →
  `0 (ok)`. Raíces del almacén local. `pio run` SUCCESS, las 2 verificadas dentro del `.bin`.
- **Tarifa por defecto:** whitelist, todo lo no registrado cae en $8.000. ADR-002 confirmado, sin bug.

## Riesgos abiertos (en orden de daño)
- 💸 **ADR-023.** A los **120 s** el barrido marca `PAYMENT_EXPIRED` sin preguntarle a MP, y ese estado
  es **terminal** (`TRANSITIONS` vacío): registra que no hubo pago y se prohíbe corregirlo. Los 120 s
  corren desde que el cliente carga la patente, no desde el checkout → **se dispara en un pago lento
  normal**. Resoluble: `createPayment` ya setea `external_reference`. → Fase 1.
- ⚡ **ADR-015.** `RELAY_ACTIVE_LEVEL HIGH` contra un módulo activo-bajo = **el motor arranca solo en
  el boot**. Probar polaridad en banco, sin contactor. `[STOP-HUMANO]`.
- **ADR-024.** El límite diario cuenta `SESSION_INTERRUPTED`/`MACHINE_OFFLINE`: el cliente paga con su
  cupo las fallas del sistema, y eso vuelve inservible el crédito ofrecido al dueño (agregado ya
  escrito en `mensajes/`). Verificado que **no** se compone con el ADR-023.
- **ADR-022.** 3 proxies delante; `TRUST_PROXY=1` puede agrupar a todos en una cuota de rate limit.
- `getPayment()` devuelve `PENDING` hardcodeado (trampa cargada); `refundPayment()` es stub.
- El firmware compila pero **nunca corrió en hardware**. Config toda de compilación: si cambia el
  WiFi de la cooperativa, hay que abrir la caja (deuda, se decide en la Fase 1).

## Próximo paso concreto
1. **[HUMANO]** App en Coolify → `docs/deploy-coolify.md`. Único paso para tener el backend vivo.
2. **[HUMANO]** Respuestas de `mensajes/`: técnicos (relay + contactor) y dueño (ADR-007 + reembolso
   + cupo diario + cuenta de MP).
3. **[HUMANO]** Cuenta de desarrollador de MP + usuarios de prueba (ADR-018).
4. **Abrir la Fase 1** con `/office-hours` + `/autoplan` sobre `fases/FASE-1.md`. Único bloque grande
   que no depende de nadie más.
5. Puesta en marcha del hardware con Pablo presente, timer viejo como red.
