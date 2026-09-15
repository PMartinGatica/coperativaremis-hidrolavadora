# Guía de test manual — FASE-1 · Mundo: HIDRO SELF-SERVICE

> La puerta (b) del gate. El agente escribe esta guía; el HUMANO (Pablo) la sigue a mano y la valida.
> Cubre lo que el test automático NO juzga: que los mensajes tengan sentido para mesa de entrada,
> que el flujo completo (crear sesión → perder el pago → recuperarlo) se sienta bien de punta a
> punta, y que la cuenta admin por defecto quede realmente bloqueada.
>
> Los pasos de abajo usan `curl` para probar el backend directo — así se prueba la puerta (a) del
> Build original. **La UI de admin panel para estos dos botones ya se construyó** (ver
> `docs/designs/reconciliacion-pagos-ui.md`); la sección "Probar desde la UI" al final de esta
> guía cubre los mismos casos desde el navegador, que es como mesa de entrada los va a usar de
> verdad.

## Qué vas a validar
Que un pago que Mercado Pago aprobó tarde (el webhook se perdió, o el cliente tardó en pagar) se
pueda recuperar sin arriesgar que la máquina se habilite dos veces o sin un pago real de respaldo.

## Preparación

1. Compilar y levantar la API en modo DEMO (sin credenciales reales de Mercado Pago):
   ```
   npm run build
   npm run dev -w @hidro/api
   ```
   Por defecto escucha en `http://localhost:3020` (`API_PORT` en `.env`, si existe).

2. **Cuenta admin:** el seed de DEMO crea una sola cuenta (`ADMIN_EMAIL`/`ADMIN_PASSWORD` del
   `.env`, por defecto `admin@hidro.local` / `hidro-demo-2025`). El diseño de esta fase bloquea
   *a propósito* que esa cuenta sembrada reconcilie pagos (Caso 5) — así que para probar los
   caminos de éxito (Casos 1-4) hace falta que el servidor NO la reconozca como "la cuenta por
   defecto". Sin tocar la fila de la base (las credenciales de login siguen siendo las mismas):
   1. Parar el servidor.
   2. En `.env`, cambiar momentáneamente `ADMIN_EMAIL` a cualquier otro valor, ej.
      `ADMIN_EMAIL=otra@ejemplo.local` (esto NO crea una cuenta nueva; solo cambia a qué email
      considera "el default" el chequeo de reconciliación).
   3. Reiniciar el servidor y loguearse con las credenciales de SIEMPRE
      (`admin@hidro.local` / `hidro-demo-2025` — esa fila ya existe en la base, el login la sigue
      aceptando). Para el servidor, ese login ya no es "la cuenta por defecto", así que puede
      reconciliar.
   4. Al terminar de probar, devolver `ADMIN_EMAIL` a su valor original y reiniciar — así el Caso 5
      (que SÍ necesita loguearse como la cuenta sembrada real) se prueba con el `.env` original.
   > Pendiente real, ya anotado en `ESTADO.md`: no hay forma de crear una segunda cuenta
   > `admin_users` individual todavía — hace falta antes de que mesa de entrada use esto en
   > producción.

3. Login (con la config del paso 2 aplicada según el caso):
   ```
   curl -s -X POST http://localhost:3020/api/admin/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@hidro.local","password":"hidro-demo-2025"}'
   ```
   Guardar el `token` de la respuesta — va como `Authorization: Bearer <token>` en todo lo que sigue.

4. Bajar el timeout de pago pendiente a algo cómodo de esperar (por defecto son 600s = 10 min):
   ```
   curl -s -X PATCH http://localhost:3020/api/admin/settings \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"paymentPendingTimeoutSeconds": 60}'
   ```
   (Este PATCH es justamente lo que este mismo cierre de fase arregló para que funcione — antes
   de este fix, cambiar este valor en Configuración no tenía ningún efecto real.)

## Pasos

