# Mensaje para el dueño de la cooperativa — "qué necesito de vos" (WhatsApp)

> **Contexto para Pablo, NO lo mandes.**
>
> Este mensaje reemplaza a `mensaje-dueno.md` (B2), que nunca se llegó a mandar. Incluye lo de
> aquel (reembolso + cuenta de Mercado Pago + cupo diario) **más** lo que apareció el 2026-09-22
> con el ADR-052: hay un paso de configuración dentro de la cuenta de Mercado Pago de ellos que
> hay que hacer sí o sí, y que se olvida siempre porque no es obvio.
>
> **Está ordenado por lo que BLOQUEA.** El punto 1 es el único que frena todo lo demás: sin la
> cuenta de Mercado Pago de ellos, el sistema no puede cobrar y no se puede probar de verdad.
> Los puntos 2 y 3 son decisiones suyas que cambian cómo está programado. El 4 es una lista de
> nombres. El 5 es el pedido de que pruebe el demo.
>
> **Cómo mandarlo:** de una sola vez está bien (es largo pero todo es una sola cosa: arrancar).
> Si preferís que conteste sin abrumarse, mandá el bloque 1 primero, y el resto cuando conteste.
> Formato de WhatsApp: `*texto*` sale en negrita. Copiá desde la línea de abajo.
>
> **Ojo con esto al hablar con él:** el punto 1 puede sonar a "dame el control de mi plata". No
> es eso y conviene decirlo en voz alta si pregunta: la plata cae *siempre* en la cuenta de
> ellos, desde el primer peso. Lo que se necesita es permiso para configurar el cobro, no para
> mover fondos.

---

Buenas! Te hago un resumen de cómo viene la hidrolavadora y de las cosas que necesito de vos para
poder seguir. Las puse en orden: la primera es la que frena todo, las otras son decisiones tuyas.

*Cómo viene:* el sistema está terminado y funcionando. Se puede probar entero desde el celular
(cargar la patente, ver la tarifa, pagar y ver los 3 minutos correr). Hoy cobra con *plata de
mentira*, para probar. Falta el paso de que cobre plata de verdad, y ahí entrás vos.

---

*1) La cuenta de Mercado Pago de la cooperativa* ← esto es lo que frena todo

La plata del lavado tiene que caer en la cuenta de ustedes, no en la mía. Eso es así desde el
primer peso y no se toca.

Para que eso funcione hay que hacer una configuración *adentro* de esa cuenta. Es lo que te pido:
que me digas *quién maneja la cuenta de Mercado Pago de la cooperativa* y que coordinemos un rato
con esa persona (puede ser por videollamada, son 20 minutos).

Te aclaro dos cosas para que no haya malentendidos:

- No necesito la plata de ustedes ni sacar nada de esa cuenta. Necesito permiso para configurar
  el cobro automático, que es otra cosa.
- No alcanza con que me pases la clave y listo. Hay un paso que *hay que hacer sí o sí* y que se
  olvida siempre: avisarle a Mercado Pago a qué sistema tiene que mandarle el aviso de "este
  cliente ya pagó". Si ese paso no está hecho, pasa algo feo y difícil de explicar: el cliente
  paga bien, le sale el comprobante, *pero la máquina no se entera* y se queda esperando hasta
  dos minutos. El cliente piensa que le robaron la plata y te llama a vos.

Lo encontré justo esta semana y ya lo dejé cubierto: ahora el sistema *directamente no arranca* si
ese paso falta, así lo vemos nosotros al instalarlo y no un cliente a las 11 de la noche con la
camioneta sucia. Pero hacerlo requiere entrar a la cuenta de ustedes, y para eso te necesito.

*Mientras tanto no puedo avanzar con la parte de cobro.* Todo lo demás ya está.

---

*2) ¿Qué hacemos si alguien paga y no llega a lavar?*

Va a pasar alguna vez: que se corte la luz en la mitad, o que la máquina esté sin señal justo en
ese momento. Quiero que el sistema ya sepa qué hacer solo, en vez de que te llamen a vos.

*A)* *Le queda a favor*: la próxima vez que venga con la misma patente, lava gratis. Es
automático, no hay que devolver plata ni hacer trámites. *Es la que te recomiendo.*

*B)* *Se le devuelve la plata* por Mercado Pago. Es lo más prolijo, pero tarda unos días en
aparecerle y hay que hacerlo a mano desde la cuenta.

*C)* *Caso por caso*: el cliente avisa y ustedes lo resuelven.

Y si se corta la luz en el medio del lavado: ¿le damos los 3 minutos completos de nuevo, o se
pierde? (Yo le daría el lavado completo: son 3 minutos de agua contra un cliente que no vuelve
más.)

---

*3) Un detalle del punto 2, y es importante*

Cada patente puede lavar *2 veces por día* como máximo (eso lo pusimos para que no se abuse de la
tarifa de $500 de los remises).

Hoy, si el lavado se corta por un problema nuestro, *igual le gasta uno de esos dos*. O sea que si
elegís la opción A del punto 2, el "le queda a favor" no le sirve de nada: ya no le quedan lavados
ese día.

Lo puedo cambiar para que un lavado que falló *por culpa nuestra* no le cuente. A mí me parece lo
lógico, pero lo decidís vos porque toca el control de la tarifa barata. *¿Lo cambio?*

---

*4) ¿Quiénes van a mirar los pagos?*

Si alguna vez un pago queda "colgado", alguien de la cooperativa tiene que poder entrar a una
pantalla, ver qué pasó y destrabarlo. Hoy hay una sola cuenta de administrador y no está bien que
la compartan entre varios: si pasa algo, no hay manera de saber quién hizo qué.

Pasame *el nombre y el mail de cada persona* que va a hacer eso (con uno o dos alcanza) y les armo
una cuenta propia a cada uno.

---

*5) Probá el sistema vos mismo y decime qué te parece*

Te paso el link para que lo recorras desde el celular, como si fueras un cliente:

https://hidro-api.insolvadev.com

Entrás, elegís la máquina, ponés una patente cualquiera, y vas a ver la tarifa y el botón de
pagar. *No te va a cobrar nada*: está todo con plata de mentira. Vas a ver un cartel que dice
"MODO DEMO" — eso está bien, significa que es la simulación.

Decime cualquier cosa que no se entienda, que esté fea o que te falte. Es el mejor momento para
cambiarla: ahora es un rato, después es rehacer.

---

Con el punto 1 arrancamos, y con las respuestas de los puntos 2, 3 y 4 dejo todo cerrado.
Cualquier cosa te llamo y lo charlamos tranquilo.

---

# Para anotar las respuestas (uso interno, no mandar)

- **1. Cuenta de Mercado Pago** → quién la maneja: ______ · fecha de la videollamada: ______
- **2. Si paga y no lava** → A (le queda a favor) / B (devolución) / C (caso por caso): ______ ·
  corte de luz = ¿lavado completo de nuevo? SÍ / NO
- **3. ¿El lavado fallido le gasta uno de los 2 del día?** → se cambia / se deja como está
- **4. Mesa de entrada** → nombre + mail: ______ · nombre + mail: ______
- **5. Feedback del demo** → ______
