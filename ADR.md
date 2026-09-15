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

- **2026-09-04 — ADR-023 [HALLAZGO, no es una decisión]: el barrido no "no reconcilia": escribe un
  veredicto falso sobre dinero y cierra la puerta.** El ESTADO decía *"si MP pierde el webhook, el
  cliente pagó y no pasa nada"*. Es peor que eso. Cadena verificada:
  a los **120 s** (`DEFAULT_PAYMENT_PENDING_TIMEOUT_SECONDS`, `packages/shared/src/constants.ts:23`)
  `sweepExpired` (`sessionService.ts:333`) transiciona `PAYMENT_PENDING → PAYMENT_EXPIRED` y marca el
  pago `EXPIRED` con motivo `'expired'` — **sin preguntarle nada al proveedor**. Y `PAYMENT_EXPIRED`
  es terminal: **verificado ejecutando** contra el paquete compilado, `TRANSITIONS.PAYMENT_EXPIRED`
  es `[]`, y tanto `PAYMENT_EXPIRED → PAYMENT_APPROVED` como `→ AUTHORIZED` son imposibles. Un
  webhook que llegue tarde **ya no puede recuperar la sesión**.
  **Agravante que cambia la probabilidad:** los 120 s se cuentan desde `sessions.createdAt`, o sea
  desde que el cliente carga la patente, **no** desde que abre el checkout. Escanear el QR, abrir la
  app de MP, loguearse y confirmar, con la señal de una parada de remises, pasa de 2 minutos sin
  esfuerzo. **No es un caso raro de webhook perdido: se dispara en un pago lento normal.**
  **Trampa cargada, aparte:** `getPayment()` de la interfaz (`mercadoPagoProvider.ts:66`) consulta
  una **preference**, no un pago, y devuelve `'PENDING'` **hardcodeado**. Hoy no lo llama nadie, así
  que no hace daño; el daño sería que alguien lo cablee como fallback creyendo que sirve, porque
  **confirmaría** la conclusión falsa. Se arregla o se borra, pero no se deja así.
  **Lo que lo hace resoluble:** `createPayment` ya setea `external_reference: sessionId`, así que se
  puede llegar al pago real sin el webhook. **No se implementa nada todavía**: es alcance de la Fase
  1 y la fase abre con `/office-hours` + `/autoplan`, como manda la regla. Borrador en
  `fases/FASE-1.md`.

- **2026-09-04 — ADR-024 [HALLAZGO + queda ATADO a la respuesta del dueño]: el límite diario le cobra
  al cliente las fallas del sistema.** Verificado ejecutando contra `packages/shared/dist`:
  `WASH_COUNTING_STATUSES` incluye `SESSION_INTERRUPTED`, `MACHINE_OFFLINE`, `DEVICE_ERROR`,
  `EMERGENCY_STOP` y `AUTHORIZATION_EXPIRED`. O sea que si se corta la luz en la mitad del lavado, o
  si la máquina estaba caída, **el cliente igual gasta uno de sus 2 lavados del día**.
  **Buena noticia que hay que dejar escrita para que nadie la re-investigue:** `PAYMENT_EXPIRED` y
  `PAYMENT_FAILED` **NO** cuentan. Se chequeó específicamente si el falso vencimiento del ADR-023 se
  componía con esto — **no se compone**. La hipótesis era razonable y resultó falsa; se verificó en
  vez de afirmarla.
  **Lo que sí es un problema hoy:** `PAYMENT_PENDING` **cuenta**. Como anti-abuso tiene sentido (que
  nadie abra 50 sesiones), pero combinado con los 120 s del ADR-023 significa que un cliente que
  trastabilla — arranca, se le cierra la app por la señal, vuelve a escanear — llega al límite de 2
  **sin haber lavado ni una vez**, y queda bloqueado hasta 2 minutos. Se auto-cura al vencer, pero el
  cliente ve "ya lavaste 2 veces hoy" cuando no lavó ninguna.
  **Por qué queda atado al dueño:** el mensaje que se le mandó ofrece *"crédito automático: la próxima
  vez que escanee, lava gratis"* si se corta la luz. **Ese crédito es inservible si el lavado fallido
  ya le quemó el cupo del día.** Las dos decisiones — reembolso y contabilidad del límite — hay que
  tomarlas juntas o la compensación no se puede usar. Si contesta "crédito automático",
  `SESSION_INTERRUPTED` y `MACHINE_OFFLINE` tienen que salir de `WASH_COUNTING_STATUSES`.
  **No se cambia nada todavía**: entra al alcance de la Fase 1, con la respuesta del dueño como
  entrada.

- **2026-09-05 — ADR-025 [ERROR PROPIO, corregido]: la guía de deploy omitía `NODE_ENV=production` y
  eso apagaba TODAS las guardas de producción.** `docs/deploy-coolify.md`, escrita ayer, listaba las
  variables sin `NODE_ENV` y encima sugería `TEST_SPEED_FACTOR=10` y `DEVICE_SIMULATOR=true`.
  `config.ts:83` calcula `isProd = nodeEnv === 'production'` y de ahí cuelga todo:
  (1) `speed` solo se fuerza a `1` si `isProd` (`config.ts:103`) → con `10`, **el lavado de 180 s dura
  18 s**: el cliente paga $8.000 y recibe 18 segundos de agua;
  (2) `deviceSimulator: !isProd && ...` (`config.ts:127`) → queda un **ESP32 simulado corriendo dentro
  del servidor público**, capaz de consumir autorizaciones en lugar de la máquina real;
  (3) la validación de `JWT_SECRET` (`config.ts:97`) no dispara.
  Corregido en la guía, con la contrapartida escrita: con `NODE_ENV=production` el simulador queda
  apagado y no se puede probar el ciclo completo sin hardware desde ese deploy — que es lo correcto,
  porque está expuesto a internet; para simulador, local.
  **Lección:** una guía de deploy que enumera variables es código con otro nombre. Esta se escribió
  mirando `.env.example` y `conexiones.md` en vez de mirar `config.ts`, que es donde viven las guardas
  reales. La fuente de verdad de una guía de deploy es el archivo que lee el entorno, no la documentación.

