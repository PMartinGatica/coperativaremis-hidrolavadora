# Guía del "día de Mercado Pago real" (con Javi)

> Para Pablo. Escrita el 2026-09-22, la noche anterior. Es la sesión de `pendientes-manual.md`
> **C2b**. Seguila en orden: cada parte depende de la anterior.
>
> **Lo que vas a lograr mañana:** sacar los tres códigos de la cuenta de la cooperativa y
> **cobrar un peso de verdad**, de punta a punta, con la máquina simulada, en tu compu.
>
> 🔴 **Lo que NO vas a hacer mañana, y es a propósito: cargar las credenciales en producción.**
> Leé la Parte 0 antes de tentarte, porque si lo hacés te quedás con la web fuera de servicio.

---

## Parte 0 — Por qué producción NO se toca mañana (leer primero)

Tres cosas del sistema, encadenadas:

1. Con `PAYMENT_PROVIDER=mercadopago`, la API **se niega a arrancar** si `DEVICE_SIMULATOR=true`
   (ADR-048). Es una guarda puesta a propósito: es la única combinación que le cobra plata real a
   un cliente por una máquina que no existe.
2. Si apagás el simulador, no queda nadie mandando señales de vida: HIDRO-01 pasa a **OFFLINE**.
3. Con la máquina OFFLINE, `assertMachinePayable` rechaza cualquier intento de cobro
   ("Máquina temporalmente fuera de servicio"). Nadie puede pagar.

O sea: cargar Mercado Pago real en producción **hoy** deja la web mostrando "fuera de servicio"
hasta que el ESP32 esté instalado. No rompe nada ni se pierde plata, pero si Javi entra a mirar
justo ese día, ve el sistema muerto.

**En tu compu esa guarda no corre** (solo se aplica con `NODE_ENV=production`), así que ahí sí
podés tener el simulador andando + credenciales reales. Por eso la prueba va en local.

**Producción se pasa a Mercado Pago real recién en D1**, el día que se instala el ESP32, y los
tres códigos ya van a estar guardados de mañana.

---

## Parte 1 — Con Javi, 15 minutos (los tres códigos)

Javi entra con su clave (vos no la necesitás ni la anotás). Compartiendo pantalla, guialo:

