# Guía de test manual — FASE-1 · Mundo: HIDRO SELF-SERVICE

> La puerta (b) del gate. El agente escribe esta guía; el HUMANO (Pablo) la sigue a mano y la valida.
> Cubre lo que el test automático NO juzga: que los mensajes tengan sentido para mesa de entrada,
> que el flujo completo (crear sesión → perder el pago → recuperarlo) se sienta bien de punta a
> punta, y que la cuenta admin por defecto quede realmente bloqueada.
>
> **Esta fase es 100% backend.** Los dos botones de mesa de entrada ("reintentar automáticamente" /
> "aprobación manual") todavía NO tienen UI en el panel admin — se prueban acá con `curl` contra la
> API directamente. Construir esa UI es un pendiente separado (ver `ESTADO.md`).

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
| 1 | Crear una sesión: `curl -X POST http://localhost:3020/api/public/machines/HIDRO-01/sessions -H "Content-Type: application/json" -d '{"plate":"AE100AA"}'` → guardar `sessionId` y `payment.externalPaymentId` | 201, sesión en `PAYMENT_PENDING` | ☐ |
| 2 | **NO** simular el pago todavía. Esperar ~70s (más que el timeout de 60s del paso de Preparación 4) sin tocar nada | La sesión pasa sola a `PAYMENT_EXPIRED` (barrido automático, corre cada 15s) | ☐ |
| 3 | Consultar `GET /api/public/sessions/:sessionId` | `status: "PAYMENT_EXPIRED"` | ☐ |
| 4 | **Simular la aprobación tardía** directo en el proveedor demo (esto simula "MP aprobó pero el webhook se perdió"): `curl -X POST http://localhost:3020/api/public/payments/<externalPaymentId>/simulate -H "Content-Type: application/json" -d '{"action":"approve"}'` | 200 — esto simula el pago en el proveedor, la sesión sigue en `PAYMENT_EXPIRED` (el simulate normal no reconcilia por sí solo una sesión ya vencida) | ☐ |
| 5 | **Caso 1 — reintentar automáticamente** (mesa de entrada aprieta el botón, sin escribir nada): `curl -X POST http://localhost:3020/api/admin/sessions/<sessionId>/reconcile/auto -H "Authorization: Bearer <token>"` (con la cuenta NO-default del paso de Preparación 2) | `{"result":"approved","message":"Pago confirmado: la sesión quedó autorizada de nuevo. Avisale al cliente."}` | ☐ |
| 6 | `GET /api/public/sessions/:sessionId` de nuevo | `status: "AUTHORIZED"` — la sesión revivió | ☐ |
| 7 | Repetir el paso 5 sobre la MISMA sesión (ya recuperada) | `result` distinto de `approved` (la sesión ya no está en un estado recuperable — no debe generar una SEGUNDA autorización) | ☐ |

## Casos borde a probar

- **Caso 2 — sin pago aprobado todavía:** repetir pasos 1-3 con una sesión nueva, pero SIN el
  paso 4 (nunca aprobar en el proveedor). Reintentar automáticamente →
  `{"result":"not_found", "message":"Todavía no aparece ningún pago aprobado..."}`.
- **Caso 3 — aprobación manual con ID real:** con una sesión vencida y aprobada en el proveedor
  (pasos 1-4), en vez del paso 5 usar
  `POST /api/admin/sessions/:sessionId/reconcile/manual` con body
  `{"paymentId":"<externalPaymentId>"}` → mismo resultado `approved`. Probar también con un
  `paymentId` que no exista o pertenezca a otra sesión → `session_id_mismatch`, la sesión NO se
  autoriza.
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

## Veredicto del humano
- [ ] Todos los pasos OK → puerta (b) verde.
- [ ] Hay problemas → anotá cuáles y la fase NO cierra:
  - {problema 1}

## Notas para quien construya la UI del admin panel (pendiente, no de esta fase)
Los mensajes de `RECONCILE_MESSAGES` (`apps/api/src/services/adminService.ts`) ya están escritos
para mostrarse tal cual a mesa de entrada — no hace falta traducirlos ni resumirlos, van
directo en un toast/alert cuando se conecten los dos botones al admin panel.
