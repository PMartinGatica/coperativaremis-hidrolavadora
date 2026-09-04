# Mensaje para los técnicos (WhatsApp)

> Copiar desde la línea de abajo. Formato de WhatsApp: `*texto*` sale en negrita.
> Contexto para vos, no lo mandes: acá pedimos lo que define el ADR-014 y el ADR-015 del Mundo.
> Los 3 datos que pedimos al final son los que bloquean la puesta en marcha.

---

Buenas! Les paso el detalle de la parte eléctrica y de hardware de la hidrolavadora de la
cooperativa, así lo vamos armando en paralelo.

*Qué es, en dos líneas:* el cliente escanea un QR pegado a la máquina, paga desde el celular, se le
prende una luz verde y aprieta un pulsador para que la hidrolavadora arranque 180 segundos. Todo lo
que es programación (el sitio, el cobro y el programa de la plaquita) lo hago yo. Lo que necesito de
ustedes es la parte física.

*Lo que hay que comprar:*

1. *Placa ESP32 DevKit V1 (módulo ESP32-WROOM-32), 4 MB de flash, 38 pines.* En algunos lados figura
   como NodeMCU-32S o DevKitC. Importante: tiene que ser el ESP32 clásico. *NO sirven* las versiones
   C3, S2, S3, C6 ni H2 aunque digan ESP32 y sean más nuevas: son otro chip y el programa no les
   entra. Si consiguen, traigan *dos* (una para probar en el banco y otra para la máquina).

2. *Módulo relay de 1 canal con optoacoplador*, que diga que funciona con lógica de *3,3 V*.

3. *Pulsador NA (normal abierto) momentáneo*, metálico de panel, apto intemperie: va a estar afuera
   en Ushuaia. Si viene con luz LED incorporada, mejor todavía.

4. *LED verde de panel* (si el pulsador ya viene con luz, no hace falta).

5. *Fuente 5 V / 2 A* para alimentar la placa y el relay.

6. *Caja estanca IP65* para meter la placa, el relay y la fuente.

7. *El contactor* para el motor. Ese lo eligen ustedes según la hidrolavadora (es un motor de 10 HP):
   corriente, calibre de cable y protección los definen ustedes, yo no me meto ahí.

*Cómo se conecta la plaquita* (por si arman el tablero antes de que yo llegue):
• GPIO 26 → entrada del módulo relay
• GPIO 27 → pulsador, y del otro lado del pulsador a GND
• GPIO 25 → LED verde
• GPIO 33 → LED rojo
La salida del relay maneja *solamente la bobina del contactor*. La potencia del motor nunca pasa por
el relay ni por la plaquita.

*Dos cosas de seguridad, importantes:*

🔴 El *timer eléctrico viejo queda instalado* hasta que probemos todo. Es la red por si algo falla.
No lo saquen todavía.

🔴 Los módulos relay vienen de dos tipos y por fuera se ven iguales: algunos activan con señal alta y
otros con señal baja. Si me equivoco de tipo en el programa, *la máquina arranca sola al prenderse la
placa*. Por eso, cuando tengan el módulo, lo probamos en el banco *sin el contactor conectado* antes
de cablear nada de potencia. Es una prueba de 5 minutos, pero no se saltea.

*Las 3 cosas que necesito que me pasen:*
1. Qué módulo de relay compraron (marca/modelo o una foto de la plaquita) → con eso configuro el
   programa.
2. Qué contactor eligieron y de cuántos volts es la bobina.
3. Confirmación de que el timer viejo queda puesto para la primera prueba.

Con eso ya puedo dejar la placa lista para el día que lo montemos. Cualquier duda me escriben.
