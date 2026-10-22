// Renders a 1200×630 PNG hero for every blog post from an SVG template
// (brand gradient + title + game emoji tile). Outputs are committed static assets.
//
//   node apps/web/scripts/generate-blog-images.mjs            # all posts
//   node apps/web/scripts/generate-blog-images.mjs --force    # re-render even if up to date
//
// Emoji render via the system emoji font as monochrome glyphs (librsvg has no
// colour-font support), so they are drawn white on a game-coloured tile.
import sharp from 'sharp';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../../../packages/game-core/src/catalog.ts';

const root = (p) => fileURLToPath(new URL(p, import.meta.url));
const contentDir = root('../src/content/blog/');
const outDir = root('../public/blog/heroes/');
const force = process.argv.includes('--force');

// Tailwind colour names used by the catalog gradients → hex.
const TW = {
  'emerald-500': '#10b981', 'lime-400': '#a3e635', 'amber-500': '#f59e0b', 'orange-500': '#f97316', 'orange-400': '#fb923c',
  'fuchsia-500': '#d946ef', 'purple-500': '#a855f7', 'sky-500': '#0ea5e9', 'indigo-500': '#6366f1', 'red-500': '#ef4444',
  'red-600': '#dc2626', 'yellow-400': '#facc15', 'yellow-500': '#eab308', 'cyan-500': '#06b6d4', 'blue-500': '#3b82f6',
  'teal-500': '#14b8a6', 'slate-600': '#475569', 'slate-400': '#94a3b8', 'rose-600': '#e11d48', 'stone-700': '#44403c',
  'green-500': '#22c55e',
};
const gradientStops = (classes) => {
  const from = classes.match(/from-([a-z]+-\d+)/)?.[1];
  const to = classes.match(/to-([a-z]+-\d+)/)?.[1];
  return [TW[from] ?? '#8b5cf6', TW[to] ?? '#d946ef'];
};

/** Minimal frontmatter reader for the fields the template needs. */
function frontmatter(md) {
  const block = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const get = (key) => {
    const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (!m) return undefined;
    return m[1].trim().replace(/^(["'])(.*)\1$/, '$2').replace(/\\"/g, '"');
  };
  return { title: get('title'), game: get('game'), hero: get('hero') };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word wrap; shrinks the font until the title fits in three lines. */
function layoutTitle(title) {
  for (const size of [66, 60, 54, 48, 44, 40]) {
    const maxChars = Math.floor(760 / (size * 0.5));
    const lines = [];
    let line = '';
    for (const word of title.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length <= 3) return { size, lines };
  }
  return { size: 36, lines: [title] };
}

function template({ title, game }) {
  const [c1, c2] = gradientStops(game.gradient);
  const { size, lines } = layoutTitle(title);
  const lineHeight = size * 1.12;
  const startY = 330 - ((lines.length - 1) * lineHeight) / 2;
  const kind = title.toLowerCase().startsWith('how to play') ? 'Rules guide' : 'Strategy guide';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="25%" cy="0%" r="110%"><stop offset="0" stop-color="#3b1d7a"/><stop offset="1" stop-color="#07071a"/></radialGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="brand" x1="0" x2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="0.5" stop-color="#f0abfc"/><stop offset="1" stop-color="#fde68a"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/></filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1060" cy="560" r="260" fill="${c1}" opacity="0.12"/>
  <circle cx="1120" cy="90" r="180" fill="${c2}" opacity="0.10"/>
  <g filter="url(#shadow)">
    <rect x="860" y="175" width="260" height="260" rx="56" fill="url(#tile)"/>
  </g>
  <text x="990" y="340" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Noto Emoji, sans-serif" font-size="150" fill="#ffffff">${esc(game.emoji)}</text>
  <text x="80" y="92" font-family="Arial Rounded MT Bold, Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="url(#brand)">🎲 Epic Board Games</text>
  <text x="80" y="138" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="3" fill="#a78bfa">${esc(kind.toUpperCase())}</text>
  ${lines
    .map((line, i) => `<text x="80" y="${(startY + i * lineHeight).toFixed(1)}" dominant-baseline="middle" font-family="Arial Rounded MT Bold, Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" fill="#f8fafc">${esc(line)}</text>`)
    .join('\n  ')}
  <text x="80" y="548" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#cbd5e1">${esc(game.name)} · Free in your browser</text>
  <rect x="80" y="572" width="140" height="6" rx="3" fill="url(#brand)"/>
</svg>`;
}

await mkdir(outDir, { recursive: true });
const files = (await readdir(contentDir)).filter((f) => f.endsWith('.md'));
let written = 0;
for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const md = await readFile(contentDir + file, 'utf8');
  const fm = frontmatter(md);
  const game = GAMES.find((g) => g.id === fm.game);
  if (!fm.title || !game) {
    console.warn(`skip ${file}: missing title or unknown game "${fm.game}"`);
    continue;
  }
  const out = `${outDir}${slug}.png`;
  if (!force) {
    const [src, dst] = await Promise.all([stat(contentDir + file), stat(out).catch(() => null)]);
    if (dst && dst.mtimeMs >= src.mtimeMs) continue;
  }
  await sharp(Buffer.from(template({ title: fm.title, game })), { density: 96 })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(out);
  written++;
  console.log(`wrote blog/heroes/${slug}.png`);
}
console.log(`${written} hero image(s) rendered, ${files.length - written} up to date`);