- **2026-09-05 — ADR-026 [HALLAZGO]: credenciales de admin por defecto y patentes demo se siembran
  también en producción.** `config.ts:125-126` tiene `ADMIN_EMAIL` default `admin@hidro.local` y
  `ADMIN_PASSWORD` default **`hidro-demo-2025`**, y `seed.ts:182-192` los siembra si no hay usuario.
  **No existe ninguna guarda `isProd`** para esto, a diferencia de `JWT_SECRET`, que sí la tiene. Y
  `seedDemo` (`config.ts:139`) viene en **`true` también en producción**, sembrando `DEMO_VEHICLES`:
  `AE100AA` como **remis ($500)** y `AE200AA` como **socio ($2.000)**.
  **Por qué importa:** quien conozca los defaults entra al admin y puede registrar cualquier patente
  como `remis` — lavados a $500 en vez de $8.000 —, cambiar las tarifas, y rotar el secret del
  dispositivo, que deja el ESP32 sin poder autenticarse hasta re-flashearlo (o sea, un viaje a la
  máquina). Es la vía más barata para vaciar el modelo de negocio, y no requiere tocar el hardware.
  **Mitigación inmediata:** `SEED_DEMO=false` + `ADMIN_PASSWORD` propia, ya en la guía.
  **Arreglo real, alcance de la Fase 1:** que el arranque **falle** en producción si `ADMIN_PASSWORD`
  es el default, igual que ya hace con `JWT_SECRET`; y que `seedDemo` sea `false` por defecto cuando
  `isProd`. Una mitigación que depende de que alguien se acuerde de poner una variable no es una guarda.
  **Nota sobre `JWT_SECRET`:** su guarda compara contra `'dev-only-change-me'`, pero el default real es
  `''` (`config.ts:96`), así que ese `if` **nunca puede dispararse por el default**. No es explotable
  (firmar con secreto vacío tira error en `jsonwebtoken`, o sea que rompe ruidosamente el login del
  admin en vez de aceptar tokens falsos), pero la guarda no protege de lo que cree proteger. Entra al
  mismo arreglo.

- **2026-09-05 — ADR-027 [DECISIÓN, /office-hours Fase 1]: alcance de la Fase 1 se recorta a
  reconciliación de pagos pura; ADR-022/024/025/026 pasan a Fase 1.5.** El borrador original de
  `fases/FASE-1.md` mezclaba el fix de reconciliación con TRUST_PROXY (ADR-022), el conteo del cupo
  diario contra fallas del sistema (ADR-024) y las guardas de arranque en producción (ADR-025/026).
  Segunda opinión de Codex (vía `/office-hours`): son dominios de falla independientes que no
  comparten código con la máquina de estados de pagos, y mezclarlos agranda el diff que pasa por
  `/review` + `/cso` sin necesidad. Confirmado por el usuario. **ADR-025/026 ya NO son "alcance de
  la Fase 1" pese a lo que dice su propio texto — quedan documentados y listos para Fase 1.5, sin
  reabrir el diagnóstico.** Design doc: `docs/designs/reconciliacion-pagos.md`.

- **2026-09-05 — ADR-028 [DECISIÓN, /office-hours Fase 1]: la Fase 1 incorpora aprobación manual de
  mesa de entrada como núcleo, no como extra.** Diagnóstico forzado (Q2 de `/office-hours`): la
  hidrolavadora está dentro de un taller que atiende 24hs, y mesa de entrada puede VER en la base si
  el cliente pagó pero hoy no tiene forma de HABILITAR una sesión trabada (`adminService.ts` solo
  tiene listados y `emergencyStop`, nada que autorice). Mecanismo elegido: mesa de entrada tipea el
  ID real de pago de Mercado Pago (nunca un checkbox ciego); el backend lo valida con
  `getPaymentById`, confirma `external_reference` e importe, y recién ahí llama a `processApproval()`
  — el mismo camino único que usa el webhook. Identidad y auditoría de quién aprueba reusan
  `admin_users` + `insertAudit(actor: email)`, que ya existen (`db/schema.ts:202-208`,
  `adminService.ts:66-74`) — no hace falta construir identidad nueva.

