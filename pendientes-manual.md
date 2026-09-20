# Pendientes manuales — checklist paso a paso (Pablo)

> Versión "a prueba de boludos": mismo contenido que antes, pero ordenado por lo que podés hacer
> YA (sin esperar a nadie) primero, y lo que depende de un tercero después. Cada paso dice qué
> hacer, cómo, y cómo saber que salió bien. Andá tachando. Cuando termines uno, avisame y lo saco
> de acá (si generó una decisión, queda su rastro en `ADR.md`).
>
> Última actualización: 2026-09-18. **TODA LA PARTE A ESTÁ HECHA.** Fase 1 cerrada del todo
> (A4b, ADR-044) y A3 cerrado encontrando y arreglando un bug real de rate-limit por IP
> (ADR-045). **B0 ya mandado** (compras a Gaby). Falta confirmar B1/B2. **C4 decidido y
> construido** (ADR-047 → ADR-048): el modo demo existe; te queda prender `DEVICE_SIMULATOR=true`
> en Coolify para que el dueño pueda recorrer la interfaz sin ESP32.
> ⚠️ Coolify despliega solo cada vez que se sube código a `main` (tarda ~2 minutos). El ítem de
> ADR-007 (patente) se sacó: lo resolvió el PIN (ADR-036).

---

## PARTE A — Podés hacer esto ahora mismo, no depende de nadie más

### ✅ A1. Corregir la configuración de Coolify — HECHO

Confirmado por vos el 2026-09-15 y verificado desde afuera: redeploy hecho, clave admin de 12+
caracteres, las 2 claves generadas con el comando de la guía, volumen Volume Mount. Ya no hace
falta tocar nada de esto.

<details><summary>Contexto (ya resuelto, para referencia)</summary>

Chequeado desde afuera el 2026-09-15: `/health` respondía bien y la página cargaba. Pero:
- 🔴 **Cualquiera entraba al panel admin con `admin@hidro.local` / `hidro-demo-2025`** (probado:
  entraba). Con eso podía cargar patentes como remis y lavar a $500, o cambiar tarifas.
- 🔴 La patente demo `AE100AA` cobraba $500 a quien la escribiera.
- 🔴 No había volumen: cada redeploy borraba patentes, PINs, pagos y la clave del ESP32.

**Paso 1 — Generar 2 claves secretas.** En una terminal de tu compu, corré este comando **dos
veces** (cada vez sale una clave distinta):
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
La primera es para `JWT_SECRET`, la segunda para `DEVICE_AUTH_SECRET`. Guardalas en tu gestor de
claves.

**Paso 2 — Configuration → Environment Variables → Production.** Agregá o completá estas 6:

| Variable | Valor |
|---|---|
| `PUBLIC_APP_URL` | `https://hidro-api.insolvadev.com` |
| `PUBLIC_API_URL` | `https://hidro-api.insolvadev.com` |
| `JWT_SECRET` | la 1ª clave del paso 1 |
| `DEVICE_AUTH_SECRET` | la 2ª clave del paso 1 |
| `ADMIN_EMAIL` | tu mail real |
| `ADMIN_PASSWORD` | una clave propia de **12 caracteres o más**, solo letras, números, `-` y `_` |

- 🔴 **Hacelo hoy:** la página `/admin` publicada muestra escritas en pantalla las credenciales
  demo (`Credenciales DEMO: admin@hidro.local / hidro-demo-2025`). Cualquiera que entre las lee.
- La clave de 12 caracteres o más y las 2 claves generadas no son un capricho: el arreglo que
  estoy construyendo hace que el sistema **no arranque** en producción si alguna es más corta o
  es la de demo. Si ya cargaste una clave admin más corta, cambiala ahora.
- `PUBLIC_APP_URL` vacía = el QR de la máquina (el que se imprime y se pega) apunta a
  `localhost` y no le abre a nadie.
- 🔴 **NO agregues `SEED_DEMO=false`, y si ya la tenés cargada, borrala.** La guía vieja la pedía
  y estaba mal: con el código actual apaga también la creación de la máquina HIDRO-01 y de tu
  cuenta admin. Quedarías sin máquina y sin poder entrar.
