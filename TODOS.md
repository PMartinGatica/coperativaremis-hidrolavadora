# TODOS — MUNDO: HIDRO SELF-SERVICE

> Ítems diferidos explícitamente durante reviews (`/autoplan`, `/plan-*-review`). Cada
> uno tiene su razón de por qué NO entró a la fase que lo generó. Append-only salvo que
> se resuelva (mover a "Resueltos" con la fecha y el PR/commit).

## Abiertos

- **[Proceso, con fecha: 2026-09-28]** Re-correr las fases CEO y Eng de `/autoplan` sobre
  `docs/designs/webhook-ipn-legado.md` **con Codex**. El 2026-09-22 el pipeline corrió con
  una sola voz: `codex exec` devolvió `You've hit your usage limit ... try again at Sep 28th,
  2026`, así que no hubo contraste cruzado. El plan quedó aprobado igual (la decisión central
  se apoya en documentación de MP y evidencia de audit_logs, no en opinión), pero la segunda
  voz sigue pendiente. Pedido explícito de Pablo el 2026-09-22.
  Origen: `/autoplan` sobre `webhook-ipn-legado.md`, 2026-09-22.

- **[Observabilidad, Fase 1.5]** Que el aviso de "llegó un IPN huérfano" (sin su par firmado)
  le llegue a alguien sin tener que ir a mirar el audit. Hoy queda registrado y logueado, que
  es lo que evita la falla silenciosa, pero nadie se entera solo. Comparte el canal de
  notificación que no existe con el ítem de abajo (el del barrido) — **se resuelven juntos, no
  por separado**. Origen: `/autoplan` sobre `webhook-ipn-legado.md` (expansión E6), 2026-09-22.

- **[Fase 1.5]** Notificar al dueño/mesa de entrada cuando el barrido recupera un pago
  automáticamente (hoy nadie se entera salvo que lo note por accidente). Requiere un
  canal de notificación que hoy no existe — fuera del blast radius de la Fase 1.
  Origen: `/autoplan` sobre `docs/designs/reconciliacion-pagos.md`, 2026-09-05.

- **[Backlog]** Contador en el admin: "N sesiones recuperadas manualmente esta semana".
  Nice-to-have, no bloqueante — el admin route de aprobación manual no tiene requisito
  de UI más allá del campo + botón que ya entra a la Fase 1.
  Origen: `/autoplan` sobre `docs/designs/reconciliacion-pagos.md`, 2026-09-05.

- **[Backlog, seguridad]** Rate-limit/cooldown de aprobaciones manuales por admin por
  hora, como defensa adicional más allá del lookup obligatorio de ID de pago real. El
  lookup ya es el control principal contra el abuso que señaló Codex; esto sería
  defensa en profundidad, no requisito para cerrar ese vector.
  Origen: `/autoplan` sobre `docs/designs/reconciliacion-pagos.md`, 2026-09-05.

- **[Arquitectura, no antes de Fase 2+]** Generalizar el patrón "reverificar contra el
  proveedor antes de cualquier escritura en estado terminal" más allá de pagos, como
  estilo de casa para todo código que mueve dinero en este sistema. Ambicioso pero muy
  afuera del blast radius de la Fase 1 (multi-día, muchos call sites no relacionados).
  Origen: `/autoplan` sobre `docs/designs/reconciliacion-pagos.md`, 2026-09-05.

- **[Hardening, seguridad]** Cerrar del todo la ventana de carrera (TOCTOU) entre
  recuperar una sesión `PAYMENT_EXPIRED` y la creación de una sesión nueva en la misma
  máquina: hoy `createSessionWithPayment` bloquea por patente, no por `machineId`, así
  que el chequeo de existencia (`idx_sessions_machine_created`) de la Fase 1 tiene una
  ventana angosta mas no nula. Cierre completo requeriría que `createSessionWithPayment`
  también tome un lock de fila sobre la máquina — toca una función que esta fase no
  modifica por lo demás. Origen: Codex (voz eng de `/autoplan`), confirmado leyendo
  `sessionService.ts:56-115`, 2026-09-05.

- **[Backlog, seguridad]** Permiso `reconcile` dedicado, separado del rol `admin`
  genérico, en vez de negar por email por defecto (que es configuración frágil, no
  identidad real). El chequeo de email por defecto que entra en la Fase 1 cierra el
  hueco concreto encontrado; esto sería la versión robusta. Origen: Codex (voz eng),
  2026-09-05.

- **[Arquitectura, alternativa evaluada y no adoptada por ahora]** En vez de recuperar
  `PAYMENT_EXPIRED` directo a `AUTHORIZED`, Codex propuso un estado no-activo tipo
  `PAID_REQUIRES_ATTENDANT_RELEASE`, liberado solo con el reclamante físicamente
  presente — elimina el algoritmo de recencia, la carrera del índice y el problema de
  autorización desatendida de raíz. Es más grande que el blast radius de la Fase 1 (un
  estado nuevo + un flujo de reclamo atendido). Si la experiencia operativa muestra que
  el fix liviano de la Fase 1 no alcanza, esta es la alternativa estructural a revisar.
  Origen: Codex (voz eng), 2026-09-05.

