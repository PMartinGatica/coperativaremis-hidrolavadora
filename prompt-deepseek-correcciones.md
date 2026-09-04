# PROMPT PARA DEEPSEEK — correcciones hidro-self-service

> Copiar TODO lo que sigue (desde "CONTEXTO") y pegarlo como prompt. Es autocontenido:
> no hace falta que DeepSeek conozca otros repos ni que tenga acceso a infra real.

---

## CONTEXTO

Trabajás sobre el repo `hidro-self-service`: monorepo npm workspaces con `apps/api`
(Express + TypeScript + drizzle-orm + PGlite/Postgres), `apps/web` (React + Vite),
`packages/shared`, `packages/state-machine` y `firmware/esp32` (PlatformIO, C++).

Es el sistema de pago QR de una hidrolavadora autoservicio de una cooperativa de remises
en Ushuaia: el cliente escanea un QR, carga su patente, ve su tarifa ($500 remis /
$2.000 socio / $8.000 particular), paga por Mercado Pago, se le habilita la máquina y
aprieta un pulsador físico que enciende un relay durante 180 segundos.

El estado actual: `npm test` da 46/46 verde y `tsc --noEmit` está limpio en api y web.
**Los tests NO cubren el firmware**: lo que se testea es el simulador TypeScript
(`apps/api/src/simulator/simDevice.ts`), que es otra implementación del mismo protocolo.
Por eso el firmware C++ tiene bugs que ningún test detecta.

Vas a corregir una lista de defectos concretos. **Regla base: no rompas los 46 tests ni
el typecheck.** Después de cada bloque corré `npm test` y `npx tsc -p apps/api/tsconfig.json --noEmit`.

---

## BLOQUE 1 — CRÍTICO: el firmware no puede conectarse (3 bugs acumulados)

Hoy el ESP32 real, si se flashea tal cual, **no logra ni un solo request exitoso**.

### 1.1 — `x-device-ts` manda uptime en segundos, el backend espera epoch en milisegundos

`firmware/esp32/src/api_client.h:93`:
```cpp
const String ts = String((unsigned long)(millis() / 1000UL));  // uptime, NO epoch
```
`apps/api/src/auth/deviceAuth.ts:47` valida:
```ts
if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > DEVICE_AUTH_TOLERANCE_MS)  // ts en ms epoch, ventana ±5 min
```
`Date.now()` ≈ 1.7e12; `millis()/1000` ≈ 42. La diferencia siempre supera los 300.000 ms,
así que **todo request del dispositivo devuelve 401 DEVICE_UNAUTHORIZED**.

`docs/device-protocol.md` (sección "PENDIENTES del firmware real") dice
*"hoy `millis()/1000`; la ventana de 5 min lo tolera"*. **Eso es falso** y hay que
corregir también el texto del doc.

**Corregir:**
- Sincronizar hora por NTP en `setup()` (`configTime(0, 0, "pool.ntp.org", "time.nist.gov")`).
- `ts` = epoch en **milisegundos**: `String((uint64_t)time(nullptr) * 1000ULL)`.
- No emitir requests hasta tener hora válida (`time(nullptr) > 1700000000`); mientras tanto,
  loguear y reintentar. El relay queda OFF (ya es el estado de arranque).
- Actualizar `docs/device-protocol.md` para que diga que el firmware usa NTP + epoch ms.

### 1.2 — El certificado raíz está truncado (con texto de relleno adentro del PEM)

`firmware/esp32/src/api_client.h:15-29`: el bloque `ROOT_CA` contiene literalmente la línea
`... (certificado recortado: usar el PEM completo de ISRG Root X1 al compilar)` **dentro** de
`-----BEGIN CERTIFICATE----- / -----END CERTIFICATE-----`. mbedtls no lo puede parsear, así que
`client_.setCACert(ROOT_CA)` deja el cliente TLS sin CA válida y **ninguna conexión HTTPS abre**.

**Corregir:** pegar el PEM completo y real de ISRG Root X1. Además dejar el CA como
`build_flag`/constante configurable con un comentario que avise: si el dominio queda detrás de
Cloudflare, la cadena la firma Cloudflare y hay que poner ESA raíz, no la de Let's Encrypt.

### 1.3 — La URL base lleva el esquema pegado y se duplica

