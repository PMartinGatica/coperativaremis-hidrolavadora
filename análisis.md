# Hidrolavadora Autoservicio — Análisis Técnico
### Cooperativa de Remises · DEVXIA

Documento de trabajo interno. Consolida el análisis de arquitectura, la revisión del
repositorio de referencia, los repositorios que sí vamos a usar, la estimación de
horas y los datos que todavía faltan. Reemplaza las notas sueltas originales.

---

## 0. Estado del proyecto

| | |
|---|---|
| Cliente | Cooperativa de Remises, **Ushuaia** |
| Presupuesto aprobado | **USD 2.300** — 3 hitos: 40% anticipo, 30% prototipo, 30% puesta en marcha |
| Plazo | ~1 mes. El bloque 00 (spike de Mercado Pago) arranca esta semana |
| Materiales eléctricos | ~$40.000–55.000 ARS, a cargo de Lucho |
| Mercado Pago | Todavía no hay cuenta productiva de la cooperativa. La está gestionando **Pablo** |
| Hardware de control | **ESP32 vs Raspberry Pi — sin definir todavía.** Ver sección 7 |
| WiFi en el sitio | **Ya hay WiFi en el lugar.** No hace falta router 4G (pregunta ya resuelta) |
| Parte eléctrica de Lucho | **Ya armada:** timer, contactores y relés existentes están montados y funcionando. Falta únicamente conectar el ESP32 al contactor que activa la hidro. No hay preguntas pendientes de relevamiento eléctrico |

---

## 1. Qué pide el cliente

Una hidrolavadora autoservicio: el cliente escanea un QR pegado en la máquina, paga
desde el celular, y si el pago se aprueba la máquina se habilita por **3 minutos**.
Sin fichas, sin monedas, sin nadie atendiendo.

**Orden de instalación confirmado:** arranca la hidro de **10 HP**. Si la cooperativa
lo pide más adelante, se suma una segunda de **5 HP**. El sistema se diseña
multi-máquina desde el día uno para que agregar la segunda sea configuración, no otro
desarrollo — independientemente de cuál sea HIDRO-01 y cuál HIDRO-02.

---

## 2. Flujo completo

```
CLIENTE                    escanea QR pegado en la hidro
   ↓
WEB MÓVIL                  elige servicio, ve el precio, paga
   ↓
MERCADO PAGO                procesa el pago (QR con saldo, 0,6% de comisión)
   ↓
WEBHOOK (Node/Express)      recibe la notificación de pago
   ↓
BACKEND                     valida el pago → genera una AUTORIZACIÓN temporal
   ↓ (WiFi / Internet)
ESP32                       recibe la autorización → prende LED verde
   ↓
PULSADOR FÍSICO              el cliente aprieta
   ↓
ESP32                       verifica que la autorización sigue vigente → activa el relay
   ↓
RELAY → CONTACTOR            cierra la potencia del motor
   ↓
HIDROLAVADORA                arranca — corre 180 segundos
   ↓
ESP32                       corta el relay al cumplirse el tiempo
```

### Decisión clave: el ESP32 nunca habla directo con Mercado Pago

Meter las credenciales de MP y la lógica de pago dentro del firmware es innecesario y
riesgoso. El ESP32 solo conoce **autorizaciones**, no pagos. Todo lo sensible
—credenciales, webhook, validación de firma— vive en el backend.

### El pago no enciende la hidro directamente

El backend no le dice al ESP32 "prendé la hidro". Genera una **autorización con
vencimiento**:

```
payment_id : 123456
machine_id : HIDRO-01
status     : AUTHORIZED
expires_at : 22:38:00
duration   : 180 segundos
```

El ESP32 recibe `HIDRO-01 → AUTORIZADA`, prende el LED verde, y **recién ahí** el
pulsador tiene efecto. Esto es lo que evita:

