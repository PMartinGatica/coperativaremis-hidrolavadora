# FASE-1 — Reconciliación de pagos · Mundo: HIDRO SELF-SERVICE

> **BORRADOR de alcance, escrito el 2026-09-04.** Todavía NO pasó por `/office-hours` + `/autoplan`,
> que son obligatorios antes de escribir una línea de código (regla innegociable del Universo).
> Este documento es la materia prima de esa sesión, no su reemplazo: existe para que el pipeline
> arranque con el problema ya medido en vez de con una intuición.

## Por qué esta fase y no otra
Es el único bloque grande que **no depende de una decisión ajena**. El ADR-007 (identidad de la
patente) y la política de reembolso esperan al dueño; la polaridad del relay espera a los técnicos.
Esto no espera a nadie, y es lo que hoy pierde plata.

## El problema, medido
Lo que decía el ESTADO — *"sin reconciliación de pagos: si MP pierde el webhook, el cliente pagó y no
pasa nada"* — se quedaba corto. El sistema no es pasivo frente a ese caso: **escribe un veredicto
falso y cierra la puerta.**

Cadena real, verificada leyendo el código y **ejecutando** la máquina de estados:

1. El cliente paga. Mercado Pago tiene la plata.
2. El webhook no llega (o llega tarde): corte de red, contenedor reiniciando, reintentos agotados.
3. A los **120 segundos** (`DEFAULT_PAYMENT_PENDING_TIMEOUT_SECONDS`, `packages/shared/src/constants.ts:23`),
   el barrido de `sweepExpired` (`apps/api/src/services/sessionService.ts:333`) transiciona la sesión
   `PAYMENT_PENDING → PAYMENT_EXPIRED` y marca el pago como `EXPIRED` con motivo `'expired'`.
4. `PAYMENT_EXPIRED` es **terminal**. Verificado ejecutando contra el paquete compilado:

   ```
   PAYMENT_EXPIRED  -> PAYMENT_APPROVED   IMPOSIBLE
   PAYMENT_EXPIRED  -> AUTHORIZED         IMPOSIBLE
   salidas de PAYMENT_EXPIRED: []
   es terminal: true
   ```

   O sea que **un webhook que llegue tarde ya no puede recuperar nada**: la transición no existe.

**El agravante:** los 120 s se cuentan desde `sessions.createdAt`, es decir desde que el cliente
carga la patente — **no** desde que abre el checkout. Escanear el QR, abrir la app de Mercado Pago,
loguearse y confirmar, con la señal de una parada de remises en Ushuaia, pasa de 2 minutos con
facilidad. Esto no es un caso raro de webhook perdido: **se dispara en un pago lento normal.**

**El segundo agujero, más silencioso:** `getPayment()` de la interfaz `PaymentProvider`
(`apps/api/src/payments/mercadoPagoProvider.ts:66`) consulta una **preference**, no un pago, y
devuelve `status: 'PENDING'` **hardcodeado**. Hoy no lo llama nadie, así que no hace daño; el daño
sería que alguien lo cablee como fallback creyendo que sirve, porque **confirmaría** la conclusión
falsa. Es una trampa cargada.

## Lo que lo hace resoluble
`createPayment` ya setea `external_reference: input.sessionId` en la preference
(`mercadoPagoProvider.ts:46`). Mercado Pago permite buscar pagos por ese campo, así que **se puede
llegar al pago real sin el webhook**. La pieza existe; falta usarla.

## Entra
- Un método de búsqueda por `external_reference` en la interfaz `PaymentProvider`, implementado en
  los dos providers (mercadopago y demo), para que el dominio pueda usarlo sin conocer el SDK.
- **Antes de expirar, preguntar.** `sweepExpired` deja de asumir: para cada sesión `PAYMENT_PENDING`
  vencida, consulta al proveedor. Solo expira si el proveedor confirma que no hay pago aprobado.
- Un camino legal para la aprobación tardía en la máquina de estados, sin aflojar el resto de las
  transiciones ni tocar los índices únicos del ADR-003.
- Revisar el valor de los 120 s: es plazo de negocio, no constante técnica.
- Arreglar o eliminar `getPayment()` para que deje de ser una trampa.
- `TRUST_PROXY` / `CF-Connecting-IP` (ADR-022): entra acá porque también es "el sistema se equivoca
  sobre quién es el cliente", y se verifica con la app ya desplegada.
- **Contabilidad del límite diario (ADR-024).** `PAYMENT_PENDING` cuenta, así que un cliente que
  trastabilla se bloquea a sí mismo hasta 2 minutos sin haber lavado. Y `SESSION_INTERRUPTED` /
  `MACHINE_OFFLINE` cuentan, o sea que el cliente paga con su cupo las fallas del sistema.
  **Depende de la respuesta del dueño sobre reembolsos:** si elige "crédito automático", ese crédito
  es inservible mientras el lavado fallido siga quemando el cupo del día. Las dos decisiones se
  toman juntas.

## No entra (obligatorio y específico)
- **Reembolsos.** `refundPayment()` sigue siendo stub hasta que el dueño defina la política. Esta
  fase deja de *perder* pagos; no decide qué hacer con la plata cuando la máquina falló.
- La identidad de la patente (ADR-007): es otra fase, y espera al dueño.
- Nada de firmware. Nada de hardware.
- Sin credenciales reales de Mercado Pago: se construye contra el provider demo y mocks. El SPIKE
  con credenciales de prueba es su propio paso y depende de Pablo.

## Carpetas que se tocan
- `apps/api/src/payments/`, `apps/api/src/services/`, `packages/state-machine/`,
  `packages/shared/src/constants.ts`, `apps/api/tests/`.

## Las 3 puertas del gate
### (a) Test automático
- Un test que reproduzca la pérdida: pago aprobado en el proveedor + webhook que nunca llega +
  barrido corriendo → la sesión **no** debe terminar en `PAYMENT_EXPIRED`.
- Un test de la aprobación tardía (webhook que llega después del vencimiento).
- La suite completa sigue verde: `npm test`.
- No toca `firmware/`, así que **no** aplica la puerta (a) reforzada del ADR-006.

### (b) Test manual
- Guía en `qa/FASE-1-manual.md` (plantilla `docs/qa/FASE-MANUAL-TEMPLATE.md` del Universo),
  validada por Pablo.

### (c) Seguridad
- `docs/SEGURIDAD.md` del Universo + `/cso`. Foco: que la reconciliación no abra una vía para
  autorizar un lavado sin pago real, y que los índices únicos del ADR-003 sigan intactos.

## Checkpoint (al cerrar)
`ESTADO.md`, `ADR.md`, `MAPA.md` si cambia la estructura, y el storyline en
`redessociales-hidro-self-service.md`. Sin storyline la fase no cierra.
