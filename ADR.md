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

- **2026-09-04 — ADR-012: el código se consolida en `Madre/mundos/hidro-self-service/`. SUPERSEDE
  el ADR-004.** El repo pasó de `Deepseek-harnes/hidro-self-service/` a la carpeta del Mundo, y
  memoria y código conviven acá, igual que en los otros 4 Mundos. Repo propio:
  **https://github.com/PMartinGatica/coperativaremis-hidrolavadora** (privado). Motivo: el ADR-004
  justificaba la separación porque el sistema lo construía DeepSeek en su harness; con el Build ya
  propio (ADR-008) esa razón desapareció, y mantenerla costaba una regla de "dos raíces" en el
  CLAUDE.md y el MAPA que era un footgun permanente (búsquedas acotadas apuntando a otra carpeta).
  Evidencia que cerró la decisión: `Madre/.gitignore` tiene `/mundos/`, y los 4 Mundos anteriores
  ya viven adentro con repo y remote propios — `hidro` era el único afuera. Cero colisiones de
  nombre entre memoria y código. **La regla del slug NO cambia:** tener `.git`+remote propio no
  alcanza, `gstack-slug` camina al ancestro más externo y `Madre/` gana igual (verificado: sin el
  override resuelve a `PMartinGatica-madreinsolva`), así que `GSTACK_PROJECT_SLUG` se sigue
  exportando a mano. Nota de la mudanza: `apps/web/node_modules` y `apps/web/dist` no se movieron
  (los tenía tomados un `esbuild` colgado de una corrida vieja de vitest); se regeneraron con
  `npm install`, que es lo correcto — son artefactos, no fuente.

- **2026-09-04 — ADR-013: primer commit y push.** `bc5f744`, 138 archivos, 21.966 líneas, rama
  `main`. Cierra la deuda #1 del Mundo (ADR-010): a partir de acá hay historial y rollback en un
  sistema que cobra plata y enciende un motor de 10 HP. El repo es **privado**, lo cual importa
  porque adentro viajan `presupuesto-hidrolavadora-completo.html` (la cotización al cliente),
  `contexto.md` (datos del negocio) y el ADR-007 (que documenta un agujero explotable de tarifa).
  **Si alguna vez se hace público, sacar esos tres antes.**

- **2026-09-04 — ADR-014: reparto de trabajo. Pablo hace software y firmware; el hardware y lo
  eléctrico lo hacen los técnicos.** Decisión de Pablo. Consecuencia práctica: la compra del ESP32,
  del módulo relay, del pulsador, de la fuente y de la caja, más el contactor y su instalación, salen
  del alcance de esta sesión y pasan a un **pedido escrito a los técnicos** (`mensajes/mensaje-tecnicos.md`).
  Lo que este Mundo necesita de vuelta de ellos, y sin lo cual la puesta en marcha no arranca, son
  **tres datos**: (1) el nivel activo del módulo relay que compren (define `RELAY_ACTIVE_LEVEL`),
  (2) el voltaje de bobina del contactor, (3) confirmación de que el timer eléctrico viejo queda
  instalado como red durante el primer encendido. El firmware NO se flashea a la placa definitiva
  hasta tener el (1).

- **2026-09-04 — ADR-015: el ESP32 objetivo es ESP32-WROOM-32 con 4 MB de flash** (`board = esp32dev`
  en `platformio.ini`; DevKit V1 / DevKitC / NodeMCU-32S). Motivo medible: el binario ocupa 947.157 de
  1.310.720 B de la partición de aplicación del esquema por defecto (72,3%), así que 4 MB entran con
  ~27% de margen y menos no entra. RAM al 14,4%: **no hace falta PSRAM**. **Quedan excluidos C3, S2,
  S3, C6 y H2**: son otra arquitectura o distinto pinout y `board = esp32dev` no les aplica; cambiar
  de familia es un cambio de firmware, no una compra equivalente.
  **Riesgo de seguridad asociado, encontrado en esta sesión:** `app_config.h` fija
  `RELAY_ACTIVE_LEVEL HIGH` y `Relay::off()` escribe `activeLevel_ ? LOW : HIGH`. La mayoría de los
  módulos relay baratos son **activo-BAJO**. Con esa combinación, `relay.begin()` llama a `off()`,
  escribe LOW, el módulo **cierra** y **el motor arranca solo en el boot**: el fail-safe queda
  invertido, que es exactamente lo contrario del ADR-001. Además el GPIO 26 queda en alta impedancia
  durante los ~100 ms previos a `pinMode()` en `setup()`, así que la línea flota justo en la ventana
  de arranque. **Regla:** (a) probar la polaridad del módulo en el banco, sin contactor conectado,
  ANTES de cablear nada de potencia; (b) fijar `RELAY_ACTIVE_LEVEL` según lo medido, no según lo que
  diga la etiqueta; (c) poner una resistencia de ~10 k desde GPIO 26 al nivel que deja el relay
  ABIERTO (a 3V3 si es activo-bajo, a GND si es activo-alto) para cubrir la ventana de boot.

