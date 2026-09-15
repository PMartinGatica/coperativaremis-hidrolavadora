# Pendientes manuales — checklist paso a paso (Pablo)

> Versión "a prueba de boludos": mismo contenido que antes, pero ordenado por lo que podés hacer
> YA (sin esperar a nadie) primero, y lo que depende de un tercero después. Cada paso dice qué
> hacer, cómo, y cómo saber que salió bien. Andá tachando. Cuando termines uno, avisame y lo saco
> de acá (si generó una decisión, queda su rastro en `ADR.md`).
>
> Última actualización: 2026-09-15 (noche). **El arreglo de seguridad ya está construido y
> probado en tu compu** (ADR-038: 107 tests, imagen Docker probada sin variables, con
> variables y con volumen). **No está subido**: espera a que hagas A1, porque con el arreglo el
> sistema no arranca sin tus claves y el sitio se caería. La app de Coolify YA existe y el link
> anda. El ítem de ADR-007 (patente) se sacó: lo resolvió el PIN (ADR-036).
> `mensajes/mensaje-dueno.md` ya tiene 2 preguntas, no 3.

---

## PARTE A — Podés hacer esto ahora mismo, no depende de nadie más

### A1. Corregir la configuración de Coolify (la app anda, pero está abierta)

Chequeado desde afuera el 2026-09-15: `/health` responde bien y la página carga. Pero:
- 🔴 **Cualquiera entra al panel admin con `admin@hidro.local` / `hidro-demo-2025`** (probado:
  entra). Con eso puede cargar patentes como remis y lavar a $500, o cambiar tarifas.
- 🔴 La patente demo `AE100AA` cobra $500 a quien la escriba.
- 🔴 No hay volumen: cada redeploy borra patentes, PINs, pagos y la clave del ESP32.

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
| `ADMIN_PASSWORD` | una clave propia de **12 caracteres o más** |

- 🔴 **Hacelo hoy:** la página `/admin` publicada muestra escritas en pantalla las credenciales
  demo (`Credenciales DEMO: admin@hidro.local / hidro-demo-2025`). Cualquiera que entre las lee.
- La clave de 12 caracteres o más y las 2 claves generadas no son un capricho: el arreglo que
  estoy construyendo hace que el sistema **no arranque** en producción si alguna es más corta o
  es la de demo. Si ya cargaste una clave admin más corta, cambiala ahora.
- `PUBLIC_APP_URL` vacía = el QR de la máquina (el que se imprime y se pega) apunta a
  `localhost` y no le abre a nadie.
- 🔴 **NO agregues `SEED_DEMO=false`.** La guía vieja lo pedía y estaba mal: esa variable apaga
  también la creación de la máquina HIDRO-01 y de tu cuenta admin. Quedarías sin máquina y sin
  poder entrar.
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

### A2. Verificar que quedó bien

1. Avisame con este mensaje, copiado tal cual y completando lo que corresponda:
   > listo el redeploy · la clave admin tiene 12 caracteres o más: SÍ · las 2 claves las generé
   > con el comando de la guía: SÍ · el volumen es Volume Mount: SÍ

   Esas 3 cosas no las puedo ver desde afuera y deciden si el sitio levanta con el arreglo. Con
   tu mensaje corro los chequeos desde afuera (que `/health` responda y que el login
   `admin@hidro.local` / `hidro-demo-2025` **ya no entre**) y recién ahí subo el arreglo.