`firmware/esp32/src/app_config.h:26`: `#define HIDRO_API_BASE_URL "https://dominio.com"`.
En `api_client.h`:
- línea 89: `client_.connect(host_.c_str(), HIDRO_API_PORT)` → se le pasa `"https://dominio.com"` como hostname → falla el DNS.
- línea 99: `http.begin(client_, String("https://") + host_ + path)` → arma `https://https://dominio.com/api/...`.

**Corregir:** que `HIDRO_API_BASE_URL` sea solo el host (`"dominio.com"`), o que `begin()`
normalice y saque el esquema. Que `connect()` y `http.begin()` usen el mismo valor coherente.

---

## BLOQUE 2 — CRÍTICO DE SEGURIDAD FÍSICA: el relay puede quedar encendido para siempre

`firmware/esp32/src/main.cpp` (loop) corta el ciclo con:
```cpp
if (state == RUNNING && running.valid && (int64_t)(running.deadlineMs - now) <= 0) finishWash();
```
`running.deadlineMs` es `uint64_t` calculado desde `millis()` (que es `uint32_t` y **da la vuelta
a los ~49,7 días de uptime**). Después del rollover, `now` vuelve a cero y `deadlineMs` queda
gigante: la condición nunca se cumple y **el relay no se apaga nunca**. Es una hidrolavadora de
10 HP: la probabilidad es baja pero la consecuencia es inaceptable.

**Corregir:** agregar una guarda absoluta e independiente del deadline, con aritmética `uint32_t`
(que es rollover-safe por definición):
```cpp
// Guarda dura: pase lo que pase, el relay no puede estar ON más que la duración + margen.
if (relay.isOn() && (uint32_t)(millis() - runStartedAtMs) > (running.durationSeconds * 1000UL) + 5000UL) {
  relay.off();
  // reportar SESSION_INTERRUPTED reason="watchdog_max_runtime"
}
```
Guardar `runStartedAtMs` (uint32) al arrancar el ciclo y persistirlo en NVS junto al resto.
Esta guarda va **antes** de cualquier otra lógica del loop y no depende de WiFi ni del backend.

---

## BLOQUE 3 — ALTO: firmware, contratos y estado

### 3.1 — El "resume tras reboot" es código muerto y engaña al doc
`main.cpp` → `bootDevice()`:
```cpp
uint32_t gap = millis() - saved.lastTickMs;   // millis() ≈ 0 después del reset
int64_t remaining = (int64_t)saved.deadlineMs - (int64_t)millis();
if (gap < REBOOT_RESUME_MAX_GAP_MS && remaining > 0) { /* reanudar */ }
```
Después de un reset `millis()` arranca en ~0 y `saved.lastTickMs` es un valor grande de antes
del reset: la resta en `uint32_t` da un número enorme, así que **siempre** cae en la rama
"no reconstruible". `REBOOT_RESUME_MAX_GAP_MS` no se usa nunca y `remaining` compara dos relojes
distintos (millis pre-reboot vs millis post-reboot), así que no significa nada.

**Corregir — elegí UNA y dejala documentada:**
- (a) Simple y honesta: borrar la rama de resume, dejar que todo reboot interrumpa la sesión, y
  actualizar `nvs_store.h` + `docs/device-protocol.md` para que digan eso.
- (b) Correcta: guardar el deadline como **epoch NTP** (no millis) y recién ahí el gap y el
  remaining tienen sentido entre reinicios.
Recomendada: (b), porque ya vas a tener NTP por el bloque 1.1.

### 3.2 — Los eventos del dispositivo mandan `data` como string y el backend espera objeto
`main.cpp` → `sendEvent()`: `doc["data"] = data;` donde `data` viene como
`R"({"reason":"no_authorization"})"` (una **cadena**). El backend valida con
`DeviceEventPayloadSchema` (`packages/shared/src/validation.ts`), que declara
`data: z.record(z.unknown()).optional()` → espera un **objeto JSON**.
Todo `POST /api/device/events` del firmware sale con 400.

**Corregir:** que `sendEvent()` reciba y serialice un `JsonObject` real
(`doc["data"].to<JsonObject>()` y setear las claves), no una String.

### 3.3 — `Button::onPress_` no se llama nunca
`peripherals.h`: `Button::begin(pin, onPress)` guarda el callback pero nadie lo invoca; el loop
llama `onButtonPressed()` directo. Borrar el miembro y el parámetro, o usarlo. Hoy es ruido que
hace pensar que hay una ISR.

---

## BLOQUE 4 — ALTO: backend, dinero y concurrencia

