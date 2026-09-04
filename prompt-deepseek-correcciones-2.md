# PROMPT 2 PARA DEEPSEEK — dos correcciones que quedaron

> Copiar TODO lo que sigue (desde "CONTEXTO") y pegarlo como prompt.

---

## CONTEXTO

Seguís sobre el repo `hidro-self-service` (monorepo npm workspaces: `apps/api` Express+TS+drizzle,
`apps/web` React+Vite, `packages/shared`, `packages/state-machine`, `firmware/esp32` PlatformIO/C++).

**Buen trabajo con la ronda anterior.** Verifiqué lo que entregaste y está casi todo bien:

- El firmware ya usa NTP con epoch en milisegundos y no emite requests hasta tener hora válida.
- El root CA es el ISRG Root X1 real (lo pasé por `openssl x509`: subject, issuer y fingerprint
  SHA256 correctos, válido hasta 2035).
- `HIDRO_API_BASE_URL` quedó solo el host y `begin()` normaliza por las dudas.
- `hardRelayGuard()` está bien hecha: aritmética `uint32_t` rollover-safe, se llama primero en el
  loop, y `bootDevice()` re-ancla `runStartedAtMs` restando lo consumido al reanudar.
- `processApproval` corre dentro de `db.transaction` con todo pasando `tx`.
- Los dos tests que pedí están y pasan: `concurrency.test.ts:13` y `plates.test.ts:130`.
- `npm test` da **48/48 verde** y `tsc --noEmit` está limpio en api y web.
- `npm audit`: pasó de 1 high + 7 moderate a **0 high** + 7 moderate.

Quedan **dos cosas rotas** (una es un fix tuyo con el signo invertido, la otra es un bug del
Dockerfile que yo no había detectado antes) y **cuatro detalles menores**.

**Regla base: no rompas los 48 tests ni el typecheck.** Después de cada bloque corré `npm test` y
`npx tsc -p apps/api/tsconfig.json --noEmit`.

---

## BLOQUE A — CRÍTICO: el fix de zona horaria tiene el signo invertido

`packages/shared/src/time.ts`:

```ts
const ARGENTINA_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3

export function startOfDayAmericaArgentina(now: Date = new Date()): Date {
  const t = now.getTime();
  const shifted = t - ARGENTINA_OFFSET_MS;              // ← MAL: suma 3 h, debería restarlas
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(dayStart + ARGENTINA_OFFSET_MS);      // ← MAL: resta 3 h, debería sumarlas
}
```

Los dos signos están al revés. Para pasar de UTC a hora local se **suma** el offset
(`local = utc + offset`, con `offset = -3 h`), y para volver a UTC se **resta**.

**Efecto medido** (lo corrí con tres timestamps):

```
ahora 2026-09-03T14:00:00Z   (Ushuaia 11:00 del 3)
  da       2026-09-02T21:00:00Z  → Ushuaia 2026-09-02 18:00
  correcto 2026-09-03T03:00:00Z  → Ushuaia 2026-09-03 00:00
```

O sea: **el día arranca a las 18:00 de Ushuaia en vez de a las 00:00**. Antes del fix cortaba a
las 21:00 (el bug original con `setHours` en UTC). Sigue mal, y en un horario más concurrido: el
límite de 2 lavados por patente se resetea a las 6 de la tarde y la recaudación del día del panel
admin queda partida al medio.

**Corregir:**

```ts
const shifted = t + ARGENTINA_OFFSET_MS;
const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
return new Date(dayStart - ARGENTINA_OFFSET_MS);
```

**Y agregá un test unitario** en `packages/shared` (o donde tengas los tests de shared) que fije
el comportamiento con casos concretos, para que este signo no se vuelva a dar vuelta:

- `2026-09-03T14:00:00Z` → `2026-09-03T03:00:00Z`
- `2026-09-03T02:00:00Z` → `2026-09-02T03:00:00Z` (antes de las 00:00 de Ushuaia = día anterior)
- `2026-09-03T02:59:59Z` → `2026-09-02T03:00:00Z`
- `2026-09-03T03:00:00Z` → `2026-09-03T03:00:00Z` (el borde exacto)

El test tiene que pasar **con el proceso en cualquier TZ**: no uses `setHours` ni `toLocaleString`
para calcular lo esperado, poné los ISO literales.

---

## BLOQUE B — CRÍTICO: el Dockerfile construye, pero el contenedor no arranca

Construí la imagen y la corrí. La build sale bien (exit 0, 535 MB) y por eso el problema pasa
desapercibido, pero el contenedor **muere en el arranque**:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@hidro/shared'
    imported from /app/apps/api/dist/config.js
    code: 'ERR_MODULE_NOT_FOUND'
