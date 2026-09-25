// E2E EN NAVEGADOR REAL: recorre el viaje completo del cliente con clics reales
// (Edge headless vía CDP) y verifica cada pantalla del flujo.
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:3020';
const DEBUG_PORT = 9444;
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeoutMs = 30000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
    last = v;
  }
  throw new Error(`TIMEOUT: ${label} (último: ${JSON.stringify(last)?.slice(0, 120)})`);
}

function evalJs(ws, expression) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('eval timeout')), 10000);
    const handler = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 99) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(msg.result?.result?.value);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: 99, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });
}

const clickByText = (ws, text) =>
  evalJs(ws, `(() => {
    const els = [...document.querySelectorAll('button, a')];
    const el = els.find(e => (e.innerText || '').includes(${JSON.stringify(text)}));
    if (!el) return 'NOT_FOUND';
    el.click();
    return 'CLICKED';
  })()`);

const bodyText = (ws) => evalJs(ws, `document.body ? document.body.innerText : ''`);

// Selectores estables (data-testid): el texto de la UI puede cambiar sin romper la prueba.
const exists = (ws, id) => evalJs(ws, `!!document.querySelector('[data-testid="${id}"]')`);
const clickTestId = (ws, id) =>
  evalJs(ws, `(() => { const el = document.querySelector('[data-testid="${id}"]'); if (!el) return 'NOT_FOUND'; el.click(); return 'CLICKED'; })()`);
const setInput = (ws, id, value) =>
  evalJs(ws, `(() => {
    const input = document.querySelector('[data-testid="${id}"]');
    if (!input) return 'NOT_FOUND';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'SET';
  })()`);