### 4.1 — `processApproval` no corre en transacción (y el comentario dice que sí)
`apps/api/src/services/paymentService.ts:52-62`. El docblock afirma:
*"La fila de pago se bloquea FOR UPDATE: webhooks concurrentes del mismo pago se serializan."*
Pero `getPaymentByExternalIdForUpdate(db, ...)` corre sobre la conexión suelta. En Postgres,
`SELECT ... FOR UPDATE` **fuera de una transacción explícita libera el lock al terminar el
statement**: no serializa nada. Lo mismo con `getSessionForUpdate` y `getMachineForUpdate` más abajo.

Hoy no se generan dos autorizaciones (lo impide el índice único `uq_authorizations_payment`),
pero el segundo webhook simultáneo revienta con un 500 en vez de responder `duplicated`,
y Mercado Pago lo reintenta.

**Corregir:** envolver el cuerpo entero de `processApproval` en `db.transaction(async (tx) => {...})`
y pasar `tx` a todas las llamadas de repositorio de adentro. Agregar un test que dispare dos
`processApproval` concurrentes del mismo `externalPaymentId` y exija `approved` + `duplicated`,
nunca un 500.

### 4.2 — El límite de 2 lavados/día se puede saltear entre máquinas
`apps/api/src/services/sessionService.ts:57-116`. El comentario dice:
*"lock advisory por patente (hashtext): el límite diario no tiene carreras aunque dos clientes
usen la misma patente en máquinas distintas."*
El `pg_advisory_xact_lock` se suelta al cerrar la Tx1, que termina **antes** del pago. Y
`PAYMENT_PENDING` no está en `WASH_COUNTING_STATUSES`, así que no reserva el cupo.
Dos checkouts casi simultáneos de la misma patente en HIDRO-01 y HIDRO-02 leen `used=1` los dos,
los dos pasan, y terminan 3 lavados con límite 2. (HIDRO-02 ya viene en el seed.)

**Corregir:** que el cupo se reserve al crear la sesión, no al aprobarse el pago. La forma más
limpia: agregar `PAYMENT_PENDING` a `WASH_COUNTING_STATUSES` y asegurarse de que los estados
`PAYMENT_FAILED` / `PAYMENT_EXPIRED` **no** cuenten (así un pago rechazado devuelve el cupo).
Agregar test: misma patente, dos máquinas, en paralelo → la segunda debe dar `PLATE_LIMIT_REACHED`.

### 4.3 — "Hoy" es el día del servidor, no el de Ushuaia
`sessionService.ts:43` y `adminService.ts:76`:
```ts
const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
```
`setHours` usa la TZ local del proceso. En un contenedor (UTC, que es lo normal) el "día" corta a
las **21:00 hora de Ushuaia**: el límite diario se resetea a la noche y la recaudación del día del
panel admin queda partida.

**Corregir:** calcular el inicio del día con offset fijo `-03:00` (Tierra del Fuego no tiene
horario de verano). No uses round-trip de `Intl`: solo funciona si el proceso está en UTC.
Ponerlo en una función única en `packages/shared` y usarla desde los dos lugares.

### 4.4 — Cualquiera bloquea la máquina 10 minutos gratis
Un checkout que nunca se paga deja la sesión en `PAYMENT_PENDING`, que está en
`ACTIVE_SESSION_STATUSES` y por lo tanto ocupa la máquina hasta que la barre
`PAYMENT_PENDING_TIMEOUT_SECONDS` (600 s por defecto). Sin costo y sin identidad: para una
máquina en la vía pública es un bloqueo trivial y repetible.

**Corregir:** bajar el default a 120 s en `.env.example` y en
`DEFAULT_PAYMENT_PENDING_TIMEOUT_SECONDS`, y hacer que el barrido corra con el intervalo actual
(15 s) para que libere rápido. Dejarlo configurable desde admin (ya existe el setting).

### 4.5 — `notification_url` apunta al frontend, no a la API
`apps/api/src/payments/mercadoPagoProvider.ts:51`:
```ts
notification_url: `${this.config.publicAppUrl}/api/webhooks/mercadopago`,
```
`PUBLIC_APP_URL` es la URL del **frontend**. Solo funciona si un reverse proxy mapea `/api/*` al
puerto 3020. `infrastructure/DEPLOY.md` referencia un `infrastructure/Caddyfile.example` que
**no existe en el repo**. Si front y API se despliegan como servicios separados, los webhooks se
pierden en silencio: el cliente paga y la máquina nunca se habilita.

