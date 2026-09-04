# Arquitectura

## Visión general

```
┌──────────┐   QR    ┌────────────────┐   HTTPS   ┌──────────────────┐
│ CLIENTE  │ ──────► │  WEB (React)   │ ────────► │  API (Express)   │
│ (celular)│         │  /machine/:id  │           │  Node + TS       │
└──────────┘         └────────────────┘           │  PostgreSQL      │
      ▲                        │                  │  máquina estados │
      │  polling (1s)          │ redirect         └───────┬──────────┘
      │  estado de sesión      ▼                          │
      │               ┌──────────────────┐   webhook      │
      └───────────────│  MERCADO PAGO    │ ◄──────────────┤
                      │  (o DEMO)        │ ──────────────►│ autorización
                      └──────────────────┘                │ temporal
                                                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│ ESP32 (por máquina)                                                    │
│  polling HTTPS ──► GET  /api/device/authorization                      │
│  heartbeat      ──► POST /api/device/heartbeat  (HMAC por dispositivo) │
│  pulsador       ──► POST /api/device/session/start                     │
│  timer LOCAL 180s (independiente de Internet)                          │
│  relay ──► contactor ──► motor hidrolavadora                           │
└───────────────────────────────────────────────────────────────────────┘
```

## Monorepo

```
hidro-self-service/
├── apps/
│   ├── api/          Express + TS + Drizzle + PostgreSQL (server o embebido)
│   └── web/          React + Vite + Tailwind (cliente móvil + admin + demo device)
├── packages/
│   ├── shared/       tipos, constantes, errores y validación (zod) compartidos
│   └── state-machine/ máquina de estados centralizada + labels/tones
├── firmware/esp32/   PlatformIO C++ (mismo protocolo que el simulador)
├── infrastructure/   docker-compose PostgreSQL + notas de deploy
├── docs/             esta documentación
└── scripts/          verify-e2e, browser-e2e, check-render
```

## Decisiones clave (y por qué)

1. **Monolito modular, no microservicios.** Una o dos hidrolavadoras: React + Express + PostgreSQL + ESP32 alcanzan. El sistema controla una máquina que cobra dinero: software aburrido, predecible y mantenible.

2. **PostgreSQL con Drizzle ORM.** Un solo ORM, consistente. En desarrollo/test corre **PGlite** (PostgreSQL 16 real embebido en el proceso, sin servidor externo); producción apunta `DATABASE_URL` a un servidor PostgreSQL. La migración SQL vive en `apps/api/drizzle/` y el runner soporta ambos drivers.

3. **REST/HTTPS con polling del ESP32, NO MQTT.** Para 1–2 máquinas MQTT agrega un broker sin necesidad. El ESP32 siempre inicia las conexiones (no hay que exponerlo a Internet). La comunicación está encapsulada tras `DeviceService`; si mañana hiciera falta MQTT, se implementaría un `MqttDeviceTransport` sin tocar el dominio.

4. **El pago nunca enciende el relay.** Mercado Pago → webhook → re-consulta → verificación de importe/máquina/sesión → autorización temporal (`expires_at`) → el ESP32 la recibe por polling → LED verde → el PULSADOR físico inicia el ciclo con confirmación del backend. El timer de 180 s es **local en el ESP32**.

5. **Idempotencia a nivel de base de datos**, no solo de aplicación:
   - `uq_payments_external_id` — un pago por id externo
   - `uq_authorizations_payment` — UNA autorización por pago
   - `uq_sessions_active_machine` — nunca dos sesiones activas para la misma máquina
   - Las filas críticas se bloquean `FOR UPDATE` en transacciones.

6. **Concurrencia/BUSY.** Crear una sesión bloquea la fila de máquina (`FOR UPDATE`), verifica estado y ausencia de sesión activa ANTES de generar el cobro. Un segundo cliente recibe 409 `MACHINE_BUSY` y **nunca se le cobra**.

7. **Secretos por dispositivo**, cifrados (AES-256-GCM, clave derivada de `DEVICE_AUTH_SECRET`) para poder verificar la firma HMAC. Rotar HIDRO-01 no afecta HIDRO-02. El ESP32 se autentica con HMAC-SHA256 por request; `machine_id` solo nunca es suficiente.

8. **Simulador y firmware: dos implementaciones independientes del mismo protocolo.** `SimulatorHub` (TS) y el firmware ESP32 (C++) implementan el mismo contrato (heartbeat, polling de autorización, LED, pulsador, relay, timer local escalado, NVS en archivo, fail-safe), pero son **códigos separados**: el E2E sin hardware prueba las reglas del **backend**, no las del firmware. Solo el simulador está cubierto por tests; por eso un defecto del firmware puede convivir con la suite en verde. Un cambio de protocolo hay que aplicarlo en los DOS lados y verificarlo por compilación + puesta en marcha.

## Servicios (apps/api/src/services)

| Servicio | Responsabilidad |
|---|---|
| `machineService` | estado derivado ONLINE/DEGRADED/OFFLINE, disponibilidad, guardas previas al cobro |
| `sessionService` | ciclo de vida de sesión, timeline, barrido de vencimientos |
| `paymentService` | `processApproval()`: punto único e idempotente usado por webhook y DEMO |
| `deviceService` | heartbeat, entrega de autorización, arranque/fin/interrupción, comandos, emergency stop |
| `adminService` | login JWT, dashboard, máquinas, sesiones, pagos, logs, settings, rotación de secret |
| `settingsService` | configuración dinámica (speed factor, TTLs) |
| `sweeper` (en bootstrap) | pagos vencidos, autorizaciones vencidas, estados de máquina |

`PaymentProvider` (interfaz) tiene dos implementaciones: `DemoPaymentProvider` y `MercadoPagoPaymentProvider`. El dominio jamás importa el SDK de Mercado Pago.

## Fallas y recuperación

| Falla | Comportamiento |
|---|---|
| Internet cae antes de arrancar | el pulsador NO arranca (requiere confirmación del backend) |
| Internet cae durante el lavado | el timer local completa y corta; el finish se reporta al reconectar |
| Reinicio corto durante RUNNING | reanuda desde NVS si el gap < 5 s y el deadline es reconstruible |
| Corte eléctrico | relay OFF al boot; sesión → `SESSION_INTERRUPTED` (seguridad primero) |
| Doble pulsación | la autorización se consume atómicamente; la 2da es rechazada |
| Webhook duplicado | `processApproval` idempotente + índices únicos |
| Emergency stop | comando al ESP32 (heartbeat lo entrega), sesión → `EMERGENCY_STOP`, autorizaciones revocadas |
