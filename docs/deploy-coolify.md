# Deploy en Coolify — `hidro-api.insolvadev.com`

> Estado al 2026-09-04: **la red ya está montada y verificada.** Lo único que falta es crear la
> aplicación en Coolify. Ver ADR-021.
>
> **Actualizado 2026-09-10 (ADR-035):** el mismo dominio ahora sirve TODO — API + panel admin +
> flujo del cliente (QR→pago). Antes solo se hubiera visto JSON en este link; ya no hace falta
> un segundo deploy ni otro dominio para lo visual. Ver `docs/designs/deploy-web-estatico.md`.
>
> **Actualizado 2026-09-15 (ADR-037):** la app YA está creada y respondiendo. Chequeada desde
> afuera: faltaban `ADMIN_*`, `JWT_SECRET`, `DEVICE_AUTH_SECRET`, `PUBLIC_APP_URL` y el volumen
> persistente (el login admin por defecto entraba en producción). **Esta guía recomendaba
> `SEED_DEMO=false` y estaba mal**: ver la sección corregida más abajo.
>
> **Actualizado 2026-09-15 (ADR-038):** el código ahora falla cerrado en producción (secretos y
> clave admin), siembra la instalación base siempre y las patentes demo solo en desarrollo, y
> bloquea la clave demo en el login. Diseño: `docs/designs/guardas-produccion-seed.md`.

## Lo que ya está hecho (no hay que repetirlo)

| Pieza | Estado | Evidencia |
|---|---|---|
| Ingress del túnel | ✅ | línea `hidro-api.insolvadev.com → http://localhost:80` en `/etc/cloudflared/config.yml`, con backup `.bak-YYYYMMDD` |
| Servicio cloudflared | ✅ | reiniciado, `active (running)` |
| DNS | ✅ | CNAME `hidro-api` → `18730cc4-2670-40e8-9952-150538438a3f.cfargotunnel.com`, Proxied |
| Camino de red | ✅ | `curl https://hidro-api.insolvadev.com/health` → `404 page not found` de **Traefik**, o sea que llega hasta el proxy |
| TLS para el ESP32 | ✅ | bundle GTS Root R4 + ISRG Root X1 en el firmware, `Verify return code: 0 (ok)` |

**No se creó un segundo túnel** (R1 del Universo) y **no se migró** el túnel a gestión remota: esa
migración es irreversible y el túnel también sirve las cámaras.

## Crear la app en Coolify

1. Nueva aplicación → **Public/Private Repository** → `PMartinGatica/coperativaremis-hidrolavadora`
   (privado: hay que darle acceso a Coolify).
2. **Build Pack: Dockerfile.** El `Dockerfile` está en la raíz del repo y ya está verificado
   (`docker build` + `docker run` + `curl /health` → `{"status":"ok","database":"OK"}`).
3. **Port Exposes: `3020`.**
4. **Domain: `http://hidro-api.insolvadev.com`** (con `http://`: el TLS lo termina Cloudflare y el
   túnel entra a Traefik por el puerto 80; así está funcionando). Coolify le genera solo el router
   de Traefik (`Host(...) && PathPrefix(/)`), que es lo que el ingress del túnel espera.
5. Variables de entorno: ver abajo.
6. **Persistent Storage → Volume Mount → Destination Path `/app/.data`.** Sin volumen, cada
   redeploy borra la base PGlite entera: patentes, PINs, pagos y los secrets de los dispositivos
   (el ESP32 ya flasheado deja de autenticar). Tiene que ser **Volume Mount** (named volume, hereda
   el dueño `node` que fija el `Dockerfile`), no Directory Mount: ese queda de root y el arranque
   falla con `EACCES`.
7. Deploy.

> 🔴 **No actives Healthcheck mientras la base sea PGlite embebido.** Con healthcheck, Coolify
> puede levantar el contenedor nuevo antes de bajar el viejo, y dos procesos PGlite sobre la misma
> carpeta del volumen arriesgan corromper la base. Se activa al migrar a Postgres (TODOS.md).

## Variables de entorno

```
NODE_ENV=production
API_PORT=3020
API_HOST=0.0.0.0
TRUST_PROXY=1
PUBLIC_APP_URL=https://hidro-api.insolvadev.com
PUBLIC_API_URL=https://hidro-api.insolvadev.com
DATABASE_URL=
PAYMENT_PROVIDER=demo
JWT_SECRET=<generar: openssl rand -hex 32>
DEVICE_AUTH_SECRET=<generar: openssl rand -hex 32>
ADMIN_EMAIL=<tu mail>
ADMIN_PASSWORD=<una clave propia, 12 caracteres o más>
DAILY_WASH_LIMIT=2
```

> Secretos en Windows sin `openssl`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
> `DEVICE_AUTH_SECRET` cifra los secrets de los dispositivos en la base: **se fija una vez y no se
> rota** sin re-flashear cada ESP32.

### 🔴 `NODE_ENV=production` no es opcional: sin él se apagan TODAS las guardas

Una versión anterior de esta guía lo omitía y además sugería `TEST_SPEED_FACTOR=10` y
`DEVICE_SIMULATOR=true`. **Esa combinación era peligrosa** y quedó registrada en el ADR-025. `config.ts`
calcula `isProd = nodeEnv === 'production'` y de ahí cuelgan todas las protecciones:

