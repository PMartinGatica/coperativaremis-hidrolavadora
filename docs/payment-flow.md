# Flujo de pago

## Patente y tarifas (decisión del cliente)

Antes de pagar, el cliente ingresa su **patente** y el sistema cotiza la tarifa:

| Categoría | Tarifa | Regla |
|---|---|---|
| Remis de la cooperativa | $500 | Patente registrada `remis` (admin → Patentes) |
| Auto de socio | $2.000 | Patente registrada `socio` (admin → Patentes) |
| Particular no asociado | $8.000 | Patente NO registrada |

- `POST /api/public/machines/:id/quote {plate}` → cotización SIN cobrar (categoría, tarifa, lavados restantes del día).
- `POST /api/public/machines/:id/sessions {plate}` → re-valida TODO en el servidor (nunca se confía en el frontend).
- **Límite diario por patente** (default 2, configurable): los lavados pagados/aprobados del día cuentan; superado → 409 `PLATE_LIMIT_REACHED` y NO se cobra. Protegido contra carreras con `pg_advisory_xact_lock(hashtext(patente))` + lock `FOR UPDATE` de la máquina.
- La patente se normaliza (mayúsculas, sin espacios/guiones) y se registra en la sesión, el pago y el timeline de admin.

## Secuencia feliz (DEMO y Mercado Pago comparten el dominio)

```
cliente            web                     backend                        proveedor
   │  /machine/HIDRO-01                      │                               │
   │  ingresa patente -> POST /quote         │                               │
   │ ◄────── tarifa + lavados restantes ─────│                               │
   │  POST /api/public/machines/:id/sessions {plate}                         │
   │ ───────────────────────────────────────►│                               │
   │            (locks patente+máquina: ONLINE? libre? límite diario?)        │
   │            tarifa por categoría de patente                              │
   │            sesión: IDLE → PAYMENT_PENDING                              │
   │            createPayment() ────────────────────────────────────────────►│
   │            pago PENDING + initPoint                                     │
   │ ◄───────────────────────────────────────│                               │
   │  redirect (MP) o /pay/:id (DEMO)        │                               │
   │ ───────── pago ────────────────────────────────────────────────────────►│
   │                                         │ ◄────────── webhook ──────────│
   │                                         │  1. validar firma HMAC        │
   │                                         │  2. RE-CONSULTAR pago (API)   │
   │                                         │  3. verificar importe         │
   │                                         │  4. verificar máquina/sesión  │
   │                                         │  processApproval():           │
   │                                         │    PAYMENT_PENDING →          │
   │                                         │    PAYMENT_APPROVED →        │
   │                                         │    AUTHORIZED (expires_at)    │
   │  polling /api/public/sessions/:id (1s)  │                               │
   │ ◄────────── estado + eventos ───────────│                               │
   │  "MÁQUINA HABILITADA — presioná el botón físico"                        │
```

El frontend **nunca** consulta Mercado Pago directamente: el webhook actualiza el backend y el frontend hace polling del estado de la sesión.

## Punto único de aprobación: `processApproval()`

Tanto el webhook real como `POST /api/public/payments/:externalId/simulate` (DEMO) llaman al MISMO `processApproval()`:

1. Bloquea la fila de pago `FOR UPDATE` (webhooks concurrentes se serializan).
2. Pago no encontrado → `WEBHOOK_UNKNOWN_PAYMENT` → ignorado (200 para frenar reintentos).
3. Ya APPROVED + autorización existente → `WEBHOOK_DUPLICATED` → devuelve la misma autorización.
4. `REJECTED` → pago rechazado, sesión `PAYMENT_FAILED`. Sin autorización.
5. Importe ≠ importe esperado → rechazado + auditoría (`amount_mismatch`). Sin autorización.
6. Máquina offline/deshabilitada en el momento → autorización **REVOCADA** inmediatamente + sesión `MACHINE_OFFLINE` + auditoría *PENDING CLIENT DECISION: política de reembolso*.
7. Feliz → autorización `AUTHORIZED` con `expires_at = now + AUTH_TTL_SECONDS` (default 300 s).

Restricciones de base de datos como red de seguridad:
- `payments.external_payment_id` UNIQUE
- `authorizations.payment_id` UNIQUE → **nunca 2 autorizaciones por pago**
- `authorizations.session_id` UNIQUE

## Idempotencia ante webhooks duplicados

| Escenario | Resultado |
|---|---|
| Webhook 2x del mismo pago | 2da vez → `WEBHOOK_DUPLICATED`, misma autorización, sin duplicar nada |
| Crash entre "payment APPROVED" y "auth creada" | el siguiente webhook detecta APPROVED sin auth y la crea (recuperación) |
| Webhook con pago desconocido | auditado e ignorado (no se genera nada) |
| Webhook con firma inválida | 401 + `WEBHOOK_INVALID` (Mercado Pago no debe reintentar un webhook inválido; en dev sin secret se acepta con warning y la re-consulta es la barrera real) |

## SIMULAR PAGO (DEMO)

La pantalla `/pay/:externalId` usa el mismo camino:

- **APROBAR** → `provider.approve()` + `processApproval()` (webhook simulado válido).
- **RECHAZAR** → `processApproval(REJECTED)`.
- **DEJAR PENDIENTE** → sin cambios; el sweeper lo vence (`PAYMENT_EXPIRED`) a los `PAYMENT_PENDING_TIMEOUT_SECONDS` (default **120 s**, `DEFAULT_PAYMENT_PENDING_TIMEOUT_SECONDS` en `packages/shared/src/constants.ts`).
- **WEBHOOK DUPLICADO** → `processApproval()` dos veces → segunda idempotente.
- **WEBHOOK INVÁLIDO** → descartado sin tocar el dominio.

## SPIKE Mercado Pago (antes de producción)

1. `PAYMENT_PROVIDER=mercadopago` + credenciales de prueba.
2. Crear preference → pagar con tarjeta de prueba desde el MISMO celular.
3. Recibir webhook real y verificar: firma `x-signature` (formato `ts=...,v1=...` — confirmar contra docs vigentes), re-consulta, autorización creada UNA vez.
4. Probar `back_urls` (success/pending/failure) con `?session=` en la URL.
5. Recién entonces pasar a credenciales productivas.

El proveedor se puede cambiar de `demo` a `mercadopago` sin tocar `SessionService`, `AuthorizationService` ni `DeviceService`.

## PENDING CLIENT DECISION

- Política de reembolso automático ante máquina offline después del pago.
- Política comercial ante corte eléctrico durante una sesión paga (el sistema registra la interrupción con trazabilidad completa).
- Precio definitivo del lavado.
