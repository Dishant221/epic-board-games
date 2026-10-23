// Mahjong Solitaire tile set and layouts. Positions are in half-tile units: a
// tile covers 2×2 units and `z` is the layer, so half-offset tiles (e.g. the
// Turtle's side and crown tiles) use odd coordinates.

export interface MahjongPos {
  x: number;
  y: number;
  z: number;
}

export interface MahjongLayout {
  id: string;
  /** Used in the summary line: "Cleared the Turtle in 7:45". */
  name: string;
  blurb: string;
  positions: MahjongPos[];
}

/** The 34 regular kinds (4 copies each) + 4 unique seasons + 4 unique flowers = 144 tiles. */
export const MAHJONG_REGULAR_KINDS: readonly string[] = [
  ...['c', 'b', 'd'].flatMap((suit) => Array.from({ length: 9 }, (_, i) => `${suit}${i + 1}`)),
  'wE', 'wS', 'wW', 'wN',
  'dR', 'dG', 'dW',
];
export const MAHJONG_SEASONS: readonly string[] = ['s1', 's2', 's3', 's4'];
export const MAHJONG_FLOWERS: readonly string[] = ['f1', 'f2', 'f3', 'f4'];

/** Parse rows of 'X' / '.' (one char per tile column) into positions on layer `z`. */
function rows(z: number, lines: string[], originY = 0): MahjongPos[] {
  const out: MahjongPos[] = [];
  lines.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) if (line[col] === 'X') out.push({ x: col * 2, y: (originY + row) * 2, z });
  });
  return out;
}

// Classic Turtle: 87 + 36 + 16 + 4 + 1 = 144.
const TURTLE: MahjongPos[] = [
  ...rows(0, [
    '.XXXXXXXXXXXX..',
    '...XXXXXXXX....',
    '..XXXXXXXXXX...',
    '.XXXXXXXXXXXX..',
    '.XXXXXXXXXXXX..',
    '..XXXXXXXXXX...',
    '...XXXXXXXX....',
    '.XXXXXXXXXXXX..',
  ]),
  // Side tiles sit between rows 3 and 4 (half offset).
  { x: 0, y: 7, z: 0 },
  { x: 26, y: 7, z: 0 },
  { x: 28, y: 7, z: 0 },
  ...rows(1, ['....XXXXXX.....', '....XXXXXX.....', '....XXXXXX.....', '....XXXXXX.....', '....XXXXXX.....', '....XXXXXX.....'], 1),
  ...rows(2, ['.....XXXX......', '.....XXXX......', '.....XXXX......', '.....XXXX......'], 2),
  ...rows(3, ['......XX.......', '......XX.......'], 3),
  // Crown tile straddles the four tiles beneath it.
  { x: 13, y: 7, z: 4 },
];

// Stepped Pyramid: 84 + 40 + 12 + 8 = 144.
const PYRAMID: MahjongPos[] = [
  ...rows(0, Array<string>(6).fill('XXXXXXXXXXXXXX')),
  ...rows(1, Array<string>(4).fill('..XXXXXXXXXX..'), 1),
  ...rows(2, Array<string>(2).fill('....XXXXXX....'), 2),
  ...rows(3, Array<string>(2).fill('.....XXXX.....'), 2),
];

// Butterfly: two wings around a thin body. 96 + 44 + 4 = 144.
const BUTTERFLY: MahjongPos[] = [
  ...rows(0, [
    'XXXXX....XXXXX',
    'XXXXXX..XXXXXX',
    'XXXXXX..XXXXXX',
    'XXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXX',
    'XXXXXX..XXXXXX',
    'XXXXXX..XXXXXX',
    'XXXXX....XXXXX',
  ]),
  ...rows(1, [
    '.XXX......XXX.',
    '.XXXX....XXXX.',
    '.XXXX....XXXX.',
    '.XXXX....XXXX.',
    '.XXXX....XXXX.',
    '.XXX......XXX.',
  ], 1),
  ...rows(2, ['..X........X..', '..X........X..'], 3),
];

export const MAHJONG_LAYOUTS: readonly MahjongLayout[] = [
  { id: 'turtle', name: 'Turtle', blurb: 'The classic five-layer shell.', positions: TURTLE },
  { id: 'pyramid', name: 'Pyramid', blurb: 'Wide steps rising to a flat top.', positions: PYRAMID },
  { id: 'butterfly', name: 'Butterfly', blurb: 'Two stacked wings around a slender body.', positions: BUTTERFLY },
];
