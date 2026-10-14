// Genera los recursos gráficos de Aegis ResQ:
//   - Logotipo oficial: resources/brand/logo.png (texto oscuro) y logo-white.png (texto blanco),
//     proporcionados por el equipo. De ellos se derivan el icono Android, el favicon y el splash.
//   - Avatares: SVG paramétricos originales en resources/avatars/*.svg
//   - src/assets/brand/*           logotipo para la interfaz
//   - src/assets/avatars/*.png     cinco avatares demostrativos
//   - src/assets/icon/favicon.png
//   - android/app/src/main/res/... iconos (legado + adaptable) y splash, si existe la carpeta android
//
// Uso: node scripts/generate-graphics.mjs
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const palette = {
  navy: '#0B2545',
  deepBlue: '#13315C',
  turquoise: '#1FC7C1',
  green: '#3DDC97',
  mint: '#E8F6F3',
};

// ---------- Logotipo (a partir del PNG oficial) ----------

const BRAND_BACKGROUND = '#2B1838';
/** Filas del PNG oficial (2480×2000) que contienen solo el símbolo, sin el texto «AEGIS RESQ». */
const SYMBOL_ROWS = { top: 100, bottom: 1420 };

async function symbolWhite(brandDir) {
  const source = join(brandDir, 'logo-white.png');
  const { width } = await sharp(source).metadata();
  const cropped = await sharp(source)
    .extract({ left: 0, top: SYMBOL_ROWS.top, width, height: SYMBOL_ROWS.bottom - SYMBOL_ROWS.top })
    .png()
    .toBuffer();
  return sharp(cropped).trim().png().toBuffer();
}

/** Coloca `image` centrado en un lienzo cuadrado de `size` px ocupando `fraction` del lado. */
async function centered(image, size, fraction, background) {
  const inner = Math.round(size * fraction);
  const resized = await sharp(image).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

function roundedMask(size, radius) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
}