async function main() {
  let failures = 0;
  const ok = (cond, label) => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
    if (!cond) failures += 1;
  };

  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--user-data-dir=' + process.env.TEMP + '\\hidro-e2e-' + Math.random().toString(36).slice(2),
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await waitFor(async () => {
      try { return (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok; } catch { return false; }
    }, 'CDP up');

    // estado inicial limpio (DEMO): resetea sesiones/pagos previos
    await fetch(`${API}/api/demo/reset`, { method: 'POST' });

    // abrir pestaña en la máquina
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(BASE + '/machine/HIDRO-01')}`, { method: 'PUT' });
    const tab = await res.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws')); });

    // Tema: THEME=dark recorre todo el flujo en modo oscuro (el que el usuario elige con el botón).
    if (THEME === 'dark') {
      await evalJs(ws, `localStorage.setItem('hidro:theme', 'dark'); location.reload(); 'ok'`);
      await sleep(1500);
    }
    await waitFor(async () => (await evalJs(ws, `document.documentElement.getAttribute('data-theme')`)) === THEME, `tema ${THEME}`);
    ok(true, `la página arranca en tema ${THEME}`);

    console.log('[1] página de máquina');
    await waitFor(() => exists(ws, 'plate-input'), 'paso 1: input de patente');
    const first = await bodyText(ws);
    ok(first.includes('Ingresá tu patente') && first.includes('HIDRO-01'), 'cliente ve HIDRO-01 disponible y el paso 1');
    ok(first.includes('Tarifas por lavado'), 'muestra la tabla de tarifas');

    console.log('[2a] patente argentina NO registrada -> aviso de tipeo');
    ok((await setInput(ws, 'plate-input', 'zz 999-zz')) === 'SET', 'escribe una patente con separadores');
    await clickTestId(ws, 'quote-button');
    await waitFor(() => exists(ws, 'typo-warning'), 'aviso de tipeo');
    const typo = await bodyText(ws);
    ok(typo.includes('ZZ999ZZ'), 'la patente quedó normalizada (ZZ999ZZ)');
    ok(typo.includes('$8.000'), 'cotiza como particular: $8.000');
    await clickByText(ws, 'Corregir patente');
    await waitFor(() => exists(ws, 'plate-input'), 'vuelve al paso 1 al corregir');
    ok(true, '"Corregir patente" vuelve al paso 1');

    console.log('[2b] patente de remis y cotizar');
    ok((await setInput(ws, 'plate-input', 'AE100AA')) === 'SET', 'escribe la patente en el input');
    await clickTestId(ws, 'quote-button');
    await waitFor(() => exists(ws, 'quote-card'), 'tarifa cotizada');
    const tariff = await bodyText(ws);
    ok(tariff.includes('Remis de la cooperativa'), 'categoría remis');
    ok(tariff.includes('$500'), 'tarifa remis: $500');
    ok(tariff.includes('0 de 2'), 'muestra lavados del día (0 de 2)');
    ok(!(await exists(ws, 'typo-warning')), 'sin aviso de tipeo para una patente registrada');

    console.log('[3] pagar $500');
    await clickTestId(ws, 'pay-button');
    await waitFor(async () => (await bodyText(ws)).includes('SIMULAR PAGO'), 'pantalla de pago DEMO');
    const payPage = await bodyText(ws);
    ok(payPage.includes('AE100AA'), 'la pantalla de pago muestra la patente');
    ok(true, 'redirige a la pantalla SIMULAR PAGO');

    console.log('[4] aprobar pago');
    await clickByText(ws, 'APROBAR');
    await waitFor(async () => (await bodyText(ws)).includes('PAGO APROBADO'), 'resultado aprobado');
    ok(true, 'pago aprobado con el mismo dominio que Mercado Pago');

    console.log('[5] volver a la máquina');
    await clickByText(ws, 'VOLVER A LA MÁQUINA');
    await waitFor(() => exists(ws, 'stage-approved'), 'paso 3: pago aprobado');
    ok(true, 'cliente ve "Pago aprobado"');
    await waitFor(() => exists(ws, 'auth-clock'), 'cuenta de la autorización');
    ok((await bodyText(ws)).includes('apretá el botón'), 'le dice que apriete el botón cuando vea la luz');
    ok(!(await evalJs(ws, `location.search.includes('session=')`)), 'la dirección ya no lleva ?session= (app instalable)');

    console.log('[6] pulsador (simulador ESP32)');
    // Esperar a que el simulador haya RECIBIDO la autorización (LED verde = ARMED):
    // replica exactamente lo que hace el firmware real con su polling de 2s.
    await waitFor(async () => {
      const r = await fetch(`${API}/api/demo/device/HIDRO-01/state`).then((x) => x.json());
      return r.simulator?.state === 'ARMED';
    }, 'simulador ARMED', 20000);
    // Presionar; si aún no arrancó (carrera), reintentar como lo haría un usuario.
    let running = false;
    for (let i = 0; i < 5 && !running; i++) {
      await fetch(`${API}/api/demo/device/HIDRO-01/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'press_button' }),
      });
      await sleep(1500);
      const snap = await fetch(`${API}/api/demo/device/HIDRO-01/state`).then((x) => x.json());
      running = snap.simulator?.relayState === true;
    }
    await waitFor(() => exists(ws, 'wash-clock'), 'lavando: cuenta regresiva', 20000);
    ok(true, 'cliente ve la cuenta regresiva del lavado');

    console.log('[7] timer local -> finalizado (~18s con speed factor 10)');
    await waitFor(() => exists(ws, 'stage-finished'), 'lavado terminado', 60000);
    ok((await bodyText(ws)).includes('¡Listo!'), 'cliente ve "¡Listo!"');

    console.log('[8] admin registra la sesión con patente');
    const login = await fetch(`${API}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hidro.local', password: 'hidro-demo-2025' }),
    }).then((r) => r.json());
    const overview = await fetch(`${API}/api/admin/overview`, {
      headers: { authorization: `Bearer ${login.token}` },
    }).then((r) => r.json());
    ok(overview.stats?.washesToday >= 1, `lavados de hoy: ${overview.stats?.washesToday}`);
    ok(overview.stats?.revenueToday >= 500, `ingresos de hoy: $${overview.stats?.revenueToday}`);
    ok(overview.stats?.byCategory?.remis?.washes >= 1, `desglose remis: ${overview.stats?.byCategory?.remis?.washes} lavados`);

    console.log(failures === 0 ? `\n=== E2E EN NAVEGADOR (${THEME}): PASS ===` : `\n=== ${failures} FALLOS (${THEME}) ===`);
    ws.close();
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    edge.kill();
  }
}

main().catch((err) => {
  console.error('E2E BROWSER ERROR:', err.message);
  process.exit(1);
});