- **2026-09-05 — ADR-029 [DECISIÓN, /office-hours Fase 1]: el fix reusa `processApproval()` como
  punto único de aprobación; no se construye un comando nuevo.** Codex (segunda opinión) propuso un
  `confirmPayment()` canónico para unificar webhook tardío + aprobación manual. Verificado en
  `paymentService.ts:52-60`: esa función ya existe (`processApproval`, "PUNTO ÚNICO de aprobación de
  pagos", idempotente por `UNIQUE` + `FOR UPDATE`) y ya maneja pago tardío sobre sesión terminal
  (`paymentService.ts:271-279`) — pero solo lo registra, no recupera la sesión. Approach elegido:
  extender esa rama con una tabla exhaustiva de recuperabilidad por los 8 `SessionStatus` terminales
  (`state-machine/src/index.ts:26-33`); de los 8, solo `PAYMENT_EXPIRED` es recuperable por esta vía
  — los otros 7 (`PAYMENT_FAILED`, `MACHINE_OFFLINE`, `AUTHORIZATION_EXPIRED`, `SESSION_INTERRUPTED`,
  `EMERGENCY_STOP`, `DEVICE_ERROR`, `FINISHED`) quedan explícitamente excluidos y documentados por
  qué. Design doc revisado 2 rondas por agente adversarial independiente (10/10):
  `docs/designs/reconciliacion-pagos.md`. Próximo paso: `/autoplan`.

- **2026-09-05 — ADR-030 [DECISIÓN, `/autoplan` Fase 1]: la recuperación de
  `PAYMENT_EXPIRED` se guarda por recencia, no por liveness — y sin locking simétrico
  inventado.** El review de ingeniería (subagente Claude + Codex, hallazgo idéntico de
  forma independiente) encontró que mi primera versión del fix tenía una falla real:
  `uq_sessions_active_machine` solo protege si la otra sesión de la misma máquina sigue
  **activa** — si ya llegó a un estado terminal (ej. `FINISHED`), el índice no dispara y
  la recuperación tendría éxito en silencio, dejando una autorización viva para un
  cliente que ya no está. Corrección: (1) caso "otra sesión sigue activa" — el índice
  único ya serializa esto solo (Postgres lo aplica sin locking de la app); solo hace
  falta capturar la violación en vez de dejarla salir como 500 crudo → `'machine_occupied'`.
  (2) caso "otra sesión ya terminó" — chequeo `EXISTS` por recencia
  (`idx_sessions_machine_created`, `createdAt >= A.createdAt`, ya existente, sin índice
  nuevo) → `'machine_used_since'`. Codex corrigió además: `createSessionWithPayment`
  bloquea por **patente** (`pg_advisory_xact_lock`), no por máquina — un locking
  simétrico del lado de la recuperación no serializaba nada, porque el creador nunca
  toma ese lock. La ventana TOCTOU angosta que queda (crear una sesión nueva en el
  instante exacto entre el chequeo y la escritura de la recuperación) se documenta como
  riesgo residual aceptado en `TODOS.md`, no se cierra ahora — cerrarla del todo
  requeriría tocar `createSessionWithPayment`, fuera del blast radius de esta fase. La
  consulta a MP se mueve fuera de cualquier transacción (igual que ya hace
  `webhookRoutes.ts`) — Codex señaló que hacerla dentro de la transacción de recuperación
  era un anti-patrón real.

- **2026-09-05 — ADR-031 [DECISIÓN, `/autoplan` Fase 1]: dos riesgos de seguridad
  resueltos por el usuario en el Final Gate, no auto-decididos por el pipeline.**
  (1) Cuando se rechaza una recuperación porque la máquina ya se usó para otro cliente
  (`machine_used_since`), el cliente original pagó y queda sin lavado — Codex objetó que
  "queda como métrica" no es una resolución para esa plata. **Decisión: se deja solo
  como métrica consultable**, consistente con la premisa 5 (reembolsos son política
  pendiente del dueño, confirmada dos veces en `/office-hours`) — no se inventa política
  de reembolso ni cola de escalamiento nueva. (2) La vía manual de aprobación puede
  activarse horas después del pago, cuando el cliente ya no está — la autorización nueva
  que se abre no tiene chequeo de identidad (el pulsador acepta a cualquiera presente).
  Hallado de forma independiente por el subagente Eng Y por Codex — señal fuerte.
  **Decisión: se acepta el riesgo residual**, mismo criterio de confianza que ya aplica
  hoy a la llave física del mecánico (tampoco verifica identidad) — no se agrega un
  campo de "confirmar presencia" a la Fase 1. Ambas decisiones documentadas como
  aceptación explícita del usuario, no como huecos sin ver.

- **2026-09-05 — ADR-032 [DECISIÓN, `/autoplan` Fase 1]: timeout 120s → 600s (10 min)
  se envía como default de esta fase, no como pregunta abierta para el dueño.** El
  review de CEO encontró que dejar el valor del timeout como "pregunta abierta,
  bloqueado en el dueño" invertía la relación esfuerzo/impacto: es el fix más barato y
  de mayor apalancamiento de toda la fase, y es un parámetro revisable, no una política
  de negocio inventada. El dueño puede ajustarlo después sin que eso bloquee el Build.

- **2026-09-07 — ADR-033: Fase 1 (reconciliación de pagos) construida y cerrada — T1-T8 +
  2 bugs reales encontrados escribiendo los tests, no en el diseño.** Build directo de las
  8 tareas de `docs/designs/reconciliacion-pagos.md` (ya `/office-hours` + `/autoplan`
  CLEARED). Dos hallazgos que el diseño no había cubierto:
  (1) **`isUniqueViolation` nunca detectaba nada, en ningún driver.** drizzle-orm envuelve
  todo error del driver en su propio `DrizzleQueryError` (mensaje "Failed query: ...") y
  mueve el error ORIGINAL (con `.code`/`.constraint` estructurados, tanto en `pg` como en
  PGlite) a `.cause`. El chequeo solo miraba el error atrapado, nunca `.cause` — el
  sub-caso A (`machine_occupied`) de ADR-030 nunca se activaba: la violación del índice
  único salía como 500 crudo en vez de una respuesta controlada. Encontrado al escribir el
  test de sub-caso A (`reconciliation.test.ts`), invisible leyendo el código solo.
  (2) **El chequeo de recencia (sub-caso B) hacía inalcanzable al sub-caso A.**
  `existsNewerSessionForMachine` no filtraba por estado: como CUALQUIER sesión más nueva
  en la máquina calza "creada después", el chequeo de recencia disparaba siempre primero
  para cualquier sesión más nueva — activa o terminal — dejando el catch de la violación
  del índice único sin caso posible de uso, y devolviendo `machine_used_since` (mensaje
  "ya se usó y se liberó") cuando la máquina en realidad está ocupada AHORA. Fix: el
  chequeo de recencia se restringe a `TERMINAL_SESSION_STATUSES` — una sesión más nueva
  que sigue activa la resuelve el índice único (su propósito original), una terminal la
  resuelve la recencia. Motivo por el que ninguno de los dos apareció en `/autoplan`: el
  diseño describió la lógica correctamente en prosa y el diagrama ASCII; el error estaba
  en la implementación de `existsNewerSessionForMachine`, no en el diseño.
  **Tercer hallazgo, no un bug de esta fase:** `paymentPendingTimeoutSeconds` era
  decorativo en el admin desde antes de esta fase — `sweepExpired` nunca lo leía del
  setting dinámico, solo del `.env` estático, a diferencia de sus 3 hermanos
  (`authTtlSeconds`, `dailyWashLimit`, `heartbeatIntervalMs`). Encontrado escribiendo
  `qa/FASE-1-manual.md` (necesitaba una forma de acortar el timeout para probar a mano) y
  arreglado en el mismo cierre por ser barato y estar directamente en el camino crítico
  del mecanismo que esta fase agrega. 91 tests verdes (84 en `@hidro/api` + 7 en
  `@hidro/state-machine`; 48 y 6 respectivamente eran preexistentes — 37 tests nuevos, 0
  regresiones), `/review` + `/cso --code --diff` + `/qa` (sustituido por guía manual,
  fase 100% backend sin UI todavía) limpios. Pendiente explícito: `qa/FASE-1-manual.md`
  necesita el veredicto de Pablo corriéndola a mano — puerta (b) abierta hasta entonces.

- **2026-09-07 — ADR-034: UI de admin panel para reconciliación de pagos, construida y
  verificada en vivo. Pipeline completo: `/office-hours` → `/autoplan` (CEO+Design+Eng,
  Codex no disponible en esta máquina por un bloqueo de sandbox de PowerShell — corrió
  subagente-Claude-solo en las 3 fases) → Build → verificación en navegador real.**
  Diseño: `docs/designs/reconciliacion-pagos-ui.md`. Alcance: card "Reconciliación" en
  `SessionDetailPage.tsx` (visible solo si `status === 'PAYMENT_EXPIRED'`, botón auto +
  form manual) + filtro `PAYMENT_EXPIRED` agregado a `SessionsPage.tsx` (faltaba en el
  dropdown). Cero cambios de comportamiento del backend.
  **Dos hallazgos reales del Eng review, sumados al alcance:** (1) `SessionDetailPage`'s
  `load()` devolvía `null` en cualquier catch, y `usePolling` propaga ese `null` como
  valor nuevo — un solo poll fallido después de cargar bien revertía toda la pantalla al
  skeleton de carga, justo en medio de una reconciliación. Fix: estado `lastGood`,
  `session = polled ?? lastGood`, aviso no bloqueante en vez de skeleton. (2)
  `ReconcileResultType`/`ApprovalResultType` vivían solo en `apps/api`, sin ligazón de
  tipos con el frontend — un typo o una variante renombrada fallaba en silencio en
  runtime, no en build. Movidos a `packages/shared/src/types.ts` (cambio de tipos, cero
  comportamiento), `paymentService.ts` los re-exporta para no tocar sus consumidores.
  **Hallazgo operativo de la verificación en navegador (Edge headless vía CDP, no
  simulado):** `/api/public/payments/:id/simulate` con `action:"approve"` llama a
  `processApproval` con `source:'webhook'`, y la reconciliación (`isReconciliationAttempt`,
  `paymentService.ts:142`) depende solo de `payment.status === 'EXPIRED' &&
  isRecoverableTerminalStatus(session.status)` — nunca del `source`. Consecuencia: **no
  hay forma de reproducir a mano, vía API pública del proveedor DEMO, el escenario "el
  proveedor ya muestra aprobado pero la sesión sigue `PAYMENT_EXPIRED`"** — cualquier
  `/simulate approve` recupera la sesión en el mismo request. `qa/FASE-1-manual.md`
  (Casos 1/3, escritos en la Fase 1 original) asumían lo contrario; corregido en el mismo
  cierre. El camino de éxito real de `reconcileSessionAutomatic`/`Manual` sigue cubierto
  por `apps/api/tests/reconciliation.test.ts` (arma el escenario manipulando la base
  directo, sin pasar por `/simulate`) — la puerta (a) de esa parte ya estaba verde antes
  de este hallazgo, esto solo corrige la documentación de cómo probarlo a mano.
  **Verificado en navegador real (Edge headless, no unit tests):** card visible solo en
  `PAYMENT_EXPIRED` ✓, oculta en sesión ya resuelta ✓, click en "Reintentar automático" →
  request real a `/reconcile/auto` → mensaje `default_admin_forbidden` renderizado en
  ámbar, card persiste ✓, form manual (tipear ID + habilitar botón + submit) → request
  real a `/reconcile/manual` ✓, timeline de la sesión muestra la auditoría
  ("Reconciliación denegada (cuenta compartida)") sin logging nuevo ✓. El camino
  `approved` (mensaje verde, card desaparece) no se pudo disparar por el mismo motivo del
  hallazgo de arriba — queda para que Pablo lo confirme con una cuenta NO-default
  siguiendo `qa/FASE-1-manual.md`. `npm run build` limpio, `tsc --noEmit` limpio en
  `apps/web`, 91 tests preexistentes siguen verdes (84 api + 7 state-machine) tras el
  refactor de tipos. **Dependencia de negocio que este código NO resuelve** (hallazgo de
  la voz CEO de `/autoplan`): mesa de entrada sigue sin cuentas `admin_users`
  individuales — la UI queda construida y correcta pero sin uso real hasta que esas
  cuentas existan (`pendientes-manual.md` §3).

- **2026-09-10 — ADR-035: single-domain deploy — `apps/api` sirve el build estático de
  `apps/web`. Pipeline completo: `/office-hours` (condensado, decisión ya tomada por
  Pablo vía AskUserQuestion) → `/autoplan` (CEO+Eng; Design y DX skippeados con
  justificación — sin componentes/pantallas nuevos y sin superficie de API nueva
  respectivamente; Codex sigue bloqueado en esta máquina, degradado a subagente-Claude) →
  Build → verificación en navegador real contra el build de producción.**
  Origen: Pablo preguntó si `hidro-api.insolvadev.com` ya servía para mostrarle el
  producto a su cliente (la cooperativa). Verificado con `curl`: seguía dando el 404 de
  Traefik documentado desde ADR-021 (la app de Coolify nunca se creó) — y aunque se
  creara, el `Dockerfile` solo empaquetaba `apps/api/dist`, nunca `apps/web/dist`; cero
  puente entre ambos (`express.static` no aparecía en ningún lado del código).
  Diseño: `docs/designs/deploy-web-estatico.md`. Alcance: `apps/api/src/app.ts` monta
  `express.static(apps/web/dist)` + fallback SPA (regex que excluye `/api/*` y `/health`)
  si `apps/web/dist/index.html` existe (resuelto vía `import.meta.url`, no `process.cwd()`
  — misma ruta relativa en dev local y en la imagen Docker); si no existe, se mantiene la
  guía JSON de siempre (dev sin buildear, tests). `Dockerfile` copia `apps/web/dist` al
  stage de runtime.
  **Hallazgo real del Eng review (segunda voz, subagente sin contexto previo, verificado
  por mí leyendo el archivo):** `apps/web/public/dev-autologin.html` (helper de dev que
  auto-loguea con `admin@hidro.local`/`hidro-demo-2025` hardcodeados) quedaba copiado tal
  cual a `dist/` por Vite (todo `public/` se copia sin condición) — con este cambio, esas
  credenciales admin habrían quedado públicas en el mismo link que se le manda al cliente.
  Fix: archivo movido a `apps/web/dev-only/` (fuera de `public/`) + un plugin de Vite
  (`configureServer`, solo corre en `vite dev`, nunca en `vite build`) que lo sigue
  sirviendo en local sin que pueda llegar al build de producción — `scripts/check-render.mjs`
  (que lo usa contra el dev server) no necesitó cambios. Segundo hallazgo menor: el regex
  de fallback tenía una asimetría (`(?!health)` sin límite de palabra, excluía de más
  rutas como `/healthcheck`) — corregido a `(?!health(?:\/|$))`.
  **Verificado en vivo, no solo `tsc`:** build completo limpio, `tsc --noEmit` limpio,
  arranque del build real (`node dist/index.js`, no el dev server de Vite) + navegación
  real Edge headless a `/`, `/machine/HIDRO-01`, `/admin` → las 3 cargan la SPA real sin
  errores de consola (CSP incluido, helmet default no bloquea el build de Vite). `curl` a
  `/dev-autologin.html` contra el build de producción confirma que la credencial YA NO
  está — la ruta cae en el fallback SPA (200, pero es el `index.html`, no el archivo
  filtrado). `/health` y `/api/*` (incluido un 404 real de API) siguen devolviendo JSON
  exactamente igual que antes. Grep confirmó que ningún test existente pega a `GET /`, así
  que el cambio de esa ruta no tiene riesgo de regresión de cobertura.
  **Fuera de alcance, acción de Pablo:** crear la app en Coolify sigue sin acceso propio
  (`pendientes-manual.md` §4) — este trabajo deja el repo listo para que, cuando se haga,
  el mismo link ya muestre el producto completo. `docs/deploy-coolify.md` actualizado con
  esa nota y el chequeo visual post-deploy.

- **2026-09-13 — ADR-036: PIN de 4 dígitos por patente (remis/socio), pedido en vivo por el
  cliente (Gaby, cooperativa). Pipeline completo: `/office-hours` (premisas corregidas en
  el medio — ver abajo) → `/autoplan` condensado (Eng, dual-voice) → Build → 84 tests
  (incluye 3 nuevos específicos de PIN) + verificación en navegador real.**
  Origen: hoy cualquiera que sepa una patente remis/socio ajena se cobra su tarifa
  preferencial sin ninguna verificación. Diseño: `docs/designs/pin-patente-remis-socio.md`.
  **Corrección de alcance real durante /office-hours:** mi primer modelo asumía "1 PIN por
  patente"; el cliente aclaró que el PIN es DE LA PERSONA, que puede tener 2 autos (su
  remis + su particular, que cobra tarifa de socio por serlo, no la de externo) — se
  resuelve con el MISMO PIN cargado en las 2 filas de `vehicles`, sin entidad nueva
  (descartada por desproporcionada a ~2-3 socios reales hoy). También se confirmó que
  "cuántos lavados le quedan hoy" (otro pedido del cliente) **ya estaba construido**
  (`MachinePage.tsx`, `quote.remainingToday`) — cero trabajo ahí.
  **Diseño:** columna `pin` (hash scrypt vía `hashSecret`/`verifySecret` ya existentes,
  reusa el mecanismo de la contraseña admin) en `vehicles`, nullable — grandfather clause:
  sin PIN seteado, sigue funcionando como antes. `categoryAndPriceOf` (único choke point,
  llamado por `quotePlate` y `createSessionWithPayment` dentro de la misma transacción con
  lock advisory) resuelve PIN incorrecto/faltante al MISMO camino que patente no
  registrada — nunca revela que una patente es remis/socio a quien no tiene el PIN.
  **2 hallazgos reales del Eng review (subagente independiente, verificados por mí):** (1)
  `VehicleUpsertSchema.pin` como `.optional()` rechazaba `null` con Zod, rompiendo el
  borrado explícito de PIN que el propio plan pedía — corregido a `.nullable().optional()`
  + tri-estado real en `upsertVehicle` (ausente = no tocar, `null` = borrar, string =
  setear; distinto del `ownerName`, que sí se pisa siempre — perder un PIN en silencio es
  un bug funcional, no cosmético). (2) `/quote` no tenía protección específica contra
  fuerza bruta del PIN — el rate limit global (600/5min por IP) permitía agotar los 10.000
  PINs contra una patente conocida en ~2.3h. Fix: `createPinAttemptRateLimit`
  (`middleware.ts`), mismo `express-rate-limit` ya usado en todo el Mundo, con
  `keyGenerator` sobre la patente normalizada (no la IP) — 10 intentos/5min por patente,
  aplicado a `/quote` y `/sessions`. Side-channel de timing en `verifySecret` (scrypt solo
  corre si hay PIN seteado): real pero de severidad baja para este modelo de amenaza
  (lavadero de barrio), no se normaliza — aceptado explícitamente, no residual olvidado.
  **Verificado en vivo (Edge headless, no solo tests):** patente con PIN + sin pin
  ingresado → $8.000 con el aviso "¿Sos socio o remisero?" ✓; mismo patente + PIN correcto
  → $2.000 (socio) ✓; alta de patente con PIN por el form admin → `hasPin: true`
  confirmado por API real ✓; PIN nuevo funciona de inmediato en la cotización pública ✓.
  87 tests de `apps/api` verdes (84 preexistentes + 3 nuevos: grandfather+verificación,
  mismo PIN en 2 patentes, rate limit por patente sin afectar otras), `tsc` limpio en
  api/web/shared.
  **Nota operativa (no de esta feature, descubierta al tocar `db:generate`):**
  `drizzle-kit generate` recrea TODO el schema desde cero en este repo — las migraciones
  0000/0001 fueron escritas a mano sin generar sus snapshots, así que `meta/_journal.json`
  no tiene una base real para diffear. El runner propio (`db/migrate.ts`) no usa esa
  metadata (lee `.sql` de `drizzle/` directo, trackea aplicadas en `hidro_migrations`), así
  que no rompe nada en producción — pero significa que `db:generate` seguirá generando
  basura hasta que alguien regenere la base de snapshots correctamente. La migración de
  esta feature (`0002_vehicle_pin.sql`) se escribió a mano, seguí esa convención.

