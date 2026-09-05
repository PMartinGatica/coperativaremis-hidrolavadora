# CLAUDE.md — MUNDO: HIDRO SELF-SERVICE

> **PASO 1 de la receta — Contexto.** Manual + contexto de este Mundo. Claude lo lee solo al
> entrar a esta carpeta. Corto: el detalle va en los otros archivos del Mundo.
> Parte del Universo `Madre/`. El protocolo de tokens del Universo aplica acá a escala Mundo.
> Stack: monorepo npm workspaces · **Express + TypeScript + drizzle-orm + PGlite/Postgres** (api) ·
> **React 19 + Vite + Tailwind 4** (web) · **PlatformIO / C++** (firmware ESP32).
> Gestor de paquetes: **npm** SIEMPRE (workspaces; NO pnpm — este Mundo es la excepción).
> Producción: PENDIENTE. Ver `<donde-vive-el-codigo>` y `conexiones.md`.

---

<donde-vive-el-codigo>
**Código y memoria viven juntos en esta carpeta**, igual que los otros 4 Mundos:
`Madre/mundos/hidro-self-service/` es a la vez la memoria (este archivo, ESTADO, MAPA, ADR,
cadencia, conexiones, skills, storyline) **y el repo de código** (`apps/`, `packages/`,
`firmware/`, `docs/`, `infrastructure/`, `scripts/`).

Repo propio: **https://github.com/PMartinGatica/coperativaremis-hidrolavadora** (privado).
`Madre/.gitignore` tiene `/mundos/`, así que este repo anidado no interfiere con el de Madre.

> Historia: hasta el 2026-09-04 el código vivía fuera, en `Deepseek-harnes/hidro-self-service/`,
> porque lo había construido DeepSeek en su harness (ADR-004). Con el Build ya propio (ADR-008)
> esa razón desapareció y se consolidó todo acá (ADR-012). Si encontrás una ruta que apunte a
> `Deepseek-harnes/`, está desactualizada.

**Regla que SIGUE vigente:** `export GSTACK_PROJECT_SLUG=PMartinGatica-hidro-self-service` antes
de la primera skill de gstack, prefijado en CADA comando (el shell no conserva estado entre
llamadas). Tener `.git` + remote propio **no alcanza**: `gstack-slug` camina al ancestro MÁS
EXTERNO con `.git`+remote y `Madre/` gana igual — verificado el 2026-09-04, sin el override
resuelve a `PMartinGatica-madreinsolva`. También está fijado en `.claude/settings.json`.
</donde-vive-el-codigo>

---

<que-es>
Sistema de **pago por QR para una hidrolavadora autoservicio** de una cooperativa de remises de
Ushuaia. El cliente escanea el QR pegado a la máquina, carga su patente, ve su tarifa, paga por
Mercado Pago, se le prende una luz verde, aprieta un pulsador físico y la hidrolavadora funciona
**180 segundos**.

**Principio fundamental (invariante, no negociable):** *el pago NUNCA enciende la hidrolavadora.*
La cadena es pago → webhook → validación en el backend → autorización temporal → el ESP32 la
busca → LED verde → **pulsador físico** → relay → contactor → motor. Los 180 s los cuenta el
**ESP32 localmente**, nunca un `setTimeout` del backend: si se cae internet en medio del lavado,
igual corta.

**Tres tarifas por categoría de patente** (aprobadas por el dueño el 2026-09-01):

| Categoría | Tarifa | Cómo se determina |
|---|---|---|
| Remis de la cooperativa | **$500** | patente registrada como `remis` en el admin |
| Auto particular del socio | **$2.000** | patente registrada como `socio` |
| Particular no asociado | **$8.000** | patente NO registrada (default) |

Más: **máximo 2 lavados por día por patente** (anti-abuso de la tarifa de remis), configurable.

Objetivos propios de este Mundo:
- Que la máquina cobre sola, sin que nadie tenga que estar ahí ni manejar fichas ni efectivo.
- Que sea imposible que el motor arranque sin un pago validado en el servidor.
- Multi-máquina desde el día uno: agregar HIDRO-02 es configuración, no código.

Decisiones cerradas del Mundo (NO reabrir sin consultar — ver `ADR.md` del Mundo):
- El pago no enciende el motor. La autorización es temporal y la consume el pulsador físico.
- El timer de 180 s es LOCAL del ESP32.
- El botón físico del mecánico (llave de la caja) sigue funcionando por fuera del sistema.
- Código y memoria conviven en esta carpeta, con repo propio (ADR-012, supersede el ADR-004).
- **El Build lo hace Claude** (ADR-008, 2026-09-04 — revierte el ADR-005 "Build = DeepSeek").
</que-es>

---

<protocolo>
1. Al entrar a este Mundo leé SOLO este `CLAUDE.md` + `ESTADO.md` (+ la spec de la fase activa si
   hay fases). No cargues otro Mundo en la misma sesión.
