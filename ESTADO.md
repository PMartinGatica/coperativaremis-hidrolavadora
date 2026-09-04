# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones de este Mundo. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-04

## Dónde estamos
**Código y memoria ya viven juntos acá** (ADR-012) con repo propio **privado**
`PMartinGatica/coperativaremis-hidrolavadora`, commits `bc5f744` + `b6560bb` pusheados.
**El firmware compila** (`pio run` → SUCCESS, RAM 14,4%, Flash 72,3%): la puerta (a) del ADR-006
está cerrada por primera vez. **El Build lo hace Claude** (ADR-008).

**El software está tan avanzado como puede estar sin hardware y sin dominio.** Lo que queda
depende de tres cosas de afuera: los técnicos (hardware), el dueño (ADR-007 + reembolsos) y el
dominio real (TLS + webhooks).

## Listo y funcionando
- **Backend:** 58 tests verdes (shared 4 · state-machine 6 · api 48), `tsc` limpio, `npm audit` sin
  HIGH. `processApproval` en transacción, límite diario a prueba de carreras, día de Ushuaia correcto.
- **Firmware:** compila. NTP + epoch ms, guarda dura del relay rollover-safe, resume por epoch,
  parser ISO real (fuzzeado con 20.006 fechas, 0 diferencias).
- **Docker:** `docker build` + `docker run` + `curl /health` → `{"status":"ok","database":"OK"}`.

## A medias / riesgos abiertos
- **El firmware compila pero nunca corrió en hardware.** `[STOP-HUMANO]`.
- **⚠️ `TRUST_PROXY` (ADR-022, abierta).** Hay 3 proxies delante (Cloudflare → cloudflared →
  Traefik) y `TRUST_PROXY=1` puede hacer que `req.ip` sea una IP de Cloudflare: el rate limiter
  metería a todos los clientes en la misma cuota y el primero que la consuma deja afuera al resto.
  **Verificar apenas la app esté desplegada.**
- **⚠️ Polaridad del relay (ADR-015).** `RELAY_ACTIVE_LEVEL HIGH` + un módulo activo-bajo = el motor
  arranca solo en el boot. Probar en banco sin contactor + resistencia de estado seguro en GPIO 26.
- Sin reconciliación de pagos: si MP pierde el webhook, el cliente pagó y no pasa nada.
  `getPayment()` consulta una *preference* y siempre devuelve `PENDING`; `refundPayment()` es un stub.
- Imagen Docker de 525 MB con ~70 MB de deps del front que la API no usa. Optimización, no defecto.

## Hecho el 2026-09-04 (infra + firmware) — ADR-021
- **Hostname definitivo: `hidro-api.insolvadev.com`**, fijado en el firmware (ADR-020). No cambia al
  pasar a producción: se re-apunta el DNS y la placa ni se entera.
- **Túnel:** una línea de ingress más en `/etc/cloudflared/config.yml` (`→ http://localhost:80`, el
  mismo target que sm y studio), con backup. **No se creó un segundo túnel** ni se migró el túnel a
  gestión remota (es irreversible y sirve las cámaras). DNS: CNAME Proxied al túnel.
- **Camino de red probado:** `curl` al dominio devuelve el 404 **de Traefik**, no el del túnel → la
  cadena DNS → Cloudflare → túnel → Traefik está entera. Falta solo la app en Coolify.
- **TLS cerrado (ADR-016):** medido el fallo real (`Verify return code: 20` con solo ISRG) y la
  solución (`0 (ok)` con el bundle GTS Root R4 + ISRG Root X1). Raíces sacadas del almacén local, no
  de internet. `pio run` → SUCCESS, y verificado que las 2 quedan embebidas en el `.bin`.
- **Guía de deploy escrita:** `docs/deploy-coolify.md`, lista para ejecutar en una pasada.

## Próximo paso concreto
1. **[HUMANO] Mandar los 2 mensajes de `mensajes/`** (ya enviados el 2026-09-04): `mensaje-tecnicos.md`
   y `mensaje-dueno.md`. Falta que respondan.
2. **[HUMANO] Crear la app en Coolify** siguiendo `docs/deploy-coolify.md` (repo + Dockerfile + puerto
   3020 + dominio + env). Es lo único que falta para que el backend esté vivo.
3. **[HUMANO] Cuenta de desarrollador de Mercado Pago** + usuarios de prueba (ADR-018).
4. Verificar `TRUST_PROXY` apenas haya app desplegada (ADR-022).
5. Abrir la **Fase 1** con `/office-hours` + `/autoplan`. Alcance candidato: reconciliación de pagos,
   política de reembolso y `CF-Connecting-IP` (las dos primeras dependen de la respuesta del dueño).
6. Puesta en marcha del hardware con Pablo presente, con el timer eléctrico viejo como red.

## Dudas / pendientes
- ADR-007 abierta (la patente no prueba identidad) — bloquea definir las fases.
- **Toda la config del firmware es de compilación** (`HIDRO_API_BASE_URL`, `WIFI_SSID`,
  `WIFI_PASSWORD`, `HIDRO_DEVICE_SECRET`, `TLS_ROOT_CA`); NVS solo guarda el estado de sesión.
  El hostname lo resuelve el ADR-020. **Deuda abierta: si la cooperativa cambia el router o la clave
  de WiFi, hay que abrir la caja IP65.** Arreglo real = aprovisionamiento por NVS (AP + portal
  cautivo o comando por serie); se decide en la Fase 1, no ahora.
- Dominio propio del cliente: si la cooperativa quiere el suyo, mejor decidirlo antes, pero con el
  esquema del ADR-020 ya no obliga a re-flashear.
- Producción real (cuando el cliente esté vivo): base en **Supabase Cloud** por R8 y la API en un
  contenedor siempre encendido. Costo chico y sólo cuando arranca; lo importante es que el movimiento
  sea DNS + variables de entorno, no una reconstrucción.