**Corregir:**
- Agregar `PUBLIC_API_URL` a `AppConfig`, a `.env.example` y a `DEPLOY.md`, con fallback a
  `PUBLIC_APP_URL` para no romper el modo local.
- Usar `publicApiUrl` para `notification_url` (y dejar `publicAppUrl` para `back_urls` y el QR).
- Crear de verdad `infrastructure/Caddyfile.example` con el contenido que ya describe `DEPLOY.md`.

### 4.6 — Título absurdo en la pantalla de pago de Mercado Pago
`mercadoPagoProvider.ts:44`:
```ts
title: `${input.machineName} — ${Math.round(input.amount)}s de lavado`.replace(/\d+s/, 'lavado'),
```
Interpola el **monto** como si fueran segundos y después lo tapa con un regex. El cliente ve
algo tipo `Hidrolavadora 10 HP — lavado de lavado`.

**Corregir:** `title: `${input.machineName} — ${input.durationSeconds}s de lavado`` (pasar
`durationSeconds` en `ProviderPaymentCreateInput`), sin `.replace`.

---

## BLOQUE 5 — ALTO: deploy y credenciales

### 5.1 — No hay Dockerfile y la API escucha solo en loopback
`apps/api/src/index.ts:9`: `app.listen(ctx.config.apiPort, '127.0.0.1', ...)`.
Dentro de un contenedor eso hace la API inalcanzable desde afuera. Y el repo no trae ningún
`Dockerfile` (`infrastructure/` solo tiene un compose de Postgres).

**Corregir:**
- Nueva variable `API_HOST` (default `127.0.0.1` en desarrollo, `0.0.0.0` cuando
  `NODE_ENV=production`), documentada en `.env.example`.
- Agregar `Dockerfile` multi-stage en la raíz (build de workspaces → runtime con `node:22-alpine`,
  usuario no-root, `EXPOSE 3020`, `CMD ["node","apps/api/dist/index.js"]`) y su `.dockerignore`
  (`node_modules`, `.npm-cache-local`, `dist` del host, `.data`, `.env`).
- Ningún secreto va al Dockerfile: todos por variables de entorno.

### 5.2 — Sin `trust proxy`
La app usa `express-rate-limit` pero nunca hace `app.set('trust proxy', ...)`. Detrás de un
reverse proxy / túnel, todos los requests llegan con la misma IP: el limitador o castiga a todos
juntos o no limita nada.

**Corregir:** en `apps/api/src/app.ts`, `app.set('trust proxy', 1)` cuando
`NODE_ENV === 'production'` (configurable con `TRUST_PROXY`).

### 5.3 — El salt del hash de contraseña es fijo y derivado del pepper
`apps/api/src/db/seed.ts:33-37`:
```ts
const salt = scryptSync(pepper, 'hidro-salt', 16).toString('hex');  // mismo salt para TODOS los usuarios
```
Un salt determinístico y compartido no cumple la función de un salt.

**Corregir:** `randomBytes(16)` por usuario, guardado en el propio string
(`${saltHex}$${hashHex}` ya soporta el formato). `verifySecret` ya lee el salt del string, así que
el cambio es acotado. Mantener compatibilidad: si el hash guardado no tiene salt aleatorio,
sigue validando (o re-hashear en el próximo login exitoso).

### 5.4 — El secret del dispositivo se escribe en claro en disco también en producción
`apps/api/src/services/adminService.ts:461` (`rotateDeviceSecret`) llama
`updateDeviceSecretFile()` sin mirar el entorno. El README promete
*"en producción los secrets viajan únicamente al ESP32 en el momento del flashing"*.

**Corregir:** escribir `devices.json` **solo** si `config.deviceSimulator === true`. El secret se
sigue devolviendo una vez por la respuesta HTTP (que es como se flashea el ESP32).

### 5.5 — `ADMIN_EMAIL` con mayúsculas rompe el login
`adminService.ts:66` busca por `email.toLowerCase().trim()`, pero `seed.ts:184` inserta
`config.adminEmail` tal cual. Si alguien pone `Admin@hidro.local` en el `.env` de producción,
nadie puede entrar al panel.

**Corregir:** normalizar a minúsculas en el seed y en `loadConfig`.

---

## BLOQUE 6 — MEDIO: dependencias e higiene del repo

