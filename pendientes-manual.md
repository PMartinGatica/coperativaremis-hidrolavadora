# Pendientes manuales — qué necesito que hagas vos (Pablo/dueño)

> Este archivo es distinto de la sección "Pendientes humanos" de `ESTADO.md`: ahí está el
> roadmap operativo completo del Mundo; **acá está filtrado a lo que específicamente me
> bloquea a mí para seguir construyendo o cerrar lo ya construido.** Se reescribe, no se
> acumula — cuando resolvés uno, lo saco de acá (y si generó una decisión, queda su rastro
> en `ADR.md`).
>
> Última actualización: 2026-09-07, después de cerrar la Fase 1 (reconciliación de pagos).

## 1. Validar lo que ya construí (bloquea cerrar la Fase 1 en los hechos)

- **Correr `qa/FASE-1-manual.md` y marcar el veredicto.** Es la puerta (b) del gate de este
  Mundo — sin tu OK ahí, la Fase 1 queda con el código andando pero sin cerrar formalmente.
  Son ~20 minutos con `curl`, la guía tiene los comandos exactos copiables. Si algo no te
  cierra al probarlo, anotalo en la guía misma (sección "Veredicto del humano") y seguimos
  desde ahí.

## 2. Decisiones tuyas que bloquean código específico

- **Política de reembolso** (premisa 5 de la Fase 1). `refundPayment()` sigue siendo un
  stub a propósito — no puedo implementarlo de verdad hasta que decidas: ¿reembolso
  automático, crédito para el próximo lavado, o revisión caso por caso? Esto también
  destraba el cupo diario (ADR-024): hoy un lavado que falla por culpa del sistema le
  cobra el cupo al cliente, y arreglarlo bien depende de qué política elijas acá.
- **ADR-007 — identidad de la patente.** Sigue sin resolver desde antes de la Fase 1. Sin
  esto no puedo tocar cómo se identifica a un socio/remis de forma más robusta que "la
  patente que cargó en el momento".
- **¿Construyo ya la UI del admin panel para los 2 botones de reconciliación?** Hoy
  funcionan pero solo se prueban con `curl` (ver punto 1). Es la próxima tarea obvia si
  querés que mesa de entrada los use de verdad — decime si es prioridad o si esperamos.

## 3. Cuentas y credenciales que necesito que consigas

- **Cuenta de desarrollador de Mercado Pago + usuario de prueba** (ADR-018). Sin esto,
  todo lo de pagos sigue construido y probado solo contra el proveedor DEMO — el SPIKE de
  validar contra la API real de Mercado Pago (mencionado como pendiente en
  `mercadoPagoProvider.ts`) no lo puedo hacer sin credenciales de prueba tuyas.
- **Cuentas individuales para mesa de entrada** (`admin_users`). Hoy el sistema tiene UNA
  sola cuenta admin (la que sembró el `.env`), y la Fase 1 la bloquea a propósito para
  reconciliar pagos (para que quede auditado quién reconcilia cada uno). Necesito que me
  digas: ¿cuántas personas van a usar mesa de entrada, y con qué email cada una? Con eso
  agrego la ruta para crear esas cuentas (hoy no existe).

## 4. Acciones fuera de lo que yo puedo tocar

- **App en Coolify** (`docs/deploy-coolify.md`). Es el único paso que falta para que el
  backend esté vivo en producción de verdad — yo no tengo acceso a tu Coolify.
- **Puesta en marcha del hardware con vos presente**, timer viejo como red de seguridad.
  Bloquea probar la polaridad del relay (ADR-015) — `[STOP-HUMANO]`, no se automatiza.
- **Respuestas a los mensajes ya generados en `mensajes/`** — técnicos (relay + contactor)
  y las preguntas tuyas pendientes sobre reembolso/cupo diario/cuenta de MP (mismo tema
  que el punto 2, pero ahí están redactadas como para reenviar tal cual).

---

**Si no hacés nada de esto:** igual puedo seguir construyendo otras cosas del Mundo que no
dependan de estos puntos (por ejemplo, la UI del admin panel del punto 2, sin esperar a que
definas la política de reembolso). Decime por dónde seguir si preferís eso mientras tanto.
