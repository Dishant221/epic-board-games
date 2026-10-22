import { IllegalMoveError, type GameEngine } from './types';
import { CROSSWORD_PUZZLES, type CrosswordPuzzle } from './crossword-data';

export * from './crossword-data';

export type CrosswordDir = 'across' | 'down';

/** One numbered entry of a puzzle, derived from the grid. */
export interface CrosswordWord {
  /** Position in `wordsOf()` — the id used by `reveal_word`. */
  index: number;
  number: number;
  dir: CrosswordDir;
  cells: number[];
  answer: string;
  clue: string;
}

export interface CrosswordState {
  phase: 'pick' | 'play';
  puzzleId: string | null;
  /** Player letters: '' empty, '#' block, 'A'–'Z'. */
  cells: string[];
  revealed: boolean[];
  /** Check mode: the board colours wrong letters. */
  checked: boolean;
  hintsUsed: number;
  startedAt: number | null;
  solvedAt: number | null;
  winner: number | null;
}

export type CrosswordMove =
  | { type: 'start'; puzzleId: string }
  | { type: 'set'; cell: number; letter: string }
  | { type: 'clear'; cell: number }
  | { type: 'reveal_letter'; cell: number }
  | { type: 'reveal_word'; word: number }
  | { type: 'toggle_check' };

export function getCrosswordPuzzle(id: string | null): CrosswordPuzzle | undefined {
  return CROSSWORD_PUZZLES.find((p) => p.id === id);
}

const WORDS_CACHE = new Map<string, CrosswordWord[]>();

/** Standard crossword numbering: a cell is numbered when it starts an across or down run of 2+ cells. */
export function wordsOf(puzzle: CrosswordPuzzle): CrosswordWord[] {
  const cached = WORDS_CACHE.get(puzzle.id);
  if (cached) return cached;
  const n = puzzle.size;
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= n || c >= n ? '#' : puzzle.grid[r]?.[c] ?? '#');
  const words: CrosswordWord[] = [];
  let number = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (at(r, c) === '#') continue;
      const startsAcross = at(r, c - 1) === '#' && at(r, c + 1) !== '#';
      const startsDown = at(r - 1, c) === '#' && at(r + 1, c) !== '#';
      if (!startsAcross && !startsDown) continue;
      number++;
      if (startsAcross) {
        const cells: number[] = [];
        for (let cc = c; at(r, cc) !== '#'; cc++) cells.push(r * n + cc);
        words.push({ index: words.length, number, dir: 'across', cells, answer: cells.map((i) => at(Math.floor(i / n), i % n)).join(''), clue: puzzle.clues.across[number] ?? '' });
      }
      if (startsDown) {
        const cells: number[] = [];
        for (let rr = r; at(rr, c) !== '#'; rr++) cells.push(rr * n + c);
        words.push({ index: words.length, number, dir: 'down', cells, answer: cells.map((i) => at(Math.floor(i / n), i % n)).join(''), clue: puzzle.clues.down[number] ?? '' });
      }
    }
  }
  WORDS_CACHE.set(puzzle.id, words);
  return words;
}

export function cellsOfWord(puzzle: CrosswordPuzzle, wordIndex: number): number[] {
  return wordsOf(puzzle)[wordIndex]?.cells ?? [];
}

/** Solution letter for a cell ('#' for blocks). */
export function solutionAt(puzzle: CrosswordPuzzle, cell: number): string {
  return puzzle.grid[Math.floor(cell / puzzle.size)]?.[cell % puzzle.size] ?? '#';
}

const PICK_STATE: CrosswordState = {
  phase: 'pick',
  puzzleId: null,
  cells: [],
  revealed: [],
  checked: false,
  hintsUsed: 0,
  startedAt: null,
  solvedAt: null,
  winner: null,
};

function isSolved(puzzle: CrosswordPuzzle, cells: string[]): boolean {
  return cells.every((ch, i) => ch === solutionAt(puzzle, i));
}

function finish(puzzle: CrosswordPuzzle, next: CrosswordState): CrosswordState {
  if (!isSolved(puzzle, next.cells)) return next;
  return { ...next, winner: 0, solvedAt: Date.now() };
}