```

**Causa:** en un monorepo npm workspaces, `node_modules/@hidro/shared` no es una copia sino un
**symlink** a `packages/shared` (`npm ls @hidro/shared` lo confirma:
`@hidro/shared@1.0.0 -> .\packages\shared`), y `packages/shared/package.json` resuelve a
`./dist/index.js`. La etapa de runtime del Dockerfile copia `node_modules`, `apps/api/dist`,
`apps/api/drizzle` y los `package.json`, pero **nunca copia `packages/`** → el symlink queda
colgado.

**Corregir** en la segunda etapa del `Dockerfile`, antes del `USER node`:

```dockerfile
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/state-machine/package.json ./packages/state-machine/package.json
COPY --from=build /app/packages/state-machine/dist ./packages/state-machine/dist
```

**Verificalo de verdad, no por lectura.** El criterio de aceptación es que esto arranque y quede
escuchando:

```bash
docker build -t hidro-check .
docker run --rm -p 3020:3020 \
  -e NODE_ENV=production \
  -e API_HOST=0.0.0.0 \
  -e JWT_SECRET=una-clave-larga-de-prueba-1234567890 \
  -e DEVICE_AUTH_SECRET=otra-clave-larga-de-prueba-0987654321 \
  hidro-check
# en otra terminal:
curl -s http://localhost:3020/health
```

Tiene que responder el health, no tirar `ERR_MODULE_NOT_FOUND`.

**Mientras estás ahí, dos mejoras de la imagen** (opcionales pero baratas): la etapa de runtime
copia el `node_modules` completo del build, que incluye las devDependencies (typescript, vitest,
drizzle-kit, supertest…). Son 535 MB de imagen para una API. Si te sale limpio, hacé un
`npm ci --omit=dev --ignore-scripts` en la etapa de runtime, o `npm prune --omit=dev` antes de
copiar. **Si eso te complica el symlink de los workspaces, dejalo como está y avisá** — que
arranque es más importante que el tamaño.

---

## BLOQUE C — MENORES (rápidos)

### C.1 — `docs/architecture.md:64` todavía afirma lo que causó todo el problema

Dice:

> **8. Simulador fiel al firmware.** `SimulatorHub` replica el firmware (…). Así el E2E sin
> hardware prueba exactamente las mismas reglas.

Es la **misma afirmación falsa** que ya corregiste en `README.md` y en `docs/device-protocol.md`,
en el único archivo que no te nombré. El simulador y el firmware son **dos implementaciones
independientes** del mismo protocolo, y solo el simulador está cubierto por tests: por eso
convivían los 3 bloqueantes del firmware con la suite entera en verde.

**Corregir** con el mismo criterio que usaste en el README: decir que son dos implementaciones
del mismo contrato, que el E2E prueba las reglas del **backend** (no las del firmware), y que un
cambio de protocolo hay que aplicarlo en los dos lados.

### C.2 — `docs/payment-flow.md:83` quedó desactualizado

Dice que el sweeper vence el pago pendiente a los `PAYMENT_PENDING_TIMEOUT_SECONDS` **(600 s)**.
Ahora el default es **120 s** (`DEFAULT_PAYMENT_PENDING_TIMEOUT_SECONDS` en
`packages/shared/src/constants.ts`). Actualizar el número.

### C.3 — `hashSecret` ya no usa el parámetro `pepper`

En `apps/api/src/db/seed.ts`, después de pasar a salt aleatorio, `hashSecret(secret, pepper)`
ignora `pepper`. Está bien funcionalmente (y `verifySecret` sigue leyendo el salt del string, así
que los hashes viejos siguen validando), pero el parámetro quedó muerto y confunde. Sacalo de la
firma y de los llamadores, **o** dejalo y documentá en una línea por qué se conserva. Cualquiera
de las dos, pero que quede explícito.

### C.4 — `pollAuthorization` sigue con el TTL hardcodeado

`firmware/esp32/src/main.cpp`: `auth.expiresAtMs = nowEpochMs() + 300000UL;` — 5 minutos fijos,
sin parsear `expires_at` de la respuesta. El comentario ahora aclara bien que el backend es la
autoridad y que una autorización vencida devuelve 409, así que **no es un bug**. Pero si el admin
sube `authTtlSeconds` a 600, el dispositivo se desarma a los 300 s igual.

Es de prioridad baja: parseá el ISO8601 de `expires_at` a epoch ms (con `strptime`/`timegm` o
parseo manual, es UTC con `Z`), y si el parseo falla caé al margen de 5 minutos actual.

---

## CIERRE

1. `npm test` → 48 tests + los nuevos del bloque A, todos verdes.
2. `npx tsc -p apps/api/tsconfig.json --noEmit` y `npx tsc -p apps/web/tsconfig.json --noEmit` limpios.
3. **`docker build` + `docker run` + `curl /health` respondiendo** — este es el criterio de
   aceptación del bloque B, no alcanza con leer el Dockerfile.
4. `pio run -d firmware/esp32` — **esto quedó pendiente de la ronda anterior y sigue pendiente**.
   Los arreglos del firmware están revisados por lectura, no verificados por compilación. Si no
   tenés PlatformIO disponible, decilo explícitamente en el resumen en vez de omitirlo.
5. Un resumen corto: qué arreglaste, qué dejaste sin tocar y por qué, y qué necesita decisión humana.

No agregues features. No cambies el modelo de datos. No toques el diseño visual de `apps/web`.
