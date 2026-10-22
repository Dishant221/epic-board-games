// Single source of truth for the game catalog. Used by the landing page,
// SEO metadata, the matchmaker (player limits), the mode selector and the blog.

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
/** Turn-based games run on the shared engine; realtime ones have their own loop. */
export type GameKind = 'turn' | 'realtime';

export interface GameInfo {
  id: GameId;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
  category: 'Board' | 'Strategy' | 'Puzzle' | 'Word' | 'Arcade';
  kind: GameKind;
  minPlayers: number;
  maxPlayers: number;
  ai: AISupport;
  multiplayer: boolean;
  status: GameStatus;
  /** Typical length of one game, in minutes (for SEO and the game cards). */
  minutes: number;
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
    kind: 'turn',
    minPlayers: 2,
    maxPlayers: 4,
    ai: 'opponent',
    multiplayer: true,
    status: 'playable',
    minutes: 10,
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
      'A property-trading board game for 2–4 players. Buy districts, build offices and towers, collect rent, draw Fortune and Market cards, and bankrupt your rivals.',
    emoji: '🏙️',
    category: 'Strategy',
    kind: 'turn',
    minPlayers: 2,
    maxPlayers: 4,
    ai: 'opponent',
    multiplayer: true,
    status: 'playable',
    minutes: 45,
    gradient: 'from-amber-500 to-orange-500',
    rules: [
      'Everyone starts with 1,500 credits. Roll two dice and move clockwise around the 40-space board.',
      'Land on an unowned district, station or utility to buy it, or pass and let it go to auction.',
      'Pay rent when you land on a rival’s property. Rent rises when they own the whole colour group and when they build.',
      'Own every district in a colour group to build offices (up to 4) and then a tower.',
      'Fortune and Market cards move you, pay you or charge you. Three doubles in a row sends you to the Lock-up.',
      'Collect 200 credits every time you pass Payday. Mortgage properties to raise cash.',
      'The last player who has not gone bankrupt wins.',
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
    kind: 'turn',
    minPlayers: 1,
    maxPlayers: 2,
    ai: 'none',
    multiplayer: true,
    status: 'playable',
    minutes: 15,
    gradient: 'from-fuchsia-500 to-purple-500',
    rules: [
      'Pick an image from the gallery and a piece count.',
      'Scroll the piece tray at the bottom and drag pieces onto the canvas.',
      'Pieces snap into place when they are close to the correct spot.',
      'With two players, you solve together — both of you can place pieces at any time.',
      'Complete the picture to win.',
    ],
  },
  {
    id: 'crossword',
    slug: 'crossword',
    name: 'Crossword',
    tagline: 'Colourful animated crosswords with smart hints.',
    description: 'Hand-made crosswords with animated reveals, unique colour themes and a hint system that reveals a letter or a whole word.',
    emoji: '📝',
    category: 'Word',
    kind: 'turn',
    minPlayers: 1,
    maxPlayers: 1,
    ai: 'hints',
    multiplayer: false,
    status: 'playable',
    minutes: 15,
    gradient: 'from-sky-500 to-indigo-500',
    rules: [
      'Fill the grid using the across and down clues.',
      'Tap a square to select it, tap again to switch between across and down.',
      'Type letters to fill the word; the puzzle checks your answers as you go.',
      'Use hints to reveal a letter or a whole word if you are stuck.',
      'Fill every square correctly to finish.',
    ],
  },
  {
    id: 'connect4',
    slug: 'connect-4',
    name: 'Connect 4',
    tagline: 'Drop discs and connect four in a row.',
    description: 'Drop coloured discs into a 7×6 grid. First to connect four horizontally, vertically or diagonally wins.',
    emoji: '🔴',
    category: 'Strategy',
    kind: 'turn',
    minPlayers: 2,
    maxPlayers: 2,
    ai: 'opponent',
    multiplayer: true,
    status: 'playable',
    minutes: 5,
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
    kind: 'turn',
    minPlayers: 2,
    maxPlayers: 2,
    ai: 'opponent',
    multiplayer: true,
    status: 'playable',
    minutes: 2,
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
    description: 'Sudoku puzzles from easy to fiendish, with pencil marks, mistake checking and a solver-powered hint.',
    emoji: '🔢',
    category: 'Puzzle',
    kind: 'turn',
    minPlayers: 1,
    maxPlayers: 1,
    ai: 'hints',
    multiplayer: false,
    status: 'playable',
    minutes: 15,
    gradient: 'from-teal-500 to-emerald-500',
    rules: [
      'Every row, column and 3×3 box must contain the digits 1–9 exactly once.',
      'Tap a cell, then tap a digit to fill it. Use pencil mode to jot candidates.',
      'Turn on mistake checking to see wrong digits highlighted.',
      'Use a hint to reveal one correct digit when you are stuck.',
      'Fill the whole grid correctly to win.',
    ],
  },
  {
    id: 'flappy_bird',
    slug: 'flappy-bird',
    name: 'Flappy Flyer',
    tagline: 'Tap to fly through the pipes.',
    description: 'One-tap arcade action. Fly through the gaps, dodge the pipes and chase your personal best.',
    emoji: '🐤',
    category: 'Arcade',
    kind: 'realtime',
    minPlayers: 1,
    maxPlayers: 1,
    ai: 'none',
    multiplayer: false,
    status: 'playable',
    minutes: 2,
    gradient: 'from-yellow-400 to-orange-400',
    rules: [
      'Tap, click or press space to flap your wings.',
      'Gravity pulls you down between flaps; find the rhythm.',
      'Fly through the gap in each pair of pipes to score a point.',
      'Touch a pipe or the ground and the round is over.',
      'Beat your best score; it is saved on this device.',
    ],
  },
  {
    id: 'chess',
    slug: 'chess',
    name: 'Chess',
    tagline: 'The ultimate game of strategy.',
    description: 'Full-rules chess with castling, en passant, promotion, check, checkmate and stalemate. Play friends online or challenge four levels of AI.',
    emoji: '♟️',
    category: 'Strategy',
    kind: 'turn',
    minPlayers: 2,
    maxPlayers: 2,
    ai: 'opponent',
    multiplayer: true,
    status: 'playable',
    minutes: 30,
    gradient: 'from-slate-600 to-slate-400',
    rules: [
      'White moves first; players alternate one move at a time.',
      'Each piece moves in its own way: pawns forward, knights in an L, bishops diagonally, rooks straight, the queen both, the king one square.',
      'You may castle once if neither the king nor that rook has moved and the squares between are empty and safe.',
      'A pawn that reaches the last rank promotes to a queen, rook, bishop or knight.',
      'You may never leave your own king in check.',
      'Checkmate the opponent’s king to win. Stalemate, threefold repetition, the 50-move rule and insufficient material are draws.',
    ],
  },
  {
    id: 'checkers',
    slug: 'checkers',
    name: 'Checkers',
    tagline: 'Jump, capture and crown your kings.',
    description: 'Classic 8×8 checkers (draughts) with mandatory captures, multi-jumps and kinging. Play online or against the AI.',
    emoji: '⚫',
    category: 'Strategy',
    kind: 'turn',
    minPlayers: 2,
    maxPlayers: 2,
    ai: 'opponent',
    multiplayer: true,
    status: 'playable',
    minutes: 15,
    gradient: 'from-rose-600 to-stone-700',
    rules: [
      'Pieces move one square diagonally forward onto an empty dark square.',
      'Capture by jumping over an adjacent enemy piece onto the empty square beyond.',
      'If a capture is available you must take it, and you keep jumping while you can.',
      'A piece that reaches the far row is crowned a king and can move and capture backwards too.',
      'Win by capturing all enemy pieces or leaving your opponent with no legal move.',
    ],
  },
  {
    id: 'mahjong',
    slug: 'mahjong',
    name: 'Mahjong Solitaire',
    tagline: 'Match tiles and clear the board.',
    description: 'Match pairs of free tiles to clear beautiful layouts, with a hint system and shuffle when you are stuck.',
    emoji: '🀄',
    category: 'Puzzle',
    kind: 'turn',
    minPlayers: 1,
    maxPlayers: 1,
    ai: 'hints',
    multiplayer: false,
    status: 'playable',
    minutes: 15,
    gradient: 'from-red-600 to-amber-500',
    rules: [
      'A tile is free when nothing sits on top of it and at least one long side (left or right) is open.',
      'Tap two identical free tiles to remove them. Any season matches any season; any flower matches any flower.',
      'Use a hint to highlight a matching pair, or shuffle the remaining tiles if no moves are left.',
      'Clear every tile to win.',
    ],
  },
  {
    id: 'word_puzzle',
    slug: 'word-puzzle',
    name: 'Word Puzzle',
    tagline: 'Find the hidden word in six tries.',
    description: 'Guess the hidden five-letter word in six tries, with colour-coded clues after every guess.',
    emoji: '🔤',
    category: 'Word',
    kind: 'turn',
    minPlayers: 1,
    maxPlayers: 1,
    ai: 'none',
    multiplayer: false,
    status: 'playable',
    minutes: 5,
    gradient: 'from-green-500 to-yellow-500',
    rules: [
      'Guess the hidden five-letter word in six tries. Every guess must be a real word.',
      'Green means the letter is correct and in the right spot.',
      'Yellow means the letter is in the word but in a different spot.',
      'Grey means the letter is not in the word at all.',
      'Use the on-screen keyboard colours to track what you have learned.',
    ],
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
