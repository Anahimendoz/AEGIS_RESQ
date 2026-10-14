// Comprueba que participants.json es válido y que cada avatar declarado existe como PNG real.
// Uso: node scripts/verify-assets.mjs   (se ejecuta antes de `npm test`)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'src/assets/config/participants.json'), 'utf8'));
const PNG_SIGNATURE = '89504e470d0a1a0a';
const problems = [];

if (config.participants?.length !== 5) problems.push(`Se esperaban 5 participantes y hay ${config.participants?.length}.`);
for (const p of config.participants ?? []) {
  const file = join(root, 'src', p.avatar);
  if (!existsSync(file)) {
    problems.push(`Falta el avatar de ${p.alias}: ${p.avatar}`);
  } else if (readFileSync(file).subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    problems.push(`El avatar de ${p.alias} no es un PNG válido.`);
  }
}
for (const icon of ['src/assets/brand/logo.png', 'src/assets/icon/favicon.png']) {
  if (!existsSync(join(root, icon))) problems.push(`Falta ${icon}`);
}

if (problems.length) {
  console.error('verify-assets: FALLO\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`verify-assets: OK (${config.participants.length} participantes, avatares PNG presentes).`);
