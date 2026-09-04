#pragma once
#include <Arduino.h>
#include <Preferences.h>

// ============================================================
// Persistencia NVS (sobrevive reinicios y cortes eléctricos).
// Los tiempos se guardan en EPOCH (ms UTC, vía NTP): así el "gap" de reinicio
// y el tiempo restante son comparables entre boots.
// La política de recuperación es CONSERVADORA: si no se puede reconstruir
// el tiempo restante de forma confiable -> relay OFF + sesión interrumpida.
// ============================================================
struct NvsSession {
  bool valid = false;
  char sessionId[40] = {0};
  char authorizationId[40] = {0};
  uint32_t durationSeconds = 0;
  uint64_t deadlineEpochMs = 0;    // deadline en epoch ms (UTC)
  uint64_t lastTickEpochMs = 0;    // última persistencia (para medir gap de reinicio)
  uint64_t runStartedEpochMs = 0;  // inicio del ciclo (para la guarda dura)
};

class NvsStore {
 public:
  void begin() {
    prefs.begin("hidro", false);
  }

  void save(const NvsSession& s) {
    prefs.putBool("valid", s.valid);
    prefs.putString("sess", s.sessionId);
    prefs.putString("auth", s.authorizationId);
    prefs.putUInt("dur", s.durationSeconds);
    prefs.putULong64("deadline", s.deadlineEpochMs);
    prefs.putULong64("lastTick", s.lastTickEpochMs);
    prefs.putULong64("runStart", s.runStartedEpochMs);
  }

  NvsSession load() {
    NvsSession s;
    s.valid = prefs.getBool("valid", false);
    if (!s.valid) return s;
    strncpy(s.sessionId, prefs.getString("sess", "").c_str(), sizeof(s.sessionId) - 1);
    strncpy(s.authorizationId, prefs.getString("auth", "").c_str(), sizeof(s.authorizationId) - 1);
    s.durationSeconds = prefs.getUInt("dur", 0);
    s.deadlineEpochMs = prefs.getULong64("deadline", 0);
    s.lastTickEpochMs = prefs.getULong64("lastTick", 0);
    s.runStartedEpochMs = prefs.getULong64("runStart", 0);
    return s;
  }

  void clear() {
    prefs.putBool("valid", false);
    prefs.remove("sess");
    prefs.remove("auth");
    prefs.remove("dur");
    prefs.remove("deadline");
    prefs.remove("lastTick");
    prefs.remove("runStart");
  }

 private:
  Preferences prefs;
};
