#pragma once

// ============================================================
// HIDRO SELF-SERVICE — configuración del ESP32
// TODOS los valores de hardware son CONFIGURABLES.
// PENDING: validar en puesta en marcha (modelo de relay/contactor reales).
// ============================================================

// ---------- Identidad ----------
// El device_id y el secret se generan en el panel admin (Máquinas -> Rotar secret).
// NUNCA hardcodear el secret en producción: usar platformio.ini -> build_flags
//   -DHIDRO_DEVICE_SECRET='"el-secret"'  (o editar solo en el build local)
#ifndef HIDRO_MACHINE_ID
#define HIDRO_MACHINE_ID "HIDRO-01"   // PENDING: corresponde a la máquina física
#endif
#ifndef HIDRO_DEVICE_ID
#define HIDRO_DEVICE_ID "ESP32-HIDRO-01"
#endif
#ifndef HIDRO_DEVICE_SECRET
#define HIDRO_DEVICE_SECRET "PENDING-cambiar-por-secret-real-del-admin"
#endif

// ---------- Backend ----------
#ifndef HIDRO_API_BASE_URL
// PENDING CLIENT DECISION: dominio productivo con HTTPS.
// SOLO el host: sin "https://" y sin barra final (ej. "hidro.coop-remises.ar").
// Si llegara a llevar esquema, api_client.h lo normaliza.
#define HIDRO_API_BASE_URL "dominio.com"
#endif
#define HIDRO_API_PORT 443

// ---------- WiFi ----------
#ifndef WIFI_SSID
#define WIFI_SSID "PENDING-nombre-de-red"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "PENDING-clave-wifi"
#endif

// ---------- Hardware (PENDING: validar pines y niveles en puesta en marcha) ----------
#define RELAY_PIN        26
#define RELAY_ACTIVE_LEVEL HIGH   // HIGH o LOW según el módulo de relay. ¡Validar!
#define BUTTON_PIN       27     // pulsador físico a GND (INPUT_PULLUP)
#define LED_GREEN_PIN    25
#define LED_RED_PIN      33

// ---------- Tiempos ----------
#define HEARTBEAT_INTERVAL_MS 5000
#define AUTH_POLL_INTERVAL_MS 2000
#define HTTP_TIMEOUT_MS       8000
#define BUTTON_DEBOUNCE_MS    50
#define REBOOT_RESUME_MAX_GAP_MS 5000   // reinicio corto -> reanudar si es reconstruible
#define NVS_PERSIST_INTERVAL_MS 1000
#define WIFI_RECONNECT_INTERVAL_MS 10000

// ---------- Testing ----------
// TEST_SPEED_FACTOR SOLO para builds de desarrollo/testing.
// En producción DEBE ser 1.0 (se fuerza por compile-time: HIDRO_TEST_MODE).
#ifndef HIDRO_TEST_MODE
#define HIDRO_TEST_MODE 0
#endif
#if HIDRO_TEST_MODE
  #ifndef HIDRO_TEST_SPEED_FACTOR
  #define HIDRO_TEST_SPEED_FACTOR 10.0f   // 180s simulados en 18s
  #endif
#else
  #define HIDRO_TEST_SPEED_FACTOR 1.0f
#endif

#define FIRMWARE_VERSION "1.0.0"