- **2026-09-15 — `pendientes-manual.md` reescrito como checklist ejecutable, pedido explícito
  de Pablo ("a prueba de boludos paso a paso").** Sin decisión técnica de fondo, pero deja
  rastro porque corrige dos cosas que si no quedaban escritas se repetían solas: (1) el ítem
  de ADR-007 (identidad de patente) seguía listado como pendiente cuando ya lo resolvió
  ADR-036 (PIN) — se sacó de la lista. (2) `mensajes/mensaje-dueno.md` todavía traía la
  pregunta 1 (la de la patente) ya respondida en vivo — se sacó y se renumeraron las 2
  preguntas que quedan (reembolso, cuenta MP), incluida la referencia cruzada del agregado
  del 2026-09-04 sobre el cupo diario. El checklist nuevo separa qué puede hacer Pablo ya
  (Coolify, verificación de deploy, chequeo de `TRUST_PROXY`, correr la prueba de
  recuperación de pago con los comandos `curl` ya armados) de lo que depende de terceros
  (técnicos, dueño de la cooperativa) — mismo contenido de fondo, cero información nueva.

- **2026-09-15 — ADR-037: la app de Coolify existía y estaba abierta; `SEED_DEMO=false` de la guía
  de deploy era un error.** Pablo avisó que el link no daba 404 (el ADR-021/035 y `ESTADO.md` lo
  daban por no creado). Chequeo externo: `/health` ok (`simulator: DISABLED`, `speedFactor: 1` —
  el `ENV NODE_ENV=production` del `Dockerfile` cubre el ADR-025 aunque Coolify no lo cargue),
  **pero `POST /api/admin/auth/login` con `admin@hidro.local`/`hidro-demo-2025` → 200** y la
  patente demo `AE100AA` cotiza como remis a $500: el agujero del ADR-026, vivo en producción. Las
  env de Coolify tenían solo `CORS_ORIGINS`, `PUBLIC_APP_URL` (vacía → QR de la máquina apunta a
  `localhost:5173`, `adminService.ts:493`) y `PUBLIC_API_URL`; sin volumen persistente (cada
  redeploy borra la base y los secrets de dispositivo). No se forjó ningún token ni se usó la
  sesión admin obtenida: la verificación se limitó a status codes y endpoints públicos.
  **Dos errores de código confirmados leyendo (no arreglados todavía, requieren pipeline):**
  (1) `bootstrap.ts:22` saltea `runSeed` entero con `SEED_DEMO=false`, y `runSeed` crea máquinas,
  dispositivos y admin además de las patentes demo — seguir la guía sobre una base vacía dejaba
  el sistema sin máquina y sin cuenta. (2) `config.ts:96-97,122`: con `JWT_SECRET` ausente, la
  guarda compara `'' === 'dev-only-change-me'` (false, pasa) y después `str('', default)` asigna
  justo ese default — la guarda solo frena a quien tipea el literal. `DEVICE_AUTH_SECRET` ni
  siquiera tiene guarda. **Mitigación inmediata (Pablo, en Coolify):** cargar `ADMIN_*`,
  `JWT_SECRET`, `DEVICE_AUTH_SECRET`, `PUBLIC_APP_URL`, volumen en `/app/.data`, redeploy, y
  neutralizar `AE100AA`/`AE200AA` con un PIN (borrarlas no sirve: el seed las recrea; con volumen,
  el seed no pisa una fila existente). Dominio `http://` en Coolify se confirma correcto con el
  túnel. **Fix de fondo pendiente (Fase 1.5, ADR-025/026):** separar seed base vs. demo y fallar
  el arranque en producción con credenciales/secretos por defecto o ausentes.

