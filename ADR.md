# ADR — MUNDO: HIDRO SELF-SERVICE (append-only, una línea c/u)

> Decisiones de arquitectura propias de este Mundo. NO reabrir sin consultar. Las decisiones del
> Universo van en `docs/decisiones/ADR.md` (raíz), no acá.

- **2026-09-01 — El flujo del cliente es: patente → tarifa → pago → luz verde → pulsador → 180 s.**
  Motivo: aprobado por el dueño en la reunión del 01/09. La patente se pide ANTES de cobrar para
  poder mostrar la tarifa que le corresponde; nunca se cobra sin haber validado todo en el backend.

- **2026-09-01 — Tres tarifas por categoría de patente: $500 remis de la cooperativa / $2.000 auto
  particular del socio / $8.000 particular no asociado.** Motivo: decisión comercial del dueño. La
  categoría sale de una tabla de patentes registradas en el admin; **lo no registrado es externo**
  (el default es la tarifa cara, así un error de carga nunca regala el lavado barato).

- **2026-09-01 — Máximo 2 lavados por día por patente.** Motivo: anti-abuso de la tarifa de remis
  (que un socio no lave su auto particular a $500 todo el día). Configurable desde el admin.

- **2026-09-03 — ADR-001 del Mundo (invariante duro): el pago NUNCA enciende la hidrolavadora.**
  La cadena es pago → webhook → validación en el backend → **autorización temporal** → el ESP32 la
  busca por polling → LED verde → **pulsador físico** → relay → contactor → motor. Motivo: un
  webhook, un reintento de red o un doble click no pueden traducirse en un motor de 10 HP
  arrancando solo. La autorización se consume de forma atómica (`uq_authorizations_payment` +
  transición `WAITING_FOR_BUTTON → RUNNING` en transacción): doble pulsación nunca genera dos ciclos.

- **2026-09-03 — ADR-002: el timer de los 180 s es LOCAL del ESP32, nunca del backend.** Motivo: si
  se cae internet en medio del lavado, el corte tiene que ocurrir igual. Corolario que faltaba y se
  agrega como deuda: hace falta además una **guarda dura independiente** del deadline (aritmética
  `uint32_t`, rollover-safe), porque `millis()` da la vuelta a los ~49,7 días y hoy en ese caso el
  relay no se apaga nunca.

- **2026-09-03 — ADR-003: las garantías de dinero viven en la base, no en el código.** Índices
  únicos `uq_payments_external_id`, `uq_payments_session`, `uq_authorizations_payment`,
  `uq_authorizations_session` y el parcial `uq_sessions_active_machine`. Motivo: un webhook
  duplicado de Mercado Pago o dos clientes simultáneos no pueden depender de que el código haga
  bien un `if`. **No se eliminan ni se relajan sin decisión explícita.**

- **2026-09-03 — ADR-004: el código de este Mundo vive FUERA de `Madre/`,** en
  `D:/insolva/Desarrollo/Deepseek-harnes/hidro-self-service/`. La carpeta del Mundo en Madre es
  **solo la memoria** (CLAUDE/ESTADO/MAPA/ADR/fases/qa/storyline). Motivo: el sistema lo construyó
  DeepSeek en su propio harness antes de que el Mundo entrara al motor, y mover el árbol ahora
  rompería el flujo de trabajo con DeepSeek sin ganar nada. Consecuencia asumida: las búsquedas
  acotadas del protocolo apuntan a ese repo, y `GSTACK_PROJECT_SLUG` hay que exportarlo siempre a
  mano porque el resolvedor de slug de gstack camina al ancestro más externo con `.git`.

- **2026-09-03 — ADR-005: Build = DeepSeek, puertas de calidad = gstack (modo híbrido).** Misma
  excepción acotada que ya está registrada para el Mundo `Chatboot` en el ADR del Universo
  (2026-08-31). La regla innegociable NO se anula: `/office-hours` + `/autoplan` al abrir cada fase
  y `/review` + `/cso` + `/qa` + `/retro` al cerrarla siguen siendo obligatorios, y sin ellos la
  fase no cierra. Lo único que cambia es quién tipea el código. Motivo: es el esquema de dos agentes
  que Pablo ya usa (Claude piensa/diseña/audita, DeepSeek implementa) y este Mundo ya nació así.

- **2026-09-03 — ADR-006: en este Mundo, la puerta (a) exige que el firmware COMPILE.** Los 46 tests
  corren contra `apps/api/src/simulator/simDevice.ts`, una **re-implementación en TypeScript** del
  protocolo del dispositivo; el firmware C++ nunca se compila en CI. Por eso convivían tres bugs que
  impiden que el ESP32 abra un solo request (timestamp de uptime en vez de epoch, root CA truncado,
  URL con esquema duplicado) con la suite entera en verde. Motivo: un simulador que no es el
  artefacto que se despliega no valida nada del artefacto que se despliega. Regla: si el cambio toca
  `firmware/`, la puerta (a) incluye `pio run -d firmware/esp32`, y todo cambio de protocolo se
  aplica **en los dos lados** (simulador y firmware).