- pagar una vez y usar la máquina dos veces;
- apretar el botón antes de pagar;
- reutilizar una autorización vieja;
- que un pago quede habilitado para siempre;
- que un cliente pague y otro use la máquina.

### El temporizador vive en el ESP32, no en el backend

Una vez que el ESP32 recibió la autorización y arrancó el ciclo, **no necesita
Internet para completarlo**. Los 180 segundos los cuenta el propio equipo. Si se cae
el WiFi a mitad de un lavado, el lavado igual termina y corta a tiempo.

### Multi-máquina desde el día uno

Aunque hoy se instale una sola hidro, cada QR identifica su máquina:

```
/machine/HIDRO-01   →  ESP32-01  →  10 HP   (se instala primero)
/machine/HIDRO-02   →  ESP32-02  →  5 HP    (si la piden más adelante)
```

El mismo backend controla todas. Diseñarlo así ahora cuesta poco horas; hacerlo
después obliga a rehacer medio sistema.

---

## 3. Máquina de estados

```
IDLE → PAYMENT_PENDING → AUTHORIZED → RUNNING → FINISHED
```

Más los estados de error que hay que contemplar explícitamente:

- `PAYMENT_FAILED`
- `PAYMENT_EXPIRED`
- `MACHINE_OFFLINE`
- `EMERGENCY_STOP`

---

## 4. Arquitectura elegida (MVP, una hidro)

| Capa | Elección |
|---|---|
| Frontend | React/Vite, mobile-first, muy liviano |
| Backend | Node.js + Express + PostgreSQL |
| Pagos | Mercado Pago — QR dinámico con saldo (0,6% de comisión) + webhook |
| IoT | HTTP/REST por ahora. MQTT si en el futuro son muchas máquinas |

No hace falta meter Kubernetes ni un broker complejo para prender una hidrolavadora.
Con HTTP/WebSocket simple alcanza para el volumen de una sola máquina.

---

## 5. El repositorio de referencia: veredicto