- **[Instrumentación, mide antes de decidir]** Contar cuántas sesiones llegan a
  `PAYMENT_EXPIRED` por semana, post-mejora del barrido (`f0e3f5d`, T4: busca antes de
  vencer). Resolvería con datos la pregunta que ya queda abierta en el design doc de la
  UI de reconciliación (`docs/designs/reconciliacion-pagos-ui.md`, Approach B): si el
  volumen justifica una cola dedicada o si el fallback manual actual alcanza. Fuera del
  blast radius de esa UI (toca backend/analytics, no solo `apps/web`).
  Origen: `/autoplan` (voz CEO, subagente Claude) sobre
  `docs/designs/reconciliacion-pagos-ui.md`, 2026-09-07.

- **[Operativo, tooling]** `meta/_journal.json` de drizzle-kit está desincronizado: las
  migraciones 0000/0001 fueron escritas a mano sin generar sus snapshots, así que
  `npm run db:generate -w @hidro/api` recrea TODO el schema desde cero en vez de un diff
  incremental (confirmado al usarlo para esta feature — se descartó el archivo generado y
  se escribió `0002_vehicle_pin.sql` a mano). No rompe producción (el runner propio,
  `db/migrate.ts`, no lee esa metadata) pero cualquier futuro `db:generate` va a repetir
  este problema hasta que alguien regenere la base de snapshots correctamente. Fuera del
  blast radius de la feature del PIN. Origen: Build de ADR-036, 2026-09-13.

- **[Backlog, UX]** Cupo diario combinado por persona: hoy cada patente de un socio tiene
  su propio cupo de 2 lavados/día independiente (aunque comparta PIN con otra suya) — no
  lo pidió el cliente explícitamente, y combinarlo cambiaría ADR-024. Revisar si surge
  como pedido real. Origen: `docs/designs/pin-patente-remis-socio.md`, 2026-09-13.

- **[Hardening, al migrar a Postgres con más de una réplica]** `runSeed` hace "select y
  después insert" (`seed.ts:131-143,148-161,183-196`): dos arranques simultáneos contra la
  misma base chocan con los índices únicos y uno sale con error (se recupera al reiniciar).
  Usar `.onConflictDoNothing()`. Hoy es imposible: un solo contenedor con PGlite. Origen:
  `/autoplan` (voz eng, subagente) sobre `docs/designs/guardas-produccion-seed.md`,
  2026-09-15.

- **[Backlog, seguridad]** Pantalla para cambiar la contraseña y dar de baja cuentas admin.
  Hoy la única forma de rotar la clave es `ADMIN_PASSWORD` + Redeploy (sync del seed), y una
  cuenta con email viejo (si cambia `ADMIN_EMAIL`) queda viva con permiso de reconciliar sin
  forma de borrarla desde la UI; solo hay un warning con el conteo al arrancar. Va junto con
  la ruta de cuentas individuales de mesa de entrada (`pendientes-manual.md` C1). Origen:
  `/autoplan` sobre `docs/designs/guardas-produccion-seed.md`, 2026-09-15.

- **[Operativo, al migrar a Postgres]** Activar Healthcheck en Coolify (`/health`, puerto
  3020) recién cuando la base deje de ser PGlite embebido: con healthcheck Coolify puede
  levantar el contenedor nuevo antes de bajar el viejo, y dos procesos PGlite sobre el mismo
  volumen arriesgan corromper la base. Origen: `/autoplan` (voz eng) sobre
  `docs/designs/guardas-produccion-seed.md`, 2026-09-15.

- **[Backlog, seguridad]** Revocar sesiones admin al rotar la clave: `verifyToken`
  (`adminService.ts:57`) solo valida firma y vencimiento, así que un JWT emitido antes de
  cambiar `ADMIN_PASSWORD` (o de borrar la cuenta) sigue sirviendo hasta 12 h. Fix: versión de
  token o `passwordChangedAt` en `admin_users`, chequeado en cada request. Mientras tanto, el
  deploy doc indica rotar `JWT_SECRET` junto con la clave tras un compromiso. Origen: `/review`
  (especialista de seguridad) sobre ADR-038, 2026-09-15.

- **[Hardening]** `PUBLIC_APP_URL` apuntando a `localhost` en producción no frena ni avisa: el
  QR impreso de la máquina y los `back_urls` de Mercado Pago quedarían rotos. Evaluar un warning
  (o sumarlo a `assertProductionConfig`) cuando se pase a Mercado Pago. Origen: `/review`
  (adversarial) sobre ADR-038, 2026-09-15.

- **[Observabilidad]** Un device secret que no descifra con `DEVICE_AUTH_SECRET` hoy solo loguea
  un warning al arrancar; `/health` sigue en OK y el ESP32 falla en la calle con
  `DEVICE_UNAUTHORIZED`. Mostrarlo en `/health` o en el panel. Origen: `/review` (adversarial)
  sobre ADR-038, 2026-09-15.

- **[Robustez, manejo de errores]** Un body JSON mal formado en cualquier endpoint que lo espera
  (probado en `/api/admin/auth/login`) no lo agarra ningún handler dedicado: cae al error genérico
  y responde `500 {"code":"INTERNAL"}` en vez de un `400` claro tipo "JSON inválido". No es un
  problema de seguridad (no hay fuga de datos), pero esconde la causa real ante cualquier cliente
  que mande un body corrupto — en la práctica, encontrado porque PowerShell 5.1 le come las
  comillas a los `-d` de `curl.exe` y el JSON llega roto (ver `pendientes-manual.md` A4). Fix
  acotado: middleware de manejo de error para `express.json()` que convierta `SyntaxError` en un
  `AppError` de validación. Origen: depurando A4 con Pablo, 2026-09-15.

## Resueltos

(ninguno todavía)