2. El índice del Mundo es `MAPA.md` (de este Mundo) — y apunta a archivos del repo de código, no
   de esta carpeta. Búsquedas acotadas a ese repo.
3. Material de referencia pesado (`análisis.md`, `presupuesto-hidrolavadora-completo.html`) vive en
   el repo de código: se lee UNA vez, después se referencia por su código.
4. Al cerrar checkpoint: actualizá `ESTADO.md` del Mundo (≤40 líneas) y `MAPA.md` si cambió la
   estructura. Decisiones nuevas → `ADR.md` del Mundo.
5. **Nunca leas `node_modules/` ni `.npm-cache-local/`** del repo de código (este último son 532 MB).
</protocolo>

---

<arranque>
Modo de arranque de este Mundo: **RETROFIT**. El sistema ya estaba construido por DeepSeek cuando
el Mundo se registró en el Universo (2026-09-03); no se construye de cero, se adopta y se ordena.
Seguir `RETROFIT.md`.
</arranque>

---

<conexiones>
Ver `conexiones.md` (Paso 2). Mercado Pago (Checkout Pro + webhook), ESP32 por HTTPS con HMAC por
dispositivo, Postgres (o PGlite embebido en demo).
Credenciales: nunca en claro; documentadas en `.env.example` del repo de código.
</conexiones>

---

<skills>
Ver `skills.md` (Paso 3). Skills propias del Mundo + qué skills de gstack aplican.
</skills>

---

<gstack-obligatorio>
**REGLA INNEGOCIABLE (heredada del Universo). El modo híbrido se CERRÓ el 2026-09-04.**

⚠️ **El ADR-005 (Build = DeepSeek) fue REVERTIDO por el ADR-008.** Desde el 2026-09-04 el código lo
escribe Claude directamente, con gstack de punta a punta como en el resto de los Mundos. Si leés el
ADR-005 suelto, está superado: manda el **ADR-008**. (El Mundo `Chatboot` sí mantiene su modo
híbrido; es una decisión aparte.)

**Think → Plan → Build → Review → Test → Ship → Reflect**
- **Inicio de fase:** `/office-hours` + `/autoplan` ANTES de escribir una línea.
- **Build:** se implementa acá, según el plan. Las dudas vuelven al pipeline, no se improvisan.
- **Cierre:** `/review` + `/cso` + `/qa` (parte de las 3 puertas) → `/ship` → `/retro`.

Una fase que no pasó por las puertas de gstack NO está terminada, aunque los tests estén verdes.

⚠️ **Aprendizaje caro de este Mundo: los tests verdes acá NO prueban el hardware.**
Los 48 tests de `apps/api` corren contra `apps/api/src/simulator/simDevice.ts`, un simulador escrito
en TypeScript. El firmware C++ es **otra implementación del mismo protocolo** y no lo cubre ningún
test. Llegó a la tercera ronda de correcciones **sin haber compilado nunca**, con una dependencia
sin declarar y dos errores de sintaxis que solo ve un compilador (ADR-009).
**Ninguna puerta (a) cuenta como verde si el cambio toca `firmware/` y no se corrió `pio run`.**
`npm run check:firmware` es un pre-chequeo barato por grep — daba OK con el archivo sin compilar,
así que **no sustituye** a `npm run build:firmware`.
</gstack-obligatorio>

---

<cadencia>
Ver `cadencia.md` (Paso 4). Fase de automatización actual: **1 manual**. No automatizar nada
marcado `[STOP-HUMANO]` en `docs/SEGURIDAD.md` del Universo.

**`[STOP-HUMANO]` propio de este Mundo:** todo lo que energiza el relay en hardware real. El primer
encendido del contactor con el motor conectado se hace con Pablo presente y con el timer eléctrico
viejo todavía instalado como red.
</cadencia>

---

<gate>
Una fase del Mundo cierra SOLO con las 3 puertas verdes (ver `docs/fases/FASE-TEMPLATE.md` del
Universo): (a) test automático, (b) guía de test manual validada por el humano, (c) chequeo de
`docs/SEGURIDAD.md` aplicado. **Puerta 0 implícita: la fase pasó por las puertas de gstack**
(ver `<gstack-obligatorio>`).

**Puerta (a) reforzada en este Mundo:** si el cambio toca `firmware/`, la puerta (a) exige además
que el firmware **compile** (`pio run -d firmware/esp32`). Un cambio de firmware validado solo por
el simulador no cierra.

**Entregables de cierre (junto a las puertas):** al cerrar la fase se actualizan `ESTADO.md`,
`ADR.md` **y `redessociales-hidro-self-service.md`** (el storyline: qué hace la herramienta y qué
se construyó en esta fase, contado como pasos en la herramienta, sin jerga de código; se genera con
`marketing-psychology` + `viral-youtube-shorts`). Falta el storyline → la fase no se da por cerrada.
</gate>

---

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
