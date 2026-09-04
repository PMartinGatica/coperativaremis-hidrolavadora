Acá va el estado completo del proyecto:

Qué es: Sistema de pago QR para una hidrolavadora autoservicio de una cooperativa de remises en Ushuaia. El cliente escanea, paga por patente, se habilita la hidro por 3 minutos.



Flujo definitivo (aprobado por el dueño el 01/09):

1. Cliente escanea QR
2. Carga su patente 
3. Sistema identifica tipo de patente y muestra tarifa
4. Paga por Mercado Pago
5. Luz verde 180 segundos (3 minutos), aprieta Start, usa la hidro 3 min
6. Máximo 2 lavados/día/patente (anti-abuso)

Tres tarifas:

• $500 — remis de la cooperativa
• $2.000 — auto particular del socio
• $8.000 — particular no asociado

Arquitectura:

• ESP32 + relay 5V + contactor + pulsador NA + luz LED verde
• Web app QR  + Mercado Pago
• Timer por software en ESP32 (180s)
• Botón físico para el mecánico (bypass, ya existe)

Dónde estamos ahora:

• Bloque 00 (validación QR dinámico MP) — Pablo ya desplegó el mockup con DeepSeek, funciona al 100%. El dueño pidió cambios (los 3 items nuevos de arriba: patente, tarifas, límite diario) — reunión del 01/09, todo definido.
