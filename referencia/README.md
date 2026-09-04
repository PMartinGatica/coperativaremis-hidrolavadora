# referencia/ — material pesado del Mundo

> **En este Mundo esta carpeta está vacía a propósito.** El material de referencia vive en el
> **repo de código**, no acá (ver ADR-004 del Mundo).

## Dónde está el material pesado
Todo en `D:/insolva/Desarrollo/Deepseek-harnes/hidro-self-service/`:

| Archivo | Qué es | Tamaño |
|---|---|---|
| `análisis.md` | análisis original del sistema, escrito antes de construir | 27 KB |
| `presupuesto-hidrolavadora-completo.html` | presupuesto presentado al cliente | 37 KB |
| `docs/architecture.md` | arquitectura y decisiones | — |
| `docs/payment-flow.md` | flujo de pago e idempotencia | — |
| `docs/device-protocol.md` | contrato backend ↔ ESP32 (headers, firma, endpoints) | — |
| `docs/state-machine.md` | máquina de estados de sesión | — |
| `docs/testing.md` | estrategia de testing | — |

## Regla de tokens (importante)
Esto es **referencia pesada**: se lee **UNA sola vez**, en la fase que lo necesita (regla 8 del
protocolo del Universo). Una vez construida la pantalla o el módulo, **se referencia por su
código**, NO se vuelve a leer el análisis ni el presupuesto.

## ⚠️ Los docs técnicos afirman cosas que no son ciertas
Verificado el 2026-09-03. Ejemplo: `docs/device-protocol.md` dice que la ventana HMAC de 5 minutos
"tolera" que el firmware mande `millis()/1000` — **no la tolera**, con eso el ESP32 recibe 401 en
todos los requests. Las correcciones de documentación están en el bloque 6.3 de
`prompt-deepseek-correcciones.md`. **Hasta que DeepSeek las aplique, leé los docs con desconfianza
y verificá contra el código.**
