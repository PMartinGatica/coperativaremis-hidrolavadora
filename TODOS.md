# TODOS — MUNDO: HIDRO SELF-SERVICE

> Ítems diferidos explícitamente durante reviews (`/autoplan`, `/plan-*-review`). Cada
> uno tiene su razón de por qué NO entró a la fase que lo generó. Append-only salvo que
> se resuelva (mover a "Resueltos" con la fecha y el PR/commit).

## Abiertos

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

## Resueltos

(ninguno todavía)