- **2026-09-04 — ADR-016 [VERIFICADO, bloqueante de la puesta en marcha]: el root CA que lleva el
  firmware NO sirve para un dominio detrás de Cloudflare.** `api_client.h` embebe **ISRG Root X1**
  (Let's Encrypt) y lo pasa a `client_.setCACert(ROOT_CA)`. Medición de hoy sobre el dominio que ya
  usa el Universo:
  `openssl s_client -connect sm.insolvadev.com:443` devuelve la cadena
  `insolvadev.com ← Google Trust Services WE1 ← GTS Root R4 ← GlobalSign Root CA`.
  O sea: **Let's Encrypt no aparece en la cadena** y el ESP32 rechazaría el handshake en todos los
  requests. El síntoma sería "el ESP32 no conecta" sin ningún error entendible.
  **Decisión:** el root CA deja de ser un dato fijo del código y pasa a depender del dominio elegido.
  El firmware ya soporta inyectarlo por `-DTLS_ROOT_CA` en `build_flags` (está documentado en
  `api_client.h:22`), así que el cambio no toca código. **Además se pasa de una raíz a un bundle de
  dos** (ISRG Root X1 + GTS Root R4, PEM concatenados: `setCACert` acepta bundle), para que un cambio
  de CA del proveedor no deje la máquina muerta en la calle. **Antes de flashear la placa definitiva
  hay que correr el `openssl s_client` contra el dominio real y confirmar la raíz.**

- **2026-09-04 — ADR-017: Vercel NO hospeda esta API. El dominio sí es el paso correcto.** Pablo
  propuso levantar un dominio en Vercel. El dominio destraba dos cosas reales (los webhooks de
  Mercado Pago exigen una URL pública HTTPS, y el ESP32 también), así que la mitad de la idea va.
  La otra mitad no: **`apps/api` es un servidor Express de proceso largo**, con PGlite persistiendo a
  un archivo en disco (`DB_FILE`), un runner de migraciones propio y un endpoint que el ESP32 poletea
  cada 2 s. Vercel es serverless con filesystem efímero y sin build por Dockerfile — el `Dockerfile`
  que ya está verificado (`docker build` + `curl /health` OK) no se usaría, la base se perdería en
  cada invocación, y el polling del dispositivo son ~43.000 invocaciones por día por máquina. Sumado:
  el plan Hobby de Vercel es de uso no comercial y esto cobra plata.
  **Decisión: la API va al server (Coolify + Cloudflare Tunnel, R1 del Universo, con el Dockerfile que
  ya existe), bajo un subdominio de `insolvadev.com`**, que ya tiene los nameservers en Cloudflare y
  no cuesta nada. El front puede ir a Vercel o servirse del mismo contenedor; es una decisión menor y
  posterior. **Nota que hay que respetar (memoria del Universo):** los nameservers de `insolvadev.com`
  son `aspen`/`peter.ns.cloudflare.com` y el "arreglar DNS" de Hostinger los rompe y tira abajo
  sm, studio y las cámaras. No se toca el DNS sin necesidad.
  **Pendiente que esto abre:** el dominio del cliente final. Un subdominio de `insolvadev.com` está
  bien para desarrollo y demo; si la cooperativa quiere su propio dominio, se decide antes de flashear
  (cambiar la URL después implica re-flashear el ESP32, ver `HIDRO_API_BASE_URL`).

- **2026-09-04 — ADR-018: Mercado Pago se prueba primero con cuenta de desarrollador propia, y la
  cuenta real de la cooperativa entra recién al final.** Confirmado con Pablo. Secuencia: (1) crear
  la aplicación en el panel de desarrollador y usar las credenciales de **prueba** (`TEST-...`) con
  usuarios de prueba — MP no deja pagar una preferencia propia con la misma cuenta que la creó, hacen
  falta un usuario vendedor y uno comprador de prueba; (2) cerrar el SPIKE del webhook real contra
  esas credenciales; (3) recién ahí pedirle a la cooperativa el `ACCESS_TOKEN` de producción de **su**
  cuenta, porque la plata tiene que caer en la cuenta de ellos, no en la de Pablo. El
  `MERCADOPAGO_WEBHOOK_SECRET` es por aplicación y cambia entre prueba y producción. Pasar
  `PAYMENT_PROVIDER` de `demo` a `mercadopago` sigue siendo `[STOP-HUMANO]`.

- **2026-09-04 — ADR-019: el server de Pablo es DESARROLLO, no producción. ACOTA el ADR-017.** Dato
  que faltaba y que Pablo aclaró: `pablo-server` (Hermes) es una máquina local suya, no un VPS. La
  usa para no pagar VPS ni Vercel mientras desarrolla, igual que el Supabase self-hosted. **Con
  cliente real, va a la nube** — que es exactamente la R8 del Universo, y este Mundo es el caso más
  claro de "lo que ve un cliente": una máquina desatendida en la calle, cobrando plata a cualquier
  hora, sin nadie al lado. La memoria del Universo ya registra que **el server se freezea**; si se
  freezea a las 23:00 con alguien que acaba de pagar $8.000, eso es plata perdida y un cliente
  enojado, no una demo que no carga. **Regla del Mundo: el server local sirve para desarrollo, demo y
  la puesta en marcha del hardware; NUNCA para la máquina en la calle cobrando.**
  El ADR-017 sigue vigente en lo que decía (Vercel no corre esta API, y la API es un contenedor); lo
  que cambia es que "va al server" era la mitad de desarrollo de la frase, no el destino final.

- **2026-09-04 — ADR-020: el hostname del backend se fija HOY y no cambia nunca más; la migración a
  la nube se hace por DNS, no re-flasheando.** Hallazgo que lo motiva: en el firmware **toda la
  configuración es de tiempo de compilación**. `app_config.h` define `HIDRO_API_BASE_URL`,
  `WIFI_SSID`, `WIFI_PASSWORD`, `HIDRO_DEVICE_SECRET` y `TLS_ROOT_CA` como `#define` (inyectables por
  `build_flags`, pero igual fijos en el binario), y **NVS no guarda nada de configuración**: mirando
  `nvs_store.h`, las únicas claves son `valid/sess/auth/dur/deadline/lastTick/runStart`, o sea el
  estado de sesión para el resume tras un reboot. Consecuencia: cambiar el dominio significa
  recompilar y re-flashear, y para eso hay que ir físicamente hasta la máquina, en Ushuaia, a la
  intemperie, y abrir la caja IP65 — **justo en el momento de pasar a producción**, que es el peor
  momento posible.
  **Decisión:** se elige ya un hostname propio y estable (p. ej. `hidro-api.insolvadev.com`) que hoy
  apunta al server local y mañana apunta a la nube. El ESP32 nunca se entera: cambia el registro DNS,
  no el binario.
  **Corolario que vuelve OBLIGATORIO el bundle del ADR-016:** el server local sale por Cloudflare
  (`GTS Root R4`) y casi cualquier hosting cloud sale por Let's Encrypt (`ISRG Root X1`). Con una
  sola raíz pinneada, la migración rompe el TLS y obliga al re-flasheo igual, anulando la ventaja del
  DNS. **Se pinnean las dos raíces**, y así el movimiento server→nube es DNS + variables de entorno,
  sin tocar la placa.
  **Limitación que queda asumida y anotada:** las credenciales de WiFi siguen siendo de compilación.
  Si la cooperativa cambia el router o la clave, hay que abrir la caja. Arreglarlo bien es modo de
  aprovisionamiento por NVS (AP + portal cautivo, o comando por serie); **no se hace ahora**, se
  registra como deuda y se decide en la Fase 1. Lo que NO se posterga es el hostname: eso cuesta cero
  hoy y cuesta un viaje después.

- **2026-09-04 — ADR-021: el hostname definitivo es `hidro-api.insolvadev.com` y el root CA pasa a
  bundle de 2 raíces. CIERRA el ADR-016 y ejecuta el ADR-020.** Infraestructura montada y verificada
  de punta a punta:
  **Red.** El túnel `frigate-nvr` (ID `18730cc4-…`) resultó ser **localmente configurado**, no
  administrable desde el dashboard de Zero Trust — Cloudflare ofrece migrarlo pero la migración es
  **irreversible**, así que NO se tocó. Sus rutas viven en `/etc/cloudflared/config.yml` del server, y
  ahí ya estaban `sm`, `studio`, `hermes`, `panel`, `supabase` y las cámaras. Se agregó una línea de
  ingress más — `hidro-api.insolvadev.com → http://localhost:80`, el mismo target que usan sm y studio
  (Traefik de Coolify, que rutea por Host header) — con backup previo del archivo, y se reinició el
  servicio. Del lado de Cloudflare, un CNAME `hidro-api → 18730cc4-….cfargotunnel.com`, Proxied.
  **Verificado ejecutando**, no leyendo: `curl https://hidro-api.insolvadev.com/health` devuelve
  `404 page not found` con `x-content-type-options: nosniff`, que es el 404 de **Traefik** (Go
  `http.NotFound`), no el `http_status:404` del túnel. O sea que la cadena DNS → Cloudflare → túnel →
  Traefik funciona entera; lo único que falta es la app en Coolify. **No se creó un segundo túnel**
  (R1 del Universo intacta).
  **TLS.** Se midió el fallo real antes de arreglarlo, contra el dominio ya levantado:
  con solo ISRG Root X1 (lo que el firmware tenía) → `Verify return code: 20 (unable to get local
  issuer certificate)`; con el bundle GTS Root R4 + ISRG Root X1 → `Verify return code: 0 (ok)`.
  Las dos raíces se extrajeron del almacén de confianza local (150 CAs), **no se copiaron de
  internet**: GTS Root R4 SHA256 `34:9D:FA:40:…:1B:3C:7D` (vence 2036), ISRG Root X1
  `96:BC:EC:06:…:08:C6` (vence 2035) — este último idéntico al que ya tenía el firmware, así que no
  se reemplazó nada, se sumó. Compilado y verificado que **las dos quedan embebidas en el `.bin`**.
  `pio run` → `[SUCCESS]`, RAM 14,4%, Flash 72,3% (947.925 B, +768 B por el segundo certificado).
  Trampa encontrada al escribir el comentario: un `\n` literal dentro de un comentario de C rompe la
  compilación si el archivo se genera con un script que lo interpreta como salto de línea real.

- **2026-09-04 — ADR-022 [ABIERTA, verificar después del primer deploy]: `TRUST_PROXY=1` es
  probablemente insuficiente y puede tirar abajo el rate limiting.** `config.ts:138` lee
  `TRUST_PROXY` y `app.ts:27` hace `app.set('trust proxy', N)`. Con N numérico, Express confía en N
  saltos contados desde adelante. Pero acá la cadena tiene **tres** proxies: borde de Cloudflare →
  `cloudflared` → Traefik → app. Con `TRUST_PROXY=1`, `req.ip` puede terminar siendo una IP de
  Cloudflare en vez de la del cliente real, y entonces `express-rate-limit` agrupa a **todos** los
  clientes bajo la misma IP: el primero que consuma la cuota deja afuera a los demás. En una máquina
  de la calle eso es que la gente no pueda pagar. **No se cambia a ciegas** — el número correcto
  depende de cuántas entradas de `X-Forwarded-For` llegan realmente. **Verificación obligatoria
  apenas la app esté desplegada:** pegarle desde afuera y comparar la IP que registra el backend con
  la IP pública real; si no coinciden, subir `TRUST_PROXY` hasta que coincidan. Alternativa más
  robusta que hay que evaluar en la Fase 1: leer `CF-Connecting-IP`, que Cloudflare siempre
  sobreescribe y el cliente no puede falsificar. Queda como entrada de alcance de la Fase 1.
