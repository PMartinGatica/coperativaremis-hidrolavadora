# Redes Sociales — MUNDO: HIDRO SELF-SERVICE

> **Entregable de cierre de fase** (junto a `ESTADO.md` y `ADR.md`). NO es una puerta del gate
> técnico: es un requisito de documentación para cerrar la fase. Si falta, la fase no se da por
> cerrada.
>
> **Qué es:** el *storyline* del Mundo. Fase por fase, cuenta **qué hace la herramienta** y **qué se
> fue construyendo/agregando** en cada fase, como una historia que avanza. Sirve de guión hablado de
> 10–20 min para YouTube/charla, más una versión corta (short/reel) y un caption de feed.
>
> **NO es un guión de venta ni un pitch comercial.** Es mostrar el producto y su avance. La venta es
> la consecuencia: que un contacto con el mismo problema vea lo que la herramienta resuelve y escriba
> para contratar una a medida. El guión cuenta el producto, no lo remata con descuentos ni urgencia.
>
> **NO hablar de código.** Nada de "abrí VS Code", componentes, frameworks, funciones ni stack. El
> guión es sobre los **pasos en la herramienta**: qué se ve, qué se aprieta, qué problema resuelve,
> para quién, qué se logró. Lenguaje de cliente/usuario, no de programador.

---

## Cómo se genera (con skills — OBLIGATORIO en el cierre de fase)

> **Importante:** estas skills viven como archivos en `.agents/skills/` pero NO son slash-commands
> ejecutables en Claude Code. Se aplican **leyendo su `SKILL.md`** y siguiendo su guía — no se
> "invocan" con la herramienta Skill (fallaría: "Unknown skill"). El resultado es el mismo guión
> bien encuadrado; la diferencia es que se lee la skill en vez de ejecutarla.

Al cerrar cada fase, generá/actualizá este archivo aplicando, en este orden:

1. **`marketing-psychology`** (leer `.agents/skills/marketing-psychology/SKILL.md`) — para encuadrar
   el storyline: cuál es el problema (Jobs to Be Done), por qué le importa al espectador, qué prueba
   que la herramienta lo resuelve, el llamado a contacto sin pitch agresivo. Da el *ángulo*, no el
   código.
2. **`viral-youtube-shorts`** (leer `.agents/skills/viral-youtube-shorts/SKILL.md`) — para el
   **short/reel** de la fase: hook en los primeros 3 segundos, estructura de retención, cierre en
   loop, CTA al video largo. (Solo formato corto; el guión largo se arma con el storyline de abajo.)

El guión largo de 10–20 min se construye sumando los bloques de fase de este archivo en orden: cada
fase es un capítulo del storyline. No se reescriben las fases anteriores; se acumula.

---

## Cabecera del Mundo (se escribe una vez, se ajusta si cambia)

- **Qué hace la herramienta (en una frase de usuario):** escaneás un QR, pagás desde el celular y
  la hidrolavadora se enciende sola por 3 minutos.
- **Para quién:** cualquiera que tenga una máquina que cobra por uso y hoy la maneja con fichas,
  con una llave, o con alguien parado al lado cobrando. Lavaderos, cocheras, cooperativas, clubes.
- **Qué problema le saca de encima:** que alguien tenga que estar ahí. Sin fichas, sin efectivo,
  sin llave, sin confiar en la buena fe. Y con tarifas distintas según quién sea el que lava.
- **Por qué mirarlo:** es software que termina en una máquina física arrancando. Se ve el celular,
  se ve la luz verde, se aprieta un botón y arranca el motor. No es una pantalla más.
- **Llamado a contacto (sin presión):** si tenés una máquina que cobra por uso y estás atado a
  fichas o a estar presente, escribime y vemos cómo se automatiza.

> **Cuidado al filmar:** la tarifa de $500 es de la cooperativa y el sistema maneja plata real.
> No mostrar patentes reales de socios, ni credenciales, ni el panel de administración con datos
> del cliente. El storyline se cuenta con las patentes DEMO (`AE100AA` / `AE200AA`).

---

## Storyline por fases (append-only — una entrada por fase, en orden)

> Al cerrar la FASE-N, agregá un bloque acá. No borres los anteriores: el storyline es la suma.

### FASE-{N} — {NOMBRE_FASE}  ·  cerrada {FECHA}

**Qué se mostró en esta fase (1 línea):** {qué nueva capacidad de la herramienta aparece acá}

**Guión largo — capítulo de esta fase (para el video de 10–20 min):**
- **Dónde quedamos / qué problema seguía abierto:** {arranca enganchando con la fase anterior}
- **Qué se construyó en esta fase, contado como pasos en la herramienta:**
  1. {paso visible 1 — qué se ve / qué se hace / qué resuelve}
  2. {paso visible 2}
  3. {paso visible 3}
- **El momento "ajá":** {el punto donde se ve que esto le sirve al espectador}
- **Cómo queda la herramienta al final de la fase:** {estado mostrable, sin tecnicismos}
- **Puente a la próxima fase:** {qué falta todavía — deja la historia abierta}

**Short / Reel (30–45s, generado con `viral-youtube-shorts`):**
- **Hook (primeros 3s):** {línea que para el scroll}
- **Desarrollo:** {la transformación en 2–3 beats}
- **Payoff:** {el resultado visible}
- **Loop / cierre:** {beat final que invita a re-ver o al video largo}
- **CTA:** {"video completo en el canal" / "escribime si querés una igual"}

**Caption de feed (Instagram/otros):**
- **Gancho de apertura:** {1–2 líneas}
- **Cuerpo:** {qué resuelve, contado simple}
- **Cierre + llamado a contacto:** {sin presión}
- **Hashtags sugeridos:** {3–6 acotados al nicho}

---

## Checklist de cierre de fase (para este archivo)

- [ ] Cabecera del Mundo escrita/al día.
- [ ] Bloque de la fase agregado (largo + short + caption), sin borrar fases previas.
- [ ] Generado aplicando (leyendo) `marketing-psychology` (ángulo) + `viral-youtube-shorts` (short).
- [ ] Cero jerga de código: todo en lenguaje de usuario, sobre pasos en la herramienta.
- [ ] Llamado a contacto presente, sin pitch agresivo.
