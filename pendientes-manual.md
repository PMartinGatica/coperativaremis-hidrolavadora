# Pendientes manuales — checklist paso a paso (Pablo)

> Versión "a prueba de boludos": mismo contenido que antes, pero ordenado por lo que podés hacer
> YA (sin esperar a nadie) primero, y lo que depende de un tercero después. Cada paso dice qué
> hacer, cómo, y cómo saber que salió bien. Andá tachando. Cuando termines uno, avisame y lo saco
> de acá (si generó una decisión, queda su rastro en `ADR.md`).
>
> Última actualización: 2026-09-23. **C3 cerrado por código — ya no te toca hacer nada ahí**
> (ADR-053). **C1 tiene un hallazgo nuevo y fuerte: hoy nadie puede destrabar un pago colgado**
> (ADR-054) — leelo abajo, cambia la prioridad de ese punto.
>
> Última actualización previa: 2026-09-18. **TODA LA PARTE A ESTÁ HECHA.** Fase 1 cerrada del todo
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
- **Javi (encargado) → RESPONDIDO el 2026-09-22, en vivo a Pablo:**
  - **Reembolso: opción A + C.** Por defecto el lavado le queda **a favor** para la próxima con
    la misma patente (automático). Si el cliente insiste con que quiere la plata, lo resuelven
    **a mano, caso por caso** desde Mercado Pago. → O sea: `refundPayment()` **no hace falta en
    código**; lo que hay que construir es el crédito automático.
  - **Corte de luz en el medio: lavado completo de nuevo**, los 3 minutos enteros.
  - **El lavado fallido NO gasta cupo diario** ("si no lavó, es como si no hubiera lavado").
    → Desbloquea el **ADR-024 / Fase 1.5**, que estaba esperando justo esta decisión.
  - **Cuenta de MP: sin fecha todavía.** Es lo único que bloquea. Ver `mensajes/mensaje-javi.md`.
  - **Mesa de entrada (C1): no contestó.** Se le repregunta en el mismo mensaje.

---

## PARTE C — Depende de que consigas algo de otra persona

- [ ] **C1. Cuentas individuales para mesa de entrada. ⚠️ QA corrido el 2026-09-23: esto está
  peor de lo que decía esta nota, y a la vez depende menos de Javi de lo que parecía** (ADR-054).

  **El hallazgo, en criollo:** la función de destrabar un pago colgado está construida y anda
  bien. Pero **hoy no la puede usar nadie, ni vos.** La única cuenta que existe es la tuya (la
  del `.env`), y a esa cuenta el sistema le prohíbe destrabar pagos a propósito — para que quede
  registrado el nombre de la persona que lo hizo y no un "admin" genérico. Como no hay ninguna
  pantalla para crear una segunda cuenta, la cadena se cierra sola: **si mañana se cuelga un pago
  real, no hay nadie habilitado para destrabarlo.**

  Los 140 tests verdes no lo veían porque el test se fabricaba la credencial por adentro en vez
  de entrar por la pantalla de login, como entra una persona. Ya está arreglado y fijado con
  tests que sí entran por la puerta (`tests/mesa-de-entrada.test.ts`).

  **Lo que cambia para vos:** esto estaba archivado acá abajo, en "depende de otra persona",
  esperando los nombres. Pero los nombres hacen falta para **llenar** el formulario; **hacer** el
  formulario no depende de nadie. Se puede construir ya y dejarlo esperando los datos.

  **Lo que sigo necesitando de Javi (sin apuro ahora):** cuántas personas van a destrabar pagos y
  el email de cada una. Ya está repreguntado en `mensajes/mensaje-javi.md`.

  **Dato para cuando armemos las cuentas:** dar de baja a alguien tarda hasta 12 horas en surtir
  efecto (así está construido hoy, y a esta escala está bien). Si alguna vez necesitás cortarle
  el acceso a alguien **ya**, se cambia `JWT_SECRET` en Coolify, pero eso echa a todos y todos
  tienen que volver a entrar.
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

