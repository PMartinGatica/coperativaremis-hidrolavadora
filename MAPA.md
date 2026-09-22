# MAPA — MUNDO: HIDRO SELF-SERVICE

> Índice interno de este Mundo. El agente lee ESTO, no explora. Reemplaza la exploración del árbol
> para siempre. Escrito para un agente que llega sin contexto.

## Raíz única

Memoria y código conviven en `Madre/mundos/hidro-self-service/` (ADR-012, 2026-09-04). Todas las
rutas de este MAPA son relativas a esa carpeta. Repo:
**https://github.com/PMartinGatica/coperativaremis-hidrolavadora** (privado).

> Si ves una ruta que apunta a `Deepseek-harnes/`, es de antes de la consolidación: está muerta.

## Stack y comandos
- Monorepo **npm workspaces** (`apps/*`, `packages/*`). Node ≥ 20.6 (probado con 24). NO pnpm.
- API: Express 4 + TypeScript strict + **drizzle-orm** + **PGlite** (Postgres 16 embebido) o
  Postgres real vía `DATABASE_URL` · zod · helmet · express-rate-limit · jsonwebtoken · mercadopago.
- Web: React 19 + Vite 6 + Tailwind 4 + react-router 6 · `qrcode` · `lucide-react`.
- Firmware: **PlatformIO / C++** (ESP32, Arduino framework), ArduinoJson + mbedtls.

| Comando | Qué hace |
|---|---|
| `npm install` | instala todo el monorepo (desde la raíz) |
| `npm run build` | shared → state-machine → api → web |
| `npm run start:api` | API + simulador ESP32 en `:3020` |
| `npm run dev:web` | front en `:5173` (proxy `/api` → `:3020`) |
| `npm test` | 140 tests (shared + state-machine + api). Tardan ~9 min: corren contra PGlite real. ⚠️ **Corrarla SOLA**: varios tests dependen de tiempos (heartbeats, esperas de 10 s) y con otra corrida de vitest en paralelo aparecen fallos que no se reproducen sueltos |
| `npx vitest run tests/<archivo>` (desde `apps/api`) | corre UNA suite. Con 9 min de suite completa, iterar así es la diferencia entre trabajar y esperar |
| `npm run verify` / `node scripts/verify-e2e.mjs` | E2E en vivo contra el sistema corriendo |
| `npm run build:firmware` | `pio run -d firmware/esp32` — **la puerta (a) si tocás `firmware/`** |
| `npm run check:firmware` | pre-chequeo estático por grep. **NO sustituye al de arriba** (daba OK con el firmware sin compilar) |
| `docker build -t hidro . && docker run -p 3020:3020 -e API_HOST=0.0.0.0 …` | verificación de deploy: tiene que responder `/health` |

> **PlatformIO es requisito de este Mundo** (ADR-011). Se instala con `pip install platformio`
> (conviene un venv). El toolchain de Xtensa se baja solo a `~/.platformio` y pesa ~600 MB.
> El primer `pio run` tarda ~9 min; los siguientes, ~20 s.
> Última compilación verde: **RAM 14,4% · Flash 72,3%** (2026-09-04).

