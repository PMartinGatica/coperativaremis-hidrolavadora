# HIDRO SELF-SERVICE — infraestructura y despliegue

## Desarrollo local (DEMO MODE)

Sin servicios externos: la API ejecuta PostgreSQL 16 embebido (PGlite) en `apps/api/.data/`.
Ver README raíz.

## Producción

### 1) PostgreSQL real

```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

o cualquier servidor PostgreSQL. Configurar en `apps/api/.env`:

```env
DATABASE_URL=postgres://hidro:CLAVE-SEGURA@host:5432/hidro
NODE_ENV=production
API_HOST=0.0.0.0                       # necesario dentro de contenedor
TRUST_PROXY=1                          # detrás de reverse proxy (rate limit por IP real)
JWT_SECRET=<aleatorio-largo>           # OBLIGATORIO en producción
DEVICE_AUTH_SECRET=<aleatorio-largo>
ADMIN_EMAIL=admin@hidro.local          # se normaliza a minúsculas
ADMIN_PASSWORD=<clave-fuerte>
PAYMENT_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_PUBLIC_KEY=...
MERCADOPAGO_WEBHOOK_SECRET=...
PUBLIC_APP_URL=https://tu-dominio.com
PUBLIC_API_URL=https://tu-dominio.com # webhooks de MP van a la API; si api en subdominio: https://api.tu-dominio.com
DEVICE_SIMULATOR=false
TEST_SPEED_FACTOR=1
SEED_DEMO=true   # solo el primer arranque; luego false
```

### 2) Build y ejecución (dos opciones)

```bash
# opción A: proceso directo
npm install && npm run build
npm run start:api      # API en :3020

# opción B: contenedor (Dockerfile multi-stage en la raíz del repo)
docker build -t hidro-api .
docker run -d --env-file apps/api/.env -p 3020:3020 hidro-api
```

### 3) Web estática

`apps/web/dist/` es el build productivo. Servirlo con cualquier server estático
o reverse proxy. Los clientes usan la misma URL pública para QR y retorno de Mercado Pago.

### 4) HTTPS

Obligatorio: Mercado Pago webhooks, pagos y el protocolo del ESP32 exigen HTTPS.
El repo incluye `infrastructure/Caddyfile.example` (Caddy con HTTPS automático):
API en `/api/*` y `/health`, frontend estático en el resto.

IMPORTANTE: los webhooks de Mercado Pago se envían a `PUBLIC_API_URL`. Si front y API
están en dominios distintos, `PUBLIC_API_URL` debe apuntar a la API (y el proxy debe
rutear `/api/*` ahí), o los pagos se pierden en silencio.

### 5) Checklist de puesta en marcha

- [ ] PENDING: tarifas definitivas ($500 / $2.000 / $8.000) y límite diario (2) — configurables en admin.
- [ ] PENDING: modelo de contactor / bobina / nivel del relay (`RELAY_ACTIVE_LEVEL`).
- [ ] PENDING: decisión sobre retiro del timer eléctrico existente (mantener durante la validación).
- [ ] PENDING: política de reembolso (máquina offline post-pago, corte eléctrico) — ver DECISIÓN PENDIENTE en README.
- [ ] SPIKE Mercado Pago con credenciales de prueba (ver docs/payment-flow.md).
- [ ] Registrar/rotar secret del ESP32 real desde admin y flashear firmware (NTP + CA configuradas en `firmware/esp32`).
- [ ] Imprimir QR de cada máquina (admin → Generar QR).
