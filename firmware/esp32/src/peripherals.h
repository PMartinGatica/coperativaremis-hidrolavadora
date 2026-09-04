#pragma once
#include <Arduino.h>

// El debounce lo fija app_config.h. Fallback por si este header se usa suelto.
// OJO: NO declarar una constante (constexpr/const) con el mismo nombre que la
// macro. El preprocesador reemplaza el identificador por el número y el archivo
// no compila ("expected unqualified-id before numeric constant").
#ifndef BUTTON_DEBOUNCE_MS
#define BUTTON_DEBOUNCE_MS 50
#endif

// ============================================================
// Periféricos: relay (FAIL-SAFE), LED de estado y pulsador con debounce.
// El relay arranca SIEMPRE apagado y nunca se enciende fuera de RUNNING.
// ============================================================

class Relay {
 public:
  void begin(uint8_t pin, uint8_t activeLevel) {
    pin_ = pin;
    activeLevel_ = activeLevel;
    pinMode(pin_, OUTPUT);
    off();  // FAIL-SAFE: relay OFF en boot y en todo reset
  }
  void on()  { digitalWrite(pin_, activeLevel_);  on_ = true; }
  void off() { digitalWrite(pin_, activeLevel_ ? LOW : HIGH); on_ = false; }
  bool isOn() const { return on_; }

 private:
  uint8_t pin_ = 0;
  uint8_t activeLevel_ = HIGH;
  bool on_ = false;
};

enum class LedMode : uint8_t { OFF, GREEN, GREEN_BLINK, RED };

class Led {
 public:
  void begin(uint8_t greenPin, uint8_t redPin) {
    greenPin_ = greenPin;
    redPin_ = redPin;
    pinMode(greenPin_, OUTPUT);
    pinMode(redPin_, OUTPUT);
    set(LedMode::OFF);
  }
  void set(LedMode m) {
    mode_ = m;
    lastBlink_ = millis();
    apply(millis());
  }
  void tick(uint32_t now) {
    if (mode_ == LedMode::GREEN_BLINK && now - lastBlink_ >= 500) {
      lastBlink_ = now;
      greenOn_ = !greenOn_;
      digitalWrite(greenPin_, greenOn_ ? HIGH : LOW);
    }
  }

 private:
  void apply(uint32_t /*now*/) {
    switch (mode_) {
      case LedMode::OFF:        digitalWrite(greenPin_, LOW);  digitalWrite(redPin_, LOW);  break;
      case LedMode::GREEN:      digitalWrite(greenPin_, HIGH); digitalWrite(redPin_, LOW);  break;
      case LedMode::GREEN_BLINK: greenOn_ = true; digitalWrite(greenPin_, HIGH); digitalWrite(redPin_, LOW); break;
      case LedMode::RED:        digitalWrite(greenPin_, LOW);  digitalWrite(redPin_, HIGH); break;
    }
  }

  uint8_t greenPin_ = 0;
  uint8_t redPin_ = 0;
  LedMode mode_ = LedMode::OFF;
  bool greenOn_ = false;
  uint32_t lastBlink_ = 0;
};

class Button {
 public:
  // Sin callback: el loop consulta tick() y decide (no hay ISR ni callback oculto).
  void begin(uint8_t pin) {
    pin_ = pin;
    pinMode(pin_, INPUT_PULLUP);
  }

  // Polling con debounce (sin ISR: simple y robusto).
  // Devuelve true SOLO en el flanco de presión.
  bool tick(uint32_t now) {
    bool raw = digitalRead(pin_) == LOW;  // pulsador a GND
    if (raw != lastRaw_) {
      lastRaw_ = raw;
      if (raw) pressedAt_ = now;
    }
    if (raw && !fired_ && now - pressedAt_ >= BUTTON_DEBOUNCE_MS) {
      fired_ = true;
      return true;
    }
    if (!raw) fired_ = false;
    return false;
  }

 private:
  uint8_t pin_ = 0;
  bool lastRaw_ = false;
  bool fired_ = false;
  uint32_t pressedAt_ = 0;
};