## Dominio → carpeta → archivos clave
| Sub-área | Carpeta | Archivos clave (entrada / modelo / contrato) |
|---|---|---|
| Contratos compartidos | `packages/shared/src/` | `types.ts` (DTOs + protocolo de dispositivo), `constants.ts` (tarifas, TTLs, umbrales), `validation.ts` (zod + `normalizePlate`), `errors.ts` (código → HTTP) |
| Máquina de estados | `packages/state-machine/src/index.ts` | `TRANSITIONS` + `assertTransition()`. **Fuente única de verdad**: ninguna sesión cambia de estado sin pasar por acá |
| API — arranque | `apps/api/src/` | `index.ts` (listen), `bootstrap.ts` (DI + barrido periódico), `app.ts` (middlewares + montaje), `config.ts` (env → `AppConfig`) |
| API — rutas | `apps/api/src/http/routes/` | `publicRoutes.ts` (cliente), `deviceRoutes.ts` (ESP32, HMAC), `adminRoutes.ts` (JWT), `webhookRoutes.ts` (MP), `demoRoutes.ts` (simulador) |
| API — dominio | `apps/api/src/services/` | `sessionService.ts` (checkout + límite diario), `paymentService.ts` (**`processApproval` = punto único de aprobación**), `deviceService.ts` (heartbeat, autorización, pulsador), `machineService.ts` (tarifa por patente, disponibilidad), `transition.ts`, `settingsService.ts`, `adminService.ts` |
| API — datos | `apps/api/src/db/` + `apps/api/src/repositories/repos.ts` | `schema.ts` (drizzle), `client.ts` (PGlite vs pg), `migrate.ts` (runner propio), `seed.ts` (**+ cripto: `encryptSecret`/`hashSecret`**) |
| API — pagos | `apps/api/src/payments/` | `provider.ts` (interfaz), `demoProvider.ts`, `mercadoPagoProvider.ts` (preference + firma de webhook) |
| API — simulador | `apps/api/src/simulator/` | `hub.ts` (tick 250 ms), `simDevice.ts` (**réplica TS del firmware — es lo que testean los 46 tests**) |
| Web — cliente | `apps/web/src/pages/` | `MachinePage.tsx` (QR → patente → tarifa → pago → countdown), `PayDemoPage.tsx`, `DemoDevicePage.tsx`, `LandingPage.tsx` |
| Web — admin | `apps/web/src/admin/` | `AdminApp.tsx` + `pages/` (Dashboard, Machines, Vehicles, Sessions, Payments, Logs, Settings) |
| Firmware | `firmware/esp32/src/` | `main.cpp` (loop + timer local), `api_client.h` (HTTPS + HMAC + **root CA**), `app_config.h` (pines, URLs, tiempos), `peripherals.h` (relay/LED/pulsador), `nvs_store.h`, `hidro_state.h` |
| Tests | `apps/api/tests/` | `e2e.test.ts`, `concurrency.test.ts`, `payment-flow.test.ts`, `plates.test.ts`, `device-security.test.ts`, `offline.test.ts`, `simulator-resilience.test.ts`, `admin.test.ts`, `reconciliation.test.ts`, `config-guards.test.ts`, `demo-mode.test.ts` (MODO DEMO en producción, ADR-048), **`webhook-routes.test.ts`** (lo que contesta el endpoint de webhook a cada vía de MP, ADR-052 — la primera suite que le pega de verdad), `helpers.ts` |
| Diseños de fase | `docs/designs/` | `reconciliacion-pagos.md`, `reconciliacion-pagos-ui.md`, `pin-patente-remis-socio.md`, `guardas-produccion-seed.md`, `deploy-web-estatico.md`, **`webhook-ipn-legado.md`** (ADR-052: incluye el review completo de las dos voces) |
| Memoria de checkpoint | raíz del Mundo | `ESTADO.md` (handoff, ≤40 líneas), `MAPA.md` (este archivo), `ADR.md` (append-only), **`dashboard-data.json`** y **`tokens.csv`** — los 5 se actualizan en CADA checkpoint. **Viven acá, NO en `Madre/docs/`**: cada Mundo tiene los suyos (regla de Pablo, 2026-09-05). El `MUNDO-TEMPLATE` no traía los dos últimos, por eso faltaban |
| Fases | `fases/` | `FASE-1.md` (borrador de alcance: reconciliación de pagos + guardas de arranque) |
| Mensajes a terceros | `mensajes/` | `mensaje-tecnicos.md` (compra + montaje + los 3 datos que bloquean la puesta en marcha), `mensaje-dueno.md` (ADR-007 + reembolsos + cuenta de MP). Listos para copiar a WhatsApp |
| Scripts | `scripts/` | `verify-e2e.mjs` (E2E vivo), `browser-e2e.mjs` (Edge headless), `check-render.mjs` |

## Dónde vive el modelo de datos
- Definición: `apps/api/src/db/schema.ts` (drizzle, Postgres).
- Migraciones: `apps/api/drizzle/` (`0000_init.sql`, `0001_plates.sql`), aplicadas por un runner
  propio (`db/migrate.ts`) con tabla de tracking `hidro_migrations`.
- Tablas: `machines`, `vehicles` (patentes), `devices`, `sessions`, `payments`, `authorizations`,
  `device_events`, `audit_logs`, `device_commands`, `admin_users`, `settings`.
- **Las garantías de dinero son índices únicos, no código:** `uq_payments_external_id`,
  `uq_payments_session`, `uq_authorizations_payment` (nunca 2 ciclos por pago),
  `uq_authorizations_session`, `uq_sessions_active_machine` (parcial — nunca 2 sesiones activas por
  máquina). **No tocarlos sin leer el ADR del Mundo.**

## Puntos de entrada / contratos
- Cliente: `GET /api/public/machines/:id` · `POST /api/public/machines/:id/quote` (cotiza, no cobra)
  · `POST /api/public/machines/:id/sessions` (crea sesión + cobro) · `GET /api/public/sessions/:id`.
- Dispositivo (HMAC-SHA256 por dispositivo, headers `x-device-id` / `x-device-ts` / `x-device-sig`):
  `POST /api/device/heartbeat` · `GET /api/device/authorization` · `POST /api/device/session/start`
  · `/finish` · `/interrupted` · `POST /api/device/events` · `POST /api/device/commands/:id/ack`.
- Webhook: `POST /api/webhooks/mercadopago` (firma + **re-consulta al API de MP**, nunca confía en
  el body).
- Admin (JWT Bearer): `/api/admin/*`.
- Contrato del dispositivo documentado en `docs/device-protocol.md`.

## Referencia (se lee una vez)
- `análisis.md` (27 KB) — análisis original del sistema.
- `presupuesto-hidrolavadora-completo.html` (37 KB) — presupuesto para el cliente.
- `docs/` — `architecture.md`, `payment-flow.md`, `device-protocol.md`, `state-machine.md`,
  `testing.md`. ⚠️ **Algunos afirman cosas falsas** (ver bloque 6.3 de
  `prompt-deepseek-correcciones.md`): el doc del protocolo dice que la ventana de 5 min tolera
  `millis()/1000` — no la tolera.

## Zonas que no se tocan
- `node_modules/` y **`.npm-cache-local/` (532 MB, sin gitignorear todavía)** — nunca leerlas.
- `apps/*/dist/` y `packages/*/dist/` — generados por `npm run build`.
- `apps/api/.data/` (base PGlite local) y `apps/api/.simulator/` (NVS del simulador).
- El botón físico del mecánico (llave de la caja): NO pasa por el sistema y se queda como está.
