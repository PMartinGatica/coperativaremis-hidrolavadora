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

### FASE-1 — Reconciliación de pagos  ·  cerrada 2026-09-07

**Qué se mostró en esta fase (1 línea):** si el cliente pagó pero el sistema se distrajo un
segundo, la máquina igual se entera y se prende — nadie pierde esa plata.

**Guión largo — capítulo de esta fase (para el video de 10–20 min):**
- **Dónde quedamos / qué problema seguía abierto:** la máquina cobra sola desde el día uno,
  pero había un hueco silencioso: si el cliente tardaba un poco en confirmar el pago desde el
  celular (señal mala, cola en Mercado Pago, lo que sea), el sistema se cansaba de esperar y
  daba por perdido un pago que en realidad SÍ había entrado. El cliente había pagado. El
  sistema decía que no. Y nadie se enteraba hasta que el cliente reclamaba con el
  comprobante en la mano.
- **Qué se construyó en esta fase, contado como pasos en la herramienta:**
  1. Antes de darse por vencido, el sistema ahora vuelve a preguntarle a Mercado Pago "¿este
     pago entró o no?" — una última chequeada, justo antes de cerrar la puerta.
  2. Si Mercado Pago dice que sí entró, la máquina se habilita SOLA, sin que nadie toque nada.
     El cliente ni se entera de que hubo un sobresalto.
  3. Si el sistema ya cerró la puerta antes de darse cuenta, mesa de entrada tiene dos botones
     nuevos: "revisar de nuevo" (un click, sin escribir nada) o cargar el número real del
     comprobante de Mercado Pago a mano — nunca un tilde a ciegas, siempre contra el pago real.
  4. Blindaje extra: si mientras tanto otro cliente ya está usando esa misma máquina, el
     sistema NUNCA habilita dos lavados a la vez, pase lo que pase con el pago viejo.
- **El momento "ajá":** el cliente paga, el celular tarda en confirmar, pasa un rato... y la
  luz verde igual se prende sola. Nadie corrió, nadie llamó a nadie, nadie perdió la plata.
- **Cómo queda la herramienta al final de la fase:** la máquina sigue cobrando sola como
  siempre, pero ahora un pago lento o una conexión mala ya no significa "plata perdida" — se
  recupera solo, o mesa de entrada lo resuelve con dos clicks si hace falta.
- **Puente a la próxima fase:** todavía falta el botón en la pantalla de mesa de entrada (hoy
  se prueba por detrás, no tiene cara todavía) y definir qué pasa cuando de verdad hay que
  devolver una plata — esa es la conversación que sigue con el dueño.

**Short / Reel (30–45s, generado con `viral-youtube-shorts`):**
- **Hook (primeros 3s):** "El cliente pagó. El sistema dijo que no." (texto en pantalla sobre
  el celular mostrando el comprobante aprobado de Mercado Pago)
- **Desarrollo:** se ve la pantalla de la máquina diciendo "pago vencido" con el comprobante
  de Mercado Pago al lado mostrando "aprobado" — el contraste es el gancho. Corte: "así que le
  enseñamos al sistema a volver a preguntar antes de rendirse."
- **Payoff:** la luz verde se prende sola en cámara, sin que nadie toque el celular ni la
  máquina de nuevo.
- **Loop / cierre:** vuelve al plano inicial del comprobante "aprobado" — mismo plano, ahora
  con la luz verde ya prendida al fondo, invitando a mirar de nuevo el antes/después.
- **CTA:** "video completo en el canal" + "si tu máquina cobra sola y a veces se traba con
  pagos, escribime."

**Caption de feed (Instagram/otros):**
- **Gancho de apertura:** Pagó, y el sistema le dijo que no. Pasa más seguido de lo que pensás.
- **Cuerpo:** cuando una máquina cobra sola por QR, un pago que tarda un segundo de más puede
  hacer que el sistema se dé por vencido y cierre la puerta — aunque la plata ya haya entrado.
  Le enseñamos a volver a preguntar antes de rendirse, y si igual se le escapa, quien atiende
  el local lo resuelve con dos clicks, nunca a ciegas.
- **Cierre + llamado a contacto:** si tenés una máquina que cobra por uso y no querés que un
  pago lento se traduzca en plata perdida, escribime y vemos cómo se resuelve.
- **Hashtags sugeridos:** #automatizacion #pagosdigitales #mercadopago #cooperativa #ushuaia
  #sinfichas

---

## Checklist de cierre de fase (para este archivo)

- [ ] Cabecera del Mundo escrita/al día.
- [ ] Bloque de la fase agregado (largo + short + caption), sin borrar fases previas.
- [ ] Generado aplicando (leyendo) `marketing-psychology` (ángulo) + `viral-youtube-shorts` (short).
- [ ] Cero jerga de código: todo en lenguaje de usuario, sobre pasos en la herramienta.
- [ ] Llamado a contacto presente, sin pitch agresivo.
