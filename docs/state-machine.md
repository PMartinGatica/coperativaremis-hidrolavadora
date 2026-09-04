# Máquina de estados

Centralizada en `packages/state-machine` (TypeScript). El backend valida CADA transición con `assertTransition()` antes de escribir en base de datos; el firmware C++ replica los mismos estados (ver `firmware/esp32/src/hidro_state.h`).

## Estados de sesión

| Estado | Significado |
|---|---|
| `IDLE` | sesión recién creada (transitoria) |
| `PAYMENT_PENDING` | orden de cobro creada, esperando confirmación |
| `PAYMENT_APPROVED` | pago aprobado (hecho consumado) |
| `AUTHORIZED` | autorización temporal generada (`expires_at`) |
| `WAITING_FOR_BUTTON` | el ESP32 recibió la autorización (LED verde) |
| `RUNNING` | ciclo en curso (relay ON) |
| `FINISHED` | ciclo completado normalmente |
| `PAYMENT_FAILED` | pago rechazado |
| `PAYMENT_EXPIRED` | orden vencida sin confirmación |
| `AUTHORIZATION_EXPIRED` | autorización vencida sin pulsador |
| `MACHINE_OFFLINE` | máquina fuera de servicio (no se cobra / pago tardío) |
| `SESSION_INTERRUPTED` | interrupción por falla (corte eléctrico, desconexión) |
| `EMERGENCY_STOP` | parada de emergencia desde admin |
| `DEVICE_ERROR` | error reportado por el dispositivo |

## Transiciones permitidas

```
IDLE ────────────────► PAYMENT_PENDING ──► PAYMENT_APPROVED ──► AUTHORIZED
  └─► MACHINE_OFFLINE        │  ├─► PAYMENT_FAILED        ├─► MACHINE_OFFLINE
                             │  ├─► PAYMENT_EXPIRED       └─► WAITING_FOR_BUTTON
                             │  └─► MACHINE_OFFLINE            ├─► RUNNING
                                                               ├─► AUTHORIZATION_EXPIRED
                                                               └─► EMERGENCY_STOP

AUTHORIZED ──► WAITING_FOR_BUTTON | AUTHORIZATION_EXPIRED | EMERGENCY_STOP
WAITING_FOR_BUTTON ──► RUNNING | AUTHORIZATION_EXPIRED | EMERGENCY_STOP
RUNNING ──► FINISHED | SESSION_INTERRUPTED | EMERGENCY_STOP | DEVICE_ERROR
```

Todo lo demás es `INVALID_TRANSITION` y se rechaza (409). Los estados terminales no tienen salida.

## Estados de autorización (tabla `authorizations`)

```
AUTHORIZED ──► CONSUMED   (pulsador válido: una sola vez)
           ├─► EXPIRED    (sweeper / consulta del dispositivo)
           └─► REVOKED    (emergency stop / máquina offline tras pago)
```

## Estados de pago

`PENDING → APPROVED | REJECTED | EXPIRED | REFUNDED` — el `raw_status` del proveedor se conserva aparte.

## Dónde se aplican las transiciones

| Transición | Quién la ejecuta |
|---|---|
| `IDLE → PAYMENT_PENDING` | `sessionService.createSessionWithPayment` |
| `PAYMENT_PENDING → PAYMENT_APPROVED → AUTHORIZED` | `paymentService.processApproval` (webhook + DEMO) |
| `AUTHORIZED → WAITING_FOR_BUTTON` | `deviceService.getAuthorizationForDevice` (primer fetch del ESP32) |
| `WAITING_FOR_BUTTON → RUNNING` | `deviceService.startSessionFromDevice` (consumo atómico de autorización) |
| `RUNNING → FINISHED/…` | `sessionService.finish/interrupt` + sweeper |
| `* → EMERGENCY_STOP` | `deviceService.emergencyStopFromAdmin` |

Cada transición se audita (`SESSION_STATUS_CHANGED` con `from`/`to`) y alimenta el timeline de la sesión en admin.

## Reglas que la máquina de estados hace imposibles

- Dos ciclos por el mismo pago (`authorizations.payment_id` UNIQUE + `AUTH_CONSUMED`).
- Reutilizar una autorización vencida/consumida (validación en el consumo).
- Usar la autorización de HIDRO-01 en HIDRO-02 (verificación de máquina + `AUTH_WRONG_MACHINE`).
- Dos sesiones activas simultáneas en la misma máquina (índice único parcial + lock de máquina).
- Pasar de `RUNNING` a cualquier estado que no sea fin/interrupción/emergencia/error.