- **2026-09-03 — ADR-007 [ABIERTA, decide el dueño]: la patente no prueba identidad.** Es el único
  dato que determina la tarifa y se tipea a mano: cualquiera que vea un remis de la cooperativa
  estacionado copia la patente y lava por $500 en vez de $8.000. El límite de 2/día no lo frena
  (castiga a la patente real, no a quien la usó). Opciones sobre la mesa: PIN de 4 dígitos por
  patente registrada · patente + últimos 4 del DNI del titular · credencial/QR personal del
  remisero · aceptar el riesgo (cooperativa chica, todos se conocen). **No se implementa nada hasta
  que el dueño elija.** Se registra abierta para que ninguna sesión futura lo dé por resuelto.

- **2026-09-04 — ADR-008: el Build pasa a Claude. REVIERTE el ADR-005.** Pedido explícito de Pablo:
  *"trabajalo vos al código en lugar de que le tengamos que mandar prompts"*. El modo híbrido
  (Build = DeepSeek, puertas = gstack) queda **cerrado para este Mundo**; el Mundo `Chatboot`
  mantiene el suyo, que es una decisión aparte. Motivo del cambio: dos rondas de prompts cerraron
  los defectos de backend y documentación, pero el ciclo tenía un costo alto por iteración y un
  techo claro — DeepSeek no podía verificar lo que entregaba (no tenía Docker ni PlatformIO), así
  que cada ronda terminaba con "revisado por lectura" en vez de "verificado". La prueba está en el
  ADR-009: el firmware llegó a la ronda 3 sin compilar ni una sola vez, con dos errores de sintaxis
  de manual y una dependencia sin declarar. **Lo que NO cambia:** las puertas de gstack siguen
  siendo obligatorias (`/office-hours` + `/autoplan` al abrir una fase, `/review` + `/cso` + `/qa`
  + `/retro` al cerrarla) y la puerta (a) reforzada del ADR-006 sigue vigente.

- **2026-09-04 — ADR-009: la puerta (a) del ADR-006 se cerró por primera vez. El firmware COMPILA.**
  `pio run -d firmware/esp32` → `[SUCCESS]`, RAM 14.4% (47.208 / 327.680 B), Flash 72.3%
  (947.157 / 1.310.720 B). Para llegar ahí hubo que arreglar **tres defectos que ningún test, ni
  el chequeo estático, ni tres rondas de revisión por lectura habían detectado**, porque solo un
  compilador los ve:
  (1) **`platformio.ini` no declaraba `lib_deps`** y el código incluye `<ArduinoJson.h>`, que no
  viene con el framework Arduino ni con la plataforma `espressif32`, y no había carpeta `lib/`. El
  firmware era **estructuralmente incompilable**: esta es la causa raíz de que nunca se hubiera
  compilado. Se fijó `bblanchon/ArduinoJson@^7.0.0` (v7 obligatoria: el código usa `JsonDocument`
  sin tamaño y `doc["data"].to<JsonObject>()`, API que no existe en v6).
  (2) **Colisión macro/identificador:** `app_config.h` define `#define BUTTON_DEBOUNCE_MS 50` y
  `peripherals.h` declaraba `static constexpr uint32_t BUTTON_DEBOUNCE_MS = 50;`. El preprocesador
  reemplaza el identificador por el número → `static constexpr uint32_t 50 = 50;`. Se eliminó la
  constante y se dejó un fallback `#ifndef` en el header.
  (3) **Dos ternarios sin tipo común:** `sessionId.length() ? sessionId : nullptr` (String vs
  `nullptr_t`) y el anidado de `current_session_id` (`char[40]` vs `String` vs `nullptr_t`).
  Reescritos como `if/else`. Regla para el futuro: en ArduinoJson, un valor que puede ser null se
  asigna en ramas separadas, nunca con ternario.
  **Lección:** el chequeo estático `scripts/check-firmware.mjs` daba OK en los 11 saneos y en el
  balance de llaves, y aun así el archivo no compilaba. Un chequeo por grep valida lo que ya sabés
  que buscar; el compilador encuentra lo que no sabías. `pio run` es la puerta, no el sustituto.

- **2026-09-04 — ADR-010: el repo de código pasa a estar bajo git.** `git init` en
  `Deepseek-harnes/hidro-self-service`, 123 archivos, sin `node_modules`, sin los 532 MB de
  `.npm-cache-local/`, sin `.env` y sin `dist/`. Se agregó `.pio/` al `.gitignore` (43 MB de build
  del firmware). Cierra la deuda #1 del Mundo: hasta hoy un sistema que cobra plata y enciende un
  motor de 10 HP no tenía historial ni rollback. **Queda pendiente el primer commit y el remote**,
  que decide Pablo. Nota operativa: con `.git` presente, `gstack-slug` ya resuelve dentro del repo,
  pero el override `GSTACK_PROJECT_SLUG=PMartinGatica-hidro-self-service` sigue siendo obligatorio
  hasta que el repo tenga remote (el resolvedor exige `.git` **+ remote**).

- **2026-09-04 — ADR-011: PlatformIO es requisito de desarrollo de este Mundo.** Sin él la puerta
  (a) no se puede cerrar. Se instaló en un venv aislado (no se tocó el Python del sistema); el
  toolchain de Xtensa vive en `~/.platformio` y pesa ~600 MB. Comandos nuevos en `package.json`:
  `npm run build:firmware` (`pio run -d firmware/esp32`, la puerta real) y `npm run check:firmware`
  (el chequeo estático de `scripts/check-firmware.mjs`, que estaba huérfano y ahora es invocable
  como pre-chequeo barato — **no reemplaza a `pio run`**, ver ADR-009).