### 6.1 — `drizzle-orm` con advisory HIGH de SQL injection
`apps/api/package.json` fija `"drizzle-orm": "^0.44.2"`. GHSA-gpj5-g38j-94v9 (identificadores SQL
mal escapados) está arreglado en **0.45.2**. Además el código usa `sql.raw()` en dos lugares:
`apps/api/src/repositories/repos.ts:90` (`countWashesToday`) y
`repos.ts:144` (`getActiveSessionForMachine`). Hoy interpolan constantes del propio código, no
entrada de usuario, así que no hay inyección real — pero es el patrón exacto que conviene sacar.

**Corregir:**
- Subir a `drizzle-orm@^0.45.2` y verificar que los 46 tests siguen verdes.
- Reemplazar los dos `sql.raw(...)` por `inArray(sessions.status, ACTIVE_SESSION_STATUSES)` y
  `inArray(sessions.status, WASH_COUNTING_STATUSES)` (drizzle ya lo soporta; `adminService.ts`
  ya usa `inArray` en otro lado).
- Correr `npm audit` y resolver lo que se pueda sin romper (`qs`/`express`, `react-router`,
  `uuid` vía `mercadopago`). Si algo exige un major que rompe, no lo fuerces: dejalo anotado.

### 6.2 — `.npm-cache-local/` (532 MB) no está en `.gitignore`
El repo todavía **no está bajo git**. Cuando se haga `git init && git add .`, esa carpeta entera
se va al repositorio.

**Corregir:** agregar a `.gitignore`:
```
.npm-cache-local/
.data/
.simulator/
```

### 6.3 — Documentación que afirma cosas falsas
Además de los docs ya mencionados, corregir estas frases porque hacen que un bug parezca resuelto:
- `README.md`, sección "Cómo simular el ESP32": dice que el simulador *"replica el firmware real"*.
  Es al revés: son **dos implementaciones distintas** del mismo protocolo y solo el simulador está
  cubierto por tests. Decirlo explícitamente, con la advertencia de que un cambio en el protocolo
  hay que aplicarlo en los dos lados.
- `docs/device-protocol.md`, "PENDIENTES del firmware real": sacar la afirmación de que la ventana
  de 5 minutos tolera `millis()/1000`.
- `README.md`, sección "Seguridad": el bullet de secrets por dispositivo debe aclarar que
  `devices.json` solo existe en modo demo (después del fix 5.4).

---

## BLOQUE 7 — DECISIÓN DE NEGOCIO (no la implementes: dejala documentada y preguntá)

**La patente no prueba nada.** Es el único dato que determina la tarifa y cualquiera la escribe a
mano. Un particular que vea estacionado un remis de la cooperativa copia la patente y lava por
$500 en vez de $8.000. El límite de 2 lavados/día no lo frena: castiga a la patente real, no a
quien la usó.

**No implementes una solución por tu cuenta.** Agregá una sección
`## DECISIÓN PENDIENTE — verificación de identidad de la patente` en el README, con las opciones y
su costo, para que la decida el dueño:
- (a) PIN de 4 dígitos por patente registrada (cambio chico: un campo en `vehicles` + un input).
- (b) Patente + últimos 4 dígitos del DNI del titular.
- (c) QR/credencial personal del remisero en vez de patente tipeada.
- (d) Aceptar el riesgo: la cooperativa es chica y todos se conocen.

Lo mismo con estos dos, que ya figuran como PENDING CLIENT DECISION pero sin costo asociado:
- Qué pasa si el cliente paga y se corta internet: hoy el pulsador **no arranca** (fail-safe
  correcto) pero la plata ya se cobró y la autorización vence a los 300 s. No hay reembolso
  automático: `refundPayment()` en `mercadoPagoProvider.ts` devuelve siempre `{ok:false}`.
- Qué pasa si se corta la luz en medio de un lavado pago.

---

## CIERRE

Cuando termines:
1. `npm test` → los 46 tests siguen verdes (más los nuevos de 4.1 y 4.2).
2. `npx tsc -p apps/api/tsconfig.json --noEmit` y `npx tsc -p apps/web/tsconfig.json --noEmit` limpios.
3. `npm audit --omit=dev` con el resumen de qué quedó y por qué.
4. `pio run -d firmware/esp32` (o al menos una compilación de sintaxis) para que el firmware
   deje de ser código que nunca se compiló.
5. Un resumen corto: qué arreglaste, qué dejaste sin tocar y por qué, y qué necesita decisión humana.

No agregues features nuevas. No cambies el modelo de datos salvo lo que pide el punto 4.2.
No toques el diseño visual de `apps/web`.
