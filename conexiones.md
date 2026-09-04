# Conexiones — MUNDO: HIDRO SELF-SERVICE

> **PASO 2 de la receta — Conexiones.** Cómo este Mundo habla con el mundo exterior.
> Regla: si una herramienta tiene API, se usa la API. Credenciales nunca en claro: van en `.env`
> (no commiteado) y se documentan en `.env.example` (que vive en la raíz del **repo de código**,
> `Deepseek-harnes/hidro-self-service/.env.example`).

## APIs / servicios
| Servicio | Para qué | Auth (env var) | Endpoint base | Notas |
|---|---|---|---|---|
| **Mercado Pago** | cobrar el lavado (Checkout Pro: se crea una *preference*, el cliente paga, MP avisa por webhook) | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET` | SDK oficial `mercadopago` v2 | Hoy `PAYMENT_PROVIDER=demo` (sin credenciales). **La seguridad no depende del webhook: siempre se re-consulta el pago al API de MP.** SPIKE con credenciales de prueba pendiente. |
| **ESP32 (dispositivo)** | heartbeat, buscar autorización, avisar pulsador/fin/interrupción | secret **por dispositivo** (AES-256-GCM en base, clave derivada de `DEVICE_AUTH_SECRET`) | `POST/GET /api/device/*` sobre HTTPS | **El ESP32 siempre inicia la conexión; el backend nunca lo llama.** HMAC-SHA256 por request con ventana de ±5 min. Rotar el secret de HIDRO-01 no afecta a HIDRO-02. |
| **Postgres** | datos | `DATABASE_URL` | — | Si está vacío corre **PGlite** (Postgres 16 embebido en el proceso, persiste en `DB_FILE`). Eso es DEMO: en producción va un Postgres real. |

## Flujos n8n
Ninguno. Este Mundo no usa n8n.

## Bases de datos
- Motor: **Postgres**. Conexión vía `DATABASE_URL`; si falta, PGlite embebido en `DB_FILE`.
- Esquema: `apps/api/src/db/schema.ts` (drizzle). Migraciones: `apps/api/drizzle/*.sql`, aplicadas
  por un runner propio con tabla `hidro_migrations`.
- ⚠️ **Aún sin decidir dónde vive la base en producción.** Aplica **R8** del Universo: lo que ve un
  cliente va a **Supabase Cloud**, un proyecto por Mundo; el self-hosted de `pablo-server` es para
  pruebas internas. Acá el cliente final es el remisero que escanea el QR en la calle, así que la
  lectura por defecto de R8 es **Cloud**. Falta confirmarlo con Pablo.

## Sin API → Playwright
No aplica. La verificación visual se hace con `scripts/browser-e2e.mjs` (Edge headless) contra el
propio front, no contra herramientas de terceros.

## Hardware (conexión física — este Mundo es el único que la tiene)
| Componente | Rol | Config |
|---|---|---|
| ESP32 | cerebro local: timer de 180 s, fail-safe, HMAC | `firmware/esp32/src/app_config.h` |
| Relay 5 V | corta/habilita la bobina del contactor | `RELAY_PIN 26`, `RELAY_ACTIVE_LEVEL` **PENDIENTE de validar en la puesta en marcha** |
| Contactor | pasa la potencia al motor | modelo/voltaje de bobina **PENDIENTE (dato del cliente)** |
| Pulsador NA | lo aprieta el cliente para arrancar el ciclo | `BUTTON_PIN 27` a GND (INPUT_PULLUP) |
| LED verde | avisa "máquina habilitada" (fijo) / "lavando" (parpadeo) | `LED_GREEN_PIN 25`, `LED_RED_PIN 33` |
| Botón del mecánico | bypass manual que ya existe (llave de la caja) | **NO pasa por el sistema. Se queda como está.** |

> `[STOP-HUMANO]`: el primer encendido del relay con el motor conectado se hace con Pablo presente
> y con el timer eléctrico viejo todavía instalado como red.

## .env.example (vive en el repo de código — resumen de lo importante)
```
API_PORT=3020
PUBLIC_APP_URL=            # URL del FRONT (QR, CORS, back_urls de MP)
# FALTA y hace falta: PUBLIC_API_URL para el notification_url del webhook de MP
DATABASE_URL=              # vacío => PGlite embebido (DEMO)
PAYMENT_PROVIDER=demo      # demo | mercadopago
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=
MERCADOPAGO_WEBHOOK_SECRET=
JWT_SECRET=                # OBLIGATORIO en producción, aleatorio y largo
DEVICE_AUTH_SECRET=        # deriva la clave AES que cifra los secrets de dispositivo
ADMIN_EMAIL= / ADMIN_PASSWORD=
DEVICE_SIMULATOR=true      # se fuerza a false en producción
TEST_SPEED_FACTOR=10       # se fuerza a 1 en producción
DAILY_WASH_LIMIT=2
```
> Nunca poner secretos reales en `.env.example` ni en el repo. Las claves de Mercado Pago van en el
> `.env` del servidor (o en las Environment Variables de Coolify si se despliega ahí), **jamás en el
> front**.
