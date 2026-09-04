# Mensaje para el dueño de la cooperativa (WhatsApp)

> Copiar desde la línea de abajo. Formato de WhatsApp: `*texto*` sale en negrita.
> Contexto para vos, no lo mandes: la pregunta 1 es el ADR-007 (abierta desde el 03/09 y es lo único
> que bloquea definir las fases). La 2 es la política de reembolso. La 3 es el ADR-018 y hace falta
> sí o sí para cobrar de verdad.
> Si contesta la 1 con "opción 4" (aceptar el riesgo), queda registrado como decisión suya y se
> cierra el ADR-007 igual: lo que no se puede es seguir sin respuesta.

---

Buenas! Antes de seguir construyendo necesito que me definas tres cosas. Son decisiones tuyas, no
técnicas, y de lo que elijas depende cómo lo programo. Te las explico simple.

*1) El tema de la patente*

Como quedamos, el precio sale de la patente: $500 si es un remis de la cooperativa, $2.000 si es el
auto particular de un socio, y $8.000 si es alguien de afuera.

El problema es que la patente el cliente la escribe a mano y el sistema no tiene forma de saber si
ese auto es realmente suyo. Cualquiera que pase por la parada, anote la patente de un remis y la
cargue, lava por $500 en vez de $8.000. El límite de 2 lavados por día tampoco lo frena: le termina
gastando los lavados al remisero de verdad.

Puede pasar poco o nada, o puede correrse la voz. Vos conocés el ambiente mejor que yo. Las opciones:

*1.* Cada patente registrada tiene un *PIN de 4 dígitos*. El remisero pone patente + PIN. Es lo más
seguro, pero hay que repartir los PIN y algunos se los van a olvidar.

*2.* Patente + *los últimos 4 números del DNI del titular*. No hay que repartir nada porque el dato
ya lo sabe cada uno, pero es un poco más fácil de averiguar que un PIN.

*3.* Una *credencial o QR personal* para cada remisero, que escanea él. Es lo más cómodo de usar,
pero es lo que más trabajo lleva armar y hay que reponerla si se pierde.

*4.* *Dejarlo como está* y aceptar el riesgo, porque son pocos y todos se conocen. Si después pasa,
lo agregamos.

Contestame con el número. La 4 también es una respuesta válida, solo necesito que la elijas vos.

*2) Qué hacemos si el cliente paga y no lava*

Puede pasar de dos formas: que pague y la máquina esté sin conexión o apagada, o que se corte la luz
en la mitad del lavado. Es raro, pero va a pasar alguna vez y quiero que el sistema ya sepa qué
hacer, en vez de que te llame alguien enojado.

*A.* *Crédito automático*: la próxima vez que escanee con la misma patente, lava gratis. Es
instantáneo, no hay que devolver plata ni hacer trámites, y el cliente se va contento. Es la que te
recomiendo.

*B.* *Devolución de la plata* por Mercado Pago. Es lo más "correcto", pero la devolución tarda unos
días en aparecerle y hay que hacerla desde la cuenta.

*C.* *A mano*: el cliente avisa y ustedes lo resuelven caso por caso.

Y si se corta la luz en el medio: ¿le damos el lavado completo de nuevo, o se pierde? (Yo daría el
lavado completo: son 3 minutos de agua contra un cliente que no vuelve más.)

*3) La cuenta de Mercado Pago*

La plata tiene que caer directo en la cuenta de la cooperativa, no en la mía. Para eso, cuando
estemos por arrancar, voy a necesitar que me habiliten el acceso desde la cuenta de Mercado Pago de
ustedes. Todavía no, primero pruebo todo con una cuenta de prueba, pero te lo aviso ahora para que
lo tengas en el radar y veas quién lo maneja de ese lado.

Con esas tres respuestas sigo. Cualquier cosa te llamo y lo charlamos.

---

# AGREGADO (2026-09-04, después de mandar el mensaje de arriba)

> Surgió del ADR-024: el crédito que le ofrecimos en el punto 2 **no se puede usar** si el lavado
> fallido ya le quemó el cupo del día. Es una línea, pero sin ella la compensación es de mentira.
> Mandar como mensaje aparte, después de que conteste lo otro (o junto, si todavía no contestó).

---

Ah, me olvidé un detalle del punto 2 y es importante.

Hoy el sistema cuenta el lavado contra el límite de 2 por día **aunque el lavado haya fallado**. O
sea que si se corta la luz en la mitad, además de perder el lavado, le gasta uno de los dos que tenía.
Con lo cual el "crédito para la próxima" no le sirve de nada: ya no le quedan lavados ese día.

Lo puedo cambiar para que un lavado que falló por culpa nuestra (corte de luz, máquina caída) **no le
cuente contra el límite**. Me parece que es lo lógico, pero es tu decisión porque afecta al control
de la tarifa de $500. ¿Lo dejo así?
