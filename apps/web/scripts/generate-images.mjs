// Renders the social preview image and PWA icon from SVG. Run after changing
// branding: `node apps/web/scripts/generate-images.mjs`. Outputs are committed.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="bg" cx="50%" cy="0%" r="90%"><stop offset="0" stop-color="#3b1d7a"/><stop offset="1" stop-color="#07071a"/></radialGradient>
    <linearGradient id="t" x1="0" x2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="0.5" stop-color="#f0abfc"/><stop offset="1" stop-color="#fde68a"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g opacity="0.9">
    <rect x="860" y="120" width="220" height="220" rx="44" fill="#fff"/>
    <g fill="#1e1b4b"><circle cx="915" cy="175" r="22"/><circle cx="1025" cy="175" r="22"/><circle cx="970" cy="230" r="22"/><circle cx="915" cy="285" r="22"/><circle cx="1025" cy="285" r="22"/></g>
    <circle cx="930" cy="470" r="56" fill="#f43f5e"/><circle cx="1050" cy="470" r="56" fill="#facc15"/>
    <path d="M800 570 C 850 480, 740 430, 800 350 S 850 270, 815 205" stroke="#22c55e" stroke-width="26" fill="none" stroke-linecap="round"/>
    <circle cx="815" cy="200" r="24" fill="#16a34a"/>
  </g>
  <text x="80" y="270" font-family="Arial Rounded MT Bold, Arial, sans-serif" font-size="92" font-weight="700" fill="url(#t)">Epic Board</text>
  <text x="80" y="370" font-family="Arial Rounded MT Bold, Arial, sans-serif" font-size="92" font-weight="700" fill="url(#t)">Games</text>
  <text x="84" y="450" font-family="Arial, sans-serif" font-size="34" fill="#cbd5e1">Free multiplayer board games in your browser</text>
  <text x="84" y="510" font-family="Arial, sans-serif" font-size="28" fill="#a78bfa">Snakes &amp; Ladders · Connect 4 · Chess · Sudoku</text>
</svg>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#d946ef"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><g fill="#fff"><circle cx="20" cy="20" r="5"/><circle cx="44" cy="20" r="5"/><circle cx="32" cy="32" r="5"/><circle cx="20" cy="44" r="5"/><circle cx="44" cy="44" r="5"/></g></svg>`;

await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toFile(out('og-image.png'));
await sharp(Buffer.from(icon)).png({ compressionLevel: 9 }).toFile(out('icon-512.png'));
console.log('wrote og-image.png and icon-512.png');
