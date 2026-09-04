# Deploy en Coolify — `hidro-api.insolvadev.com`

> Estado al 2026-09-04: **la red ya está montada y verificada.** Lo único que falta es crear la
> aplicación en Coolify. Ver ADR-021.

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
4. **Domain: `https://hidro-api.insolvadev.com`.** Coolify le genera solo el router de Traefik, igual
   que hizo con `sm-gestion` (`Host(...) && PathPrefix(/)`), que es lo que el ingress del túnel espera.
5. Variables de entorno: ver abajo.
6. Deploy.

## Variables de entorno

```
API_PORT=3020
API_HOST=0.0.0.0
TRUST_PROXY=1
PUBLIC_APP_URL=https://hidro-api.insolvadev.com
PUBLIC_API_URL=https://hidro-api.insolvadev.com
DATABASE_URL=
PAYMENT_PROVIDER=demo
JWT_SECRET=<generar: openssl rand -hex 32>
DEVICE_AUTH_SECRET=<generar: openssl rand -hex 32>
ADMIN_EMAIL=admin@hidro.demo
ADMIN_PASSWORD=<poner una propia, no dejar la de ejemplo>
DEVICE_SIMULATOR=true
TEST_SPEED_FACTOR=10
DAILY_WASH_LIMIT=2
```

- `API_HOST=0.0.0.0` es **obligatorio**: con el default `127.0.0.1` el contenedor arranca pero es
  inalcanzable desde afuera.
- `DATABASE_URL` vacío deja correr **PGlite** embebido, que persiste en `DB_FILE` dentro del
  contenedor. Alcanza para desarrollo. **Ojo: si Coolify recrea el contenedor sin volumen, se pierde
  la base.** Para producción va Postgres/Supabase Cloud (R8).
- `DEVICE_SIMULATOR=true` mientras no haya ESP32 real conectado; pasa a `false` en la puesta en marcha.
- Los secretos **no van al repo**: se cargan acá, en Coolify.

## Verificación después del deploy

```bash
curl https://hidro-api.insolvadev.com/health
```
Tiene que devolver `{"status":"ok","database":"OK"}`. Si sigue dando `404 page not found`, el
problema es el router de Traefik (el dominio no quedó bien cargado en Coolify), no el túnel.

## ⚠️ Chequeo obligatorio de `TRUST_PROXY` (ADR-022)

Hay **tres** proxies delante de la app: borde de Cloudflare → `cloudflared` → Traefik. Con
`TRUST_PROXY=1` Express puede tomar como IP del cliente una IP de Cloudflare, y entonces
`express-rate-limit` mete a todos los clientes en la misma cuota: el primero que la consuma deja
afuera al resto. En una máquina de la calle, eso es gente que no puede pagar.

Apenas esté desplegada, comparar la IP que ve el backend con la IP pública real y subir `TRUST_PROXY`
hasta que coincidan. La alternativa robusta es leer `CF-Connecting-IP`, que Cloudflare sobreescribe
siempre y el cliente no puede falsificar; se evalúa en la Fase 1.
