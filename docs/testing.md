# Testing

## Stack

- **Vitest + Supertest** para la API (unit + integración, base PostgreSQL embebida en memoria por test).
- **Estado compartido real**: cada test levanta un contexto completo (DB migrada + seed + simulador), nada de mocks del dominio.
- **E2E en vivo** (`scripts/verify-e2e.mjs`) contra el sistema corriendo.
- **E2E en navegador real** (`scripts/browser-e2e.mjs`) con Edge headless vía CDP: clics reales en el flujo del cliente.
- **Verificación de render** (`scripts/check-render.mjs`): todas las páginas en navegador real.

## Cómo correr

```bash
npm test                          # state-machine + API (35 tests)
npm run test:e2e                  # solo el E2E vitest
node scripts/verify-e2e.mjs       # E2E contra http://127.0.0.1:3020 (API corriendo)
node scripts/browser-e2e.mjs      # E2E con navegador (API + web corriendo)
node scripts/check-render.mjs     # render de las páginas
```

## Matriz de casos obligatorios (todos automatizados)

| Requisito | Test |
|---|---|
| Pago aprobado → genera autorización | `payment-flow.test.ts` |
| Pago rechazado → sin autorización | `payment-flow.test.ts` |
| Pago pendiente → no habilita | `payment-flow.test.ts` |
| Webhook duplicado → una sola autorización | `payment-flow.test.ts` |
| Webhook inválido → descartado | `payment-flow.test.ts` |
| Importe manipulado → rechazado | `payment-flow.test.ts` |
| Botón sin pago → relay no activa | `device-security.test.ts` |
| Doble pulsación → un solo ciclo | `device-security.test.ts` + `concurrency.test.ts` |
| Autorización vencida → no arranca | `payment-flow.test.ts` |
| Internet cae antes de arrancar → no comienza | `simulator-resilience.test.ts` |
| Internet cae durante el lavado → timer local | `simulator-resilience.test.ts` |
| ESP32 reinicia durante el ciclo → reanuda seguro | `simulator-resilience.test.ts` |
| Corte eléctrico → relay OFF + interrumpida | `simulator-resilience.test.ts` |
| Máquina offline → usuario no puede pagar | `offline.test.ts` |
| Dos clientes misma máquina → nunca 2 RUNNING / 2 cobros | `concurrency.test.ts` |
| Pago de HIDRO-01 no sirve en HIDRO-02 | `device-security.test.ts` |
| Emergency stop → relay OFF | `simulator-resilience.test.ts` |
| Flujo E2E completo | `e2e.test.ts` + `browser-e2e.mjs` |
| Pago aprobado con máquina caída → REVOKED | `payment-flow.test.ts` |
| Rotación de secret por dispositivo | `admin.test.ts` |
| HMAC inválido → 401 | `device-security.test.ts` |
| Patente remis → $500 · socio → $2.000 · no registrada → $8.000 | `plates.test.ts` |
| Patente se normaliza (mayúsculas, espacios, guiones) | `plates.test.ts` |
| Sesión sin patente → 400, sin cobro | `plates.test.ts` |
| El pago usa la tarifa de la categoría | `plates.test.ts` |
| Límite diario por patente → 2do/3er lavado rechazado SIN cobrar | `plates.test.ts` |
| El límite es por patente (otra patente sigue pudiendo) | `plates.test.ts` |
| Registro/cambio/borrado de patentes desde admin | `admin.test.ts` |

## Speed factor para testing

`TEST_SPEED_FACTOR` acelera el timer del dispositivo simulado (y del firmware en modo test):

| Valor | Efecto sobre 180 s |
|---|---|
| 1 | tiempo real |
| 10 | 18 s |
| 60 | 3 s |

Solo disponible en desarrollo/testing: en `NODE_ENV=production` se fuerza a 1 (API y firmware `HIDRO_TEST_MODE=0`).

## Notas

- Cada test usa una base PostgreSQL embebida EN MEMORIA (tempdir) → aislado y repetible.
- El simulador corre con heartbeat 500 ms y umbrales cortos para acelerar escenarios offline.
- `scripts/browser-e2e.mjs` resetea los datos demo (`POST /api/demo/reset`, solo desarrollo) antes de correr.
