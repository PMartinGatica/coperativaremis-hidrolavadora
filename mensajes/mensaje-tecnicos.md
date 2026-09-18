# Mensaje para los técnicos (WhatsApp)

> Copiar desde la línea de abajo. Formato de WhatsApp: `*texto*` sale en negrita.
> Contexto para vos, no lo mandes: acá pedimos lo que definen el ADR-014, el ADR-015 y el
> ADR-046 del Mundo.
>
> **Cambió respecto de la versión anterior (2026-09-18):** la electrónica del lado del ESP32
> (placa, módulo relay, antena) la compra Pablo — ya está pedida a Buenos Aires, ver
> `mensaje-compras-gaby.md`. A los técnicos les queda el contactor, el pulsador, la fuente y la
> instalación eléctrica. Por eso **ya no son 3 datos los que bloquean la puesta en marcha, son 2**:
> el nivel activo del relay lo mide Pablo en el banco porque ahora el módulo lo compra él.
> Se agregó lo de la puesta a tierra de la caja (es metálica y hay agua en el taller).

---

Buenas! Les paso el detalle de la parte eléctrica de la hidrolavadora de la cooperativa, así lo
vamos armando en paralelo.

*Qué es, en dos líneas:* el cliente escanea un QR pegado a la máquina, paga desde el celular, se le
prende una luz verde y aprieta un pulsador para que la hidrolavadora arranque 180 segundos. Todo lo
que es programación (el sitio, el cobro y el programa de la plaquita) lo hago yo.

*Novedad:* la plaquita, el módulo relay y la antena *ya los compré yo* — están en camino desde
Buenos Aires. Así que de la lista original les queda menos cosa.

*Lo que necesito que compren ustedes:*

1. *El contactor* para el motor. Ese lo eligen ustedes según la hidrolavadora (es un motor de
   10 HP): corriente, calibre de cable y protección los definen ustedes, yo no me meto ahí.

2. *Pulsador NA (normal abierto) momentáneo*, metálico de panel, apto intemperie: va a estar
   afuera y en el taller hay agua. Si viene con luz LED incorporada, mejor todavía.

3. *Luz verde de panel* para avisar "pagado, apretá el botón" (si el pulsador ya viene con luz
   incorporada, no hace falta aparte). Sumen también una *roja* si consiguen: la uso para avisar
   que la plaquita tiene un problema.

4. *Fuente 5 V / 2 A* para alimentar la plaquita y el relay.

*Cómo se conecta la plaquita* (por si arman el tablero antes de que yo llegue):
• GPIO 26 → entrada IN1 del módulo relay
• GPIO 27 → pulsador, y del otro lado del pulsador a GND
• GPIO 25 → LED verde
• GPIO 33 → LED rojo
La salida del relay maneja *solamente la bobina del contactor*. La potencia del motor nunca pasa por
el relay ni por la plaquita.

*Tres cosas de seguridad, importantes:*

🔴 La caja donde va todo esto es *metálica* y en el taller hay agua: esa caja tiene que quedar
*puesta a tierra*. Se los dejo dicho por escrito para que no quede en el aire.

🔴 El *timer eléctrico viejo queda instalado* hasta que probemos todo. Es la red por si algo falla.
No lo saquen todavía.

🔴 Los módulos relay vienen de dos tipos y por fuera se ven iguales: algunos activan con señal alta y
otros con señal baja. Si me equivoco de tipo en el programa, *la máquina arranca sola al prenderse la
placa*. Eso lo pruebo yo en el banco con el tester, *sin el contactor conectado*, antes de llevar
nada a la máquina. Lo aclaro para que sepan por qué no voy a cablear potencia el primer día.

*Las 2 cosas que necesito que me pasen:*
1. Qué contactor eligieron y de cuántos volts es la bobina.
2. Confirmación de que el timer viejo queda puesto para la primera prueba.

Con eso ya puedo dejar la placa lista para el día que lo montemos. Cualquier duda me escriben.
