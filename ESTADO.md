# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-04

## Dónde estamos
Código y memoria juntos acá (ADR-012), repo propio **privado**, HEAD `275c9a5` pusheado. El firmware
**compila** y el Build lo hace Claude (ADR-008). **El software está tan avanzado como puede estar sin
hardware, sin app desplegada y sin las respuestas del dueño.**

## Listo y verificado (ejecutando, no leyendo)
- **Backend:** 58 tests verdes (shared 4 · state-machine 6 · api 48), `tsc` limpio, `npm audit` sin HIGH.
- **Docker:** build + run + `curl /health` → `{"status":"ok","database":"OK"}`.
- **Red (ADR-021):** hostname definitivo **`hidro-api.insolvadev.com`**. Ingress agregado al túnel
  existente (`→ localhost:80`, igual que sm/studio) con backup; CNAME Proxied. **Sin segundo túnel
  (R1 intacta)** y sin migrar el túnel de las cámaras (es irreversible). Probado: el dominio devuelve
  el 404 **de Traefik**, no el del túnel → la cadena está entera, falta solo la app en Coolify.
- **TLS (ADR-016 cerrado):** medido el fallo (`return code 20` con solo ISRG) y la solución (`0 (ok)`
  con bundle **GTS Root R4 + ISRG Root X1**, raíces del almacén local). `pio run` SUCCESS, Flash
  72,3%, y las 2 raíces verificadas dentro del `.bin`.
- **Docs:** `docs/deploy-coolify.md` (deploy en una pasada) y `fases/FASE-1.md` (borrador de alcance).

## Riesgos abiertos
- **⚠️ ADR-023 (el que pierde plata).** No es que "no reconcilia": a los **120 s** el barrido marca
  `PAYMENT_EXPIRED` sin preguntarle a MP, y ese estado es **terminal** (verificado: `TRANSITIONS`
  vacío) — un webhook tardío ya no recupera nada. Los 120 s corren desde que el cliente carga la
  patente, no desde que abre el checkout: **se dispara en un pago lento normal**. Resoluble:
  `createPayment` ya setea `external_reference: sessionId`. → Fase 1.
- **⚠️ ADR-015 (el que puede lastimar).** `RELAY_ACTIVE_LEVEL HIGH` contra un módulo activo-bajo hace
  que el motor **arranque solo en el boot**. Probar polaridad en banco, sin contactor.
- **ADR-022:** 3 proxies delante; `TRUST_PROXY=1` puede agrupar a todos los clientes en una cuota de
  rate limit. Verificar con la app desplegada.
- **ADR-024:** el límite diario le cobra al cliente las fallas del sistema (`SESSION_INTERRUPTED`,
  `MACHINE_OFFLINE` cuentan), y `PAYMENT_PENDING` cuenta, así que un cliente que trastabilla se
  bloquea solo hasta 2 min sin haber lavado. **Atado a la respuesta del dueño:** el "crédito
  automático" que se le ofreció es inservible si el lavado fallido ya quemó el cupo. Verificado que
  `PAYMENT_EXPIRED` **no** cuenta, o sea que NO se compone con el ADR-023.
- `getPayment()` devuelve `PENDING` hardcodeado (trampa cargada); `refundPayment()` es stub.
- El firmware compila pero **nunca corrió en hardware**. `[STOP-HUMANO]`.
- Config del firmware toda de compilación (NVS solo guarda sesión): si cambia el WiFi de la
  cooperativa, hay que abrir la caja. Deuda, se decide en la Fase 1.

## Próximo paso concreto
1. **[HUMANO]** Crear la app en Coolify → `docs/deploy-coolify.md`. Es lo único que falta para tener
   el backend vivo.
2. **[HUMANO]** Respuestas de los 2 mensajes de `mensajes/` (enviados el 2026-09-04): técnicos
   (relay + contactor) y dueño (ADR-007 + reembolso + cuenta de MP).
3. **[HUMANO]** Cuenta de desarrollador de MP + usuarios de prueba (ADR-018).
4. **Abrir la Fase 1** con `/office-hours` + `/autoplan` sobre `fases/FASE-1.md`. Es el único bloque
   grande que no depende de nadie más.
5. Puesta en marcha del hardware con Pablo presente, timer viejo como red.
