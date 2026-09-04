# Protocolo dispositivo ↔ backend

El ESP32 **siempre inicia** las conexiones (HTTPS/REST). El backend nunca necesita acceder al ESP32 desde Internet.

Base URL: `https://<dominio>/api/device`

## Autenticación (HMAC por dispositivo)

Cada request lleva headers:

| Header | Valor |
|---|---|
| `x-device-id` | identificador del dispositivo (ej. `ESP32-HIDRO-01`) |
| `x-device-ts` | timestamp unix en **milisegundos** (ventana ±5 min) |
| `x-device-sig` | firma hex |

```
body_hash = sha256_hex(raw_body)
firma     = hex( HMAC_SHA256(secret, "{device_id}.{ts}.{METHOD}.{path}.{body_hash}") )
```

- `path` es la URL completa con prefijo de montaje (`/api/device/...`), sin query string.
- El `secret` es **por dispositivo**: se genera en admin (Rotar secret) y se flashea en el ESP32.
- Rotar el secret de HIDRO-01 no afecta a HIDRO-02.

## Endpoints

### `POST /api/device/heartbeat`

```json
{
  "machine_id": "HIDRO-01",
  "device_id": "ESP32-HIDRO-01",
  "firmware_version": "1.0.0",
  "status": "ONLINE",
  "uptime": 12345,
  "current_session_id": null,
  "relay_state": false,
  "wifi_rssi": -56,
  "timestamp": 1756944000000
}
```

Respuesta (incluye comandos pendientes):

```json
{
  "device_id": "ESP32-HIDRO-01",
  "machine_id": "HIDRO-01",
  "server_time": 1756944000123,
  "commands": [{ "id": "uuid", "type": "EMERGENCY_STOP", "payload": { "reason": "..." } }],
  "heartbeat_interval_ms": 5000
}
```

Estado de máquina derivado por el backend:

| Último heartbeat | Estado |
|---|---|
| ≤ 15 s | `ONLINE` |
| 15–45 s | `DEGRADED` |
| > 45 s | `OFFLINE` |

(Umbrales configurables: `DEVICE_ONLINE_THRESHOLD_MS`, `DEVICE_DEGRADED_THRESHOLD_MS`.)

### `GET /api/device/authorization`

El ESP32 pregunta cada 2 s si tiene autorización pendiente.

```json
{
  "authorization": {
    "authorization_id": "uuid",
    "session_id": "HS-8F3K2Q",
    "machine_id": "HIDRO-01",
    "duration_seconds": 180,
    "expires_at": "2026-08-30T20:05:00.000Z",
    "status": "AUTHORIZED"
  },
  "server_time": 1756944000123
}
```

- La primera entrega hace la transición `AUTHORIZED → WAITING_FOR_BUTTON` y registra `AUTHORIZATION_FETCHED`.
- `authorization: null` = sin autorización (LED apagado).
- Vencida localmente (`expires_at` en el pasado) = LED apagado; el backend la marca `AUTHORIZATION_EXPIRED`.

### `POST /api/device/session/start` (pulsador)

```json
{
  "machine_id": "HIDRO-01",
  "session_id": "HS-8F3K2Q",
  "authorization_id": "uuid",
  "relay_expected_state": true
}
```

Reglas (todas en una transacción atómica):

- La sesión debe existir, ser de ESTA máquina y estar en `WAITING_FOR_BUTTON`.
- La autorización debe existir, pertenecer a la sesión, estar `AUTHORIZED` y no vencida.
- Consume la autorización (`CONSUMED`) → **una autorización = un solo ciclo**.
- `RUNNING` + `started_at`; eventos `BUTTON_PRESSED`, `RELAY_ON`, `SESSION_STARTED`.

Respuesta 200:

```json
{ "ok": true, "session_id": "HS-8F3K2Q", "duration_seconds": 180, "started_at": "..." }
```

Errores (el relay NO se enciende nunca): `AUTH_CONSUMED` (doble pulsación), `AUTH_EXPIRED`, `AUTH_REVOKED`, `SESSION_NOT_FOUND`, `AUTH_WRONG_MACHINE`, `INVALID_TRANSITION`. Cada intento inválido queda registrado como `BUTTON_PRESSED_WITHOUT_AUTH`.

**FAIL-SAFE**: si el backend no responde (o no responde 2xx), el firmware NO enciende el relay.

### `POST /api/device/session/finish` (timer local cumplido)

```json
{ "machine_id": "HIDRO-01", "session_id": "HS-8F3K2Q", "reason": "timer_completed", "duration_seconds": 180 }
```

