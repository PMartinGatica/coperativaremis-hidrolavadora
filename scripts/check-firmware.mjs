// Chequeo estático ligero del firmware (sin toolchain): balance de llaves/paréntesis,
// y saneos básicos que no requieren compilador. NO reemplaza `pio run`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../firmware/esp32/src', import.meta.url));
const files = fs.readdirSync(SRC).filter((f) => /\.(cpp|h)$/.test(f));

let failures = 0;
const check = (cond, label) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures += 1;
};

for (const f of files) {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8');
  // Orden importante: strings ANTES que comentarios (un "//" dentro de un string
  // literal no es un comentario; p.ej. host_.replace("https://", "")).
  const strip = text
    .replace(/R"EOF\([\s\S]*?\)EOF"/g, '""')   // raw strings (PEM)
    .replace(/"(?:\\.|[^"\\])*"/g, '""')       // strings
    .replace(/'(?:\\.|[^'\\])*'/g, "''")       // chars
    .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
    .replace(/\/\/[^\n]*/g, '');               // line comments
  const open = (strip.match(/\{/g) ?? []).length;
  const close = (strip.match(/\}/g) ?? []).length;
  const parens = (strip.match(/\(/g) ?? []).length - (strip.match(/\)/g) ?? []).length;
  console.log(`\n${f}: {{ ${open} }} {{ ${close} }} parens-delta ${parens}`);
  check(open === close, 'balance de llaves');
  check(parens === 0, 'balance de paréntesis');
}

// Saneos puntuales de los bugs corregidos
const apiClient = fs.readFileSync(path.join(SRC, 'api_client.h'), 'utf8');
const mainCpp = fs.readFileSync(path.join(SRC, 'main.cpp'), 'utf8');
console.log('\nsaneos de los fixes');
check(!apiClient.includes('millis() / 1000UL'), 'api_client: sin ts de uptime');
check(apiClient.includes('time(nullptr) * 1000ULL'), 'api_client: epoch ms');
check(apiClient.includes('MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw'), 'api_client: PEM ISRG completo');
check(!apiClient.includes('certificado recortado'), 'api_client: sin relleno en el PEM');
check(apiClient.includes('host_.replace("https://", "")'), 'api_client: normaliza esquema');
check(mainCpp.includes('configTime(0, 0, "pool.ntp.org", "time.nist.gov")'), 'main: NTP en setup');
check(mainCpp.includes('hardRelayGuard()'), 'main: guarda dura del relay');
check(mainCpp.includes('watchdog_max_runtime'), 'main: reporta watchdog_max_runtime');
check(mainCpp.includes('deadlineEpochMs'), 'main: deadline en epoch');
check(mainCpp.includes('doc["data"].to<JsonObject>()'), 'main: eventos con data como objeto');
check(!mainCpp.includes('button.begin(BUTTON_PIN, onButtonPressed)'), 'main: begin() sin callback');

console.log(failures === 0 ? '\nFIRMWARE STATIC: OK (requiere pio run en máquina con PlatformIO)' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
