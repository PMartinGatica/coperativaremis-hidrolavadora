# Firmware ESP32 — HIDRO SELF-SERVICE

Firmware real para la hidrolavadora autoservicio (PlatformIO + Arduino + C++).

**El ESP32 NUNCA alimenta el motor directamente:**

```
ESP32 -> relay -> contactor -> motor de hidrolavadora
```

## Requisitos

- [PlatformIO](https://platformio.org/) (VS Code o CLI)
- Placa ESP32 (devkit)
- Módulo relay compatible con 3.3V (o con driver), contactor con bobina a 220V (PENDING: validar modelo real)

## Configuración

Todo lo configurable vive en `src/app_config.h`:

| Parámetro | Default | Notas |
|---|---|---|
| `HIDRO_MACHINE_ID` | `HIDRO-01` | Id de la máquina en el backend |
| `HIDRO_DEVICE_ID` | `ESP32-HIDRO-01` | Identificador del dispositivo (registrado en admin) |
| `HIDRO_DEVICE_SECRET` | placeholder | **Secret real del admin (Rotar secret)** — nunca commitear |
| `HIDRO_API_BASE_URL` | `dominio.com` | SOLO host, sin `https://` ni barra final (se normaliza igual) |
| `TLS_ROOT_CA` | ISRG Root X1 (PEM completo embebido) | Si el dominio está detrás de Cloudflare, pasar la raíz de Cloudflare por build flag |
| `WIFI_SSID` / `WIFI_PASSWORD` | placeholders | Red del lugar |
| `RELAY_PIN` | 26 | GPIO del relay |
| `RELAY_ACTIVE_LEVEL` | `HIGH` | **PENDING: validar con el módulo real** (HIGH o LOW) |
| `BUTTON_PIN` | 27 | Pulsador físico a GND |
| `LED_GREEN_PIN` / `LED_RED_PIN` | 25 / 33 | LEDs de estado |
| `HIDRO_TEST_SPEED_FACTOR` | 1.0 | Solo con `HIDRO_TEST_MODE=1`; producción siempre 1.0 |

Para no tocar el código con secretos reales, usá build flags:

```ini
build_flags =
  -DHIDRO_DEVICE_SECRET='"el-secret-real"'
  -DHIDRO_MACHINE_ID='"HIDRO-01"'
  -DHIDRO_DEVICE_ID='"ESP32-HIDRO-01"'
  -DHIDRO_API_BASE_URL='"tu-dominio.com"'
  -DWIFI_SSID='"tu-red"'
  -DWIFI_PASSWORD='"tu-clave"'
```

## Compilar y flashear

```bash
cd firmware/esp32
pio run            # compilar
pio run -t upload  # flashear por USB
pio device monitor # ver logs (115200)
```

## Comportamiento del LED

| Estado | Significado |
|---|---|
| Apagado | Máquina sin autorización |
| Verde fijo | Pago aprobado — esperando pulsador |
| Verde parpadeando | Lavado en curso |
| Rojo | Error de dispositivo |

## Invariantes de seguridad

1. El relay arranca **SIEMPRE apagado** (boot, watchdog reset, error, estado corrupto).
2. **GUARDA DURA**: el relay no puede quedar ON más que `duración + 5 s` — guarda con
   aritmética `uint32_t` (rollover-safe), evaluada ANTES que todo en el loop, sin depender
   de WiFi ni del backend. Si se dispara: relay OFF + `watchdog_max_runtime`.
3. El pulsador **no hace nada** sin autorización válida, no vencida, no consumida y de esta máquina.
4. El ciclo **no arranca** sin confirmación HTTP del backend (`POST /session/start` 2xx).
5. El timer de 180s es **local** (deadline en epoch NTP): corta el relay aunque Internet desaparezca.
6. Reinicio corto durante RUNNING (gap < 5s en **epoch NTP** y deadline reconstruible): **reanuda**.
   Corte eléctrico / gap no confiable / sin hora NTP: relay OFF + sesión **interrumpida** (seguridad primero).
7. `EMERGENCY_STOP` del backend tiene prioridad absoluta sobre cualquier sesión.

## Pendientes de puesta en marcha

- **PENDING**: modelo de relay/contactor y nivel lógico (`RELAY_ACTIVE_LEVEL`).
- **PENDING**: cola off-line de eventos (finish/interrupted si cae internet en ese instante; el backend queda RUNNING hasta reintegro manual — PENDING CLIENT DECISION).
- **PENDING**: no retirar el timer eléctrico existente hasta validar el sistema en puesta en marcha.

Notas ya resueltas: el firmware sincroniza **NTP en setup** y no emite requests hasta tener
hora válida (`x-device-ts` en epoch ms); el TLS usa el PEM completo de ISRG Root X1
(override con `TLS_ROOT_CA` si el dominio está detrás de Cloudflare).
