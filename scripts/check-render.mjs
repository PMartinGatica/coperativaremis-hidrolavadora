// Verificación de render REAL: abre páginas en Edge headless vía CDP (WebSocket)
// y lee document.body.innerText. No depende de capturar stdout del navegador.
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:5173';
const DEBUG_PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await sleep(300);
  }
  throw new Error('timeout: ' + label);
}

async function main() {
  const edge = spawn(
    EDGE,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
     `--remote-debugging-port=${DEBUG_PORT}`,
     '--user-data-dir=' + process.env.TEMP + '\\hidro-cdp-' + Math.random().toString(36).slice(2),
     'about:blank'],
    { stdio: 'ignore' },
  );

  try {
    await waitFor(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        return r.ok;
      } catch {
        return false;
      }
    }, 'CDP up');

    async function innerTextOf(url, waitMs = 9000) {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
      const tab = await res.json();
      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('ws error'));
      });
      await sleep(waitMs);
      const text = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve('(timeout)'), 8000);
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.id === 1) {
            clearTimeout(timer);
            resolve(msg.result?.result?.value ?? '(sin resultado)');
          }
        };
        ws.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression: 'document.body ? document.body.innerText : "(no body)"', returnByValue: true },
        }));
      });
      ws.close();
      return String(text);
    }

    const checks = [
      ['/machine/HIDRO-01', 'página cliente', ['MÁQUINA DISPONIBLE', 'HIDRO-01', 'VER MI TARIFA', 'Hidrolavadora 10 HP', 'DURACIÓN', 'TARIFAS', 'PATENTE'], 20000],
      ['/demo/device', 'demo device', ['ESP32 SIMULADOR', 'HIDRO-01', 'PRESIONAR PULSADOR', 'SIMULAR REBOOT', 'SIMULAR CORTE DE INTERNET', 'RELAY', 'Speed factor'], 9000],
      ['/admin/login', 'admin login', ['HIDRO', 'INGRESAR', 'admin@hidro.local'], 7000],
      ['/dev-autologin.html', 'admin dashboard (autologin)', ['Dashboard', 'MÁQUINAS ONLINE', 'LAVADOS DE HOY', 'INGRESOS DE HOY', 'HIDRO-01', 'RELAY', 'Hidrolavadora 10 HP', 'REMIS'], 15000],
    ];

    let failures = 0;
    for (const [path, label, needles, waitMs] of checks) {
      console.log(`\n=== ${label} (${path}) ===`);
      let text;
      try {
        text = await innerTextOf(BASE + path, waitMs);
      } catch (err) {
        console.log('  ✗ error:', String(err).slice(0, 160));
        failures += 1;
        continue;
      }
      console.log(`  texto: ${text.length} chars`);
      for (const needle of needles) {
        const found = text.includes(needle);
        if (!found) failures += 1;
        console.log(`  ${found ? '✓' : '✗'} ${needle}`);
      }
      if (failures > 0 && label.includes('dashboard')) console.log('  --- texto completo ---\n' + text);
    }
    console.log(failures === 0 ? '\nRENDER OK' : `\n${failures} FALLOS`);
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    edge.kill();
  }
}

main().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
