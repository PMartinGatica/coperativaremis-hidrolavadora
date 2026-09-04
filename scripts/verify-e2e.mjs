/**
 * Verificación E2E EN VIVO contra el sistema corriendo (API en :3020).
 * Uso: node scripts/verify-e2e.mjs
 * Recorre el viaje completo del cliente con el simulador DEMO y verifica admin.
 */
const API = process.env.API_URL ?? 'http://127.0.0.1:3020';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@hidro.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'hidro-demo-2025';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function check(cond, label) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures += 1;
    console.log(`  \u2717 ${label}`);
  }
}

async function api(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function waitFor(fn, label, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
  }
  throw new Error(`TIMEOUT: ${label}`);
}

async function main() {
  console.log('=== HIDRO SELF-SERVICE — verificación E2E en vivo ===\n');

  console.log('[1] health');
  const health = await api('GET', '/health');
  check(health.status === 200, `API responde (${health.body.status ?? '?'})`);
  check(health.body.checks?.database === 'OK', `Base de datos OK`);
  console.log(`     payments=${health.body.checks?.payments} devices=${health.body.checks?.devices}`);

  console.log('\n[2] máquina HIDRO-01');
  const machine = await api('GET', '/api/public/machines/HIDRO-01');
  check(machine.status === 200, 'endpoint público responde');
  check(machine.body.machine?.availability === 'AVAILABLE', `disponible: ${machine.body.machine?.availability}`);
  check(machine.body.machine?.status === 'ONLINE', `estado: ${machine.body.machine?.status}`);
  console.log(
    `     ${machine.body.machine?.name} — tarifas $${machine.body.machine?.priceRemisArs}/$${machine.body.machine?.priceSocioArs}/$${machine.body.machine?.priceExternoArs} / ${machine.body.machine?.durationSeconds}s`,
  );

  console.log('\n[3] cotizar tarifa por patente');
  const quote = await api('POST', '/api/public/machines/HIDRO-01/quote', { plate: 'AE100AA' });
  check(quote.status === 200, 'cotización OK');
  check(quote.body.quote?.category === 'remis', `categoría: ${quote.body.quote?.category}`);
  check(quote.body.quote?.priceArs === 500, `tarifa remis: $${quote.body.quote?.priceArs}`);
  check(quote.body.quote?.remainingToday === 2, `lavados restantes hoy: ${quote.body.quote?.remainingToday}`);
  const quoteExt = await api('POST', '/api/public/machines/HIDRO-01/quote', { plate: 'ZZ999ZZ' });
  check(quoteExt.body.quote?.priceArs === 8000, `patente no registrada -> externo: $${quoteExt.body.quote?.priceArs}`);

  console.log('\n[4] crear sesión + pago DEMO (patente AE100AA)');
  const session = await api('POST', '/api/public/machines/HIDRO-01/sessions', { plate: 'AE100AA' });
  check(session.status === 201, 'sesión creada con patente');
  check(session.body.checkout?.plateCategory === 'remis', `categoría en checkout: ${session.body.checkout?.plateCategory}`);
  const sessionId = session.body.checkout?.sessionId;
  const externalId = session.body.checkout?.payment?.externalPaymentId;
  console.log(`     sesión: ${sessionId}  pago: ${externalId}  importe: $${session.body.checkout?.payment?.amount}`);
  const approve = await api('POST', `/api/public/payments/${externalId}/simulate`, { action: 'approve' });
  check(approve.body.result?.result === 'approved', 'pago aprobado (mismo dominio que MP)');

  console.log('\n[5] ESP32 simulado recibe la autorización');
  await waitFor(async () => {
    const s = await api('GET', `/api/public/sessions/${sessionId}`);
    return s.body.session?.status === 'WAITING_FOR_BUTTON';
  }, 'WAITING_FOR_BUTTON');
  let snap = (await api('GET', '/api/demo/device/HIDRO-01/state')).body.simulator;
  check(snap.state === 'ARMED', `estado simulador: ${snap.state}`);
  check(snap.ledState === 'GREEN', `LED: ${snap.ledState}`);

  console.log('\n[6] pulsador -> relay ON -> RUNNING');
  await api('POST', '/api/demo/device/HIDRO-01/action', { action: 'press_button' });
  snap = (await api('GET', '/api/demo/device/HIDRO-01/state')).body.simulator;
  check(snap.relayState === true, `relay: ON`);
  check(snap.ledState === 'GREEN_BLINK', `LED: ${snap.ledState}`);
  const running = await api('GET', `/api/public/sessions/${sessionId}`);
  check(running.body.session?.status === 'RUNNING', `sesión: RUNNING`);

  console.log('\n[7] timer local -> relay OFF -> FINISHED');
  await waitFor(async () => {
    const s = await api('GET', `/api/public/sessions/${sessionId}`);
    return s.body.session?.status === 'FINISHED';
  }, 'FINISHED', 60_000);
  snap = (await api('GET', '/api/demo/device/HIDRO-01/state')).body.simulator;
  check(snap.relayState === false, `relay: OFF`);
  console.log(`     lavado terminó en ~${Math.round(180 / (snap.speedFactor || 1))}s reales (factor ${snap.speedFactor})`);

  console.log('\n[8] administración');
  const login = await api('POST', '/api/admin/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  check(login.status === 200, 'login admin OK');
  const token = login.body.token;
  const detail = await api('GET', `/api/admin/sessions/${sessionId}`, null, token);
  check(detail.status === 200, 'sesión visible en admin');
  check(detail.body.session?.plate === 'AE100AA', `patente registrada: ${detail.body.session?.plate}`);
  const labels = (detail.body.session?.timeline ?? []).map((e) => e.label);
  check(labels.includes('Relay ON') && labels.includes('Relay OFF') && labels.includes('Sesión finalizada'), 'timeline completa');
  const overview = await api('GET', '/api/admin/overview', null, token);
  check(overview.body.stats?.washesToday >= 1, `lavados de hoy: ${overview.body.stats?.washesToday}`);
  check(overview.body.stats?.revenueToday >= 1, `ingresos de hoy: $${overview.body.stats?.revenueToday}`);
  check(overview.body.stats?.byCategory?.remis?.washes >= 1, `desglose remis: ${overview.body.stats?.byCategory?.remis?.washes} lavados`);

  console.log('\n[9] pruebas de abuso rápido');
  const busy = await api('POST', '/api/public/machines/HIDRO-01/sessions', { plate: 'AE100AA' });
  check(busy.status === 409 || busy.status === 201, `máquina liberada tras FINISHED (${busy.status})`);
  const dup = await api('POST', `/api/public/payments/${externalId}/simulate`, { action: 'duplicate_webhook' });
  check(dup.body.result?.result === 'duplicated', 'webhook duplicado -> idempotente');
  const noPlate = await api('POST', '/api/public/machines/HIDRO-01/sessions', {});
  check(noPlate.status === 400, `sin patente -> 400 (${noPlate.status})`);

  console.log(`\n${failures === 0 ? '=== E2E COMPLETO: PASS ===' : `=== FALLO: ${failures} chequeos ==='`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E ERROR:', err.message);
  process.exit(1);
});