| Sin `NODE_ENV=production` | Qué pasa |
|---|---|
| `TEST_SPEED_FACTOR` no se fuerza a 1 | con `10`, el lavado de **180 s dura 18 s**: el cliente paga $8.000 y recibe 18 segundos de agua |
| `DEVICE_SIMULATOR` no se fuerza a `false` | corre un **ESP32 simulado dentro del servidor público**, que puede consumir autorizaciones en lugar de la máquina real |
| La guarda de secretos y clave admin no dispara | arranca con secretos de desarrollo y la clave demo |

`NODE_ENV` con un valor que no sea `development`, `test` ni `production` (ej. `prod`) **frena el
arranque**: un typo ya no apaga las guardas en silencio. El `Dockerfile` fija `production`, así
que en Coolify no hace falta cargarlo.

Contrapartida honesta: con `NODE_ENV=production` el **simulador queda apagado**, así que no vas a poder
probar el ciclo completo sin hardware real desde este deploy. Eso es lo correcto: esto está expuesto a
internet. Para probar con simulador, corré local, donde `NODE_ENV` no es `production`.

### 🔴 Secretos y clave admin: el sistema no arranca sin ellos (ADR-026/037/038)

En producción la API **sale con un solo error que lista todo lo que falta** (se ve en Coolify →
Logs) si:
- `JWT_SECRET` o `DEVICE_AUTH_SECRET` faltan, son `dev-only-change-me` o tienen menos de 32
  caracteres;
- `ADMIN_PASSWORD` es `hidro-demo-2025` o tiene menos de 12 caracteres.

Además, en producción el login rechaza `hidro-demo-2025` para **cualquier** cuenta, aunque esté
guardada en la base desde antes.

**Qué se siembra al arrancar:**
- Siempre (sobre una base vacía): máquinas `HIDRO-01/02`, sus dispositivos y la cuenta de
  `ADMIN_EMAIL`. Si la cuenta ya existe, su clave se **actualiza** a `ADMIN_PASSWORD`: es la forma
  de rotarla (no hay pantalla de cambio de contraseña).
- Solo si `SEED_DEMO=true`: las patentes demo `AE100AA` (remis, $500) y `AE200AA` (socio,
  $2.000). En producción el default es `false`; no lo cargues. Si ya existen en la base, borralas
  una vez desde Admin → Patentes y no vuelven.

**Limitaciones conocidas:**
- Cambiar `ADMIN_EMAIL` crea una cuenta nueva y **deja viva la anterior** con su clave, sin forma
  de borrarla desde la UI; además deja de contar como "cuenta por defecto", así que puede
  reconciliar pagos. El log de arranque avisa cuántas cuentas distintas de `ADMIN_EMAIL` hay.
- Cambiar `DEVICE_AUTH_SECRET` sobre una base existente deja los dispositivos sin poder
  autenticarse (el log de arranque avisa): hay que rotar el secret desde admin y re-flashear.
- **Rollback** a un deploy anterior a ADR-038: ese código siembra patentes demo por defecto y las
  vuelve a crear en el volumen. Después de un rollback, borrarlas de nuevo.

- `API_HOST=0.0.0.0` es **obligatorio**: con el default `127.0.0.1` el contenedor arranca pero es
  inalcanzable desde afuera.
- `DATABASE_URL` vacío deja correr **PGlite** embebido, que persiste en `DB_FILE` dentro del
  contenedor (`/app/.data`). Alcanza para la etapa DEMO **con el volumen del paso 6**; sin volumen
  se pierde la base en cada redeploy. Para cobrar de verdad va Postgres/Supabase Cloud (R8).
- `DEVICE_SIMULATOR` no tiene efecto en producción: `config.ts` lo fuerza a `false` cuando
  `NODE_ENV=production`, que el `Dockerfile` ya fija.
- Los secretos **no van al repo**: se cargan acá, en Coolify.

## Verificación después del deploy

```bash
curl https://hidro-api.insolvadev.com/health
```
Tiene que devolver `{"status":"ok","database":"OK"}`. Además, abrir
`https://hidro-api.insolvadev.com/` en el navegador tiene que mostrar la landing real (no el
JSON de antes) — es el link que se le puede mandar al cliente para mostrarle el producto
funcionando. Si sigue dando `404 page not found`, el
problema es el router de Traefik (el dominio no quedó bien cargado en Coolify), no el túnel.

## ⚠️ Chequeo obligatorio de `TRUST_PROXY` (ADR-022)

Hay **tres** proxies delante de la app: borde de Cloudflare → `cloudflared` → Traefik. Con
`TRUST_PROXY=1` Express puede tomar como IP del cliente una IP de Cloudflare, y entonces
`express-rate-limit` mete a todos los clientes en la misma cuota: el primero que la consuma deja
afuera al resto. En una máquina de la calle, eso es gente que no puede pagar.

Apenas esté desplegada, comparar la IP que ve el backend con la IP pública real y subir `TRUST_PROXY`
hasta que coincidan. La alternativa robusta es leer `CF-Connecting-IP`, que Cloudflare sobreescribe
siempre y el cliente no puede falsificar; se evalúa en la Fase 1.