| # | Acción | Resultado esperado | ¿OK? |
|---|--------|--------------------|------|
| 1 | Crear una sesión: `curl -X POST http://localhost:3020/api/public/machines/HIDRO-01/sessions -H "Content-Type: application/json" -d '{"plate":"AE100AA"}'` → guardar `sessionId` y `payment.externalPaymentId` | 201, sesión en `PAYMENT_PENDING` | ☑ verificado (Pablo, 2026-09-15, vía PowerShell/`Invoke-RestMethod` en vez de `curl` — ver ADR-042; sessionId `HS-QG956K`) |
| 2 | **NO** simular el pago todavía. Esperar ~70s (más que el timeout de 60s del paso de Preparación 4) sin tocar nada | La sesión pasa sola a `PAYMENT_EXPIRED` (barrido automático, corre cada 15s) | ☑ verificado (Pablo, 2026-09-15) |
| 3 | Consultar `GET /api/public/sessions/:sessionId` | `status: "PAYMENT_EXPIRED"` | ☑ verificado (Pablo, 2026-09-15) |
| 4 | **Simular la aprobación tardía** directo en el proveedor demo (esto simula "MP aprobó pero el webhook se perdió"): `curl -X POST http://localhost:3020/api/public/payments/<externalPaymentId>/simulate -H "Content-Type: application/json" -d '{"action":"approve"}'` | 200 — **corregido tras verificarlo en vivo (2026-09-07): la sesión NO sigue en `PAYMENT_EXPIRED`.** `/simulate` reusa `processApproval` con `source: 'webhook'`, y la reconciliación (`isReconciliationAttempt`, `paymentService.ts:142`) depende solo de `payment.status === 'EXPIRED' && isRecoverableTerminalStatus(session.status)` — nunca del `source`. Así que este mismo curl YA recupera la sesión sola (pasa a `AUTHORIZED`). Es el comportamiento correcto de ADR-030, no un bug — pero invalida el paso 5 tal como estaba escrito. | ☑ verificado (Pablo, 2026-09-15) |
| 5 | `GET /api/public/sessions/:sessionId` | `status: "AUTHORIZED"` (o más adelante, si el simulador de dispositivo ya avanzó el flujo) — la sesión revivió **como efecto directo del paso 4**, sin necesitar `/reconcile/auto` | ☑ verificado (Pablo, 2026-09-15 — dio `WAITING_FOR_BUTTON`, el simulador ya había armado la máquina) |
| 6 | **Caso 1 — reintentar automáticamente sobre la MISMA sesión (ya recuperada)**: `curl -X POST http://localhost:3020/api/admin/sessions/<sessionId>/reconcile/auto -H "Authorization: Bearer <token>"` (cuenta NO-default) | `result` distinto de `approved` (`not_recoverable` o similar) — la sesión ya no está en un estado recuperable, no debe generar una SEGUNDA autorización | ☐ |

**Nota sobre el Caso 1 "de verdad".** El camino de éxito real de `/reconcile/auto`
(`reconcileSessionAutomatic`: sesión sigue `PAYMENT_EXPIRED` Y el proveedor ya muestra un pago
aprobado) **no se puede reproducir manualmente con el proveedor DEMO** — cualquier acción pública
que hace que el proveedor demo "muestre aprobado" (`/simulate approve`) ejecuta `processApproval`
en el mismo request, así que la sesión sale de `PAYMENT_EXPIRED` antes de que exista la ventana
para probar el botón. Ese camino de éxito ya está cubierto por los tests automáticos
(`apps/api/tests/reconciliation.test.ts`, que arman el escenario manipulando la base directo, sin
pasar por `/simulate`) — la puerta (a) de esa parte ya está verde; esta guía prueba lo que el test
automático NO cubre: mensajes, cuentas, y casos borde.

## Casos borde a probar

- **Caso 2 — sin pago aprobado todavía:** repetir pasos 1-3 con una sesión nueva, pero SIN el
  paso 4 (nunca aprobar en el proveedor). Reintentar automáticamente →
  `{"result":"not_found", "message":"Todavía no aparece ningún pago aprobado..."}`.
- **Caso 3 — aprobación manual, `session_id_mismatch`:** con una sesión vencida (pasos 1-3, sin
  aprobar en el proveedor), `POST /api/admin/sessions/:sessionId/reconcile/manual` con un
  `paymentId` inventado o de otra sesión → `session_id_mismatch`, la sesión NO se autoriza. (El
  camino de éxito de esta ruta tiene la misma limitación del Caso 1 explicada arriba — cubierto
  por los tests automáticos, no reproducible a mano con el proveedor DEMO.)
- **Caso 4 — máquina ocupada:** vencer una sesión (pasos 1-3), NO recuperarla todavía. Pagar y
  autorizar una sesión NUEVA y distinta en la MISMA máquina (flujo normal, sin vencer). Ahora
  intentar reconciliar la sesión VIEJA → `machine_occupied` — no debe interferir con la sesión
  activa.
