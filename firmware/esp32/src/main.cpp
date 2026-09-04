// ============================================================
// HIDRO SELF-SERVICE — firmware ESP32
// Flujo: pago aprobado -> autorización (GET) -> LED verde -> pulsador
//        -> POST /session/start (confirmación backend) -> relay ON
//        -> timer LOCAL (corta aunque no haya Internet) -> relay OFF -> finish.
//
// SEGURIDAD (invariantes):
//   - El relay arranca SIEMPRE apagado (boot/watchdog/error/estado corrupto).
//   - GUARDA DURA: el relay no puede estar ON más que duración + margen,
//     con aritmética uint32 rollover-safe, sin depender de WiFi ni backend.
//   - El pulsador NO arranca sin autorización válida y confirmación del backend.
//   - EMERGENCY STOP (comando del backend) tiene prioridad absoluta.
//   - El timer de 180s es LOCAL; nunca depende de un setTimeout del backend.
//   - NTP sincroniza el reloj: el HMAC viaja con epoch ms y la recuperación
//     tras reboot compara epoch (no millis).
// ============================================================
#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <time.h>
#include "app_config.h"
#include "hidro_state.h"
#include "nvs_store.h"
#include "peripherals.h"
#include "api_client.h"

Relay relay;
Led led;
Button button;
NvsStore nvs;
ApiClient api;

DeviceState state = DeviceState::BOOT;
uint32_t bootedAtMs = 0;
uint32_t runStartedAtMs = 0;      // uint32 (rollover-safe) para la guarda dura local
uint32_t lastHeartbeatMs = 0;
uint32_t lastAuthPollMs = 0;
uint32_t lastNvsPersistMs = 0;
uint32_t lastWifiAttemptMs = 0;
bool wifiConnected = false;

// Autorización vigente (solo ARMED)
struct AuthInfo {
  bool present = false;
  String sessionId;
  String authorizationId;
  uint32_t durationSeconds = 0;
  uint64_t expiresAtMs = 0;  // epoch UTC ms
};

AuthInfo auth;
NvsSession running;  // sesión RUNNING persistida en NVS

// ---------- Tiempo ----------
uint64_t nowEpochMs() { return (uint64_t)time(nullptr) * 1000ULL; }