**[github.com/TrieuHzang/iot-laundry-self-service-system](https://github.com/TrieuHzang/iot-laundry-self-service-system)**
— lavandería autoservicio vietnamita: QR → pago (VietQR/payOS) → Blynk (nube IoT) →
ESP32 + STM32 → relay → máquina. Se analizó a fondo contra la API de GitHub, no solo
contra el README. **No sirve como base de código.**

| Se esperaba encontrar | Qué hay realmente |
|---|---|
| El backend con la lógica de pago | **No existe.** La carpeta `laundry-iot-backend` es un enlace roto a un submódulo que nunca se publicó (sin `.gitmodules`, 404). Al clonar queda vacía. |
| Firmware que controle el relay | El ESP32 **no maneja ningún relay.** Es solo un puente Blynk↔UART; los relays los maneja un segundo microcontrolador (STM32) que no vamos a usar. |
| Modelo de autorización | No hay. El pago dispara un comando directo (`WASH`/`DRY`) sin vencimiento ni control de uso — exactamente el diseño que decidimos evitar en la sección 2. |
| Manejo seguro de credenciales | El SSID, la password del WiFi y el token de Blynk están escritos en el código y publicados. |
| Web mobile-first | Layout de escritorio a 3 columnas, máquinas hardcodeadas en el componente. El 100% de nuestros usuarios entra desde el celular. |
| Arquitectura de producción | El backend corría en una PC local expuesta por un túnel (`start-laundry.bat` → `node tunnel.js`). |
| Salud del repo | 1 estrella, 0 forks, creado 16/07/2026, commits tipo "Add files via upload" sin historial real. Licencia MIT: legalmente reutilizable, pero no hay mucho que reutilizar. |

**Lo que sí aporta**, y se aprovecha:

- Confirma que el patrón QR → pago → nube → relay funciona en la vida real.
- El vocabulario de estados (`READY` / `BUSY` / `FINISHED` / `FREE` / `ERROR` /
  `TIME:`) es un buen punto de partida conceptual.
- El **"speed factor"**: un potenciómetro que comprime los ciclos durante testing, para
  poder probar los 180 segundos cientos de veces sin esperar horas reales. Se copia la
  idea.
- El polling del frontend como respaldo del webhook, por si Mercado Pago se demora. Se
  mantiene.
- Los diagramas y fotos sirven para la presentación (licencia MIT, con atribución).

**Conclusión:** ahorra entre 4 y 6 horas de análisis. **No ahorra una sola hora de
backend, de Mercado Pago ni de firmware.** El presupuesto no baja por tenerlo.

---

## 6. Repositorios que sí vamos a usar

Búsqueda dirigida en GitHub, verificando el árbol de archivos de cada uno antes de
listarlo.

### Tier 1 — Se adoptan directamente

**[mercadopago/mercadopago-claude-marketplace](https://github.com/mercadopago/mercadopago-claude-marketplace)**
— Apache-2.0, v4.3.1, activo. Plugin **oficial de Mercado Pago para Claude Code**, el
entorno donde estamos desarrollando. Trae:
- Skill `mp-webhooks`: receptor con **validación HMAC-SHA256** (`x-signature`).
- Skill `mp-test-setup`: crea usuarios de prueba **con saldo cargado** — necesario para
  probar el cobro con saldo MP al 0,6%.
- Contratos deterministas para **QR y Point**, y `/mp-review qr` audita específicamente
  una integración QR.
- Hook que bloquea credenciales hardcodeadas — el error exacto del repo de la sección 5.
- Argentina soportada. `/mp-test-cards ar` da tarjetas de prueba.

Instalación:
```
/plugin marketplace add https://github.com/mercadopago/mercadopago-claude-marketplace.git
/plugin install mercadopago@mercadopago-claude-marketplace
```

**[mercadopago/sdk-nodejs](https://github.com/mercadopago/sdk-nodejs)** — 481★,
TypeScript, oficial. No es referencia: es una dependencia directa del backend.

**[mercadopago/sdk-js](https://github.com/mercadopago/sdk-js)** — 112★, TypeScript,
oficial, push de hoy. Su equivalente para el frontend: genera el QR y tokeniza los
datos de pago del lado del cliente sin exponer credenciales.

### Tier 2 — Referencia de alto valor

**[goncy/next-mercadopago](https://github.com/goncy/next-mercadopago)** — 685★, en
español, 5 integraciones (checkout-pro, checkout-api, bricks, suscripciones,
marketplace). Lo más valioso es la carpeta `configuracion/`: crear la aplicación,
cuentas de prueba, credenciales, **exponer el puerto local** y **configurar el
webhook**, paso a paso y con capturas. Resuelve el trámite que más horas muertas genera.

> **Salvedad verificada leyendo el código:** ninguno de sus webhooks valida
> `x-signature`, pese a lo que sugiere el README. Usan el patrón de re-consultar el pago
> contra la API de MP (defensa legítima, pero no es firma). Nuestra integración usa
> **las dos cosas**: la validación de firma del plugin oficial (Tier 1) **más** el
> patrón de reconsulta como respaldo.

**[nodestark/mdb-esp32-cashless](https://github.com/nodestark/mdb-esp32-cashless)** —
164★, activo. ESP32 cashless para vending con MQTT y telemetría. Referencia mantenida
más cercana a "pago → habilitar máquina física" con ESP32+MQTT hecha en serio. Sirve
para diseñar el canal backend↔ESP32 y el ciclo de crédito/consumo.

### Firmware ESP32 — candidatos concretos para el bloque 05

Verificados contra la API de GitHub (estrellas, licencia y último push), no solo por
nombre. El objetivo es no reescribir desde cero el servidor HTTP y el control de relay
con timer — hay proyectos maduros que ya resuelven eso.

| Repositorio | Estado verificado | Para qué sirve |
|---|---|---|
| [ESP32Async/ESPAsyncWebServer](https://github.com/ESP32Async/ESPAsyncWebServer) | 648★ · activo (push de hoy) | Servidor web asíncrono para ESP32. Base para el endpoint HTTP que recibe la autorización del backend y controla el relay. **Usar este, no el original.** |
| [rpavlyuk/ESPRelayBoard](https://github.com/rpavlyuk/ESPRelayBoard) | 6★ · muy activo (push hace 3 semanas) · GPL-3.0 | Firmware completo y customizable de relay board: WiFi + Web API + MQTT + integración Home Assistant. El más completo para nuestro caso — vale la pena leerlo entero antes de escribir el firmware propio. |
| [xiv3r/esp32-automatic-timer-switch](https://github.com/xiv3r/esp32-automatic-timer-switch) | 27★ · muy activo (push de ayer) · GPL-3.0 | Timer con precisión NTP/RTC para 1-16 canales de relay. Referencia directa para la lógica de los 180 segundos. |
| [G6EJD/ESP32-Multi-Channel-Relay-Controller](https://github.com/G6EJD/ESP32-Multi-Channel-Relay-Controller) | 69★ · sin actividad desde dic. 2024 · sin licencia | Control de 4 relays con Web UI y timers programables. Útil como referencia de la interfaz web, no para clonar (sin licencia explícita = no reutilizable sin permiso). |
| [pvtex/esp32-rfid](https://github.com/pvtex/esp32-rfid) | 40★ · MIT | Control de acceso con ESP32 + lector Wiegand. No para el MVP, pero queda anotado si más adelante la cooperativa pide sumar una tarjeta RFID además del QR. |
| [DrA1ex/esp_relay](https://github.com/DrA1ex/esp_relay) | 0★ · sin licencia | Firmware liviano de relay. Muy poca adopción y sin licencia — solo para ojear el código, no para depender de él. |
| [Alextros00/ESP32-MQTT-Relay-Control](https://github.com/Alextros00/ESP32-MQTT-Relay-Control) | 2★ · **sin actividad desde 2021** | Relay por MQTT. Desactualizado — si se termina eligiendo MQTT (bloque 06), `rpavlyuk/ESPRelayBoard` de arriba ya lo cubre mejor y está mantenido. |
| [rafaelbds04/esp-rtc-timer](https://github.com/rafaelbds04/esp-rtc-timer) | 4★ · sin actividad desde 2021 · ESP8266, no ESP32 | Timer digital con interfaz web. Concepto similar al de los 180 s, pero desactualizado y en el chip equivocado. Solo como inspiración de UI. |

**Lectura de la tabla:** para arrancar el bloque 05, la base es
`ESP32Async/ESPAsyncWebServer` (servidor HTTP) + la lógica de
`rpavlyuk/ESPRelayBoard` (estructura del firmware de relay) + el manejo de tiempo de
`xiv3r/esp32-automatic-timer-switch`. Los tres están activos y verificados. El resto
de la lista es referencia de segunda línea o está desactualizada — no construir sobre
ellos, solo consultarlos si hace falta un ejemplo puntual.

> **Sobre `me-no-dev/ESPAsyncWebServer`:** es el proyecto original y el más conocido
> (4046★), pero está **archivado desde enero de 2026** — ya no recibe actualizaciones
> ni parches de seguridad. `ESP32Async/ESPAsyncWebServer` es el fork de la comunidad
> que continuó el mantenimiento y es el que hay que usar.

### Tier 3 — Evaluar con timebox (2 h, en el bloque de arquitectura)

**[espressif/esp-rainmaker](https://github.com/espressif/esp-rainmaker)** — 630★,
oficial de Espressif. Da resuelto: provisioning WiFi por BLE/SoftAP, OTA, autenticación
por dispositivo, MQTT sobre TLS con certificado por equipo. En contra: mete dependencia
de una nube de terceros, y la autorización con expiración (sección 2) hay que
construirla encima igual. **Si no cierra en 2 h de evaluación, se descarta.**

`esphome/esphome` — evaluado y **descartado**: OTA y reconexión gratis, pero atado a
Home Assistant; la lógica de autorización con estado persistente queda forzada. No es
apto para un equipo que cobra plata sin supervisión.

### Referencias de dominio: "QR → pago → habilitar máquina"

La combinación exacta no existe publicada en producción con licencia abierta. Los
proyectos que la intentan son de facultad y 1-2 estrellas (`Shivani-raj1105/SMART_WEIGH`,
balanza pay-per-use por QR; `noriutsugi/Swirl`, lavarropas con ESP32 + Razorpay):
confirman que el patrón es viable, no sirven para construir encima. Pero cada mitad del
problema está resuelta a nivel producción en dominios vecinos:

**A. Carga de autos eléctricos (OCPP) — el mejor hallazgo.** Es la versión
estandarizada de nuestro problema: autorizar un usuario → energizar una toma física →
sesión con duración → cortar → facturar. Ya resolvió toda la lista de pruebas de abuso
de la sección 9: caída de conexión, reboot en medio de la sesión, autorización
duplicada, operación offline.

- **[matth-x/MicroOcpp](https://github.com/matth-x/MicroOcpp)** — 536★, C/C++, **corre
  en ESP32** (ejemplos ESP-IDF, Arduino, ESP-TLS), benchmarks medidos sobre ESP32
  (121 KB flash, 12 KB heap en idle). Usado por OpenEVSE, compatible con 15+ centrales
  comerciales.
- Lado servidor, solo como lectura de referencia:
  [mobilityhouse/ocpp](https://github.com/mobilityhouse/ocpp) (1038★, Python),
  [lorenzodonini/ocpp-go](https://github.com/lorenzodonini/ocpp-go) (369★),
  [dallmann-consulting/OCPP.Core](https://github.com/dallmann-consulting/OCPP.Core) (305★).

> **No adoptamos OCPP como protocolo** — sería el Kubernetes-para-prender-una-hidro que
> queremos evitar. Se copia el **diseño**: Authorize → StartTransaction →
> StopTransaction, y sobre todo la persistencia de la sesión a través de un reboot. Es
> la mejor referencia para la parte más difícil del firmware.

**B. Talleres comunitarios — lo más parecido, y en producción hace años.**
**[membermatters/MemberMatters](https://github.com/membermatters/MemberMatters)** —
91★, Python, MIT, en producción en varios makerspaces desde hace más de 5 años. Portal
de membresía + pagos + control de acceso: verifica que el socio esté al día y recién
ahí activa el relé. Sus salidas documentadas son literalmente "contactors for tool
interlocks" y "vend relays".
Firmware: [membermatters/BeepBeep](https://github.com/membermatters/BeepBeep)
(MicroPython, MIT, beta, 3★) — referencia de diseño, no base para clonar.

**C. Vending.** [nodestark/mdb-esp32-cashless](https://github.com/nodestark/mdb-esp32-cashless)
(ya listado en Tier 2) y [temoto/vender](https://github.com/temoto/vender) (90★, Go,
firmware de controlador de vending).

**D. Bicicletas compartidas — la UX más parecida.**
[cyklokoalicia/OpenSourceBikeShare](https://github.com/cyklokoalicia/OpenSourceBikeShare)
— escaneás el QR pegado en la bici, el backend devuelve un código de un solo uso que la
desbloquea. Es exactamente nuestros pasos 1 y 2. PHP/Laravel: se mira el modelo de
autorización, no el código.

### Qué significa esto para el presupuesto

Ninguna de estas referencias tiene Mercado Pago: la capa de cobro argentina es
íntegramente nuestra, y es el bloque más caro y de mayor incertidumbre. Lo que estas
referencias reducen no son horas, es **riesgo** — sobre todo el de la sesión que
sobrevive a un reinicio (bloque 5 de la tabla de horas). El ahorro real de horas
—4 a 6 h, solo por el plugin oficial de MP y la guía de Goncy— se reinvierte en testing.

---

## 7. Hardware

### Estado actual — actualizado

La parte eléctrica **ya está resuelta por Lucho**: timer, contactores y relés están
montados y funcionando. Esto cambia el alcance de lo pendiente respecto de la versión
anterior de este documento — ya no es un relevamiento desde cero, es una integración
sobre un tablero que ya opera.

**Ya confirmado:**
- Hay WiFi en el lugar. No hace falta router 4G.
- El circuito de mando (timer → contactor → hidro) está armado y en uso.

**Todavía sin definir:**
- **ESP32 o Raspberry Pi** para el control. Ver recomendación abajo.
- Punto exacto de conexión: dónde entra la señal del relay en el circuito de mando
  existente (en paralelo al timer, reemplazando su salida, o en la bobina del
  contactor directamente).
- Marca/modelo del contactor y del timer instalados — necesario para confirmar la
  tensión de la bobina (12 V / 24 V / 220 V CA) y que sea compatible con la salida del
  relay, y para dimensionar el supresor RC.
- Corriente nominal del motor de 10 HP (arranca primero) y, más adelante, de la de 5 HP.
- **Una foto del tablero tal como está hoy** — sigue siendo el dato más útil: permite
  diseñar la integración sobre lo que ya existe en vez de suponer.

### ESP32 o Raspberry Pi — recomendación

**ESP32.** Para esta tarea —WiFi, un relay, un pulsador, un LED, un timer de 180 s—
una Raspberry Pi es más capacidad de la que hace falta: sistema operativo completo,
tarjeta SD como punto de falla, arranque de varios segundos, y varias veces el costo y
el consumo de un ESP32. Es el mismo error de fondo que evitamos al no meter MQTT ni
Kubernetes para prender una hidrolavadora.

El ESP32 además es el hardware que usan **todos** los repositorios de referencia de la
sección 6 —MicroOcpp, MemberMatters/BeepBeep, los firmwares de relay de más abajo—, así
que mantiene la compatibilidad con todo lo investigado. Una Raspberry Pi se
justificaría solo si más adelante se necesita cámara, una pantalla compleja, o lógica
pesada corriendo localmente — nada de eso está en el alcance actual.

### Sobre las dos hidros (10 HP primero, 5 HP después)

Para el sistema de control no importa demasiado la potencia mientras el ESP32 no
maneje el motor directamente:

```
ESP32 → relay → contactor → motor
```

El ESP32 manda una señal de baja potencia; el contactor conecta/desconecta la potencia
real. Lucho tiene que dimensionar el contactor según tensión, corriente nominal y tipo
de motor — no comprar "un contactor para 10 HP" sin más — y considerar el arranque.

### El timer existente: no se saca todavía

Si hoy el circuito es `Timer → Contactor → Hidro` y el timer solo hace "activar,
mantener encendido X minutos, apagar", el ESP32 puede reemplazar esa función. Pero
**se mantiene en serie como respaldo durante todo el prototipo**, hasta comprobar que
el sistema nuevo:
- corta exactamente a los 180 s;
- se recupera correctamente después de un reinicio;
- maneja la pérdida de WiFi;
- no genera activaciones accidentales;
- funciona bien después de muchas operaciones.

Y antes de retirarlo definitivamente hay que verificar que no cumpla además alguna
función de seguridad o enclavamiento.

### Hardware que falta en la lista original

La lista de materiales original (~$40-55k, sin mano de obra) está incompleta para
este ambiente:

- **Gabinete estanco IP65** para el ESP32 — es una hidrolavadora, hay agua a presión.
- **Pulsador metálico IP67**, no un pulsador común.
- **Supresor RC en la bobina del contactor** — el arranque de un motor de 10 HP genera
  transitorios capaces de resetear un ESP32. El punto que más horas de campo cuesta si
  se descubre tarde.
- **Fusible/térmica del circuito de mando**, separada de la potencia.
- **Cartel con el QR laminado para intemperie.**
- **Router 4G + SIM**, si no hay WiFi en el lugar.
- **UPS chica para el ESP32** (opcional) — evita que un microcorte reinicie en medio de
  un ciclo ya pagado.

No se ponen precios en pesos: los cotiza Lucho con valores del día.

---

## 8. Estimación de horas

Corrige la estimación original de 68 h: suma el spike de validación de MP, el panel
de administración (estaba en el alcance pero sin horas asignadas) y firmware real (el
repo de referencia no aporta nada ahí).

| # | Bloque | Horas |
|---|---|---|
| 00 | **Spike Mercado Pago QR dinámico** — validar UX de un solo celular en sandbox, con el plugin oficial y `mp-test-setup`. Es una compuerta: nada se construye encima hasta que esté resuelto | 6 |
| 01 | Análisis, arquitectura y protocolo ESP32↔backend (incluye timebox de 2 h para evaluar ESP-RainMaker) | 8 |
| 02 | Backend Node/Express + PostgreSQL (máquinas, sesiones, autorizaciones, logs) | 12 |
| 03 | Integración Mercado Pago (QR, webhook, validación de firma, idempotencia, conciliación) | 10 |
| 04 | Frontend React mobile-first (`/machine/:id`, estados, timer) | 7 |
| 05 | Firmware ESP32 (WiFi + reconexión, auth de dispositivo, LED, pulsador, relay, timer 180 s, NVS, watchdog, fail-safe) | 10 |
| 06 | Canal backend↔ESP32 (MQTT/TLS) + heartbeat y detección de offline | 6 |
| 07 | Panel de administración mínimo (máquinas, sesiones, stop de emergencia, logs) | 6 |
| 08 | Testing y pruebas de abuso (matriz completa, sección 9) | 8 |
| 09 | Deploy e infraestructura (hosting, DB, dominio, SSL, broker, monitoreo) | 4 |
| 10 | Puesta en marcha en sitio + generación de QR + documentación | 6 |
| | **Total real** | **83 h** |

**Se cotizan 80 h.** La diferencia se absorbe en el precio cerrado, no se factura aparte.

Para la segunda hidrolavadora: **+8 a 15 h** aproximadamente (2do ESP32, 2da caja MP,
2do QR, testing y puesta en marcha) — no se duplica el desarrollo porque el sistema ya
es multi-máquina desde el bloque 02.

---

## 9. Matriz de pruebas de abuso

El bloque 08 no se da por cerrado hasta que estos casos pasen:

| Caso | Comportamiento esperado |
|---|---|
| Pago aprobado | Autoriza, enciende la luz verde |
| Pago rechazado | No autoriza, mensaje claro |
| Pago pendiente | Espera sin autorizar |
| Webhook duplicado | Una sola autorización |
| Webhook inválido o sin firma | Se descarta y se registra |
| Aprieta el pulsador sin pagar | No pasa nada |
| Doble pulsación | Un solo ciclo |
| Aprieta con autorización vencida | No arranca |
| Se cae Internet antes de arrancar | Queda pendiente, no cobra de más |
| Se cae Internet durante el ciclo | Completa los 180 s igual (timer vive en el ESP32) |
| El ESP32 se reinicia durante el ciclo | Reanuda si el reboot fue <30 s, si no corta y marca la sesión como interrumpida |
| Corte de energía durante el ciclo | Relay apagado al volver; sesión marcada |
| Máquina fuera de línea | La web lo informa antes de cobrar |
| Dos clientes pagan a la vez | Uno arranca, al otro se le devuelve o se le ofrece otra máquina |
| Paga la máquina 1 y aprieta la 2 | La 2 no arranca |

**Pendiente de definir con la cooperativa:** qué pasa con el dinero de una sesión
interrumpida por corte de luz — ¿reintegro o crédito para el próximo lavado?

---

## 10. Presupuesto (resumen)

El detalle completo con desglose, forma de pago y aclaraciones está en los archivos
`presupuesto-hidrolavadora.html` (versión simple, en pesos) y
`presupuesto-hidrolavadora-completo.html` (versión técnica, en dólares) de esta misma
carpeta. Acá solo el resumen para que el análisis quede autocontenido.

| Concepto | Monto |
|---|---|
| Desarrollo DEVXIA — HIDRO-01 (80 h × USD 25 + 15% de gestión/contingencia) | **USD 2.300** |
| Forma de pago | 40% anticipo · 30% prototipo de laboratorio aprobado · 30% puesta en marcha |
| HIDRO-02 (adicional, precio en firme 12 meses) | USD 350 |
| Infraestructura mensual (hosting siempre encendido, DB, dominio, monitoreo) | ~USD 10-25/mes, a cargo de la cooperativa |
| Garantía | 90 días sin costo |
| Mantenimiento (desde el mes 4) | USD 45/mes |

### Comisiones de Mercado Pago (costo operativo de la cooperativa, no de DEVXIA)

| Medio de cobro | Comisión |
|---|---|
| QR con saldo de Mercado Pago (la opción integrada) | **0,6%** |
| QR con tarjeta de débito | 0,6 – 1,2% |
| QR con tarjeta de crédito | 2,99 – 4,49% |
| Checkout Pro, acreditación inmediata (alternativa más simple de integrar) | 6,39% + IVA (≈7,7%) |

Elegir QR con saldo en vez de Checkout Pro es la decisión más rentable de todo el
proyecto: la diferencia entre perder 0,6% o 7,7% de cada lavado. El riesgo asociado
—que el QR dinámico no ande bien en la pantalla del propio celular del cliente— es
justamente lo que valida el bloque 00.

### Titularidad de las cuentas

Mercado Pago, dominio, hosting y router/SIM van a nombre de la **cooperativa**. DEVXIA
cobra desarrollo y mantenimiento; no necesita ser dueña de los activos del cliente.

---

## 11. Próximos pasos

Plazo total ~1 mes. Esto es lo que falta cerrar, en orden:

1. **Definir ESP32 vs Raspberry Pi** (sección 7) — bloquea el bloque 01 y la compra de
   Lucho. Recomendación ya en el documento: ESP32.
2. **Pablo** cierra la cuenta productiva de Mercado Pago de la cooperativa — bloquea el
   bloque 00, que ya debería estar arrancando esta semana.
3. Instalar el plugin oficial de Mercado Pago (sección 6, Tier 1) — condiciona cómo se
   escribe el bloque 00 y el bloque 03.
4. Ejecutar el bloque 00 (spike de QR dinámico) antes de escribir una sola línea de más
   del backend o el firmware.
5. **Lucho** manda la foto del tablero actual y confirma el punto exacto de conexión, la
   marca/modelo del contactor y timer instalados, y la corriente nominal del motor de
   10 HP (sección 7) — su parte eléctrica ya está armada, esto es solo para diseñar la
   integración del ESP32 sobre lo existente.
6. La cooperativa define el precio del lavado de 3 minutos y qué hacer con una sesión
   interrumpida por corte de luz.
7. Con eso cerrado: arrancar el bloque 01 (arquitectura y protocolo — la elección de
   chip ya viene resuelta del paso 1, así que el timebox de esas 8 h se usa entero para
   el protocolo y para evaluar ESP-RainMaker, sección 6 Tier 3) y avanzar en orden por
   la tabla de la sección 8, usando los repositorios de firmware ya identificados en la
   sección 6.
