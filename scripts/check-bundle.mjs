// Falla si el build de producción de apps/web publica credenciales o patentes demo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'apps', 'web', 'dist');
const FORBIDDEN = ['hidro-demo-2025', 'admin@hidro.local', 'Credenciales DEMO', 'AE100AA', 'AE200AA'];
// Todo lo servido cuenta (.map, .json, .css…); solo se saltean binarios.
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot)$/i;

if (!fs.existsSync(distDir)) {
  console.error(`check:bundle: no existe ${distDir}. Corré npm run build antes.`);
  process.exit(1);
}

const files = fs
  .readdirSync(distDir, { recursive: true })
  .map((f) => path.join(distDir, f))
  .filter((f) => fs.statSync(f).isFile() && !BINARY.test(f));
if (!files.some((f) => f.endsWith('.js'))) {
  console.error(`check:bundle: ${distDir} no tiene archivos .js; no hay nada que revisar.`);
  process.exit(1);
}

const hits = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const needle of FORBIDDEN) {
    if (content.includes(needle)) hits.push(`${path.relative(root, file)}: "${needle}"`);
  }
}

if (hits.length > 0) {
  console.error('check:bundle: el build de producción contiene strings demo:');
  for (const hit of hits) console.error(`  - ${hit}`);
  process.exit(1);
}

console.log(`check:bundle OK (${files.length} archivos revisados).`);