- **2026-09-15 — ADR-038: guardas de producción fail-closed + seed base/demo separado. Construido
  con pipeline completo, commiteado solo en local hasta que Pablo haga A1 en Coolify.** Pipeline:
  `/office-hours` (premisas D2, enfoque B D3, diseño D4, 2 rondas de spec review) → `/autoplan`
  (CEO condensado, Eng con subagente independiente, 12 hallazgos, 10 aplicados) → Build.
  Diseño: `docs/designs/guardas-produccion-seed.md`. Hallazgo extra de /office-hours: el bundle
  publicado mostraba `Credenciales DEMO: admin@hidro.local / hidro-demo-2025` en `/admin`
  (`AdminLogin.tsx:57`) y la patente demo en la página de la máquina.
  **Qué cambia:** (1) `assertProductionConfig` sobre la config ya mezclada con overrides: en
  producción no arranca con `JWT_SECRET`/`DEVICE_AUTH_SECRET` ausentes, placeholder o de menos
  de 32 caracteres, ni con `ADMIN_PASSWORD` demo o de menos de 12; un solo error con la lista,
  nunca valores. (2) `NODE_ENV` desconocido tira (un typo apagaba todas las guardas, familia
  ADR-025). (3) `runSeed` corre siempre: máquinas, dispositivos y admin siempre; patentes demo
  solo con `seedDemo`, cuyo default pasa a `!isProd`. (4) La clave del admin sembrado se
  sincroniza desde `ADMIN_PASSWORD` en cada arranque (único camino de rotación: no hay UI).
  (5) `login()` rechaza `hidro-demo-2025` en producción para cualquier cuenta, con auditoría
  `demo_password_blocked`. (6) Warnings de arranque: `SEED_DEMO` activo en producción, device
  secret que no descifra, cuentas admin distintas de `ADMIN_EMAIL`. (7) Web: textos demo solo
  con `import.meta.env.DEV`. (8) `scripts/check-bundle.mjs` corre en el `Dockerfile`: si el build
  contiene strings demo, la imagen no se construye.
  **Decisiones de criterio:** commits locales en `main` sin push (no rama) hasta el rollout
  paso 2, respetando la convención del repo; Healthcheck de Coolify queda apagado mientras la
  base sea PGlite (rolling update = dos procesos sobre el volumen). Diferido a TODOS:
  `onConflictDoNothing` en seed, UI de cambio de clave/baja de cuentas, healthcheck post-Postgres.
  **Puerta (a):** 107 tests de `apps/api` verdes (87 previos + 20 nuevos), `tsc` limpio en api y
  web, `npm run build && npm run check:bundle` verde, check negativo verificado (falla con un
  string demo inyectado y sin `dist`). No toca `firmware/`.
  **`/review` (4 subagentes: testing, seguridad, mantenibilidad+perf+simplificación, adversarial;
  Codex no disponible en Windows):** 28 hallazgos, ninguno regresión del fix. Hallazgo más serio,
  confirmado por 2 fuentes y **preexistente**: con `PAYMENT_PROVIDER=demo` en producción,
  `POST /api/public/payments/:id/simulate` es público, así que el día que un ESP32 se conecte a
  ese deploy cualquiera se aprueba un lavado. Hoy no es explotable (máquina OFFLINE →
  `OUT_OF_SERVICE`, no se crean sesiones). Pablo eligió (D1 de /review) cerrarlo ya: en
  producción con pagos demo `getAuthorizationForDevice` no entrega autorizaciones salvo
  `ALLOW_DEMO_PAYMENTS_ON_DEVICE=true` (nuevo `[STOP-HUMANO]` en `cadencia.md`, para la prueba en
  banco); la web demo sigue igual y el arranque lo avisa. También eligió: al arrancar en
  producción, las cuentas admin cuya clave verifica contra `hidro-demo-2025` reciben una clave
  aleatoria (cubre volumen agregado antes que las variables y rollbacks), sin borrar filas.
  Aplicados además: `JWT_SECRET` distinto de `DEVICE_AUTH_SECRET`, `effectiveAdminPassword()`
  único para guarda y seed, `NodeEnv` derivado de `NODE_ENVS`, `SEED_MACHINES` (no demo),
  `check:bundle` revisa todo archivo no binario (incluye `.map`), 7 tests nuevos (bordes 32/12,
  ramas de producción del seed, device secret que no descifra, pagos demo en dispositivo, stub de
  `PAYMENT_PROVIDER`), docs (no cargar `NODE_ENV` en Coolify, destildar "Available at Buildtime",
  clave sin `$` ni espacios, rotar `JWT_SECRET` tras compromiso, `NODE_ENV=production` en
  `--env-file`, HTTPS por subdominio como decisión de Pablo). Diferido a TODOS: revocación de JWT
  al rotar clave, guarda de `PUBLIC_APP_URL` localhost, device secret roto visible en `/health`.
