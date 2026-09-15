# Mensaje para el dueño de la cooperativa (WhatsApp)

> Copiar desde la línea de abajo. Formato de WhatsApp: `*texto*` sale en negrita.
> Contexto para vos, no lo mandes: la pregunta 1 (ADR-007, patente) YA SE RESPONDIÓ en vivo —
> Gaby pidió PIN de 4 dígitos por patente y ya está construido y funcionando (ADR-036,
> 2026-09-13). Por eso este mensaje quedó con solo 2 preguntas: reembolso y cuenta de MP.
> La 1 (reembolso) es la política de reembolso. La 2 es el ADR-018 y hace falta sí o sí para
> cobrar de verdad.

---

Buenas! Antes de seguir construyendo necesito que me definas dos cosas. Son decisiones tuyas, no
técnicas, y de lo que elijas depende cómo lo programo. Te las explico simple.

*1) Qué hacemos si el cliente paga y no lava*

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

*2) La cuenta de Mercado Pago*

La plata tiene que caer directo en la cuenta de la cooperativa, no en la mía. Para eso, cuando
estemos por arrancar, voy a necesitar que me habiliten el acceso desde la cuenta de Mercado Pago de
ustedes. Todavía no, primero pruebo todo con una cuenta de prueba, pero te lo aviso ahora para que
lo tengas en el radar y veas quién lo maneja de ese lado.

Con esas dos respuestas sigo. Cualquier cosa te llamo y lo charlamos.

---

# AGREGADO (2026-09-04, después de mandar el mensaje de arriba)

> Surgió del ADR-024: el crédito que le ofrecimos en el punto 1 **no se puede usar** si el lavado
> fallido ya le quemó el cupo del día. Es una línea, pero sin ella la compensación es de mentira.
> Mandar como mensaje aparte, después de que conteste lo otro (o junto, si todavía no contestó).

---

Ah, me olvidé un detalle del punto 1 y es importante.

Hoy el sistema cuenta el lavado contra el límite de 2 por día **aunque el lavado haya fallado**. O
sea que si se corta la luz en la mitad, además de perder el lavado, le gasta uno de los dos que tenía.
Con lo cual el "crédito para la próxima" no le sirve de nada: ya no le quedan lavados ese día.

Lo puedo cambiar para que un lavado que falló por culpa nuestra (corte de luz, máquina caída) **no le
cuente contra el límite**. Me parece que es lo lógico, pero es tu decisión porque afecta al control
de la tarifa de $500. ¿Lo dejo así?
