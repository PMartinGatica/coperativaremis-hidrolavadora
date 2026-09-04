#pragma once
#include <Arduino.h>

// ============================================================
// Máquina de estados DEL DISPOSITIVO (espejo del estado de sesión del backend,
// pero las decisiones de seguridad se toman LOCALMENTE).
//
//   BOOT -> IDLE -> ARMED -> RUNNING -> IDLE
//   ERROR y EMERGENCY son estados de seguridad: relay OFF siempre.
// ============================================================
enum class DeviceState : uint8_t {
  BOOT,      // arrancando: relay OFF (fail-safe)
  IDLE,      // sin autorización: LED apagado
  ARMED,     // autorización válida recibida: LED verde fijo
  RUNNING,   // ciclo en curso: relay ON, LED verde parpadeando
  ERROR,     // error de dispositivo: relay OFF, LED rojo
};

const char* stateName(DeviceState s) {
  switch (s) {
    case DeviceState::BOOT:    return "BOOT";
    case DeviceState::IDLE:    return "IDLE";
    case DeviceState::ARMED:   return "ARMED";
    case DeviceState::RUNNING: return "RUNNING";
    case DeviceState::ERROR:   return "ERROR";
  }
  return "?";
}
