# Skills — MUNDO: HIDRO SELF-SERVICE

> **PASO 3 de la receta — Skills.** Las habilidades que el agente usa para resolver el trabajo de
> este Mundo. Dos fuentes: skills propias del Mundo + skills de gstack (instaladas global).

## ⚠️ Antes de la PRIMERA skill de gstack en este Mundo
```bash
export GSTACK_PROJECT_SLUG=PMartinGatica-hidro-self-service
```
Prefijado en **cada** comando que invoque un binario de gstack: el shell no conserva estado entre
llamadas. Hacer `cd` al repo de código **no alcanza** — el resolvedor camina hasta el ancestro más
externo con `.git`+remote, y como este repo todavía no está bajo git, cae en
`PMartinGatica-madreinsolva`. Verificar con `gstack-slug` antes de arrancar.
El slug también está fijado en `.claude/settings.json` de esta carpeta.

## Skills propias de este Mundo
| Skill | Qué resuelve | Cómo se invoca | Estado |
|---|---|---|---|
| `verify-e2e` | recorre el viaje completo del cliente contra el sistema corriendo y verifica el resultado en el admin | `node scripts/verify-e2e.mjs` (en el repo de código) | hecha |
| `browser-e2e` | mismo viaje, con navegador real (Edge headless) | `node scripts/browser-e2e.mjs` | hecha |
| `firmware-build` | compilar el firmware — **parte de la puerta (a)** si el cambio toca `firmware/` (ADR-006) | `pio run -d firmware/esp32` | idea (falta meterlo en el flujo de cierre) |
| `prompt-a-deepseek` | convertir la salida de `/autoplan` en un prompt autocontenido para DeepSeek | manual, patrón en `prompt-deepseek-correcciones.md` | hecha (como patrón) |

## Skills de gstack que aplican a este Mundo
| Etapa del sprint | Skill gstack | Uso en este Mundo |
|---|---|---|
| Think | `/office-hours` | encuadre de cada fase ANTES de escribirle a DeepSeek |
| Plan | `/autoplan` (CEO→design→eng) | plan revisado; su salida es la base del prompt de DeepSeek |
| Build | — | **lo hace DeepSeek** (ADR-005, modo híbrido) |
| Review | `/review` + `/codex` | bugs de producción + segunda voz (a Codex hay que **pegarle el diff en el prompt**, no pasarle rutas) |
| Security | `/cso` | corrida el 2026-09-03: encontró 3 bloqueantes de firmware + guarda del relay + 11 más |
| Test | `/qa` / `/qa-only` | navegador real sobre la pantalla del cliente y el admin |
| Ship | `/ship` / `/land-and-deploy` | **bloqueado hasta que el repo esté bajo git** |
| Reflect | `/retro` | retro al cerrar cada fase |

## Skills del storyline (cierre de fase — OBLIGATORIO)
> Generan `redessociales-hidro-self-service.md` al cerrar cada fase (entregable de cierre, junto a
> ESTADO/ADR). **OJO:** viven en `.agents/skills/` pero NO son slash-commands ejecutables; se
> aplican **leyendo su `SKILL.md`**, no invocándolas con la herramienta Skill.

| Skill (leer su SKILL.md) | Qué resuelve | Cuándo |
|---|---|---|
| `marketing-psychology` | ángulo del storyline: el problema (Jobs to Be Done), por qué le importa al espectador, llamado a contacto sin pitch agresivo | al cerrar cada fase |
| `viral-youtube-shorts` | el short/reel de la fase: hook en 3 s, retención, loop, CTA al video largo | al cerrar cada fase |

> Este Mundo tiene un storyline visualmente fuerte: hay una máquina física que arranca sola después
> de escanear un QR. Es el más "mostrable" de los 6 Mundos.

## Cómo crear una skill propia
Cuando una tarea de este Mundo se vuelve repetitiva y vale la pena automatizarla, se documenta acá
primero (qué hace, entrada/salida) y luego se implementa. Si ya la cubre una skill de gstack, NO se
reimplementa: se referencia.