- En cada variable, **destildá "Available at Buildtime"**: ninguna se usa al construir y así las
  claves no quedan guardadas en la imagen. Tampoco cargues `NODE_ENV`.
- En la clave admin evitá espacios y el signo `$`: Coolify puede interpretar el `$` y guardar otra
  clave distinta de la que vas a tipear.
- Las 2 claves generadas tienen que ser **distintas** entre sí (el comando da una distinta cada
  vez; solo no pegues la misma dos veces).
- 🔴 **`DEVICE_AUTH_SECRET` se carga una vez y no se cambia nunca más.** Con ella se guardan
  cifradas las claves de los ESP32: si la cambiás después, la máquina deja de poder conectarse.
- `NODE_ENV` no hace falta: ya viene fijado dentro del Dockerfile (verificado desde afuera:
  simulador apagado, velocidad 1).
- `CORS_ORIGINS`: dejala como está. Con un solo dominio no se usa.

**Paso 3 — Persistent Storage → + Add → Volume Mount:**
- Name: `hidro-data`
- Destination Path: `/app/.data`

**Paso 4 — Botón "Redeploy"** (arriba a la derecha). "Restart" no alcanza: las variables nuevas
se toman con Redeploy.

**No actives "Healthcheck"** en Coolify por ahora: con la base actual (embebida en el
contenedor) podría correr dos copias a la vez sobre el mismo volumen y romper la base.

**No toques:**
- **Domains `http://hidro-api.insolvadev.com`**: con el túnel de Cloudflare así está bien (el
  candado lo pone Cloudflare). Pasarlo a `https://` puede dejar el sitio en un bucle de
  redirecciones.
- **Los textos grises** (Custom Docker Options, Watch Paths `src/pages/**`,
  `php artisan migrate`, `3000:3000`): son ejemplos que muestra Coolify, no configuración real.
  Si alguno está escrito en blanco (no gris), borralo.

</details>

### ✅ A2. Verificar que quedó bien — HECHO

Verificado desde afuera el 2026-09-15 después de tu confirmación:
- `/health` responde OK.
- Login `admin@hidro.local` / `hidro-demo-2025` → **401** (ya no entra). ✅
- Subí el arreglo a `main` y Coolify redesplegó solo (~2 min). Bundle nuevo confirmado
  (`index-86E0ubWO.js`) y escaneado: **cero** apariciones de `hidro-demo-2025`,
  `admin@hidro.local`, `Credenciales DEMO`, `AE100AA`, `AE200AA` en los 6 archivos JS publicados.

**Si todavía no entraste con tu `ADMIN_EMAIL` / `ADMIN_PASSWORD` nuevos, hacelo ahora** para
confirmar que tu clave funciona (yo no puedo probar eso desde afuera). Si algo falla o ves
`EACCES` en Logs, avisame.

### 👉 A2b. Ahora sí — es lo próximo que falta

**HECHO — confirmado por vos el 2026-09-15.** Borraste `AE100AA`/`AE200AA`, creaste la patente
de prueba, hiciste Redeploy y confirmaste que persiste y que las demo no vuelven. El volumen
persistente queda validado en producción real, no solo en el test local. Nada más que hacer acá.

### ✅ A3. Chequear que el sistema ve la IP real del cliente — HECHO, encontrado y arreglado un bug real

**Corrido con vos el 2026-09-18 (ADR-045).** Probamos con tu wifi de casa y con los datos
móviles de tu celular, comparando el contador de rate-limit del login de admin: el número
siguió bajando de una red a la otra en vez de resetear — las dos IPs reales caían en el MISMO
balde. Confirmado: `TRUST_PROXY=1` no alcanza con las 2 capas intermedias que hay en producción
(túnel de Cloudflare + Traefik). Arreglado sin tocar esa variable: ahora se lee directo el header
`CF-Connecting-IP` que pone Cloudflare (no se puede falsificar, tu servidor no tiene IP pública
propia expuesta). Ya en `main`, tests 113/113 OK.

**Discutimos el impacto antes de tocar código:** con una sola máquina esto casi no afecta a
clientes reales (el "máquina ocupada" ya los serializa por lógica de negocio) — pero sí iba a
importar el día que agregues HIDRO-02, donde dos clientes en máquinas distintas podrían
compartir cupo sin motivo. Por eso se arregló ahora que ya estaba diagnosticado.