async function launcherIcon(symbol, size, round) {
  const square = await centered(symbol, size, 0.72, BRAND_BACKGROUND);
  return sharp(square)
    .composite([{ input: roundedMask(size, round ? size / 2 : size * 0.22), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// ---------- Avatares ----------

const avatars = [
  { file: 'nova', skin: '#3FD8C9', shade: '#1FA89C', bg: '#13315C', eyes: 2, antenna: 'star', gear: 'none' },
  { file: 'orion', skin: '#5BA8F5', shade: '#2F78C4', bg: '#0B2545', eyes: 3, antenna: 'double', gear: 'chest' },
  { file: 'lyra', skin: '#6FE3A4', shade: '#38B377', bg: '#123A4A', eyes: 2, antenna: 'none', gear: 'visor' },
  { file: 'cosmo', skin: '#B28CF2', shade: '#7F5BC4', bg: '#1A2A5C', eyes: 1, antenna: 'single', gear: 'helmet' },
  { file: 'vega', skin: '#F2B66D', shade: '#C98834', bg: '#0F3B3A', eyes: 2, antenna: 'double', gear: 'headset' },
];

function antennaSvg(kind, color) {
  const tip = (x, y) => `<circle cx="${x}" cy="${y}" r="13" fill="${palette.green}" stroke="${palette.navy}" stroke-width="5"/>`;
  const stalk = (x1, x2, y2) => `<path d="M${x1} 150 Q${(x1 + x2) / 2} 110 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/>`;
  switch (kind) {
    case 'single':
      return stalk(256, 256, 70) + tip(256, 64);
    case 'double':
      return stalk(215, 180, 78) + tip(178, 72) + stalk(297, 332, 78) + tip(334, 72);
    case 'star':
      return stalk(256, 268, 76) +
        `<path d="M270 40 l9 20 22 3 -16 15 4 22 -19 -11 -19 11 4 -22 -16 -15 22 -3 z" fill="${palette.green}" stroke="${palette.navy}" stroke-width="4" stroke-linejoin="round"/>`;
    default:
      return '';
  }
}

function eyesSvg(count) {
  const eye = (x, r) => `
    <ellipse cx="${x}" cy="250" rx="${r}" ry="${r * 1.15}" fill="#FFFFFF" stroke="${palette.navy}" stroke-width="5"/>
    <circle cx="${x + r * 0.15}" cy="${250 + r * 0.1}" r="${r * 0.55}" fill="${palette.navy}"/>
    <circle cx="${x + r * 0.35}" cy="${250 - r * 0.2}" r="${r * 0.18}" fill="#FFFFFF"/>`;
  if (count === 1) return eye(256, 46);
  if (count === 3) return eye(196, 28) + eye(256, 32) + eye(316, 28);
  return eye(212, 34) + eye(300, 34);
}

function gearSvg(kind) {
  switch (kind) {
    case 'visor':
      return `<rect x="160" y="218" width="192" height="66" rx="33" fill="${palette.turquoise}" opacity="0.35" stroke="${palette.mint}" stroke-width="6"/>`;
    case 'helmet':
      return `<circle cx="256" cy="262" r="168" fill="${palette.mint}" opacity="0.18" stroke="${palette.mint}" stroke-width="7"/>
              <path d="M150 190 A120 120 0 0 1 220 130" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" opacity="0.7"/>`;
    case 'headset':
      return `<path d="M140 250 A116 116 0 0 1 372 250" fill="none" stroke="${palette.navy}" stroke-width="12"/>
              <rect x="122" y="236" width="34" height="64" rx="14" fill="${palette.turquoise}" stroke="${palette.navy}" stroke-width="5"/>
              <rect x="356" y="236" width="34" height="64" rx="14" fill="${palette.turquoise}" stroke="${palette.navy}" stroke-width="5"/>
              <path d="M150 296 Q170 352 228 350" fill="none" stroke="${palette.navy}" stroke-width="7" stroke-linecap="round"/>
              <circle cx="232" cy="350" r="9" fill="${palette.green}" stroke="${palette.navy}" stroke-width="4"/>`;
    default:
      return '';
  }
}

function avatarSvg(a) {
  const chest = a.gear === 'chest'
    ? `<circle cx="256" cy="452" r="20" fill="${palette.green}" stroke="${palette.navy}" stroke-width="5"/>
       <path d="M244 452 h24 M256 440 v24" stroke="${palette.navy}" stroke-width="5" stroke-linecap="round"/>`
    : `<path d="M226 446 l30 -16 30 16" fill="none" stroke="${palette.green}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><clipPath id="c"><circle cx="256" cy="256" r="256"/></clipPath></defs>
    <g clip-path="url(#c)">
      <rect width="512" height="512" fill="${a.bg}"/>
      <g fill="${palette.mint}" opacity="0.5">
        <circle cx="70" cy="90" r="4"/><circle cx="440" cy="70" r="3"/><circle cx="460" cy="200" r="4"/>
        <circle cx="50" cy="260" r="3"/><circle cx="400" cy="140" r="2.5"/><circle cx="110" cy="170" r="2.5"/>
      </g>
      <path d="M96 512 C110 420 180 388 256 388 C332 388 402 420 416 512 Z" fill="${palette.deepBlue}" stroke="${palette.turquoise}" stroke-width="7"/>
      ${chest}
      ${antennaSvg(a.antenna, a.shade)}
      <ellipse cx="256" cy="262" rx="132" ry="124" fill="${a.skin}" stroke="${palette.navy}" stroke-width="7"/>
      <ellipse cx="226" cy="190" rx="52" ry="24" fill="#FFFFFF" opacity="0.22"/>
      <circle cx="176" cy="312" r="16" fill="${a.shade}" opacity="0.55"/>
      <circle cx="336" cy="312" r="16" fill="${a.shade}" opacity="0.55"/>
      ${eyesSvg(a.eyes)}
      <path d="M222 322 Q256 352 290 322" fill="none" stroke="${palette.navy}" stroke-width="8" stroke-linecap="round"/>
      ${gearSvg(a.gear)}
    </g></svg>`;
}

// ---------- Escritura de archivos ----------

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

async function png(svg, out, width, height = width) {
  ensureDir(dirname(out));
  await sharp(Buffer.from(svg), { density: 300 }).resize(width, height).png().toFile(out);
}

async function main() {
  const resources = join(root, 'resources');
  const assets = join(root, 'src', 'assets');
  ensureDir(resources);

  const brandDir = join(resources, 'brand');
  const symbol = await symbolWhite(brandDir);
  ensureDir(join(assets, 'brand'));
  ensureDir(join(assets, 'icon'));
  await sharp(join(brandDir, 'logo.png')).resize(620).png().toFile(join(assets, 'brand', 'logo.png'));
  await sharp(join(brandDir, 'logo-white.png')).resize(620).png().toFile(join(assets, 'brand', 'logo-white.png'));
  writeFileSync(join(assets, 'brand', 'icon.png'), await launcherIcon(symbol, 256, false));
  writeFileSync(join(assets, 'icon', 'favicon.png'), await launcherIcon(symbol, 64, false));

  ensureDir(join(resources, 'avatars'));
  for (const a of avatars) {
    const svg = avatarSvg(a);
    writeFileSync(join(resources, 'avatars', `${a.file}.svg`), svg);
    await png(svg, join(assets, 'avatars', `${a.file}.png`), 256);
  }

  const res = join(root, 'android', 'app', 'src', 'main', 'res');
  if (!existsSync(res)) {
    console.log('Carpeta android no encontrada: se omiten los iconos nativos.');
    return;
  }
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, scale] of Object.entries(densities)) {
    const dir = join(res, `mipmap-${name}`);
    ensureDir(dir);
    writeFileSync(join(dir, 'ic_launcher.png'), await launcherIcon(symbol, 48 * scale, false));
    writeFileSync(join(dir, 'ic_launcher_round.png'), await launcherIcon(symbol, 48 * scale, true));
    // Icono adaptable: el símbolo cabe en la zona segura (66 dp de 108 dp).
    writeFileSync(
      join(dir, 'ic_launcher_foreground.png'),
      await centered(symbol, 108 * scale, 0.5, { r: 0, g: 0, b: 0, alpha: 0 }),
    );
  }
  writeFileSync(
    join(res, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BRAND_BACKGROUND}</color>
</resources>
`,
  );

  // Reemplaza cada splash.png existente conservando sus dimensiones.
  for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
    const file = join(res, dir, 'splash.png');
    if (!existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const logo = await sharp(join(brandDir, 'logo-white.png'))
      .resize(Math.round(Math.min(width, height) * 0.6))
      .toBuffer();
    const buffer = await sharp({ create: { width, height, channels: 4, background: BRAND_BACKGROUND } })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toBuffer();
    writeFileSync(file, buffer);
  }
  console.log('Iconos Android y splash generados.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