- [ ] **C2b. El "día de Mercado Pago real" — COORDINADO CON JAVI PARA EL 2026-09-23.**
  👉 **La guía paso a paso está en `docs/guia-mercadopago-real.md`. Seguí esa, tiene los comandos
  exactos.** Lo de abajo es el resumen de por qué.

  🔴 **Lo más importante de mañana: NO cargues las credenciales en producción.** Con Mercado Pago
  real la API no arranca si el simulador está prendido (ADR-048), y si lo apagás la máquina queda
  OFFLINE (no hay ESP32 todavía) y nadie puede pagar: la web quedaría "fuera de servicio". La
  prueba va **en tu compu**, donde esa guarda no corre. Producción pasa a MP real recién en D1,
  con el hardware puesto.

  1. **Dar de alta el webhook en el panel de la cuenta nueva.** 🔴 **Esto es lo que más se puede
     pasar por alto, y es lo que más duele.** Mercado Pago avisa de un pago por dos caminos: uno
     sale solo desde nuestro código, y el otro **hay que darlo de alta a mano en el panel de la
     cuenta**. En la cuenta de prueba tuya ya está hecho, por eso funcionó. En la cuenta nueva
     del dueño **va a estar vacío**, y sin eso no hay firma, y sin firma el sistema rechaza todos
     los avisos: cada cliente esperaría hasta 2 minutos parado frente a la máquina, aunque el
     pago esté aprobado. Panel → la aplicación → Webhooks → configurar, evento **Pagos**, y
     copiar la **firma secreta** que te da a `MERCADOPAGO_WEBHOOK_SECRET` en Coolify.
  2. **Verificar que llegan los DOS avisos** (inspector del túnel, `http://127.0.0.1:4040`):
     tiene que haber dos POST por cada pago, los dos con respuesta **200**. Si ves un 401, avisá:
     es justo lo que estoy arreglando ahora.
  3. **Experimento de 10 minutos, y decide una pieza de código.** Sacar la línea
     `notification_url` de la preference, pagar de nuevo, y mirar cuál de los dos avisos
     desaparece. Si el aviso firmado (el del panel) sigue llegando solo, podemos borrar el
     soporte del aviso viejo en vez de mantenerlo. Eso es más simple y más prolijo, pero **no se
     puede decidir desde acá**: hay que verlo con un pago real de prueba.
  4. Recién después, la prueba de punta a punta con la cuenta real.

- [x] **C3. HECHO el 2026-09-23 — resuelto por código, ya no necesita que toques Cloudflare**
  (ADR-053). Sale solo con el próximo deploy a `main`. **No tenés que hacer nada.**

  Confirmado que `http://hidro-api.insolvadev.com` contestaba 200 sin redirigir. Pero revisando
  en detalle, **la nota vieja acá exageraba en un punto y conviene que lo sepas**: decía que la
  clave viajaba sin cifrar, y no era así. El sistema ya mandaba dos protecciones que no estaban
  contadas, y una de ellas hace que el navegador suba el pedido del login a `https://` solo,
  antes de mandarlo. La clave no viajaba en claro.

  **Lo que sí estaba mal:** la *página* del panel (el HTML y el JavaScript) sí se servía por
  `http://`. Ahí el riesgo no es que se lea la clave, es que alguien en el camino te cambie el
  programa antes de que llegue a tu navegador. Eso ahora se corta: quien entre por `http://` es
  mandado a `https://` antes de recibir nada.

  Pensado para que no pueda romper nada: no toca `/api` ni `/health` (donde vive el ESP32 y los
  avisos de Mercado Pago, que podrían no seguir un redirect), y **no puede entrar en el bucle de
  redirecciones** que la guía de A1 te advertía. 10 tests nuevos, incluidos los que prueban
  cuándo NO tiene que redirigir.

  ⚠️ **Falta un chequeo de 10 segundos, y lo hago yo** (no vos): después del próximo deploy hay
  que confirmar que el redirect realmente sale en producción. Si el header que usa para decidir
  no atraviesa el túnel de Cloudflare + Traefik, el redirect **no hace nada y no avisa**. Es la
  misma trampa del ADR-051 (el webhook que "andaba" y no andaba), así que hasta ese chequeo esto
  está *desplegado*, no *confirmado*.

  **Opcional, sin apuro y ya no bloquea nada:** la regla en Cloudflare para ese subdominio sigue
  siendo un poco mejor (el pedido en claro ni llega al servidor). Si algún día estás en el panel,
  Configuration Rule "Always Use HTTPS" **solo para `hidro-api.insolvadev.com`** — nunca para
  toda la zona sin revisar antes las cámaras.

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
