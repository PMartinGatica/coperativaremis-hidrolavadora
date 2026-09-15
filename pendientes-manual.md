# Pendientes manuales — checklist paso a paso (Pablo)

> Versión "a prueba de boludos": mismo contenido que antes, pero ordenado por lo que podés hacer
> YA (sin esperar a nadie) primero, y lo que depende de un tercero después. Cada paso dice qué
> hacer, cómo, y cómo saber que salió bien. Andá tachando. Cuando termines uno, avisame y lo saco
> de acá (si generó una decisión, queda su rastro en `ADR.md`).
>
> Última actualización: 2026-09-15 (noche). **A1, A2 y A2b hechos.** El arreglo de seguridad
> (ADR-038) está en producción, verificado desde afuera, con volumen persistente confirmado
> real. **A4 corrida y con éxito (ADR-042), pero OJO — corrijo algo que dije mal:** A4 valida
> el mecanismo central (el pago que se recupera solo), no toda la puerta (b) de la Fase 1. La
> guía formal (`qa/FASE-1-manual.md`) tiene más casos — sobre todo probar la reconciliación
> **desde el panel de admin**, con una cuenta que no sea la de fábrica — que A4 no cubre. No
> digo más "Fase 1 cerrada del todo" hasta que eso también esté hecho; ver el nuevo ítem A4b
> abajo con lo que falta en limpio. **Lo que sigue: A3, y después A4b.** ⚠️ Coolify despliega
> solo cada vez que se sube código a `main` (tarda ~2 minutos). El ítem de ADR-007 (patente) se
> sacó: lo resolvió el PIN (ADR-036). `mensajes/mensaje-dueno.md` ya tiene 2 preguntas, no 3.

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

### 👉 A3. Chequear que el sistema ve la IP real del cliente (importante para no dejar gente sin poder pagar) — seguí por acá

Hay 3 "capas" delante de tu app (Cloudflare → túnel → Traefik) y necesitamos que el sistema sepa
la IP real de cada visitante, no la de esas capas — si no, puede llegar a agrupar a TODOS los
clientes bajo una sola cuota y el primero que pague deja a los demás sin poder.

1. Con la app ya desplegada (A1 hecho), hacé un pago de prueba o cualquier request desde tu
   celular con datos móviles (no wifi de tu casa/oficina, para que sea una IP pública distinta).
2. Pedime que te ayude a revisar los logs del contenedor en Coolify — ahí vas a ver qué IP quedó
   registrada.
3. Comparala con tu IP pública real (buscá "cuál es mi ip" en Google desde el mismo celular).
   - Si coinciden → todo bien, no toques nada.
   - Si NO coinciden → avisame, hay que ajustar `TRUST_PROXY` (o cambiar a leer el header
     `CF-Connecting-IP`, que Cloudflare no deja falsificar).

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

### 👉 A4b. Terminar la puerta (b) de la Fase 1: reconciliación desde el panel de admin

Esto es lo que falta para que la Fase 1 cierre del todo. Es más largo que A4 — calculá 30-40
minutos, y necesita el navegador (no solo la terminal). La guía completa, con cada caso y qué
tiene que pasar, ya está escrita en `qa/FASE-1-manual.md` — pedime que te la vaya guiando paso a
paso cuando quieras arrancar (usa el mismo truco del `.env`/`ADMIN_EMAIL` que sacamos de A4, pero
ahí SÍ hace falta, porque esta vez estás probando la reconciliación de verdad).

En criollo, lo que falta probar:
- **Desde el panel** (`/admin/sessions`, no la terminal): que el botón "Reintentar automático"
  funcione de verdad con una cuenta que no sea `admin@hidro.local` — hoy solo está probado que el
  botón existe y que la cuenta de fábrica lo tiene bloqueado, falta el camino de éxito real.
  También: que el mensaje "no hay pago" salga bien cuando corresponde, y que cargar un ID de pago
  equivocado a mano dé el error correcto (no que autorice algo por error).
  Casos con la cuenta NO-fábrica (los 4 que faltan de la guía).
- **Un caso borde por terminal:** que si intentás reconciliar una sesión que YA se recuperó sola
  (como la que probamos en A4), el sistema diga "no hace falta" en vez de generar una segunda
  autorización por las dudas.
- Marcar el veredicto final en `qa/FASE-1-manual.md` (al final del archivo) cuando esté todo OK.

Si preferís dejarlo para otro día, avisame y seguimos con A3 mientras tanto — no hay apuro, nada
de esto toca producción.

---

## PARTE B — Mandar los mensajes ya redactados (arranca el reloj en otros)

Estos ya están escritos, listos para copiar y pegar en WhatsApp tal cual (formato `*negrita*` de
WhatsApp incluido). Vos solo los mandás.

- [ ] **B1. Mandar `mensajes/mensaje-tecnicos.md`** a quien te arma la parte eléctrica. Pide 3
  datos de vuelta: qué módulo de relay compraron, qué contactor eligieron (y voltaje de la
  bobina), y confirmación de que el timer viejo queda puesto para la primera prueba.
- [ ] **B2. Mandar `mensajes/mensaje-dueno.md`** al dueño de la cooperativa. Ahora son solo 2
  preguntas (la de la patente ya se resolvió con el PIN): qué hacer si el cliente paga y no
  lava (reembolso), y cuándo te habilita el acceso a la cuenta de Mercado Pago de ellos. Incluye
  un agregado abajo sobre si un lavado fallido debe gastar el cupo diario o no — mandalo junto o
  después, como prefieras.

**Cuando te contesten, anotá acá las respuestas** (para que yo las lea sin tener que
preguntarte de nuevo):

- Técnicos → módulo de relay: ______ · contactor/voltios de bobina: ______ · timer viejo
  queda puesto: SÍ / NO
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
- [ ] **C2. Cuenta de desarrollador de Mercado Pago + usuario de prueba** (para vos, no para el
  dueño de la cooperativa — esto es aparte de B2). La necesito para probar contra la API real de
  MP antes de cobrar plata de verdad. Sin esto, todo sigue probado solo contra el modo DEMO.

---

- [ ] **C3. Decisión de infraestructura: forzar HTTPS en `hidro-api.insolvadev.com`.** Hoy
  `http://hidro-api.insolvadev.com` responde sin redirigir a `https://` (verificado): si alguien
  entra al panel por `http://`, la clave viaja sin cifrar hasta Cloudflare. Se arregla en
  Cloudflare con una regla **solo para ese subdominio** (Configuration Rule o Page Rule "Always
  Use HTTPS"). **No actives "Always Use HTTPS" para toda la zona** sin revisar antes qué otros
  servicios (las cámaras, por ejemplo) usan `http://`. Es tu decisión porque toca la
  infraestructura compartida.

## PARTE D — Fuera de lo que se puede resolver desde una compu

- [ ] **D1. Puesta en marcha del hardware, con vos presente.** `[STOP-HUMANO]` — no se hace sin
  vos ni se automatiza. Antes de esto necesitamos las respuestas de B1 (técnicos) para configurar
  el programa con el relay y contactor correctos. El timer eléctrico viejo se deja puesto como
  red de seguridad hasta probar todo. Primer paso de la prueba: el módulo de relay se prueba en
  el banco **sin el contactor conectado** — 5 minutos, no se saltea (si me equivoco de polaridad
  en el programa, la máquina puede arrancar sola al prenderse la placa).

---

**Si por ahora no llegás a nada de esto:** decime y sigo construyendo otras partes del Mundo que
no dependan de estos puntos mientras tanto.