`RUNNING → FINISHED` + eventos `RELAY_OFF`, `SESSION_FINISHED`. Idempotente.

### `POST /api/device/session/interrupted`

```json
{ "machine_id": "HIDRO-01", "session_id": "HS-8F3K2Q", "reason": "power_cut_during_session" }
```

`RUNNING → SESSION_INTERRUPTED | EMERGENCY_STOP | DEVICE_ERROR` según `reason` (`emergency_stop`, `device_error`, resto → interrumpida).

### `POST /api/device/events`

```json
{ "machine_id": "HIDRO-01", "session_id": null, "type": "DEVICE_REBOOT", "data": { "resumed": false } }
```

Tipos: `HEARTBEAT`, `DEVICE_ONLINE/OFFLINE/DEGRADED`, `DEVICE_REBOOT`, `DEVICE_ERROR`, `AUTHORIZATION_FETCHED`, `BUTTON_PRESSED`, `BUTTON_PRESSED_WITHOUT_AUTH`, `RELAY_ON/OFF`, `SESSION_STARTED/FINISHED/INTERRUPTED`, `EMERGENCY_STOP`, `INTERNET_LOST/RESTORED`, `POWER_CUT`.

### `POST /api/device/commands/:id/ack`

Confirma la ejecución de un comando (el backend lo marca `DELIVERED`).

## Comandos (backend → dispositivo)

El backend no llama al ESP32: los comandos viajan en la **respuesta del heartbeat** y se reenvían hasta el ack (at-least-once).

`EMERGENCY_STOP` (desde admin, requiere confirmación `DETENER`):
1. Sesión activa → `EMERGENCY_STOP`.
2. Autorizaciones de la máquina → `REVOKED`.
3. Comando pendiente para el dispositivo.
4. El ESP32, al recibirlo: **relay OFF inmediato**, reporta interrupción/evento y hace ack. La parada de emergencia tiene prioridad absoluta sobre cualquier sesión.

## Timer local (180 s)

- El deadline lo controla el ESP32 (`duration_seconds` recibido en start), en **epoch NTP**.
- Sin Internet: el timer corre igual y corta el relay al vencer.
- GUARDA DURA: además del deadline, una guarda con aritmética `uint32_t` (rollover-safe) corta el relay si estuvo ON más que `duración + 5 s`, sin depender de WiFi ni del backend (reporta `watchdog_max_runtime`).
- Reinicio corto (gap < 5 s en epoch y deadline reconstruible): **reanuda** (NVS).
- Corte eléctrico / gap no confiable: relay OFF + `session/interrupted` (`power_cut_during_session`).

## Ejemplo (curl)

```bash
TS=$(node -e "console.log(Date.now())")
BODY='{"machine_id":"HIDRO-01","device_id":"ESP32-HIDRO-01","firmware_version":"1.0.0","status":"ONLINE","uptime":1,"current_session_id":null,"relay_state":false,"wifi_rssi":-56,"timestamp":'$TS'}'
SIG=$(node -e "
const {createHmac,createHash}=require('crypto');
const b=process.argv[1], s='SECRET-DEL-DISPOSITIVO', ts='$TS';
const h=createHash('sha256').update(b).digest('hex');
console.log(createHmac('sha256',s).update('ESP32-HIDRO-01.'+ts+'.POST./api/device/heartbeat.'+h).digest('hex'));
" "$BODY")
curl -X POST https://dominio.com/api/device/heartbeat \
  -H "Content-Type: application/json" \
  -H "x-device-id: ESP32-HIDRO-01" -H "x-device-ts: $TS" -H "x-device-sig: $SIG" \
  -d "$BODY"
```

## PENDIENTES del firmware real

- Cola off-line de eventos en el ESP32 (finish/interrupted si cae Internet justo al terminar; mientras tanto el backend queda RUNNING hasta reintegro manual — PENDING CLIENT DECISION).

## Implementación del firmware

El firmware (`firmware/esp32`) sincroniza **NTP en setup** (`configTime`) y no emite
requests hasta tener hora válida: `x-device-ts` viaja SIEMPRE como **epoch en milisegundos**
(`time(nullptr) * 1000`). El timestamp de uptime (`millis()/1000`) NO sirve: la ventana de
tolerancia del backend es ±5 min sobre epoch ms, así que un uptime en segundos siempre cae
fuera de ventana y da 401.

El TLS usa la raíz **ISRG Root X1** (PEM completo). Si el dominio queda detrás de Cloudflare,
la cadena la firma Cloudflare y hay que pasar esa raíz por build flag `TLS_ROOT_CA`.
