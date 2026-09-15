# Cadencia — MUNDO: HIDRO SELF-SERVICE

> **PASO 4 de la receta — Cadencia (automatización progresiva).** Cómo este Mundo gana autonomía,
> en 4 fases. No se salta de fase: cada una tiene un criterio de salida. Nada marcado
> `[STOP-HUMANO]` en `docs/SEGURIDAD.md` (Universo) se automatiza nunca.
>
> **Regla transversal (innegociable):** cualquier construcción se hace con el pipeline gstack de
> inicio a fin, en el **modo híbrido** de este Mundo (Build = DeepSeek, puertas = gstack; ver
> `<gstack-obligatorio>` en el `CLAUDE.md` del Mundo y ADR-005). La automatización progresa; el uso
> de gstack NO es negociable en ningún punto.

**Fase actual de este Mundo: 1 — Aprobación manual**

## `[STOP-HUMANO]` propios de este Mundo (nunca se automatizan)
Este es el único Mundo que mueve **potencia eléctrica y un motor de 10 HP**. Además de lo que marca
`docs/SEGURIDAD.md` del Universo:

- **Energizar el relay contra hardware real por primera vez.** Se hace con Pablo presente, con el
  timer eléctrico viejo todavía instalado como red, y con el contactor validado (modelo, voltaje de
  bobina, `RELAY_ACTIVE_LEVEL`).
- **Retirar el timer eléctrico existente.** Decisión del dueño, después de validar en operación.
- **Cambiar tarifas o el límite diario en producción.** Toca la plata de la cooperativa.
- **Rotar el secret de un dispositivo en producción.** Deja el ESP32 sin poder autenticarse hasta
  que se lo re-flashee.
- **Pasar `PAYMENT_PROVIDER` de `demo` a `mercadopago`.** Es el momento en que se empieza a cobrar
  plata real.
- **Cargar `ALLOW_DEMO_PAYMENTS_ON_DEVICE=true` en producción.** Mientras esté puesta, cualquiera
  que apruebe un pago demo habilita la máquina real. Solo durante la prueba en banco, y se saca
  apenas termina (ADR-038).

## Fase 1 — Aprobación manual  ← ESTAMOS ACÁ
El humano prueba e itera a mano. El agente no ejecuta nada solo. Hoy: modo DEMO completo
(`DemoPaymentProvider` + PGlite + simulador de ESP32), sin cobrar nada real y sin hardware.
- **Criterio para pasar a Fase 2:** los 3 bloqueantes de firmware corregidos y el ESP32 real
  haciendo el ciclo completo (heartbeat → autorización → pulsador → 180 s → corte) contra el
  backend, de forma repetible.

## Fase 2 — Revisión previa
El sistema cobra de verdad (Mercado Pago productivo) y habilita la máquina solo, pero **Pablo revisa
el panel a diario**: sesiones, pagos, errores, sesiones interrumpidas y reembolsos pendientes.
- **Criterio para pasar a Fase 3:** una semana de operación sin sesiones perdidas, sin pagos
  cobrados que no habilitaron la máquina y sin intervención manual.

## Fase 3 — Piloto automático
Las automatizaciones **no críticas** corren solas.
- **No crítico en este Mundo:** el barrido de pagos vencidos y autorizaciones vencidas, el
  recálculo de ONLINE/DEGRADED/OFFLINE por heartbeat, y los avisos al dueño (máquina offline,
  dispositivo sin heartbeat, sesión interrumpida).
- **Crítico, se queda en revisión previa:** reembolsos, cambios de tarifa, alta/baja de patentes y
  cualquier orden que toque el relay (parada de emergencia incluida).
- **Criterio para pasar a Fase 4:** piloto estable + alertas funcionando + nada `[STOP-HUMANO]`
  dentro del alcance automatizado.

## Fase 4 — Autonomía supervisada
La máquina opera sola y el sistema se monitorea a distancia. El humano interviene por excepción.
- **Pre-requisitos de despliegue:** Dockerfile en el repo (hoy NO existe) · secrets en Coolify,
  nunca en el repo · HTTPS obligatorio (lo exigen tanto MP como el ESP32) · healthcheck en
  `/health` · logs y alertas · plan de rollback (que hoy no existe porque el repo no está bajo git).

## Registro de avance
| Fecha | Fase | Qué se automatizó | Quién aprobó |
|---|---|---|---|
| 2026-09-03 | 1 | Nada todavía. Mundo registrado en el Universo; sistema en DEMO. | Pablo |

## Entregables de cierre de cada fase (recordatorio)
Cerrar una fase implica, además de las 3 puertas: actualizar `ESTADO.md`, `ADR.md` **y
`redessociales-hidro-self-service.md`** (storyline de la fase, generado con `marketing-psychology`
+ `viral-youtube-shorts`). Sin el storyline, la fase no se da por cerrada.
