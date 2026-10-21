// Single source of truth for the game catalog. Used by the landing page,
// SEO metadata, the matchmaker (player limits) and the mode selector.

export type GameId =
  | 'snakes_ladders'
  | 'epic_business'
  | 'epic_puzzle'
  | 'crossword'
  | 'connect4'
  | 'tic_tac_toe'
  | 'sudoku'
  | 'flappy_bird'
  | 'chess'
  | 'checkers'
  | 'mahjong'
  | 'word_puzzle';

export type AISupport = 'opponent' | 'hints' | 'none';
export type GameStatus = 'playable' | 'coming_soon';

export interface GameInfo {
  id: GameId;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
  category: 'Board' | 'Strategy' | 'Puzzle' | 'Word' | 'Arcade';
  minPlayers: number;
  maxPlayers: number;
  ai: AISupport;
  multiplayer: boolean;
  status: GameStatus;
  /** Tailwind gradient classes for the game card. */
  gradient: string;
  rules: string[];
}

export const GAMES: readonly GameInfo[] = [
  {
    id: 'snakes_ladders',
    slug: 'snakes-and-ladders',
    name: 'Snakes, Dragons & Ladders',
    tagline: 'Climb ladders, dodge snakes and outrun the dragon.',
    description:
      'A 3D-styled take on the classic race to 100 for up to 4 players. Roll the dice, climb ladders, and avoid snakes, crocodiles and the fire dragon.',
    emoji: '🐍',
    category: 'Board',
    minPlayers: 2,
    maxPlayers: 4,
    ai: 'opponent',
    multiplayer: true,
    status: 'playable',
    gradient: 'from-emerald-500 to-lime-400',
    rules: [
      'Players take turns rolling a single six-sided die.',
      'Move your pawn forward by the number rolled.',
      'Land at the foot of a ladder to climb to its top.',
      'Land on the head of a snake, croc or dragon and slide down to its tail.',
      'Rolling a 6 gives you another roll (three 6s in a row forfeits the turn).',
      'You must land exactly on 100 to win. Overshooting means you stay put.',
    ],
  },
  {
    id: 'epic_business',
    slug: 'epic-business',
    name: 'Epic Business',
    tagline: 'Buy, trade and build your way to a business empire.',
    description:
      'A property-trading board game for 2–4 players. Buy districts, build offices and towers, collect rent and bankrupt your rivals.',
    emoji: '🏙️',
    category: 'Strategy',
    minPlayers: 2,
    maxPlayers: 4,
    ai: 'opponent',
    multiplayer: true,
    status: 'coming_soon',
    gradient: 'from-amber-500 to-orange-500',
    rules: [
      'Roll two dice and move around the board.',
      'Buy unowned districts you land on, or let them go to auction.',
      'Own every district in a colour group to build offices and towers.',
      'Pay rent when you land on a rival’s district.',
      'The last player who is not bankrupt wins.',
    ],
  },
  {
    id: 'epic_puzzle',
    slug: 'epic-puzzle',
    name: 'Epic Puzzle Board',
    tagline: 'Drag, drop and complete 20+ stunning illustrations.',
    description:
      'A relaxing jigsaw puzzle for 1–2 players. Choose from paintings, cartoons and mythical creatures, then drag pieces from the scrolling tray onto the canvas.',
    emoji: '🧩',
    category: 'Puzzle',
    minPlayers: 1,
    maxPlayers: 2,
    ai: 'none',
    multiplayer: true,
    status: 'coming_soon',
    gradient: 'from-fuchsia-500 to-purple-500',
    rules: [
      'Pick an image from the gallery.',
      'Scroll the piece tray at the bottom and drag pieces onto the canvas.',
      'Pieces snap into place when they are close to the correct spot.',
      'Complete the picture to win.',
    ],
  },
  {
    id: 'crossword',
    slug: 'crossword',
    name: 'Crossword',
    tagline: 'Colourful animated crosswords with smart hints.',
    description: 'Daily crosswords with animated reveals, unique colour themes and a hint system.',
    emoji: '📝',
    category: 'Word',
    minPlayers: 1,
    maxPlayers: 2,
    ai: 'hints',
    multiplayer: false,
    status: 'coming_soon',
    gradient: 'from-sky-500 to-indigo-500',
    rules: ['Fill the grid using the across and down clues.', 'Use hints to reveal a letter or a word.'],
  },
  {
    id: 'connect4',
    slug: 'connect-4',
    name: 'Connect 4',
    tagline: 'Drop discs and connect four in a row.',
    description: 'Drop coloured discs into a 7×6 grid. First to connect four horizontally, vertically or diagonally wins.',
    emoji: '🔴',
    category: 'Strategy',
    minPlayers: 2,
    maxPlayers: 2,
    ai: 'opponent',
    multiplayer: true,
    status: 'playable',
    gradient: 'from-red-500 to-yellow-400',
    rules: [
      'Players take turns dropping a disc into one of the seven columns.',
      'The disc falls to the lowest empty space in that column.',
      'Connect four of your discs in a row — horizontally, vertically or diagonally — to win.',
      'If the board fills up with no winner, the game is a draw.',
    ],
  },
  {
    id: 'tic_tac_toe',
    slug: 'tic-tac-toe',
    name: 'Tic Tac Toe',
    tagline: 'The timeless game of X and O.',
    description: 'Classic 3×3 Tic Tac Toe. Can you beat the Oracle, an AI that never loses?',
    emoji: '❌',
    category: 'Strategy',
    minPlayers: 2,
    maxPlayers: 2,
    ai: 'opponent',
    multiplayer: true,
    status: 'playable',
    gradient: 'from-cyan-500 to-blue-500',
    rules: [
      'X always moves first.',
      'Players take turns marking an empty square.',
      'Get three in a row — across, down or diagonally — to win.',
      'If all nine squares fill with no winner, it is a draw.',
    ],
  },
  {
    id: 'sudoku',
    slug: 'sudoku',
    name: 'Sudoku',
    tagline: 'Fill the 9×9 grid with logic.',
    description: 'Sudoku puzzles from easy to fiendish, with pencil marks and mistake checking.',
    emoji: '🔢',
    category: 'Puzzle',
    minPlayers: 1,
    maxPlayers: 1,
    ai: 'none',
    multiplayer: false,
    status: 'coming_soon',
    gradient: 'from-teal-500 to-emerald-500',
    rules: ['Every row, column and 3×3 box must contain the digits 1–9 exactly once.'],
  },
  {
    id: 'flappy_bird',
    slug: 'flappy-bird',
    name: 'Flappy Flyer',
    tagline: 'Tap to fly through the pipes.',
    description: 'One-tap arcade action. Fly through the gaps and chase the global high score.',
    emoji: '🐤',
    category: 'Arcade',
    minPlayers: 1,
    maxPlayers: 1,
    ai: 'none',
    multiplayer: false,
    status: 'coming_soon',
    gradient: 'from-yellow-400 to-orange-400',
    rules: ['Tap or press space to flap.', 'Avoid the pipes and the ground.'],
  },
  {
    id: 'chess',
    slug: 'chess',
    name: 'Chess',
    tagline: 'The ultimate game of strategy.',
    description: 'Full-rules chess with castling, en passant and promotion. Play friends online or challenge the AI.',
    emoji: '♟️',
    category: 'Strategy',
    minPlayers: 2,
    maxPlayers: 2,
    ai: 'opponent',
    multiplayer: true,
    status: 'coming_soon',
    gradient: 'from-slate-600 to-slate-400',
    rules: ['Checkmate your opponent’s king to win.'],
  },
  {
    id: 'checkers',
    slug: 'checkers',
    name: 'Checkers',
    tagline: 'Jump, capture and crown your kings.',
    description: 'Classic 8×8 checkers with mandatory captures and kinging.',
    emoji: '⚫',
    category: 'Strategy',
    minPlayers: 2,
    maxPlayers: 2,
    ai: 'opponent',
    multiplayer: true,
    status: 'coming_soon',
    gradient: 'from-rose-600 to-stone-700',
    rules: ['Move diagonally forward.', 'Captures are mandatory.', 'Reach the far row to be crowned.'],
  },
  {
    id: 'mahjong',
    slug: 'mahjong',
    name: 'Mahjong Solitaire',
    tagline: 'Match tiles and clear the board.',
    description: 'Match pairs of free tiles to clear beautiful layouts, with a hint system when you are stuck.',
    emoji: '🀄',
    category: 'Puzzle',
    minPlayers: 1,
    maxPlayers: 1,
    ai: 'hints',
    multiplayer: false,
    status: 'coming_soon',
    gradient: 'from-red-600 to-amber-500',
    rules: ['Match two identical free tiles to remove them.', 'Clear every tile to win.'],
  },
  {
    id: 'word_puzzle',
    slug: 'word-puzzle',
    name: 'Word Puzzle',
    tagline: 'Find the hidden word in six tries.',
    description: 'Guess the hidden word with colour-coded clues after every guess.',
    emoji: '🔤',
    category: 'Word',
    minPlayers: 1,
    maxPlayers: 1,
    ai: 'none',
    multiplayer: false,
    status: 'coming_soon',
    gradient: 'from-green-500 to-yellow-500',
    rules: ['Guess the word in six tries.', 'Tiles change colour to show how close you are.'],
  },
];

export function getGame(id: GameId): GameInfo {
  const game = GAMES.find((g) => g.id === id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}

export function getGameBySlug(slug: string): GameInfo | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && GAMES.some((g) => g.id === value);
}