1. Entrar a **mercadopago.com.ar** con la cuenta **de la cooperativa** (la que recibe la plata) y,
   en esa misma sesión, abrir
   [mercadopago.com.ar/developers/panel/app](https://www.mercadopago.com.ar/developers/panel/app).
   ⚠️ Misma pestaña, misma sesión: si entra con otra cuenta, los códigos salen de la cuenta
   equivocada y la plata cae en otro lado.
2. **Crear aplicación** → tipo **Pagos online** → **Checkout Pro**. Nombre: "Hidrolavadora".
3. Copiar de la solapa **Credenciales de producción**:
   - **Access Token** → 📋 código 1
   - **Public Key** → 📋 código 2
4. En la misma aplicación, ir a **Webhooks → Configurar notificaciones**:
   - URL: la que te dé ngrok en la Parte 2 (`https://loquesea.ngrok-free.app/api/webhooks/mercadopago`).
     Si querés adelantarte, levantá ngrok ANTES de la llamada y llevá la URL lista.
   - Evento: **Pagos** (solo ese).
   - Guardar → MP muestra la **firma secreta** → 📋 código 3. **Se muestra una sola vez.**
5. Guardá los tres en tu gestor de claves. **No los mandes por WhatsApp.**

> Si Javi elige la opción B (te pasa usuario y clave): hacés estos mismos 5 pasos vos, y cuando
> terminás le avisás que ya puede cambiar la contraseña. Los tres códigos siguen andando igual.

---

## Parte 2 — Vos solo: cobrar un peso de verdad

### 2.1 Bajar la tarifa para no gastar plata

Entrá a `/admin` → Máquinas → HIDRO-01 y poné la tarifa de **externo** en el monto más bajo que
te acepte Mercado Pago (probá con **$100**; si lo rechaza por monto mínimo, subilo). Anotá el
valor que tenía ($8.000) para restaurarlo al final.

### 2.2 Túnel

```powershell
ngrok http 3020
```

Si te lo rechaza, actualizá ngrok (`ngrok update`): hace falta 3.20+. La URL pública que te da es
la que va en el panel de MP (Parte 1, paso 4) y en `PUBLIC_API_URL`.

⚠️ **Cerrá el túnel cuando termines.** Mientras corre, tu máquina está expuesta a internet.

### 2.3 Cargar las credenciales

En **`apps/api/.env`** (⚠️ ese, NO el de la raíz del repo — hay dos y el código solo lee este;
cargarlas en el otro deja todo en modo DEMO en silencio):

```
PAYMENT_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=<código 1>
MERCADOPAGO_PUBLIC_KEY=<código 2>
MERCADOPAGO_WEBHOOK_SECRET=<código 3>
PUBLIC_API_URL=https://<lo-que-te-dio-ngrok>
PUBLIC_APP_URL=https://hidro-api.insolvadev.com
```

`PAYMENT_PROVIDER` ya existe con valor `demo`: cambiá esa línea, no dupliques.
`PUBLIC_APP_URL` tiene que ser un dominio público real: MP rechaza `localhost` en los `back_urls`.

**Reiniciá la API después de tocar el `.env`** (la config se lee una sola vez al arrancar).

### 2.4 Confirmar que son las credenciales de la cuenta correcta

```powershell
Invoke-RestMethod -Uri "https://api.mercadopago.com/users/me" -Headers @{ Authorization = "Bearer <código 1>" } | Select-Object nickname, email, site_id
```

Tiene que devolver la cuenta **real de la cooperativa**. Si el `nickname` empieza con `TESTUSER`,
son las credenciales de prueba viejas: pará y revisá.

### 2.5 El pago

Desde el celular, entrá a la máquina, poné una patente cualquiera y pagá **con plata real**
(tarjeta o dinero en cuenta). Son los $100.

### 2.6 Qué mirar — esto es la prueba, no que "funcione"

Abrí el inspector de ngrok: **http://127.0.0.1:4040**

- ✅ Tienen que aparecer **DOS** POST a `/api/webhooks/mercadopago` por ese pago.
- ✅ **Los dos con 200.** Uno va a decir `approved`, el otro `ignored_unverifiable_ipn`.
  🔴 **Si ves un 401, avisame:** es exactamente lo que arreglé el 2026-09-22 y significa que algo
  no quedó como esperaba.
- ✅ Mirá **el reloj**: la sesión tiene que pasar a autorizada **en segundos**. Si tarda ~120 s,
  no fue el webhook: fue el barrido de respaldo, y el webhook no está funcionando aunque el
  resultado final parezca bien. Esta trampa ya nos comió una prueba entera (ADR-051).
- ✅ Y que la máquina simulada haga el ciclo: pulsador → RELAY ON → 180 s → libre.

### 2.7 Al terminar

1. Restaurá la tarifa de externo a **$8.000**.
2. Cerrá ngrok.
3. Volvé `PAYMENT_PROVIDER=demo` en `apps/api/.env` y reiniciá (para no dejar la compu con
   credenciales reales activas).
4. Los tres códigos quedan guardados para D1.

---

## Parte 3 — Dos experimentos, 10 minutos, mientras tenés todo armado

Son dos preguntas que hoy no se pueden responder desde el escritorio y que mañana se responden
solas. **Hacelos después de que el pago haya salido bien**, no antes.

### 3.1 ¿Se puede borrar el soporte del aviso viejo?

En `apps/api/src/payments/mercadoPagoProvider.ts`, comentá la línea de `notification_url`
(`createPayment`, cerca de la línea 56), reiniciá y pagá de nuevo.

- Si **siguen llegando los dos** avisos → `notification_url` no era lo que disparaba el viejo.
- Si llega **solo el firmado** (el que dice `approved`) → 🎉 podemos **borrar** todo el soporte
  del aviso viejo en vez de mantenerlo. Avisame y lo saco.
- Si **no llega ninguno** → descomentá y volvé atrás: el panel manda el aviso por la preference.

### 3.2 ¿La ventana de 5 minutos rompe los reintentos?

Es el riesgo que quedó anotado en `ESTADO.md`. Con el túnel andando: **cortá la API** (Ctrl+C),
pagá, esperá ~6 minutos, y volvé a levantarla.

- Mirá en el inspector qué pasa con los reintentos que manda MP.
- Si llegan y les damos **401 "timestamp fuera de ventana"** → el problema es real, hay que
  ampliar la ventana, y se pierde un pago real cada vez que la API tenga un hipo.
- Si llegan con firma nueva y dan 200 → no hay problema y lo tachamos.

---

## Checklist rápido (para tener al lado)

- [ ] Los tres códigos, de la cuenta **de la cooperativa**, guardados en el gestor de claves
- [ ] `users/me` NO devuelve `TESTUSER`
- [ ] Tarifa bajada a $100 (y anotado que era $8.000)
- [ ] Pago real hecho
- [ ] **Dos POST con 200** en el inspector de ngrok
- [ ] Autorización en **segundos**, no a los 120 s
- [ ] Experimento de `notification_url` corrido
- [ ] Experimento de la ventana de 5 minutos corrido
- [ ] Tarifa restaurada a $8.000 · ngrok cerrado · `.env` de vuelta en `demo`
- [ ] **Producción NO tocada** (sigue en DEMO hasta D1)