// ---------- WiFi ----------
void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) { wifiConnected = true; return; }
  wifiConnected = false;
  if (millis() - lastWifiAttemptMs < WIFI_RECONNECT_INTERVAL_MS) return;
  lastWifiAttemptMs = millis();
  Serial.printf("[wifi] conectando a %s ...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ---------- Helpers HTTP/JSON ----------
// data va como OBJETO JSON (el backend valida z.record(z.unknown())).
void sendEvent(const char* type, const String& sessionId, const char* reason = nullptr) {
  if (!wifiConnected) return;  // PENDING: cola de eventos off-line (mejora futura)
  JsonDocument doc;
  doc["machine_id"] = HIDRO_MACHINE_ID;
  // El backend acepta session_id null, pero la clave tiene que estar presente.
  // NO usar un ternario String/nullptr: no tienen tipo común y no compila.
  if (sessionId.length() > 0) {
    doc["session_id"] = sessionId;
  } else {
    doc["session_id"] = nullptr;
  }
  doc["type"] = type;
  if (reason != nullptr) {
    doc["data"].to<JsonObject>()["reason"] = reason;
  }
  String body;
  serializeJson(doc, body);
  api.post("/api/device/events", body);
}

void reportInterrupted(const String& sessionId, const String& reason) {
  if (!wifiConnected) return;  // PENDING: cola de eventos off-line
  JsonDocument doc;
  doc["machine_id"] = HIDRO_MACHINE_ID;
  doc["session_id"] = sessionId;
  doc["reason"] = reason;
  String body;
  serializeJson(doc, body);
  api.post("/api/device/session/interrupted", body);
}

// ---------- Heartbeat ----------
void doHeartbeat() {
  JsonDocument doc;
  doc["machine_id"] = HIDRO_MACHINE_ID;
  doc["device_id"] = HIDRO_DEVICE_ID;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["status"] = state == DeviceState::ERROR ? "ERROR" : "ONLINE";
  doc["uptime"] = (millis() - bootedAtMs) / 1000;
  // Tres tipos distintos según el estado: char[40] en RUNNING, String en ARMED y
  // null en el resto. Un ternario anidado no compila (sin tipo común); va como if.
  if (state == DeviceState::RUNNING) {
    doc["current_session_id"] = running.sessionId;
  } else if (state == DeviceState::ARMED) {
    doc["current_session_id"] = auth.sessionId;
  } else {
    doc["current_session_id"] = nullptr;
  }
  doc["relay_state"] = relay.isOn();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["timestamp"] = nowEpochMs();
  String body;
  serializeJson(doc, body);

  ApiResult res = api.post("/api/device/heartbeat", body);
  if (!res.ok()) return;

  // Comandos pendientes del backend (EMERGENCY STOP con prioridad absoluta)
  JsonDocument resp;
  if (deserializeJson(resp, res.body)) return;
  JsonArray commands = resp["commands"].as<JsonArray>();
  for (JsonObject cmd : commands) {
    String cmdId = cmd["id"] | "";
    String type = cmd["type"] | "";
    if (type == "EMERGENCY_STOP") {
      Serial.println("[emergency] EMERGENCY STOP desde backend");
      relay.off();                       // SEGURIDAD PRIMERO
      if (state == DeviceState::RUNNING) {
        reportInterrupted(running.sessionId, "emergency_stop");
      }
      sendEvent("EMERGENCY_STOP", running.sessionId);
      nvs.clear();
      auth.present = false;
      running.valid = false;
      state = DeviceState::IDLE;
      // ack del comando
      api.post(("/api/device/commands/" + cmdId + "/ack").c_str(), "{}");
    }
  }
}

// ---------- Parseo ISO8601 UTC -> epoch ms ----------
// El backend envía expires_at como toISOString() de JS: "YYYY-MM-DDTHH:mm:ss.sssZ".
// Parseo manual (sin strptime/timegm: dependen de la TZ del toolchain y de newlib).
// Devuelve 0 si el formato no es el esperado; el llamador usa el margen por defecto.
uint64_t parseIso8601EpochMs(const char* iso) {
  if (iso == nullptr) return 0;
  // YYYY-MM-DDTHH:mm:ss  (6 campos)
  unsigned v[6] = {0, 0, 0, 0, 0, 0};
  for (int i = 0; i < 6; i++) {
    const int digits = (i == 0) ? 4 : 2;
    for (int k = 0; k < digits; k++) {
      const char c = *iso;
      if (c < '0' || c > '9') return 0;
      v[i] = v[i] * 10 + (unsigned)(c - '0');
      iso++;
    }
    if (i < 5) {
      const char expected = (i <= 1) ? '-' : (i == 2 ? 'T' : ':');
      if (*iso != expected) return 0;
      iso++;
    }
  }
  const unsigned y = v[0], mo = v[1], d = v[2], h = v[3], mi = v[4], s = v[5];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return 0;
  // fracción de segundo opcional (.sss; más dígitos se ignoran)
  unsigned ms = 0;
  if (*iso == '.') {
    iso++;
    int ndigits = 0;
    while (ndigits < 3 && *iso >= '0' && *iso <= '9') {
      ms = ms * 10 + (unsigned)(*iso - '0');
      iso++;
      ndigits++;
    }
    while (*iso >= '0' && *iso <= '9') iso++;
  }
  if (*iso != 'Z') return 0;  // esperamos UTC explícito (toISOString siempre emite Z)
  // días desde 1970-01-01 (days_from_civil, Howard Hinnant — aritmética entera pura)
  const int64_t yy = (int64_t)y - (mo <= 2 ? 1 : 0);
  const int64_t era = (yy >= 0 ? yy : yy - 399) / 400;
  const int64_t yoe = yy - era * 400;                        // [0, 399]
  const int64_t mp = ((int64_t)mo + 9) % 12;                 // [0, 11]
  const int64_t doy = (153 * mp + 2) / 5 + (int64_t)d - 1;   // [0, 365]
  const int64_t doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  const int64_t days = era * 146097 + doe - 719468;
  const int64_t msOfDay = ((int64_t)h * 3600 + (int64_t)mi * 60 + (int64_t)s) * 1000 + (int64_t)ms;
  const int64_t total = days * 86400000LL + msOfDay;
  if (total < 0) return 0;
  return (uint64_t)total;
}

// ---------- Poll de autorización ----------
void pollAuthorization() {
  ApiResult res = api.get("/api/device/authorization");
  if (res.httpCode == 200) {
    JsonDocument doc;
    if (!deserializeJson(doc, res.body)) {
      JsonObject a = doc["authorization"].as<JsonObject>();
      if (!a.isNull() && String(a["status"] | "") == "AUTHORIZED") {
        if (state == DeviceState::IDLE) {
          auth.present = true;
          auth.sessionId = String(a["session_id"] | "");
          auth.authorizationId = String(a["authorization_id"] | "");
          auth.durationSeconds = a["duration_seconds"] | 0;
          // expires_at: ISO8601 UTC del backend, la autoridad del vencimiento.
          // Si el admin sube authTtlSeconds, el dispositivo se desarma igual al
          // vencimiento REAL (no a un margen fijo). Si el parseo fallara
          // (formato inesperado), margen local por defecto de 5 minutos.
          auth.expiresAtMs = parseIso8601EpochMs(String(a["expires_at"] | "").c_str());
          if (auth.expiresAtMs == 0) {
            auth.expiresAtMs = nowEpochMs() + 300000UL;
          }
          state = DeviceState::ARMED;
          Serial.printf("[auth] autorización recibida para %s (%us)\n", auth.sessionId.c_str(), auth.durationSeconds);
        }
        return;
      }
    }
  }
  // sin autorización -> volver a IDLE
  if (state == DeviceState::ARMED) {
    auth.present = false;
    state = DeviceState::IDLE;
  }
}

// ---------- Pulsador ----------
void onButtonPressed() {
  if (state != DeviceState::ARMED || !auth.present) {
    // Sin autorización válida: el botón NO hace nada (se registra el intento)
    Serial.println("[button] pulsación sin autorización (ignorada)");
    sendEvent("BUTTON_PRESSED_WITHOUT_AUTH", auth.present ? auth.sessionId : "", "no_authorization");
    return;
  }
  if (!wifiConnected) {
    // FAIL-SAFE: sin confirmación del backend NO se arranca el motor.
    Serial.println("[button] sin backend: NO se arranca (fail-safe)");
    sendEvent("BUTTON_PRESSED", auth.sessionId, "backend_unreachable");
    return;
  }

  JsonDocument doc;
  doc["machine_id"] = HIDRO_MACHINE_ID;
  doc["session_id"] = auth.sessionId;
  doc["authorization_id"] = auth.authorizationId;
  doc["relay_expected_state"] = true;
  String body;
  serializeJson(doc, body);

  ApiResult res = api.post("/api/device/session/start", body);
  if (res.ok()) {
    JsonDocument resp;
    deserializeJson(resp, res.body);
    uint32_t duration = resp["duration_seconds"] | auth.durationSeconds;

    running.valid = true;
    strncpy(running.sessionId, auth.sessionId.c_str(), sizeof(running.sessionId) - 1);
    strncpy(running.authorizationId, auth.authorizationId.c_str(), sizeof(running.authorizationId) - 1);
    running.durationSeconds = duration;
    running.deadlineEpochMs = nowEpochMs() + (uint64_t)((float)duration * 1000.0f / HIDRO_TEST_SPEED_FACTOR);
    running.lastTickEpochMs = nowEpochMs();
    running.runStartedEpochMs = nowEpochMs();
    nvs.save(running);

    runStartedAtMs = millis();  // guarda dura local
    state = DeviceState::RUNNING;
    relay.on();  // ESP32 -> relay -> contactor -> motor
    Serial.printf("[run] ciclo iniciado %s por %us\n", running.sessionId, duration);
  } else {
    Serial.printf("[button] backend rechazó el inicio (http %d)\n", res.httpCode);
    if (res.httpCode == 409) {
      // autorización vencida/consumida: volver a IDLE
      auth.present = false;
      state = DeviceState::IDLE;
    }
  }
}

// ---------- Fin de ciclo (timer LOCAL) ----------
void finishWash() {
  relay.off();  // SIEMPRE cortar al vencer el timer local
  Serial.printf("[run] timer cumplido, relay OFF (%s)\n", running.sessionId);

  if (wifiConnected) {
    JsonDocument doc;
    doc["machine_id"] = HIDRO_MACHINE_ID;
    doc["session_id"] = running.sessionId;
    doc["reason"] = "timer_completed";
    doc["duration_seconds"] = running.durationSeconds;
    String body;
    serializeJson(doc, body);
    api.post("/api/device/session/finish", body);
  } else {
    // PENDING (mejora futura): cola off-line para reportar finish al reconectar.
    Serial.println("[run] sin internet al finalizar; el backend quedará RUNNING hasta reintegro manual");
  }
  nvs.clear();
  running.valid = false;
  state = DeviceState::IDLE;
}

// ---------- Boot + recuperación desde NVS ----------
void bootDevice() {
  relay.off();  // FAIL-SAFE absoluto
  bootedAtMs = millis();

  NvsSession saved = nvs.load();
  if (saved.valid && String(saved.sessionId).length() > 0) {
    if (!api.timeValid()) {
      // Sin hora confiable NO podemos decidir resume: seguridad primero.
      Serial.println("[boot] hora NTP no válida: sesión previa -> interrumpida (conservador)");
      running = saved;
      state = DeviceState::IDLE;
      nvs.clear();
      running.valid = false;
      return;
    }
    const uint64_t nowMs = nowEpochMs();
    const uint64_t gap = nowMs > saved.lastTickEpochMs ? nowMs - saved.lastTickEpochMs : 0;
    const int64_t remaining = (int64_t)saved.deadlineEpochMs - (int64_t)nowMs;
    if (gap < REBOOT_RESUME_MAX_GAP_MS && remaining > 0) {
      // Reinicio muy corto y tiempo reconstruible (epoch NTP) -> reanudar seguro.
      running = saved;
      state = DeviceState::RUNNING;
      // La guarda dura sigue valiendo: arrancamos su reloj local restando lo ya consumido.
      const uint32_t consumedMs = (uint32_t)((uint64_t)(saved.durationSeconds * 1000UL) - (uint64_t)remaining);
      runStartedAtMs = millis() - consumedMs;
      relay.on();
      Serial.printf("[boot] reanudando sesión %s (quedan %lld ms)\n", running.sessionId, remaining);
    } else {
      // Corte eléctrico o gap no confiable: SEGURIDAD PRIMERO -> interrumpida
      running = saved;
      state = DeviceState::IDLE;
      Serial.println("[boot] sesión previa no reconstruible -> interrumpida");
      if (wifiConnected) {
        reportInterrupted(running.sessionId, gap >= REBOOT_RESUME_MAX_GAP_MS ? "power_cut_during_session" : "reboot_unreliable");
      }
      nvs.clear();
      running.valid = false;
    }
  } else {
    state = DeviceState::IDLE;
  }
}

// ---------- Guarda dura del relay (independiente de todo lo demás) ----------
void hardRelayGuard() {
  if (!relay.isOn()) return;
  const uint32_t runMs = (uint32_t)(millis() - runStartedAtMs);  // rollover-safe
  const uint32_t maxAllowedMs = (running.durationSeconds * 1000UL) + 5000UL;
  if (runMs > maxAllowedMs) {
    relay.off();
    Serial.printf("[watchdog] relay superó duración+margen (%u ms): OFF forzado\n", runMs);
    if (running.valid) {
      reportInterrupted(running.sessionId, "watchdog_max_runtime");
    }
    nvs.clear();
    running.valid = false;
    auth.present = false;
    state = DeviceState::IDLE;
  }
}

// ---------- setup / loop ----------
void setup() {
  Serial.begin(115200);
  esp_task_wdt_init(10, true);   // watchdog: reinicia si el loop se cuelga
  esp_task_wdt_add(NULL);

  relay.begin(RELAY_PIN, RELAY_ACTIVE_LEVEL);   // arranca OFF
  led.begin(LED_GREEN_PIN, LED_RED_PIN);
  button.begin(BUTTON_PIN);
  nvs.begin();
  api.begin(HIDRO_API_BASE_URL, HIDRO_DEVICE_ID, HIDRO_DEVICE_SECRET);

  Serial.printf("[boot] HIDRO SELF-SERVICE firmware %s máquina %s\n", FIRMWARE_VERSION, HIDRO_MACHINE_ID);
  WiFi.mode(WIFI_STA);

  // NTP: la firma HMAC y la recuperación post-reboot requieren epoch real.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  const uint32_t ntpStart = millis();
  while (!api.timeValid() && millis() - ntpStart < 15000UL) {
    delay(250);
    Serial.print(".");
  }
  Serial.println(api.timeValid() ? "\n[boot] hora NTP sincronizada" : "\n[boot] NTP sin respuesta: arranque conservador (relay OFF)");

  bootDevice();
}

void loop() {
  esp_task_wdt_reset();
  const uint32_t now = millis();

  // GUARDA DURA PRIMERO: pase lo que pase, el relay no queda ON indefinidamente.
  hardRelayGuard();

  connectWifi();
  led.tick(now);

  // LED según estado
  switch (state) {
    case DeviceState::ARMED:   led.set(LedMode::GREEN);        break;
    case DeviceState::RUNNING: led.set(LedMode::GREEN_BLINK);  break;
    case DeviceState::ERROR:   led.set(LedMode::RED);          break;
    default:                   led.set(LedMode::OFF);          break;
  }

  // Timer LOCAL (epoch NTP): corta aunque Internet desaparezca.
  if (state == DeviceState::RUNNING && running.valid && api.timeValid() &&
      running.deadlineEpochMs <= nowEpochMs()) {
    finishWash();
  }

  // Autorización vencida (epoch local, expires_at real del backend): desarmar.
  // El backend sigue siendo la autoridad: si el reloj local estuviera corrido,
  // /session/start responde 409 y el pulsador no arranca nada (fail-safe).
  if (state == DeviceState::ARMED && auth.present && auth.expiresAtMs != 0 &&
      api.timeValid() && auth.expiresAtMs <= nowEpochMs()) {
    Serial.println("[auth] expires_at vencida: autorización local descartada");
    auth.present = false;
    state = DeviceState::IDLE;
  }

  // Persistencia NVS periódica durante RUNNING (para recuperación de reboot)
  if (state == DeviceState::RUNNING && now - lastNvsPersistMs >= NVS_PERSIST_INTERVAL_MS) {
    lastNvsPersistMs = now;
    running.lastTickEpochMs = nowEpochMs();
    nvs.save(running);
  }

  if (wifiConnected) {
    if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatMs = now;
      doHeartbeat();
    }
    if (state == DeviceState::IDLE || state == DeviceState::ARMED) {
      if (now - lastAuthPollMs >= AUTH_POLL_INTERVAL_MS) {
        lastAuthPollMs = now;
        pollAuthorization();
      }
    }
  }

  // Pulsador (debounce interno)
  if (button.tick(now)) {
    onButtonPressed();
  }

  delay(20);
}