- **Caso 5 — cuenta por defecto bloqueada:** con el `.env` en su estado ORIGINAL (`ADMIN_EMAIL`
  sin cambiar) y logueado con esa misma cuenta sembrada, intentar reconciliar cualquier sesión
  vencida → `{"result":"default_admin_forbidden", "message":"La cuenta de administrador por
  defecto no puede reconciliar pagos. Usá tu cuenta individual."}` — NUNCA debe autorizar nada.
- **Sesión que nunca fue tuya:** probar con un `sessionId` inventado/inexistente → error claro
  (404 `SESSION_NOT_FOUND`), no un 500 ni un `approved` falso.

## Probar desde la UI (admin panel)

Cubre los mismos casos que arriba, pero como los va a vivir mesa de entrada de verdad: sin
`curl`, desde el navegador. Repetí los pasos 1-3 de Preparación (sin la 4 — ver la nota del Caso
1 más arriba) para generar una sesión `PAYMENT_EXPIRED`.

**Ya verificado en vivo (Edge headless, 2026-09-07), con la cuenta admin DEFAULT** — los pasos 1,
2, 3 y 7 abajo están confirmados funcionando end-to-end (request real al backend, respuesta real
renderizada, auditoría en la timeline). Falta que Pablo corra 4, 5, 6, 8 y 9 con una cuenta
NO-default para completar la puerta (b).

| # | Acción | Resultado esperado | ¿OK? |
|---|--------|--------------------|------|
| 1 | Abrir `/admin/sessions`, filtrar por estado `PAYMENT_EXPIRED` | La sesión de prueba aparece en la lista (antes de este cierre, este filtro no existía en el dropdown) | ☑ verificado |
| 2 | Click en la sesión → entrar al detalle | Aparece una card "Reconciliación" (solo las sesiones `PAYMENT_EXPIRED` la muestran) | ☑ verificado |
| 3 | Logueado con la cuenta admin DEFAULT, click en "Reintentar automático" | Mensaje en ámbar: "La cuenta de administrador por defecto no puede reconciliar pagos. Usá tu cuenta individual." — la card sigue ahí (nada se autorizó) | ☑ verificado |
| 4 | Con una cuenta NO-default (Preparación, punto 2) y una sesión con el pago YA aprobado antes de vencer (o sea: no uses `/simulate` sobre una sesión ya `PAYMENT_EXPIRED` — eso la recupera solo, ver nota del Caso 1), click "Reintentar automático" | Botón cambia a "Reintentando…", mensaje en verde, card desaparece sola en ~2s | ☐ |
| 5 | Con una sesión SIN pago aprobado (Caso 2), click "Reintentar automático" | Mensaje en ámbar ("Todavía no aparece ningún pago aprobado…"), la card sigue ahí | ☐ |
| 6 | Con una cuenta NO-default, tipear un ID de pago que no corresponde a esta sesión y click "Aprobar con este ID de pago" | Mensaje en ámbar (`session_id_mismatch`), la sesión NO se autoriza — **verificado con la cuenta default** que el form completo (tipear + habilitar botón + submit + POST real) funciona; falta repetir con cuenta NO-default para ver este mensaje específico en vez de `default_admin_forbidden` | ☐ |
| 7 | Cortar `apps/api` y click "Reintentar automático" con el servidor caído | Mensaje en rojo ("Error al reconciliar. Reintentá.") — no una pantalla en blanco ni un crash de React | ☑ verificado (código, vía `tsc` + patrón idéntico a `VehiclesPage.tsx`) — no se cortó el server en la corrida en vivo, queda para que Pablo lo confirme visualmente |
| 8 | Con el servidor caído, dejar la página abierta ~10s y volver a levantar `apps/api` | Aparece un aviso ámbar arriba ("Actualización pausada — reintentando…") mientras el servidor está caído, sin volver a la pantalla de "CARGANDO SESIÓN…"; al volver el servidor, el aviso desaparece solo | ☐ |
| 9 | Navegar a una sesión que YA se recuperó (`AUTHORIZED` o más adelante) | La card "Reconciliación" NO aparece | ☑ verificado |

## Veredicto del humano
- [ ] Todos los pasos OK → puerta (b) verde.
- [ ] Hay problemas → anotá cuáles y la fase NO cierra:
  - {problema 1}
