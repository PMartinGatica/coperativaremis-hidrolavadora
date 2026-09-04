# HIDRO SELF-SERVICE

Sistema de hidrolavadora autoservicio para una cooperativa de remises: **web móvil + API + firmware ESP32**, multi-máquina desde el día uno, con **DEMO MODE completo** (sin credenciales de Mercado Pago ni ESP32 físico).

```
CLIENTE ──QR──> WEB ──> BACKEND ──> MERCADO PAGO (o DEMO)
                  ▲  │
   webhook/polling│  │ autorización temporal
                  │  ▼
MERCADO PAGO ──webhook──> BACKEND ──> ESP32 (polling HTTPS)
ESP32 ──heartbeat/events──> BACKEND
ESP32 ──relay──> contactor ──> motor hidrolavadora
ESP32 <──pulsador físico──  usuario
```

**Principio fundamental: el pago NUNCA enciende la hidrolavadora.**
Pago → webhook → validación → autorización temporal → ESP32 → LED verde → pulsador físico → relay → contactor → motor (180 s controlados LOCALMENTE por el ESP32).

## Requisitos

- **Node.js ≥ 20.6** (probado con Node 24)
- **Nada más** para el modo demo: la API ejecuta **PostgreSQL 16 embebido (PGlite)** dentro del proceso. No hace falta instalar PostgreSQL, Docker ni credenciales.
- Producción: servidor PostgreSQL real vía `DATABASE_URL` (ver `infrastructure/`).

## Instalación rápida (DEMO MODE)

```bash
npm install                # desde la raíz del monorepo
npm run build:api
npm run build:web          # o npm run build (todo)
```

Ejecutar (dos terminales):

```bash
npm run start:api          # API + simulador ESP32 en http://localhost:3020
npm run dev:web            # frontend en http://localhost:5173
```

En Windows también podés correr `npm run dev:api` (mismo efecto: `node dist/index.js`).

### URLs

| Qué | URL |
|---|---|
| Cliente (QR) | http://localhost:5173/machine/HIDRO-01 |
| Administración | http://localhost:5173/admin |
| Simulador ESP32 | http://localhost:5173/demo/device |
| API | http://localhost:3020 |
| Health | http://localhost:3020/health |

### Credenciales DEMO

| Usuario | Valor |
|---|---|
| Admin | `admin@hidro.local` / `hidro-demo-2025` |

