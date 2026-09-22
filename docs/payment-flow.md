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
| Webhook con firma inválida | 401 + `WEBHOOK_INVALID` (en dev sin secret se acepta con warning y la re-consulta es la barrera real) |

## Las DOS vías de notificación de Mercado Pago (ADR-051/052)

Verificado contra MP real en sandbox: **MP avisa del mismo pago por dos caminos en paralelo**, y
no se habilitan igual.

| Vía | Cómo se habilita | Query / body | Firma | Qué contesta el sistema |
|---|---|---|---|---|
| **Webhooks** (nueva) | a mano, en el panel de la cuenta → de ahí sale `MERCADOPAGO_WEBHOOK_SECRET` | `?data.id=X&type=payment` · `{"data":{"id":"X"}}` | verificable | **200**, procesa el pago |
| **IPN** (legada) | sola, vía `notification_url` en cada preference | `?id=X&topic=payment` · `{"resource":"X","topic":"payment"}` | **NO verificable con nuestro secret** | **200** acusado, `WEBHOOK_IGNORED_IPN`, sin procesar |
| `merchant_order` | idem | `?topic=merchant_order` | — | **200**, `ignored_topic` |

MP documenta que la firma de IPN no se puede validar con el secret de la aplicación, y que IPN va
a ser discontinuada. Por eso se acusa recibo sin procesar: el pago entra por la vía firmada.

**Por qué el código de respuesta importa:** si MP no recibe 200/201, **reintenta hasta 4 días**.
De ahí las tres reglas del handler (`webhookRoutes.ts`):

1. Se valida la firma **antes** de clasificar. Clasificar primero permitiría descartar en
   silencio una notificación firmada y legítima si MP cambiara un formato.
2. Lo esperado y no verificable (IPN) recibe **200**: no tiene sentido que MP reintente por días
   algo que igual no vamos a procesar.
3. Un problema **nuestro** (falta el secret) recibe **503** a propósito, para que la cola de
   reintentos siga viva y el pago se procese solo al cargar el secret. Como refuerzo,
   `assertProductionConfig` no deja arrancar la API sin el secret cuando el provider es
   mercadopago: el fallo ocurre en el deploy, no con un cliente parado frente a la máquina.

⚠️ **El paso que se olvida al estrenar una cuenta nueva** es dar de alta el webhook en el panel de
esa cuenta. Sin eso no hay secret, no llega la vía firmada, y cada pago dependería del barrido —
que hace un solo intento. Checklist en `pendientes-manual.md` C2b.

Cuando una aprobación entra por un camino que no es el webhook (`sweep`, `admin_recheck`,
`admin_manual`), queda un `WEBHOOK_MISSING` en el audit y un `logger.error`: varios seguidos
significan que la vía firmada no está llegando.

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