**Confirmado en producción (2026-09-18, después del redeploy):** wifi dio `r=8`, datos móviles
dio `r=9, t=900` (ventana de 15 min completa, recién arrancada) — balde independiente, no
siguió bajando desde el de wifi. Arreglo verificado end-to-end.

### ✅ A4. Prueba de "pago que se recupera solo" — HECHO

**Corrida por vos el 2026-09-15, resultado `WAITING_FOR_BUTTON`** (sessionId `HS-QG956K`) — éxito:
el pago tardío se recuperó solo, sin que nadie hiciera nada a mano, y encima confirmó que la
máquina simulada se enteró y quedó armada. Esto valida el mecanismo central de la Fase 1.

**No es toda la puerta (b) de la Fase 1 — sigue en A4b más abajo.** La guía formal
(`qa/FASE-1-manual.md`) también pide probar la reconciliación *desde el panel de admin* con una
cuenta que no sea la de fábrica, y algunos casos borde. Dije antes que la Fase 1 quedaba "cerrada
del todo" con esto — no es así, me apuré. Perdón por la confusión.

<details><summary>Comandos usados (por si hay que repetirla alguna vez)</summary>

> ⚠️ Windows/PowerShell: usá estos comandos tal cual, no los cambies a `curl`. PowerShell 5.1 (el
> que trae Windows) le come las comillas a los argumentos con JSON adentro y manda el pedido roto
> — confirmado con evidencia mientras depurábamos esto (ver ADR-042). `Invoke-RestMethod` no tiene
> ese problema, y se acuerda solo del token/ID de sesión entre pasos (misma ventana de PowerShell).

```powershell
# Preparación (una sola vez)
Invoke-RestMethod -Uri "http://localhost:3020/api/demo/reset" -Method Post

$login = Invoke-RestMethod -Uri "http://localhost:3020/api/admin/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = "admin@hidro.local"; password = "hidro-demo-2025" } | ConvertTo-Json)
$token = $login.token

Invoke-RestMethod -Uri "http://localhost:3020/api/admin/settings" -Method Patch -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" } -Body (@{ paymentPendingTimeoutSeconds = 60 } | ConvertTo-Json)

# La prueba en sí
$checkout = (Invoke-RestMethod -Uri "http://localhost:3020/api/public/machines/HIDRO-01/sessions" -Method Post -ContentType "application/json" -Body (@{ plate = "AE100AA" } | ConvertTo-Json)).checkout
$sessionId = $checkout.sessionId
$extPaymentId = $checkout.payment.externalPaymentId

# Esperar ~70s sin tocar nada, después:
(Invoke-RestMethod -Uri "http://localhost:3020/api/public/sessions/$sessionId").session.status
# → PAYMENT_EXPIRED (el sistema la venció solo)

Invoke-RestMethod -Uri "http://localhost:3020/api/public/payments/$extPaymentId/simulate" -Method Post -ContentType "application/json" -Body (@{ action = "approve" } | ConvertTo-Json)

(Invoke-RestMethod -Uri "http://localhost:3020/api/public/sessions/$sessionId").session.status
# → AUTHORIZED o WAITING_FOR_BUTTON (las dos son éxito)
```

</details>

### ✅ A4b. Terminar la puerta (b) de la Fase 1: reconciliación desde el panel de admin — HECHO

**Corrida por vos el 2026-09-17, en el navegador, con tu propia cuenta (no la de fábrica).**
Encontramos y arreglamos en el camino que el `.env` no se estaba leyendo en modo dev (no hay
`dotenv` en el código) — la guía quedó corregida con el paso real (`$env:ADMIN_EMAIL` en la
terminal). Resultados:
- Sin pago aprobado → mensaje ámbar correcto, no autoriza nada.
- ID de pago equivocado a mano → `session_id_mismatch`, no autoriza nada.
- Servidor caído → banner ámbar de "actualización pausada", se recupera solo.
- Reintentar sobre una sesión YA recuperada → `not_recoverable`, no genera una segunda
  autorización.