> Cambialas en `apps/api/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). En producción es obligatorio cambiar `JWT_SECRET`.

## Tarifas y patentes (decisión del cliente)

Tres tarifas por categoría de patente, configurables por máquina desde admin:

| Categoría | Tarifa | Cómo se determina |
|---|---|---|
| **Remis de la cooperativa** | **$500** | Patente registrada como `remis` (admin → Patentes) |
| **Auto de socio** | **$2.000** | Patente registrada como `socio` (admin → Patentes) |
| **Particular no asociado** | **$8.000** | Patente NO registrada (equivale a 2 fichas de $4.000) |

- Límite de **2 lavados por día POR PATENTE** (configurable en Ajustes) — evita que un socio use la tarifa de remis para su auto particular.
- El flujo pide la patente ANTES de pagar: cotización → tarifa → pago. Nunca se cobra sin validar todo en el backend.
- Para otro lavado: escanear de nuevo y pagar de nuevo (cada pago = un ciclo de 180 s).
- El botón físico del mecánico (llave de la caja, 2-3 pulsaciones) sigue funcionando como está: **no pasa por el sistema**.

Patentes DEMO para probar: `AE100AA` (remis · $500), `AE200AA` (socio · $2.000), cualquier otra (externo · $8.000).

## Cómo simular un pago

1. Abrí http://localhost:5173/machine/HIDRO-01 → ingresá la patente (ej. `AE100AA`) → **VER MI TARIFA**.
2. Verificás la tarifa (REMIS DE LA COOPERATIVA — $500, lavados restantes del día) → **PAGAR Y HABILITAR $500**.
3. Pantalla **SIMULAR PAGO** con: APROBAR, RECHAZAR, DEJAR PENDIENTE, WEBHOOK DUPLICADO, WEBHOOK INVÁLIDO.
4. APROBAR → el backend genera la autorización (misma lógica de dominio que Mercado Pago).
5. Volvé a la máquina: **MÁQUINA HABILITADA** con countdown.
6. En http://localhost:5173/demo/device → **PRESIONAR PULSADOR** → relay ON → lavado (180 s; con `TEST_SPEED_FACTOR=10` son 18 s reales).
7. Al terminar: relay OFF, **LAVADO FINALIZADO**, sesión visible en admin con patente y categoría.

## Cómo simular el ESP32

El simulador corre **dentro de la API** (`DEVICE_SIMULATOR=true`, solo desarrollo).
**Ojo: no "replica" el firmware — son DOS implementaciones independientes del mismo
protocolo** (`docs/device-protocol.md`). Solo el simulador está cubierto por tests;
el firmware C++ no se testea automáticamente. Cualquier cambio en el protocolo hay que
aplicarlo en los dos lados y verificar el firmware a mano (o con `pio run`).

Página: http://localhost:5173/demo/device con: DESCONECTAR, RECONECTAR, REBOOT, CORTE DE INTERNET, CORTE ELÉCTRICO, SIMULAR ERROR.

El firmware real (PlatformIO) está en `firmware/esp32/`.

## Tests

```bash
npm test                 # state machine + API (unit + integración) — 46 tests
npm run test:e2e         # E2E automatizado (vitest)
node scripts/verify-e2e.mjs   # E2E en vivo contra el sistema corriendo
node scripts/browser-e2e.mjs  # E2E con navegador real (Edge headless)
node scripts/check-render.mjs # verificación de render de las páginas
```

## Mercado Pago productivo (SPIKE primero)

1. Crear aplicación en Mercado Pago y configurar **notificaciones webhook** con `MERCADOPAGO_WEBHOOK_SECRET`.
2. En `apps/api/.env`:
   ```env
   PAYMENT_PROVIDER=mercadopago
   MERCADOPAGO_ACCESS_TOKEN=...
   MERCADOPAGO_PUBLIC_KEY=...
   MERCADOPAGO_WEBHOOK_SECRET=...
   PUBLIC_APP_URL=https://tu-dominio.com
   ```
3. Hacer el spike: preferencia + pago con tarjeta de prueba + webhook real. Verificar el esquema de firma `x-signature` contra la documentación vigente (implementado en `apps/api/src/payments/mercadoPagoProvider.ts` con comentario SPIKE).
4. Nunca exponer tokens en el frontend. El dominio no depende del SDK (interfaz `PaymentProvider`).

## ESP32 físico

1. Registrar la máquina (seed crea `HIDRO-01` con dispositivo `ESP32-HIDRO-01`).
2. Admin → Máquinas → **ROTAR SECRET** → copiar el secret (se muestra una sola vez).
3. Configurar `firmware/esp32/src/app_config.h` (o build flags) con WiFi, dominio y secret. Ver `firmware/esp32/README.md` (wiring, `RELAY_ACTIVE_LEVEL`, LED, pulsador).
4. Flashear con PlatformIO. El ESP32 arranca siempre con relay OFF.

## Agregar una máquina (HIDRO-02, 03…)

Todo es configuración, no código:

1. Crear el registro (SQL o ampliando el seed) con precio/duración.
2. Crear su dispositivo con secret propio (admin → rotar secret).
3. Flashear su ESP32 con `HIDRO_MACHINE_ID`, `HIDRO_DEVICE_ID` y su secret.
4. Admin → **GENERAR QR** → descargar e imprimir junto a la máquina.

## Seguridad

- Secretos **por dispositivo** cifrados en base (AES-256-GCM); rotables sin afectar otras máquinas.
  El archivo en claro `devices.json` SOLO existe en modo demo (lo consume el simulador); en
  producción el secret se muestra una única vez en la respuesta de "Rotar secret" y no se escribe en disco.
- HMAC-SHA256 por request de dispositivo con ventana de timestamp (epoch ms, NTP en el firmware).
- Admin con JWT; `/admin` no se expone sin autenticación. Contraseñas con scrypt + salt aleatorio por usuario.
- helmet, CORS configurado, rate limiting (con `trust proxy` en producción), validación Zod, logs estructurados, ORM (sin SQL inseguro).
- Webhook: firma + re-consulta al proveedor + verificación de importe + idempotencia con restricciones de base de datos (nunca 2 autorizaciones por pago; nunca 2 sesiones activas por máquina). La aprobación corre EN UNA TRANSACCIÓN: webhooks concurrentes del mismo pago se serializan de verdad.

## DEMO MODE — qué es y qué no es

| Componente | Estado |
|---|---|
| Pagos | `DemoPaymentProvider` (mismo contrato/dominio que MP) — DEMO |
| Dispositivo | Simulador in-process (mismo protocolo que el firmware) — DEMO |
| Base de datos | PostgreSQL 16 real embebido (PGlite); en producción apuntá `DATABASE_URL` a un server |
| Máquina de estados, autorizaciones, sesiones, concurrencia, admin | **100% real** |

## PENDING CLIENT DECISION

- Modelo de contactor, voltaje de bobina, nivel lógico del relay (`RELAY_ACTIVE_LEVEL`).
- Retiro del timer eléctrico existente (mantenerlo hasta validar en puesta en marcha).
- Ajuste fino de las 3 tarifas ($500 / $2.000 / $8.000) y del límite diario (2) — hoy configurables desde admin.

## DECISIÓN PENDIENTE — verificación de identidad de la patente

**La patente no prueba nada.** Es el único dato que determina la tarifa y cualquiera la
escribe a mano: un particular que vea estacionado un remis de la cooperativa copia la
patente y lava por $500 en vez de $8.000. El límite de 2 lavados/día no lo frena:
castiga a la patente real, no a quien la usó.

Opciones para decidir con el dueño (no implementadas a propósito):

- **(a) PIN de 4 dígitos por patente registrada** — cambio chico: un campo en `vehicles`
  + un input en el flujo. Costo: el remisero tiene que recordar/transmitir el PIN.
- **(b) Patente + últimos 4 dígitos del DNI del titular** — igual de chico, pero el DNI
  se pide y se valida contra el registro; menos secreto compartido.
- **(c) QR/credencial personal del remisero** en vez de patente tipeada — elimina el
  tipeo y el error, pero hay que emitir/gestionar credenciales.
- **(d) Aceptar el riesgo** — la cooperativa es chica y todos se conocen; costo cero hoy,
  riesgo real si se abre al público.

Con costo asociado, también por decidir:

- **Cliente paga y se corta internet**: hoy el pulsador NO arranca (fail-safe correcto),
  pero la plata ya se cobró y la autorización vence a los 300 s. No hay reembolso
  automático (`refundPayment()` en `mercadoPagoProvider.ts` devuelve siempre `{ok:false}`).
  Opciones: reembolso automático vía API de MP, crédito manual con el administrador, o
  tolerancia (el cliente reintenta al volver internet dentro del TTL).
- **Corte de luz en medio de un lavado pago**: el sistema registra la interrupción con
  trazabilidad completa (`SESSION_INTERRUPTED`, motivo `power_cut_during_session`).
  Falta decidir la política comercial: reembolso, crédito de otro lavado, o nada.

## Documentación

- [docs/architecture.md](docs/architecture.md) — arquitectura y decisiones
- [docs/payment-flow.md](docs/payment-flow.md) — flujo de pago e idempotencia
- [docs/device-protocol.md](docs/device-protocol.md) — protocolo backend ↔ ESP32
- [docs/state-machine.md](docs/state-machine.md) — máquina de estados
- [docs/testing.md](docs/testing.md) — estrategia de testing