/** Free-form `set` validity (letters are not enumerated in legalMoves). */
function isValidSet(s: CrosswordState, m: CrosswordMove): boolean {
  if (m.type !== 'set' || s.phase !== 'play' || s.winner !== null) return false;
  const cur = s.cells[m.cell];
  return cur !== undefined && cur !== '#' && !s.revealed[m.cell] && /^[A-Z]$/.test(m.letter);
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

export const crossword: GameEngine<CrosswordState, CrosswordMove> = {
  id: 'crossword',
  init: () => ({ ...PICK_STATE }),
  currentPlayer: () => 0,
  legalMoves(s) {
    if (s.winner !== null) return [];
    if (s.phase === 'pick') return CROSSWORD_PUZZLES.map((p) => ({ type: 'start', puzzleId: p.id }));
    const puzzle = getCrosswordPuzzle(s.puzzleId);
    if (!puzzle) return [];
    const moves: CrosswordMove[] = [];
    s.cells.forEach((ch, cell) => {
      if (ch === '#' || s.revealed[cell]) return;
      // Template: the real letter is validated by validateMove (26 × cells would be noisy).
      moves.push({ type: 'set', cell, letter: '' });
      if (ch !== '') moves.push({ type: 'clear', cell });
      moves.push({ type: 'reveal_letter', cell });
    });
    for (const w of wordsOf(puzzle)) if (w.cells.some((c) => !s.revealed[c])) moves.push({ type: 'reveal_word', word: w.index });
    moves.push({ type: 'toggle_check' });
    return moves;
  },
  validateMove(s, m) {
    if (m.type === 'set') return isValidSet(s, m);
    return this.legalMoves(s).some((lm) => this.sameMove(lm, m));
  },
  applyMove(s, m) {
    if (s.winner !== null) throw new IllegalMoveError('Puzzle already solved');
    if (m.type === 'start') {
      const puzzle = getCrosswordPuzzle(m.puzzleId);
      if (s.phase !== 'pick' || !puzzle) throw new IllegalMoveError('Unknown puzzle');
      const cells = puzzle.grid.join('').split('').map((ch) => (ch === '#' ? '#' : ''));
      return { ...PICK_STATE, phase: 'play', puzzleId: puzzle.id, cells, revealed: cells.map(() => false), startedAt: Date.now() };
    }
    const puzzle = getCrosswordPuzzle(s.puzzleId);
    if (s.phase !== 'play' || !puzzle) throw new IllegalMoveError('Pick a puzzle first');
    const cells = s.cells.slice();
    const revealed = s.revealed.slice();
    switch (m.type) {
      case 'set': {
        if (!isValidSet(s, m)) throw new IllegalMoveError('Cannot write there');
        cells[m.cell] = m.letter;
        return finish(puzzle, { ...s, cells });
      }
      case 'clear': {
        const cur = s.cells[m.cell];
        if (cur === undefined || cur === '#' || s.revealed[m.cell]) throw new IllegalMoveError('Cannot clear that cell');
        cells[m.cell] = '';
        return { ...s, cells };
      }
      case 'reveal_letter': {
        const cur = s.cells[m.cell];
        if (cur === undefined || cur === '#' || s.revealed[m.cell]) throw new IllegalMoveError('Nothing to reveal');
        cells[m.cell] = solutionAt(puzzle, m.cell);
        revealed[m.cell] = true;
        return finish(puzzle, { ...s, cells, revealed, hintsUsed: s.hintsUsed + 1 });
      }
      case 'reveal_word': {
        const word = wordsOf(puzzle)[m.word];
        if (!word || word.cells.every((c) => s.revealed[c])) throw new IllegalMoveError('Nothing to reveal');
        for (const c of word.cells) {
          cells[c] = solutionAt(puzzle, c);
          revealed[c] = true;
        }
        return finish(puzzle, { ...s, cells, revealed, hintsUsed: s.hintsUsed + 1 });
      }
      case 'toggle_check':
        return { ...s, checked: !s.checked };
      default:
        throw new IllegalMoveError();
    }
  },
  isTerminal: (s) => s.winner !== null,
  winner: (s) => s.winner,
  parseMove(raw) {
    const r = raw as { type?: unknown; puzzleId?: unknown; cell?: unknown; letter?: unknown; word?: unknown } | null;
    if (!r || typeof r !== 'object') return null;
    const maxCell = 11 * 11 - 1;
    switch (r.type) {
      case 'start':
        return typeof r.puzzleId === 'string' && r.puzzleId.length <= 40 ? { type: 'start', puzzleId: r.puzzleId } : null;
      case 'set':
        return isInt(r.cell, 0, maxCell) && typeof r.letter === 'string' && /^[A-Z]$/.test(r.letter) ? { type: 'set', cell: r.cell, letter: r.letter } : null;
      case 'clear':
        return isInt(r.cell, 0, maxCell) ? { type: 'clear', cell: r.cell } : null;
      case 'reveal_letter':
        return isInt(r.cell, 0, maxCell) ? { type: 'reveal_letter', cell: r.cell } : null;
      case 'reveal_word':
        return isInt(r.word, 0, 200) ? { type: 'reveal_word', word: r.word } : null;
      case 'toggle_check':
        return { type: 'toggle_check' };
      default:
        return null;
    }
  },
  sameMove(a, b) {
    if (a.type !== b.type) return false;
    switch (a.type) {
      case 'start':
        return a.puzzleId === (b as typeof a).puzzleId;
      case 'set':
        return a.cell === (b as typeof a).cell && a.letter === (b as typeof a).letter;
      case 'clear':
      case 'reveal_letter':
        return a.cell === (b as typeof a).cell;
      case 'reveal_word':
        return a.word === (b as typeof a).word;
      default:
        return true;
    }
  },
  summary(s) {
    const puzzle = getCrosswordPuzzle(s.puzzleId);
    if (!puzzle || s.winner !== 0) return null;
    const secs = Math.max(0, Math.round(((s.solvedAt ?? 0) - (s.startedAt ?? 0)) / 1000));
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const hints = s.hintsUsed === 0 ? 'no hints' : s.hintsUsed === 1 ? '1 hint' : `${s.hintsUsed} hints`;
    return `Solved “${puzzle.title}” in ${time} with ${hints}`;
  },
};
