// Gallery for Epic Puzzle Board. The SVGs live in apps/web/public/puzzles and
// are authored in-repo (no downloads), so `src` is a site-relative URL.

export type PuzzleCategory = 'Paintings' | 'Cartoons' | 'Creatures';

export interface PuzzleImage {
  id: string;
  title: string;
  category: PuzzleCategory;
  /** Site-relative URL of the 1200×800 SVG. */
  src: string;
  /** Three dominant colours, used for picker accents and piece backs. */
  palette: [string, string, string];
  alt: string;
}

export type PuzzleSizeId = 'easy' | 'medium' | 'hard' | 'expert';

export interface PuzzleSize {
  id: PuzzleSizeId;
  cols: number;
  rows: number;
}

/** All artwork is 3:2, so the grids keep pieces close to square. */
export const PUZZLE_SIZES: readonly PuzzleSize[] = [
  { id: 'easy', cols: 4, rows: 3 },
  { id: 'medium', cols: 6, rows: 4 },
  { id: 'hard', cols: 8, rows: 6 },
  { id: 'expert', cols: 10, rows: 8 },
];

export const PUZZLE_IMAGE_WIDTH = 1200;
export const PUZZLE_IMAGE_HEIGHT = 800;

const img = (id: string, title: string, category: PuzzleCategory, palette: [string, string, string], alt: string): PuzzleImage => ({
  id,
  title,
  category,
  src: `/puzzles/${id}.svg`,
  palette,
  alt,
});

export const PUZZLE_IMAGES: readonly PuzzleImage[] = [
  // Paintings
  img('mountain-sunset', 'Sunset Over the Peaks', 'Paintings', ['#f97316', '#7c3aed', '#fde68a'], 'Impressionist sunset behind snow-capped mountains mirrored in a still lake'),
  img('lavender-fields', 'Lavender Fields', 'Paintings', ['#8b5cf6', '#f59e0b', '#86efac'], 'Rows of lavender leading to a stone farmhouse under a warm afternoon sky'),
  img('starry-village', 'Swirling Night', 'Paintings', ['#1e3a8a', '#facc15', '#60a5fa'], 'A swirling starry night sky with a crescent moon over a sleepy village'),
  img('dawn-waves', 'Waves at Dawn', 'Paintings', ['#0ea5e9', '#fb7185', '#fef3c7'], 'Rolling ocean waves with white crests under a pastel sunrise'),
  img('blossom-river', 'Cherry Blossom River', 'Paintings', ['#f9a8d4', '#38bdf8', '#be123c'], 'A river winding under blooming cherry trees with a small red bridge'),
  img('autumn-path', 'Autumn Forest Path', 'Paintings', ['#ea580c', '#b45309', '#fde047'], 'A leaf-covered path through a forest of red and gold autumn trees'),
  img('desert-dunes', 'Desert Dunes', 'Paintings', ['#f59e0b', '#c2410c', '#7dd3fc'], 'Sweeping sunlit sand dunes with a distant camel caravan'),
  img('northern-lights', 'Northern Lights', 'Paintings', ['#22c55e', '#a855f7', '#0f172a'], 'Green and purple aurora curtains above a snowy lake and a glowing cabin'),
  // Cartoons
  img('robot-workshop', 'Robot Workshop', 'Cartoons', ['#38bdf8', '#f97316', '#64748b'], 'A friendly blue robot holding a wrench in a cluttered workshop'),
  img('cat-astronaut', 'Cat Astronaut', 'Cartoons', ['#1e1b4b', '#f472b6', '#fbbf24'], 'An orange tabby cat in a spacesuit floating among planets and stars'),
  img('dino-party', 'Dino Birthday Party', 'Cartoons', ['#22c55e', '#f43f5e', '#fde047'], 'Cartoon dinosaurs in party hats celebrating around a birthday cake'),
  img('pirate-ship', 'Pirate Ship', 'Cartoons', ['#0369a1', '#78350f', '#f8fafc'], 'A jolly pirate ship with striped sails riding bouncy blue waves'),
  img('balloon-festival', 'Balloon Festival', 'Cartoons', ['#f43f5e', '#facc15', '#60a5fa'], 'Dozens of colourful hot-air balloons floating over a patchwork valley'),
  img('coral-reef', 'Coral Reef', 'Cartoons', ['#0891b2', '#fb923c', '#f472b6'], 'A bright underwater reef with clownfish, a turtle and an octopus'),
  img('rocket-moon', 'Rocket to the Moon', 'Cartoons', ['#312e81', '#ef4444', '#e2e8f0'], 'A red retro rocket blasting off toward a big cratered moon'),
  img('cozy-treehouse', 'Cozy Treehouse', 'Cartoons', ['#16a34a', '#92400e', '#fbbf24'], 'A wooden treehouse with fairy lights in a big oak at golden hour'),
  // Creatures
  img('fire-dragon', 'Fire Dragon', 'Creatures', ['#dc2626', '#f59e0b', '#1c1917'], 'A red dragon on a cliff breathing fire into a stormy dusk sky'),
  img('phoenix-rising', 'Phoenix Rising', 'Creatures', ['#f97316', '#fde047', '#7f1d1d'], 'A golden phoenix with spread wings rising from swirling flames'),
  img('unicorn-glade', 'Unicorn Glade', 'Creatures', ['#c084fc', '#f9a8d4', '#4ade80'], 'A white unicorn with a rainbow mane in a sunlit forest glade'),
  img('kraken-lighthouse', 'Kraken and the Lighthouse', 'Creatures', ['#0f766e', '#1e293b', '#fbbf24'], 'A giant kraken rising from a stormy sea beside a striped lighthouse'),
  img('griffin-canyon', 'Griffin Over the Canyon', 'Creatures', ['#b45309', '#fcd34d', '#7dd3fc'], 'A griffin soaring with outstretched wings over a red-rock canyon'),
  img('forest-owl', 'Forest Spirit', 'Creatures', ['#065f46', '#a3e635', '#fef9c3'], 'A great horned owl with glowing eyes on a mossy branch in a misty forest'),
];

export const PUZZLE_CATEGORIES: readonly PuzzleCategory[] = ['Paintings', 'Cartoons', 'Creatures'];

const IMAGE_BY_ID = new Map(PUZZLE_IMAGES.map((i) => [i.id, i]));
const SIZE_BY_ID = new Map(PUZZLE_SIZES.map((s) => [s.id, s]));

export function getPuzzleImage(id: string): PuzzleImage | undefined {
  return IMAGE_BY_ID.get(id);
}

export function getPuzzleSize(id: string): PuzzleSize | undefined {
  return SIZE_BY_ID.get(id as PuzzleSizeId);
}
