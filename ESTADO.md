# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones de este Mundo. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-04

## Dónde estamos
**El firmware compila por primera vez.** `pio run` → `[SUCCESS]`, RAM 14,4%, Flash 72,3%. Con eso
se cierra la puerta (a) del ADR-006, que llevaba tres rondas abierta. El código sigue viviendo
**fuera de Madre**, en `D:/insolva/Desarrollo/Deepseek-harnes/hidro-self-service/` (ADR-004).

**Cambio de modo (ADR-008, revierte el ADR-005):** el Build pasa de DeepSeek a Claude, por pedido
de Pablo. Las dos rondas de prompts cerraron los defectos de backend y documentación, pero DeepSeek
no podía verificar lo que entregaba (sin Docker ni PlatformIO) y cada ronda terminaba en "revisado
por lectura". Las puertas de gstack siguen igual de obligatorias.

**Ronda 2 de DeepSeek: verificada y correcta.** Signo de la TZ corregido (día 00:00 Ushuaia, con
test propio de ISO literales) · Dockerfile arreglado, y de yapa el `chown` del dataDir que faltaba
para el usuario no-root · parser ISO8601 del firmware **fuzzeado con 20.006 fechas contra
`Date.parse`: 0 diferencias** · docs corregidos.

## Listo y funcionando
- **Firmware: COMPILA** (`npm run build:firmware`). NTP + epoch ms, root CA ISRG Root X1 real
  (verificado con `openssl`), guarda dura del relay rollover-safe, resume por epoch, parser ISO real.
- **Backend:** 58 tests verdes (shared 4 · state-machine 6 · api 48), `tsc` limpio en api y web,
  `npm audit` sin HIGH. `processApproval` en transacción, límite diario a prueba de carreras entre
  máquinas, día de Ushuaia correcto.
- **Docker:** `docker build` + `docker run` + `curl /health` → `{"status":"ok","database":"OK"}`.
- **Repo bajo git** (ADR-010): 123 archivos, sin `node_modules`, sin los 532 MB de cache, sin
  `.env`, sin `dist/`, sin `.pio/`. **Falta el primer commit y el remote — los decide Pablo.**

## A medias
- **El firmware compila pero nunca corrió en hardware.** Compilar no es funcionar: falta la puesta
  en marcha con el ESP32 real, el relay y el contactor. Es `[STOP-HUMANO]`.
- **La imagen Docker pesa 525 MB** con ~70 MB de dependencias del frontend que la API no usa
  (`lucide-react` 42 MB, `react-dom`, `@fontsource`, `@remix-run`): el `npm prune --omit=dev` de la
  raíz las conserva porque son deps de producción de `@hidro/web`. Optimización, no defecto.
- Sin reconciliación de pagos: si Mercado Pago pierde el webhook, el cliente pagó y no pasa nada.
  `getPayment()` del provider consulta una *preference* y siempre devuelve `PENDING`, así que no
  sirve de fallback. `refundPayment()` es un stub que devuelve `{ok:false}`.

## Próximo paso concreto
1. **[HUMANO] Primer commit + remote en GitHub.** El repo está inicializado y limpio; falta tu OK.
2. **[HUMANO] ADR-007: la patente no prueba identidad.** Las 4 opciones están en el README del repo.
   Es lo único que bloquea definir las fases del Mundo. No se implementa nada hasta que el dueño elija.
3. Abrir la Fase 1 con `/office-hours` + `/autoplan` (ahora que el Build es propio, el pipeline
   completo aplica). Candidatos de alcance: reconciliación de pagos y política de reembolso.
4. Puesta en marcha del hardware con Pablo presente, con el timer eléctrico viejo como red.

## Dudas / pendientes
- Dónde se despliega y bajo qué dominio (si va a Hermes rige R1: túnel único). Por R8 la base del
  cliente iría a Supabase **Cloud**; falta confirmarlo.
- PENDING CLIENT DECISION heredadas: reembolso ante máquina offline post-pago o corte de luz ·
  modelo de contactor, voltaje de bobina y `RELAY_ACTIVE_LEVEL` · retiro del timer eléctrico viejo.
