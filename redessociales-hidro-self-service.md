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

### FASE-1 (continuación) — De la demo a la máquina real  ·  actualizado 2026-09-15

> Mismo capítulo (Fase 1), no uno nuevo: esto cierra los dos cabos sueltos que había dejado el
> capítulo anterior ("falta el botón de mesa de entrada" y "falta ponerlo en producción de
> verdad"). Pablo corrió la prueba central ("pago que se recupera solo", A4) y después el botón
> de mesa de entrada desde la pantalla con su propia cuenta (A4b, 2026-09-17) — con eso la
> Fase 1 queda cerrada del todo.

**Qué se mostró en esta fase (1 línea):** la herramienta dejó de ser una demo — ahora corre con
sus propias claves, mesa de entrada tiene botones para actuar sin usar la app de Mercado Pago, y
nadie puede pagar la tarifa de otro escribiendo su patente.

**Guión largo — capítulo de esta fase (para el video de 10–20 min):**
- **Dónde quedamos / qué problema seguía abierto:** el capítulo anterior enseñó al sistema a no
  perder pagos lentos. Pero quedaban tres cosas sin resolver: mesa de entrada todavía no tenía
  pantalla propia para actuar sobre esos casos (se hacía "por detrás"), cualquiera podía escribir
  la patente de un socio o de un remis para pagar $500 en vez de $8.000, y la página pública
  todavía mostraba las claves de administrador escritas en pantalla — cualquiera que la abriera
  podía entrar y cambiar tarifas.
- **Qué se construyó en esta fase, contado como pasos en la herramienta:**
  1. Mesa de entrada ahora tiene una pantalla propia: ve los pagos, y con dos botones puede
     revisar de nuevo o cargar el comprobante real de Mercado Pago — sin tocar la app del
     cliente ni adivinar.
  2. Pagar la tarifa de socio o de remis ahora pide un PIN de 4 dígitos, además de la patente.
     Sin el PIN correcto, se cobra la tarifa completa de particular. Ya no alcanza con conocer
     una patente ajena.
  3. La máquina dejó de tener claves de fábrica: cada credencial (la del panel de administración
     y la que usa cada ESP32 para identificarse) es única y propia, generada una sola vez. La
     página pública ya no muestra ninguna clave en pantalla.
  4. Se probó a propósito: ¿qué pasa si a la máquina se le corta la señal justo cuando termina
     un lavado? El motor se apaga solo, a tiempo, tenga o no señal — eso ya lo garantizaba el
     diseño, y esta fase lo puso a prueba de verdad y lo confirmó. Lo único que se ajustó es que
     el registro de "a qué hora terminó" ahora anota la hora real del corte, no la hora en que la
     máquina recuperó señal para avisar — para que el historial cuente lo que pasó de verdad, no
     lo que tardó en enterarse el sistema.
  5. Se probó también en la máquina real (no en una compu de prueba): se borraron las patentes de
     ensayo, se cargó una nueva, se reinició el sistema a propósito — y la patente nueva seguía
     ahí. Nada se pierde con un reinicio.
- **El momento "ajá":** alguien intenta pagar con la patente de otro socio para llevarse la
  tarifa barata. El sistema le pide un PIN que no tiene. Tarifa completa. Fin del atajo.
- **Cómo queda la herramienta al final de esta fase:** ya no es una demo con datos de prueba —
  corre con sus propias claves, mesa de entrada puede actuar sin depender de nadie más, nadie
  paga la tarifa de otro sin el PIN, y el corte del motor a tiempo quedó puesto a prueba contra
  un corte de señal real, no solo prometido en el diseño.
- **Puente a la próxima fase:** las dos validaciones que quedaban pendientes ya se corrieron —
  "un pago que llega tarde se recupera solo" y "el botón de mesa de entrada funciona de verdad
  desde la pantalla, con una cuenta propia". Con eso, la Fase 1 queda cerrada del todo. Lo que
  sigue: la política de reembolso cuando el cliente paga y no llega a lavar, y la primera prueba
  con el hardware real — motor, relay y contactor — con Pablo presente.

**Short / Reel (30–45s, generado con `viral-youtube-shorts`):**
- **Hook (primeros 3s):** "Probé pagar con la patente de mi vecino." (texto en pantalla sobre
  alguien escribiendo una patente ajena en el celular)
- **Desarrollo:** la pantalla muestra la tarifa de socio, $2.000 — pero al lado aparece "PIN
  (solo socios y remis)". Corte: "sin el PIN, no hay descuento." Se ve el campo vacío y el botón
  rechazando el pago con la tarifa completa de $8.000.
- **Payoff:** el mismo intento, ahora con el PIN correcto — tarifa de socio, aprobado al toque.
  El contraste (con PIN vs. sin PIN) es el gancho visual.
- **Loop / cierre:** vuelve al plano inicial de alguien escribiendo una patente que no es la
  suya, ahora con el texto "no funciona más" superpuesto — invita a mirar de nuevo el intento.
- **CTA:** "video completo en el canal" + "si tu descuento se puede robar solo con un dato
  público, escribime."

**Caption de feed (Instagram/otros):**
- **Gancho de apertura:** ¿Sabías la patente de un socio? Ya no te alcanza para su descuento.
- **Cuerpo:** cualquier tarifa preferencial que dependa de un solo dato público (una patente, un
  DNI, un código) se puede copiar. Le sumamos un PIN de 4 dígitos que solo tiene el dueño real —
  y de paso, la herramienta dejó de correr con claves de fábrica: ahora es una máquina de
  producción real, no una demo.
- **Cierre + llamado a contacto:** si tu sistema de tarifas diferenciadas se puede engañar con un
  dato que cualquiera puede conseguir, escribime y lo revisamos.
- **Hashtags sugeridos:** #automatizacion #antifraude #cooperativa #ushuaia #sinfichas
  #seguridadinformatica

---

### FASE-1 (continuación) — El aviso que nadie da de alta  ·  actualizado 2026-09-22

> Sigue el mismo capítulo: preparar la máquina para el día que cobre plata de verdad. Arrancó
> como un detalle técnico chiquito y terminó encontrando algo que iba a arruinar el día del
> estreno.

**Qué se mostró en esta fase (1 línea):** buscando un error menor apareció el problema real —
cuando le conectemos la cuenta de cobro del dueño, el aviso de "este cliente ya pagó" no iba a
llegar, y nadie se hubiera enterado hasta tener a un cliente enojado frente a la máquina.

**Guión largo — capítulo de esta fase (para el video de 10–20 min):**
- **Dónde quedamos / qué problema seguía abierto:** la máquina ya sabe cobrar y ya sabe
  recuperarse de un pago lento. Faltaba un detalle feo: cada vez que alguien pagaba, el sistema
  de pagos mandaba **dos avisos** en vez de uno, y a uno de los dos la máquina le contestaba
  "no te entiendo". Molesto, pero nadie perdía plata. Ese era el ticket.
- **Qué se construyó en esta fase, contado como pasos en la herramienta:**
  1. Primero, entender por qué la máquina no entendía ese segundo aviso. Resultó que **no es un
     error nuestro ni se puede arreglar**: es una vía vieja que la empresa de pagos mantiene por
     compatibilidad y que, según su propia documentación, no se puede verificar. La máquina ahora
     le contesta educadamente "recibido", lo anota, y no hace nada con él. El pago entra por el
     aviso bueno.
  2. Y acá apareció lo importante. Los dos avisos **no se activan igual**: uno sale solo, y el
     otro —el bueno, el verificable— **hay que darlo de alta a mano** en la cuenta de cobro. En
     la cuenta de prueba estaba hecho hace rato. En la cuenta del dueño, el día que nos la
     entregue, **va a estar vacío**. O sea: el día del estreno, ningún pago avisaría a la máquina,
     y cada cliente se quedaría hasta dos minutos esperando con el pago ya hecho.
  3. Se resolvió de la forma más aburrida y más segura: **el sistema ahora se niega a encenderse**
     si esa pieza falta. En vez de descubrirlo con un cliente parado frente a la máquina, se
     descubre al instalarlo, con nosotros mirando la pantalla.
  4. Se le agregó una alarma: cada vez que un pago se cobra pero el aviso no llegó, queda
     anotado. Uno suelto es ruido de internet; varios seguidos significan que algo hay que
     revisar. Antes eso pasaba sin dejar rastro.
  5. Se escribieron las pruebas automáticas de toda esa parte, que **no existían**: ninguna
     prueba tocaba el buzón donde llegan los avisos de pago. Ahora se prueba sola, incluso el
     caso de los dos avisos llegando exactamente al mismo tiempo, y el de la máquina con la base
     de datos caída.
- **El momento "ajá":** el error que fuimos a arreglar era el menos importante de los dos. El
  grave estaba escondido atrás, y solo apareció porque alguien preguntó "¿y esto por qué
  funciona en la cuenta de prueba?".
- **Qué cambia para el usuario:** nada visible hoy. Todo visible el día del estreno: el cliente
  paga y la luz verde se prende al toque, en vez de esperar dos minutos pensando que perdió la
  plata.
- **Llamado a contacto (sin pitch):** si tenés un sistema que cobra y no probaste qué pasa el día
  que cambiás de cuenta, escribime.

**Short (30–45 s):**
- **Gancho (0–3 s):** "fui a arreglar un error chiquito y encontré uno que arruinaba el día del
  estreno."
- **Desarrollo:** dos avisos llegando a la máquina, uno con un tilde verde y otro con una cruz.
  Corte: "el de la cruz no se puede arreglar, es así de fábrica." Segundo corte, el giro: "pero
  el de la tilde… **hay que darlo de alta a mano**, y en la cuenta nueva no lo está."
- **Payoff:** pantalla de la máquina que directamente **no arranca**, con el cartel de qué falta.
  "Prefiero que falle acá, conmigo mirando, que allá con un cliente esperando."
- **Loop / cierre:** vuelve al plano de los dos avisos — ahora se entiende cuál era el importante.
- **CTA:** "video completo en el canal" + "¿tu sistema de cobro sabe fallar a tiempo?"

**Caption de feed (Instagram/otros):**
- **Gancho de apertura:** el error que fui a arreglar no era el problema. El problema estaba
  atrás.
- **Cuerpo:** la máquina recibía dos avisos de pago y le contestaba mal a uno. Molesto, nada más.
  Investigando apareció lo otro: el aviso que sí importa hay que activarlo a mano en cada cuenta
  de cobro, y en la cuenta nueva del cliente iba a estar sin activar. Resultado el día del
  estreno: cada persona esperando dos minutos con el pago hecho. Ahora el sistema no arranca si
  esa pieza falta, y avisa cuando un pago llega por un camino que no debería.
- **Cierre + llamado a contacto:** si tenés algo que cobra automático, la pregunta no es si
  funciona: es qué pasa el día que cambiás de cuenta. Escribime y lo vemos.
- **Hashtags sugeridos:** #automatizacion #pagos #cooperativa #ushuaia #sinfichas
  #softwarehonesto

---

## Checklist de cierre de fase (para este archivo)

- [ ] Cabecera del Mundo escrita/al día.
- [ ] Bloque de la fase agregado (largo + short + caption), sin borrar fases previas.
- [ ] Generado aplicando (leyendo) `marketing-psychology` (ángulo) + `viral-youtube-shorts` (short).
- [ ] Cero jerga de código: todo en lenguaje de usuario, sobre pasos en la herramienta.
- [ ] Llamado a contacto presente, sin pitch agresivo.
