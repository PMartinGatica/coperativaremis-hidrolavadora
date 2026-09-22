# Mensaje para Javi (encargado de la hidrolavadora) — WhatsApp

> **Nota para Pablo, NO la mandes.**
>
> Versión corta y en tu tono, con las respuestas que Javi ya te dio incorporadas (reembolso,
> corte de luz, cupo diario). Reemplaza a `mensaje-dueno-que-necesito-de-vos.md`, que quedó
> largo y con cosas ya contestadas.
>
> **Lo único que bloquea es Mercado Pago.** Lo demás es confirmar y repreguntar.
>
> **Qué necesitamos de esa cuenta, en concreto (para que lo tengas claro vos):** tres códigos
> que se sacan del panel de desarrolladores de la cuenta de la cooperativa —
> 1. *Access Token* (el de producción, no el de prueba)
> 2. *Public Key*
> 3. la *firma secreta* que aparece al dar de alta el webhook (Webhooks → Configurar
>    notificaciones → evento **Pagos** → URL `https://hidro-api.insolvadev.com/api/webhooks/mercadopago`)
>
> El 3 es el que se olvida siempre y sin él ningún pago le avisa a la máquina (ADR-052).
>
> **Sobre pedirle usuario y contraseña:** lo dejé como opción B porque sé que con Javi hay
> confianza y puede ser lo más rápido. Dato que hace que esa opción sea razonable y que conviene
> que le digas: **cambiar la contraseña después NO rompe nada**. Los tres códigos siguen
> funcionando igual, porque no dependen de la clave de la cuenta. Si alguna vez querés cortar el
> acceso de verdad, se borra la aplicación desde el panel y listo.
> Igual la opción A (videollamada, él escribe su clave, vos le decís dónde tocar) es la misma
> cantidad de minutos y no te deja la clave de la cooperativa en el teléfono. Por eso va primera.
>
> Copiá desde la línea de abajo. `*texto*` = negrita en WhatsApp.

---

Hola Javi! Te cuento cómo viene la hidrolavadora.

Está andando. Todo el circuito funciona: el tipo escanea el QR, pone la patente, le aparece la
tarifa que le toca, paga, se le prende la luz verde y tiene sus 3 minutos. Eso ya está probado de
punta a punta. Lo que falta es que cobre plata de verdad en vez de plata de mentira, y ahí te
necesito para una sola cosa.

*Lo único que falta: la cuenta de Mercado Pago de la cooperativa*

La plata tiene que caer en la cuenta de ustedes, obvio. Para eso hay que sacar tres códigos de
adentro de esa cuenta y cargarlos en el sistema. No es nada raro, es la configuración normal para
cobrar automático, pero hay que entrar a la cuenta para hacerlo.

Lo podemos hacer de dos formas, la que te quede más cómoda:

*A)* Nos conectamos 15 minutos por videollamada, compartís pantalla, *entrás vos con tu clave* (yo
no la veo) y te voy diciendo dónde tocar. Al final me copiás y pegás tres códigos y listo.

*B)* Si te resulta más fácil, me pasás el usuario y la clave, lo dejo andando y después la cambiás.
Aclaro algo importante por si te preocupa: *cambiar la clave después no rompe nada*, el sistema
sigue funcionando igual porque esos códigos no dependen de tu contraseña.

Decime cuál preferís y cuándo te viene bien. *Hasta que no hagamos esto, no puedo avanzar con la
parte de cobro* — todo lo demás ya está listo.

*Lo que ya me dijiste, te lo confirmo por escrito así queda asentado:*

- Si alguien paga y no llega a lavar: le queda el lavado a favor para la próxima con la misma
  patente. Y si el tipo insiste con que quiere la plata, lo resuelven ustedes caso por caso.
- Si se corta la luz en la mitad: le damos el lavado completo de nuevo, los 3 minutos enteros.
- Y el lavado que se cortó *no le gasta uno de los dos del día*. Tal cual lo que dijiste: si no
  lavó, es como si no hubiera lavado. Eso lo programo así.

*Una que quedó pendiente*

Si alguna vez un pago queda colgado, alguien de la cooperativa tiene que poder entrar a una
pantalla y destrabarlo. Necesito *el nombre y el mail* de la persona o las dos personas que van a
hacer eso, para armarles una cuenta a cada una. No conviene que compartan una sola, porque después
no se sabe quién tocó qué. Cuando puedas me lo pasás.

*Y si tenés 5 minutos, probalo vos*

https://hidro-api.insolvadev.com

Entrás desde el celular como si fueras un cliente: elegís la máquina, ponés una patente cualquiera
y seguís hasta el final. *No te va a cobrar nada*, está todo con plata de mentira — vas a ver un
cartel que dice "MODO DEMO", eso está bien.

Decime cualquier cosa que no se entienda o que le falte. Ahora cambiarlo es un rato; después es
rehacerlo.

Abrazo!