2. Entrá a `https://hidro-api.insolvadev.com/admin` con tu `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   nuevos.
3. Si después del redeploy el sitio no levanta y en **Logs** aparece `EACCES`, avisame (son
   permisos de la carpeta del volumen).
4. **Todavía no toques las patentes `AE100AA` y `AE200AA`.** Hoy el sistema las vuelve a crear en
   cada arranque. Apenas vea tu "listo el redeploy", verifico y subo el arreglo; ahí te aviso y
   hacés el paso A2b.

### A2b. Después de que te avise que subí el arreglo

1. Admin → **Patentes**: borrá `AE100AA` y `AE200AA`.
2. En el mismo formulario creá una patente de prueba: `AA000AA`, categoría socio, con un PIN de 4
   dígitos cualquiera que no le digas a nadie.
3. Apretá **Redeploy** en Coolify y esperá a que termine.
4. Volvé a Admin → Patentes y fijate:
   - `AA000AA` **sigue ahí** → el volumen guarda los datos. ✅
   - `AE100AA` y `AE200AA` **no volvieron** → el arreglo funciona. ✅
   - Si falta `AA000AA` o volvieron las demo, avisame.
5. Borrá `AA000AA`.

### A3. Chequear que el sistema ve la IP real del cliente (importante para no dejar gente sin poder pagar)

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

### A4. Correr la prueba de "pago que se recupera solo" (cierra la Fase 1 oficialmente)

Esto es la única validación que falta para dar la Fase 1 por cerrada del todo. Se hace **en tu
compu, local**, no en producción. Son ~15 minutos. Comandos ya armados, copiá y pegá en orden.

**Preparación (una sola vez):**
1. `npm run build` y después `npm run dev -w @hidro/api` (queda escuchando en
   `http://localhost:3020`).
2. Parate el servidor (Ctrl+C), en el archivo `.env` cambiá momentáneamente la línea
   `ADMIN_EMAIL` a cualquier otra cosa, ej. `ADMIN_EMAIL=otra@ejemplo.local`. Al arrancar se crea
   una cuenta extra con ese mail, pero la de siempre sigue existiendo y el sistema deja de
   tratarla como "la cuenta por defecto", así que puede probar el camino de éxito. Volvé a
   levantar el servidor.
3. Login (con el mail y clave de SIEMPRE, no el que pusiste en el paso anterior):
   ```
   curl -s -X POST http://localhost:3020/api/admin/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@hidro.local\",\"password\":\"hidro-demo-2025\"}"
   ```
   Copiá el valor de `token` de la respuesta — lo vas a necesitar en el paso 4.
4. Bajá el tiempo de espera de un pago pendiente a 60 segundos (por defecto son 10 minutos,
   mucho para probar):
   ```
   curl -s -X PATCH http://localhost:3020/api/admin/settings -H "Authorization: Bearer TOKEN_DEL_PASO_3" -H "Content-Type: application/json" -d "{\"paymentPendingTimeoutSeconds\": 60}"
   ```

**La prueba en sí:**
1. Crear una sesión de lavado de prueba:
   ```
   curl -s -X POST http://localhost:3020/api/public/machines/HIDRO-01/sessions -H "Content-Type: application/json" -d "{\"plate\":\"AE100AA\"}"
   ```
   Guardá `sessionId` y `payment.externalPaymentId` de la respuesta.
2. **No hagas nada más.** Esperá ~70 segundos (más que los 60s que configuraste arriba).
3. Consultá: `curl -s http://localhost:3020/api/public/sessions/SESSION_ID` → tiene que decir
   `"status":"PAYMENT_EXPIRED"` (el sistema la venció solo).
4. Ahora simulá que Mercado Pago aprobó tarde (como si el aviso se hubiera perdido y llegara
   después):
   ```
   curl -s -X POST http://localhost:3020/api/public/payments/EXTERNAL_PAYMENT_ID/simulate -H "Content-Type: application/json" -d "{\"action\":\"approve\"}"
   ```
5. Consultá de nuevo la sesión (mismo comando del paso 3) → tiene que decir
   `"status":"AUTHORIZED"`. **Si dice eso, la prueba salió bien: el pago tardío se recuperó
   solo, sin que nadie tuviera que hacer nada a mano.**
6. Volvé a poner `ADMIN_EMAIL` en `.env` a su valor original (`admin@hidro.local`) y reiniciá el
   servidor, para dejar todo como estaba.

**✅ Si el paso 5 dio `AUTHORIZED`:** marcá acá abajo que la Fase 1 quedó validada:
- [ ] Prueba de recuperación de pago corrida y con resultado `AUTHORIZED` en el paso 5.

Si algo no coincide con lo esperado en cualquier paso, avisame con el número de paso y lo que
viste en pantalla — no sigas adivinando.

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
