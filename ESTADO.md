# ESTADO — MUNDO: HIDRO SELF-SERVICE

> Handoff entre sesiones. Reescribir, no acumular. ≤40 líneas.
> Última actualización: 2026-09-25 · detalle en `ADR.md` (014–063)

## Arranque de la próxima sesión

1. Cargá SOLO este `ESTADO.md` + `CLAUDE.md` del Mundo. `export GSTACK_PROJECT_SLUG=
   PMartinGatica-hidro-self-service` antes de la primera skill de gstack.
2. **Fase ACTIVA: "Roles y usuarios (admin / operador)". Build T1–T13 HECHO (ADR-063), SIN
   commit.** Próximo paso: `/review` + `/cso` sobre el diff → Pablo corre la guía
   `qa/FASE-roles-manual.md` (puerta b) → `/ship` → arranque en producción (pasos P1–P5 de la
   guía: la cuenta técnica crea la de Javier, Javier crea la del operador) → `/retro` + storyline.
   Javier confirmó: admin = todo el negocio, operador = básico; son **2 cuentas** (1 y 1).
   Pablo le avisa a Javier lo de la cuenta de soporte de Insolva. ⚠️ En la PC quedaron abiertas una
   API (3020) y una web (5173) con el código VIEJO: cerrarlas con Ctrl+C antes de la guía de QA.
3. **Fase "Identidad visual": en producción (`29c7783`), ABIERTA solo por el storyline**
   (`redessociales-hidro-self-service.md`). Paso 14b de su guía queda para el día de MP.
4. ⚠️ **Local:** los `.env` tienen `PAYMENT_PROVIDER=mercadopago`; para probar:
   `cd apps/api && PAYMENT_PROVIDER=demo node dist/index.js`, y **bajarlo SIEMPRE con Ctrl+C**
   (un force-kill corrompe el PGlite; arreglo: borrar `apps/api/.data/pg/`, se re-siembra sola).
5. ⚠️ **Deploy:** push a `main` NO dispara Coolify (Redeploy a mano); verificar por `uptimeSeconds`
   de `/health`. El deploy de roles desloguea a todos una vez (401 `session_changed`).
6. Pendientes de antes: mudanza a Hostinger + Supabase (ADR-056/059, confirmada, sin construir,
   avisar al Universo), PIN obligatorio en toda patente real de socio/remis (`TODOS.md`), logo en
   alta resolución de la cooperativa, llamada con Javi por MP (C2b), `/autoplan` con Codex desde
   el 2026-09-28.

## Dónde estamos

Producción en DEMO. En local: roles `tecnico`/`admin`/`operador` (`shared/src/permissions.ts`),
baja inmediata por `token_version`, páginas Usuarios y Mi cuenta. **Tests: 250 API + 27 shared + 7 state-machine + 29 web, verdes; E2E navegador PASS claro/oscuro
(con paso [9] de roles).** Firmware NO tocado.

## Riesgos abiertos (en orden de daño)

- 🔴 Roles construidos pero no desplegados: en producción toda cuenta puede todo hasta el ship ·
  patente de socio/remis sin PIN = descuento para quien la sepa · alta del webhook en MP (C2b) ·
  apagar `DEVICE_SIMULATOR` antes del ESP32 (D1).
- ⚡ Rollback de roles: antes de revertir, borrar filas no técnicas (ADR-062). Relay `[STOP-HUMANO]`.
