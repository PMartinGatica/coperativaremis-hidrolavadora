# Pendientes manuales — qué necesito que hagas vos (Pablo/dueño)

> Este archivo es distinto de la sección "Pendientes humanos" de `ESTADO.md`: ahí está el
> roadmap operativo completo del Mundo; **acá está filtrado a lo que específicamente me
> bloquea a mí para seguir construyendo o cerrar lo ya construido.** Se reescribe, no se
> acumula — cuando resolvés uno, lo saco de acá (y si generó una decisión, queda su rastro
> en `ADR.md`).
>
> Última actualización: 2026-09-10, después de dejar listo el deploy single-domain (ADR-035).

## 1. Validar lo que ya construí (bloquea cerrar la Fase 1 en los hechos)

- **Correr `qa/FASE-1-manual.md` y marcar el veredicto.** Es la puerta (b) del gate de este
  Mundo — sin tu OK ahí, la Fase 1 (y su UI, recién construida) queda con el código andando
  pero sin cerrar formalmente. La guía tiene una sección nueva "Probar desde la UI" — ya
  verifiqué en vivo (Edge headless) que la card aparece, el botón automático y el form manual
  disparan los requests reales y muestran el mensaje correcto, y la card desaparece en una
  sesión ya resuelta. Lo que me faltó probar (necesita una cuenta `admin_users` NO-default,
  que hoy no existe): el camino donde el pago SÍ se aprueba (mensaje verde). Son ~15 minutos.

## 2. Decisiones tuyas que bloquean código específico

- **Política de reembolso** (premisa 5 de la Fase 1). `refundPayment()` sigue siendo un
  stub a propósito — no puedo implementarlo de verdad hasta que decidas: ¿reembolso
  automático, crédito para el próximo lavado, o revisión caso por caso? Esto también
  destraba el cupo diario (ADR-024): hoy un lavado que falla por culpa del sistema le
  cobra el cupo al cliente, y arreglarlo bien depende de qué política elijas acá.
- **ADR-007 — identidad de la patente.** Sigue sin resolver desde antes de la Fase 1. Sin
  esto no puedo tocar cómo se identifica a un socio/remis de forma más robusta que "la
  patente que cargó en el momento".

## 3. Cuentas y credenciales que necesito que consigas

- **Cuentas individuales para mesa de entrada** (`admin_users`) — esto ahora es lo único
  que falta para que la UI de reconciliación (recién construida, ADR-034) sirva de algo en
  la práctica. Hoy el sistema tiene UNA sola cuenta admin (la que sembró el `.env`), y está
  bloqueada a propósito para reconciliar pagos (para que quede auditado quién reconcilia
  cada uno) — cualquier intento con esa cuenta muestra "usá tu cuenta individual" y no
  autoriza nada. Necesito que me digas: ¿cuántas personas van a usar mesa de entrada, y con
  qué email cada una? Con eso agrego la ruta para crear esas cuentas (hoy no existe).
- **Cuenta de desarrollador de Mercado Pago + usuario de prueba** (ADR-018). Sin esto,
  todo lo de pagos sigue construido y probado solo contra el proveedor DEMO — el SPIKE de
  validar contra la API real de Mercado Pago (mencionado como pendiente en
  `mercadoPagoProvider.ts`) no lo puedo hacer sin credenciales de prueba tuyas.

## 4. Acciones fuera de lo que yo puedo tocar

- **App en Coolify** (`docs/deploy-coolify.md`). Ahora es el ÚNICO paso que falta para que
  `hidro-api.insolvadev.com` muestre el producto completo — API + panel admin + flujo del
  cliente, todo en el mismo link (ADR-035, recién construido y verificado en vivo). Antes
  de esto, aunque crearas la app, solo se veía JSON; ya no. Yo no tengo acceso a tu Coolify,
  así que este paso es 100% tuyo — 5 pasos en la guía, `Dockerfile` y variables ya listos.
- **Puesta en marcha del hardware con vos presente**, timer viejo como red de seguridad.
  Bloquea probar la polaridad del relay (ADR-015) — `[STOP-HUMANO]`, no se automatiza.
- **Respuestas a los mensajes ya generados en `mensajes/`** — técnicos (relay + contactor)
  y las preguntas tuyas pendientes sobre reembolso/cupo diario/cuenta de MP (mismo tema
  que el punto 2, pero ahí están redactadas como para reenviar tal cual).

---

**Si no hacés nada de esto:** igual puedo seguir construyendo otras cosas del Mundo que no
dependan de estos puntos. Decime por dónde seguir si preferís eso mientras tanto.