- **2026-09-15 (ADR-039).** ADR-038 desplegado en producción tras A1 confirmado por Pablo (6
  variables, Volume Mount, Redeploy). `/cso --diff` sobre los 4 commits: 0 findings al gate 8/10.
  Push a `origin/main`; Coolify redesplegó solo en ~2 min (bundle `index-86E0ubWO.js`).
  Verificado desde afuera: `/health` OK, login `admin@hidro.local`/`hidro-demo-2025` → 401, los 6
  archivos JS publicados escaneados sin `hidro-demo-2025`, `admin@hidro.local`,
  `Credenciales DEMO`, `AE100AA` ni `AE200AA`. Riesgo 🔴 de ADR-037 (admin demo abierto) cerrado.
- **2026-09-15 (ADR-040).** A2b confirmado por Pablo: borró `AE100AA`/`AE200AA`, creó una patente
  de prueba con PIN, hizo Redeploy y verificó que persiste y que las demo no vuelven a crearse.
  **El volumen persistente queda validado en producción real** (no solo en el test local con
  Docker). Sigue el pipeline gstack (`/qa`, `/retro`) para cerrar la fase; en paralelo, Pablo
  continúa con A3 (chequear IP real detrás de Cloudflare) y el resto de `pendientes-manual.md`.
- **2026-09-15 (ADR-041).** `/qa` contra `apps/api`+`apps/web` en local (Standard, decisión D1:
  local en vez de producción — no había necesidad de tocar el deploy real para esto). Verificado
  explícitamente el invariante #1 del Mundo contra el estado real del dispositivo simulado
  (`GET /api/demo/device/:id/state`, no gateado por conectividad): con `internet_cut` disparado
  justo después de presionar el pulsador, el relay se apaga y el timer llega a 0 sin depender de
  que el backend se entere — se cumple. Hallazgo real (ISSUE-001, medium): `finishSession()`
  grababa `finishedAt` con la hora en que el backend RECIBE el reporte del dispositivo (que puede
  demorar si estuvo offline), no la hora real de corte del relay — duración de sesión inflada en
  logs/auditoría tras una reconexión demorada. **Fix:** `finishedAt = min(startedAt +
  session.durationSeconds, ahora)`, usando la duración que ya conoce el servidor. 100%
  server-side: no toca el protocolo del dispositivo ni `firmware/`, así que no aplica la puerta
  (a) reforzada del ADR-006 y el fix cubre igual al firmware real sin recompilar. Test de
  regresión (`finish-timestamp.regression-1.test.ts`) confirmado en rojo contra el código viejo
  (`git stash`) y en verde con el fix. Suite completa: 113/113 verdes. Commit local `9f8c6c8`,
  **todavía sin pushear** — pendiente antes de que cuente en el próximo `/retro`. `/retro` (7d)
  corrido: semana de 9 commits, test ratio 11% (↑5pp vs. semana anterior), sin deuda de
  shortcuts, sin PRs (flujo directo a `main`). Storyline actualizado en
  `redessociales-hidro-self-service.md` (capítulo "FASE-1 (continuación)"): botón de mesa de
  entrada (ADR-034), PIN anti-abuso (ADR-036) y puesta en producción real (ADR-037/038/039/040)
  contados como historia de usuario. Falta pushear el commit y que Pablo corra A4
  (`pendientes-manual.md`) para dar la Fase 1 por cerrada del todo.