- El único caso que NO se puede probar a mano (pago aprobado justo antes de vencer, vía botón)
  lo confirmamos por código: es un límite del proveedor DEMO, no una falla — ya está cubierto por
  el test automático.

**Veredicto confirmado en `qa/FASE-1-manual.md` (2026-09-17). La Fase 1 queda cerrada del todo
(ADR-044).**

---

## PARTE B — Mandar los mensajes ya redactados (arranca el reloj en otros)

Estos ya están escritos, listos para copiar y pegar en WhatsApp tal cual (formato `*negrita*` de
WhatsApp incluido). Vos solo los mandás.

- [ ] **B0. Mandar `mensajes/mensaje-compras-gaby.md`** a Gaby, que está en Buenos Aires.
  Es la compra de la electrónica del ESP32 (placa, relay, protoboard, borneras, cables). **Lo
  más urgente de los tres**: una de las placas figuraba como última unidad, y sin la placa no hay
  banco de pruebas. Armado el 2026-09-18 con los links ya verificados uno por uno (ADR-046).
- [ ] **B1. Mandar `mensajes/mensaje-tecnicos.md`** a quien te arma la parte eléctrica.
  **Reescrito el 2026-09-18:** ahora la electrónica la comprás vos, así que a ellos les quedan el
  contactor, el pulsador, la fuente y la instalación. Pide solo **2** datos de vuelta (antes eran
  3): qué contactor eligieron (y voltaje de la bobina), y confirmación de que el timer viejo queda
  puesto para la primera prueba. Suma el pedido de **puesta a tierra de la caja metálica**.
- [ ] **B2. Mandar `mensajes/mensaje-dueno.md`** al dueño de la cooperativa. Ahora son solo 2
  preguntas (la de la patente ya se resolvió con el PIN): qué hacer si el cliente paga y no
  lava (reembolso), y cuándo te habilita el acceso a la cuenta de Mercado Pago de ellos. Incluye
  un agregado abajo sobre si un lavado fallido debe gastar el cupo diario o no — mandalo junto o
  después, como prefieras.

**Cuando te contesten, anotá acá las respuestas** (para que yo las lea sin tener que
preguntarte de nuevo):

- Técnicos → contactor/voltios de bobina: ______ · timer viejo queda puesto: SÍ / NO ·
  caja puesta a tierra: SÍ / NO
- Dueño cooperativa → política de reembolso (crédito automático / devolución MP / a mano):
  ______ · lavado fallido cuenta contra el cupo diario: SÍ / NO · fecha estimada de acceso a
  la cuenta de MP: ______

---

## PARTE C — Depende de que consigas algo de otra persona

- [ ] **C1. Cuentas individuales para mesa de entrada.** Necesito que me digas: ¿cuántas
  personas van a reconciliar pagos, y con qué email cada una? Hoy hay una sola cuenta admin (la
  del `.env`) y está bloqueada a propósito para esto — cualquier intento con ella dice "usá tu
  cuenta individual". Con la lista de nombres/emails, agrego la pantalla para crear esas
  cuentas (hoy no existe).
