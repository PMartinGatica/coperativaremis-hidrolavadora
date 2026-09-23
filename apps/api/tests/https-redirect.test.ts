import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers.js';

/**
 * Pendiente C3: `http://hidro-api.insolvadev.com` contestaba 200 sin mandar a `https://`
 * (verificado desde afuera el 2026-09-22). El panel de admin servido por http es la superficie
 * que importa: un atacante en el camino puede reescribir el JS antes de que el navegador vea
 * ninguna defensa. El HSTS que ya manda helmet no alcanza solo, porque el navegador lo ignora
 * cuando llega por http (RFC 6797 §7.2): recién sirve después de una primera visita por https.
 *
 * `CF-Visitor` es el header que Cloudflare pone en su edge con el esquema real del visitante.
 */

const PUBLIC_HTTPS = 'https://hidro-api.insolvadev.com';
const CF_HTTP = JSON.stringify({ scheme: 'http' });
const CF_HTTPS = JSON.stringify({ scheme: 'https' });

let t: TestCtx | undefined;

afterEach(async () => {
  const ctx = t;
  t = undefined;
  await ctx?.close();
});

describe('C3: redirect a HTTPS', () => {
  it('visitante por http -> 302 al mismo path en https', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('/admin').set('cf-visitor', CF_HTTP);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PUBLIC_HTTPS}/admin`);
  });

  it('conserva path y query (el QR lleva query)', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('/machine/HIDRO-01?plate=AE100AA').set('cf-visitor', CF_HTTP);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PUBLIC_HTTPS}/machine/HIDRO-01?plate=AE100AA`);
  });

  it('temporal y no permanente: un PUBLIC_APP_URL mal cargado no queda cacheado para siempre', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('/admin').set('cf-visitor', CF_HTTP);
    expect(res.status).not.toBe(301);
    expect(res.status).not.toBe(308);
  });

  it('visitante ya por https -> no redirige (no hay bucle posible)', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('/').set('cf-visitor', CF_HTTPS);
    expect(res.status).not.toBe(302);
  });

  it('sin header de Cloudflare (local, tests, LAN) -> no redirige', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('/');
    expect(res.status).not.toBe(302);
  });

  it('header roto o sin scheme -> no redirige ni rompe', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    expect((await t.api.get('/').set('cf-visitor', 'no-es-json')).status).not.toBe(302);
    expect((await t.api.get('/').set('cf-visitor', '{"otra":"cosa"}')).status).not.toBe(302);
  });

  it('/api queda afuera: el ESP32 y los webhooks de MP no siguen redirects', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('/api/public/machines/HIDRO-01').set('cf-visitor', CF_HTTP);
    expect(res.status).toBe(200);
  });

  it('/API en mayúsculas también queda afuera: Express rutea sin distinguir mayúsculas', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('/API/public/machines/HIDRO-01').set('cf-visitor', CF_HTTP);
    expect(res.status).toBe(200);
  });

  it('/health queda afuera: es el chequeo de monitoreo', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('/health').set('cf-visitor', CF_HTTP);
    expect(res.status).toBe(200);
  });

  it('POST no se redirige: un 301 lo reenviaría como GET y perdería el cuerpo', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api
      .post('/api/admin/auth/login')
      .set('cf-visitor', CF_HTTP)
      .send({ email: 'admin@test.local', password: 'admin-pass' });
    expect(res.status).toBe(200);
  });

  it('el destino sale de PUBLIC_APP_URL, no del header Host (sin redirect abierto)', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('/admin').set('cf-visitor', CF_HTTP).set('Host', 'atacante.example');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PUBLIC_HTTPS}/admin`);
  });

  it('un path que intenta colgarse del host (//evil.com) sigue cayendo en nuestro origen', async () => {
    t = await createTestApp({ publicAppUrl: PUBLIC_HTTPS });
    const res = await t.api.get('//atacante.example/x').set('cf-visitor', CF_HTTP);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PUBLIC_HTTPS}//atacante.example/x`);
    expect(res.headers.location.startsWith(`${PUBLIC_HTTPS}/`)).toBe(true);
  });

  it('PUBLIC_APP_URL http (desarrollo) -> el redirect queda desactivado', async () => {
    t = await createTestApp({ publicAppUrl: 'http://localhost:5173' });
    const res = await t.api.get('/admin').set('cf-visitor', CF_HTTP);
    expect(res.status).not.toBe(302);
  });
});