- [x] **C2. HECHO el 2026-09-20 — cuenta de developer + los 3 SPIKE de Mercado Pago validados
  contra la API real (sandbox), en local.** Detalle en ADR-050 y ADR-051. `createPayment()` y
  `searchByExternalReference()` funcionaban tal cual estaban escritos. **El webhook NO: tenía un
  bug que lo rompía entero** (leía el id de `body.data.id`, pero MP lo manda en `body.resource`),
  así que en producción ningún pago real habría autorizado la máquina por webhook — el cliente
  habría esperado hasta que el barrido lo rescatara. Arreglado, con 5 tests nuevos, y verificado
  end-to-end con un pago de sandbox real. **Lo único que falta de pagos:** `refundPayment()`
  sigue siendo un stub, bloqueado por la política de reembolso (B2).

  **Cómo se armó, para repetirlo (ej. con la cuenta real de la cooperativa cuando llegue B2):**
  1. Con el usuario que va a ser "el vendedor" ya logueado en `mercadopago.com.ar`, entrar a
     [mercadopago.com.ar/developers/panel/app](https://www.mercadopago.com.ar/developers/panel/app)
     **en esa misma sesión** — no en otra pestaña, no con otra cuenta. Crear aplicación → **Pagos
     online** → **Checkout Pro** (el código usa `Preference.create`, la Preferences API; el panel
     avisa que se va a "descontinuar" a favor de Orders API — no migra sola, queda anotado en
     ADR-050 como pendiente sin decidir, no bloquea nada de esto).
  2. ⚠️ **Las credenciales de "Prueba" de la app de TU cuenta real NO sirven para probar pagos.**
     Pertenecen a tu cuenta real y Mercado Pago rechaza pagarle con un comprador de prueba
     (`"Una de las partes... es de prueba"`). Hace falta loguearse CON el usuario **Vendedor de
     prueba** (Cuentas de prueba → Vendedor) y crear la aplicación de nuevo desde ADENTRO de esa
     sesión — ahí las credenciales "Productivas" de esa cuenta ficticia sí sirven, porque toda la
     cuenta es de prueba. Antes de pagar, confirmar con `GET https://api.mercadopago.com/users/me`
     (header `Authorization: Bearer <access token>`) que el `nickname` devuelto empieza con
     `TESTUSER` — si devuelve un email real, son las credenciales equivocadas.
  3. Copiar Access Token + Public Key de esa app (la del Vendedor de prueba) a `apps/api/.env`
     (⚠️ NO al `.env` de la raíz del repo — hay dos, y el código solo lee el de `apps/api/`,
     `config.ts:121`; cargar ahí adentro deja la API en modo DEMO en silencio):
     ```
     PAYMENT_PROVIDER=mercadopago
     MERCADOPAGO_ACCESS_TOKEN=<Productivas de la app del Vendedor de prueba>
     MERCADOPAGO_PUBLIC_KEY=<idem>
     ```
     `PAYMENT_PROVIDER` ya existe en ese archivo con valor `demo` — cambiarlo, no duplicar la
     línea. La config se lee una sola vez al arrancar: después de tocar el `.env`, reiniciar.
  4. Mercado Pago rechaza `back_urls` con `localhost` cuando hay `auto_return` (`400
     invalid_auto_return`) — para probar desde la compu, `PUBLIC_APP_URL` tiene que apuntar a un
     dominio público real (se usó `https://hidro-api.insolvadev.com` sin tocar producción, solo
     como valor de redirect de la preferencia de prueba).
  5. Crear también una cuenta **Comprador** de prueba (mismo país que el Vendedor, no se puede
     cambiar después). Para pagar: logueado con el Comprador (no como invitado — como invitado
     pide un email y cualquier email real vuelve a disparar el error de "partes mezcladas"),
     tarjeta de [la tabla oficial](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards),
     titular **APRO** para que apruebe.

  6. **Para probar el webhook** hace falta que MP pueda pegarle a tu compu: `ngrok http 3020`
     (el agente tiene que ser 3.20+, si no MP... perdón, ngrok rechaza la conexión: `ngrok
     update`). La URL pública que te da va en `apps/api/.env` como `PUBLIC_API_URL` (⚠️ distinta
     de `PUBLIC_APP_URL`, que es la de los `back_urls`), y en el panel de MP → la app del
     Vendedor de prueba → **Webhooks** → "Configurar notificaciones" → URL de prueba
     `<tunel>/api/webhooks/mercadopago`, evento **Pagos**. Al guardar te da la **firma secreta**
     → `MERCADOPAGO_WEBHOOK_SECRET` en el mismo `.env`. Reiniciar la API después de cada cambio.
     ⚠️ **Cerrá el túnel cuando termines** — mientras corre, tu máquina está expuesta a internet.

  ⚠️ **Cómo saber si el webhook realmente funcionó (y no confundirse, como pasó el 2026-09-19):**
  el sistema tiene un barrido de respaldo que hace casi lo mismo que el webhook, así que ver la
  sesión en `WAITING_FOR_BUTTON` **no prueba nada por sí solo**. Miralo por el reloj: el webhook
  autoriza en segundos, el barrido recién al cruzar el timeout (900 s en esa prueba). Y confirmalo
  en el inspector de ngrok (`http://127.0.0.1:4040`): tiene que haber un POST a
  `/api/webhooks/mercadopago` con respuesta **200**.

---

- [ ] **C3. Decisión de infraestructura: forzar HTTPS en `hidro-api.insolvadev.com`.** Hoy
  `http://hidro-api.insolvadev.com` responde sin redirigir a `https://` (verificado): si alguien
  entra al panel por `http://`, la clave viaja sin cifrar hasta Cloudflare. Se arregla en
  Cloudflare con una regla **solo para ese subdominio** (Configuration Rule o Page Rule "Always
  Use HTTPS"). **No actives "Always Use HTTPS" para toda la zona** sin revisar antes qué otros
  servicios (las cámaras, por ejemplo) usan `http://`. Es tu decisión porque toca la
  infraestructura compartida.

- [x] **C4. HECHO el 2026-09-18 — MODO DEMO prendido y verificado en producción** (opción (a) del
  ADR-047; código en ADR-048, confirmación en ADR-049). Pablo cargó `DEVICE_SIMULATOR=true` en
  Coolify y el deploy quedó arriba. Verificado contra `hidro-api.insolvadev.com`: HIDRO-01
  **ONLINE / Disponible** con cartel "MODO DEMO — MÁQUINA SIMULADA", y el flujo entero corrido de
  punta a punta (cotizar → pago demo aprobado → autorización tomada por el simulado → pulsador →
  RELAY ON → RUNNING → cortó solo a los 180 s → máquina libre, relay apagado).
  **Ya se le puede pasar el link al dueño.** Recorre todo: patente → tarifa → pagar (pago de
  mentira) → botón "APRETAR EL PULSADOR SIMULADO" → los 180 s corriendo.
  **Para que vea las tres tarifas** tiene que haber patentes cargadas: entrá a `/admin` →
  Vehículos y registrá una como `remis` y otra como `socio` (con su PIN). Cualquier patente que
  no esté cargada cotiza como externo ($8.000) — eso es lo correcto, no un error.
  ⚠️ **Apagar la variable (o ponerla en `false`) antes de conectar el ESP32 de verdad (D1)**, si
  no vas a tener una máquina fantasma mandando heartbeats falsos al lado de la real. Ojo también:
  con el simulador prendido, **rotar el secret de un dispositivo desde el admin no tiene efecto
  hasta reiniciar la app**. Y si algún día cargás las credenciales reales de Mercado Pago sin
  apagar esta variable, **la API no arranca a propósito** y el log dice exactamente eso: es la
  red que evita cobrarle a un cliente por una máquina que no existe.

## PARTE D — Fuera de lo que se puede resolver desde una compu

- [ ] **D0. Prueba de polaridad del relay en el banco** (cuando lleguen las compras de B0). La
  hacés vos solo, con el protoboard y el tester, **sin el contactor conectado** — 5 minutos, no se
  saltea. Qué se mide: si el módulo dispara con señal ALTA o BAJA. Con eso se fija
  `RELAY_ACTIVE_LEVEL` en `firmware/esp32/src/app_config.h` (hoy dice `HIGH`, y por el tipo de
  módulo que compraste es probable que haya que ponerlo en `LOW` — ver ADR-046). También queda
  definido hacia dónde va la resistencia de 10 k del ADR-015: si es activo-bajo, de GPIO 26 a
  3,3 V. **Avisame cuando tengas las piezas y te guío paso a paso**, igual que con A4b.
  Recordá: al módulo relay hay que **sacarle el jumper `JD-VCC`** y alimentar la parte de señal a
  3,3 V, no a 5 V.
- [ ] **D1. Puesta en marcha del hardware, con vos presente.** `[STOP-HUMANO]` — no se hace sin
  vos ni se automatiza. Antes de esto hacen falta D0 (polaridad medida) y la respuesta de B1
  (contactor y voltaje de bobina). El timer eléctrico viejo se deja puesto como red de seguridad
  hasta probar todo. Ojo con la caja metálica: la antena WiFi tiene que quedar montada **por
  fuera**, con el pigtail atravesando la pared — adentro no hay señal (ADR-046).

---

**Si por ahora no llegás a nada de esto:** decime y sigo construyendo otras partes del Mundo que
no dependan de estos puntos mientras tanto.
