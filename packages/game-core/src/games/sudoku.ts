import type { Rng } from '../rng';
import { IllegalMoveError, type GameEngine } from './types';

export type SudokuDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const SUDOKU_DIFFICULTIES: readonly SudokuDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

/** Target number of remaining clues per difficulty (approximate: removal stops when uniqueness breaks). */
export const SUDOKU_CLUES: Record<SudokuDifficulty, number> = { easy: 40, medium: 32, hard: 27, expert: 24 };

/** Undo stack depth; each entry is 162 small ints so this keeps the state well under 30 KB. */
const HISTORY_LIMIT = 24;

export interface SudokuSnapshot {
  cells: number[];
  pencil: number[];
}

export interface SudokuState {
  phase: 'pick' | 'play';
  difficulty: SudokuDifficulty;
  /** 81 entries, 0 = empty. Givens never change. */
  givens: number[];
  /** Current board including givens (0 = empty). */
  cells: number[];
  /** Candidate bitmask per cell: bit (d-1) set means digit d is pencilled. */
  pencil: number[];
  solution: number[];
  /** Wrong digits placed while check mode was on. */
  mistakes: number;
  hintsUsed: number;
  checkMode: boolean;
  history: SudokuSnapshot[];
  /** Epoch ms when the puzzle started (0 while picking). */
  startedAt: number;
  solvedAt: number | null;
  winner: number | null;
}

export type SudokuMove =
  | { type: 'start'; difficulty: SudokuDifficulty }
  | { type: 'set'; cell: number; value: number }
  | { type: 'pencil'; cell: number; value: number }
  | { type: 'clear'; cell: number }
  | { type: 'hint' }
  | { type: 'undo' }
  | { type: 'toggle_check' };

export interface SudokuHint {
  cell: number;
  value: number;
  /** How the hint was found; 'fix' corrects a wrong digit, 'reveal' is a plain reveal. */
  reason: 'naked' | 'hidden' | 'fix' | 'reveal';
}

// ------------------------------------------------------------------ geometry

const ALL = 0x1ff;
export const BOX_OF: readonly number[] = Array.from({ length: 81 }, (_, i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3));
/** The 20 cells sharing a row, column or box with each cell. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: 81 }, (_, i) => {
  const peers: number[] = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (Math.floor(j / 9) === Math.floor(i / 9) || j % 9 === i % 9 || BOX_OF[j] === BOX_OF[i])) peers.push(j);
  }
  return peers;
});
/** Rows, columns and boxes as cell-index lists (27 units). */
const UNITS: readonly (readonly number[])[] = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, k) => Math.floor(b / 3) * 27 + (b % 3) * 3 + Math.floor(k / 3) * 9 + (k % 3))),
];

const bitCount = (m: number) => {
  let n = 0;
  while (m) { m &= m - 1; n++; }
  return n;
};

/** Digits still possible for `cell` given every other filled cell of `grid`. */
export function candidates(grid: readonly number[], cell: number): number {
  let used = 0;
  for (const p of PEERS[cell]!) {
    const v = grid[p]!;
    if (v) used |= 1 << (v - 1);
  }
  return ALL & ~used;
}

// -------------------------------------------------------------------- solver

interface Masks { rows: number[]; cols: number[]; boxes: number[] }

function buildMasks(grid: readonly number[]): Masks | null {
  const m: Masks = { rows: Array<number>(9).fill(0), cols: Array<number>(9).fill(0), boxes: Array<number>(9).fill(0) };
  for (let i = 0; i < 81; i++) {
    const v = grid[i]!;
    if (!v) continue;
    const bit = 1 << (v - 1);
    const r = Math.floor(i / 9), c = i % 9, b = BOX_OF[i]!;
    // A given that clashes with another given makes the puzzle unsolvable.
    if (m.rows[r]! & bit || m.cols[c]! & bit || m.boxes[b]! & bit) return null;
    m.rows[r]! |= bit; m.cols[c]! |= bit; m.boxes[b]! |= bit;
  }
  return m;
}

/**
 * Backtracking with most-constrained-cell ordering. Counts solutions up to
 * `limit`; the first one found is copied into `out` when provided. `order`
 * lets the generator randomise the digit order for the initial fill.
 */
function search(grid: number[], m: Masks, limit: number, out: number[] | null, order: ((bits: number) => number[]) | null): number {
  let best = -1, bestMask = 0, bestCount = 10;
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    const mask = ALL & ~(m.rows[Math.floor(i / 9)]! | m.cols[i % 9]! | m.boxes[BOX_OF[i]!]!);
    const n = bitCount(mask);
    if (n === 0) return 0;
    if (n < bestCount) { best = i; bestMask = mask; bestCount = n; if (n === 1) break; }
  }
  if (best === -1) {
    if (out) for (let i = 0; i < 81; i++) out[i] = grid[i]!;
    return 1;
  }
  const r = Math.floor(best / 9), c = best % 9, b = BOX_OF[best]!;
  const digits = order ? order(bestMask) : maskDigits(bestMask);
  let found = 0;
  for (const d of digits) {
    const bit = 1 << (d - 1);
    grid[best] = d; m.rows[r]! |= bit; m.cols[c]! |= bit; m.boxes[b]! |= bit;
    found += search(grid, m, limit - found, found === 0 ? out : null, order);
    grid[best] = 0; m.rows[r]! &= ~bit; m.cols[c]! &= ~bit; m.boxes[b]! &= ~bit;
    if (found >= limit) break;
  }
  return found;
}

function maskDigits(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out.push(d);
  return out;
}

/** Number of solutions of `grid` (0 = empty cells), stopping at `limit`. */
export function countSolutions(grid: readonly number[], limit = 2): number {
  const m = buildMasks(grid);
  if (!m) return 0;
  return search(grid.slice(), m, limit, null, null);
}

/** The unique-or-first solution of `grid`, or null when it has none. */
export function solveSudoku(grid: readonly number[]): number[] | null {
  const m = buildMasks(grid);
  if (!m) return null;
  const out = Array<number>(81).fill(0);
  return search(grid.slice(), m, 1, out, null) ? out : null;
}

// ----------------------------------------------------------------- generator

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/**
 * Builds a puzzle: a random full grid, then clues are removed in random order
 * while the puzzle keeps exactly one solution, until `SUDOKU_CLUES[difficulty]`
 * remain (or no further clue can be removed). Deterministic for a given rng.
 */
export function generateSudoku(rng: Rng, difficulty: SudokuDifficulty): { givens: number[]; solution: number[] } {
  const solution = Array<number>(81).fill(0);
  const empty = Array<number>(81).fill(0);
  search(empty, buildMasks(empty)!, 1, solution, (bits) => shuffle(maskDigits(bits), rng));

  const givens = solution.slice();
  let clues = 81;
  const target = SUDOKU_CLUES[difficulty];
  for (const cell of shuffle(Array.from({ length: 81 }, (_, i) => i), rng)) {
    if (clues <= target) break;
    const saved = givens[cell]!;
    givens[cell] = 0;
    // Cheap test first: a cell forced by its peers cannot create a second solution.
    const unique = bitCount(candidates(givens, cell)) === 1 || countSolutions(givens, 2) === 1;
    if (unique) clues--;
    else givens[cell] = saved;
  }
  return { givens, solution };
}

// --------------------------------------------------------------------- hints

/**
 * Finds one correct digit to reveal: a naked single, then a hidden single
 * (both verified against the solution so wrong entries cannot mislead), then
 * a wrong cell to fix, then any empty cell.
 */
export function findHint(s: SudokuState): SudokuHint | null {
  if (s.phase !== 'play' || s.winner !== null) return null;
  const cands: number[] = Array<number>(81).fill(0);
  for (let i = 0; i < 81; i++) if (!s.cells[i]) cands[i] = candidates(s.cells, i);
  for (let i = 0; i < 81; i++) {
    const c = cands[i]!;
    if (!s.cells[i] && bitCount(c) === 1 && c === 1 << (s.solution[i]! - 1)) return { cell: i, value: s.solution[i]!, reason: 'naked' };
  }
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      if (unit.some((i) => s.cells[i] === d)) continue;
      const spots = unit.filter((i) => !s.cells[i] && cands[i]! & bit);
      if (spots.length === 1 && s.solution[spots[0]!] === d) return { cell: spots[0]!, value: d, reason: 'hidden' };
    }
  }
  for (let i = 0; i < 81; i++) if (s.cells[i] && s.cells[i] !== s.solution[i]) return { cell: i, value: s.solution[i]!, reason: 'fix' };
  for (let i = 0; i < 81; i++) if (!s.cells[i]) return { cell: i, value: s.solution[i]!, reason: 'reveal' };
  return null;
}

// -------------------------------------------------------------------- engine

const isCell = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 81;
const isDigit = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 9;
const isDifficulty = (v: unknown): v is SudokuDifficulty => typeof v === 'string' && (SUDOKU_DIFFICULTIES as readonly string[]).includes(v);

function pushHistory(s: SudokuState): SudokuSnapshot[] {
  const history = s.history.length >= HISTORY_LIMIT ? s.history.slice(1) : s.history.slice();
  history.push({ cells: s.cells, pencil: s.pencil });
  return history;
}

/** Writes `value` into `cell`, clears its pencil marks and that digit from its peers' marks. */
function place(s: SudokuState, cell: number, value: number): { cells: number[]; pencil: number[] } {
  const cells = s.cells.slice();
  const pencil = s.pencil.slice();
  cells[cell] = value;
  pencil[cell] = 0;
  const bit = 1 << (value - 1);
  for (const p of PEERS[cell]!) pencil[p]! &= ~bit;
  return { cells, pencil };
}

function finish(s: SudokuState): SudokuState {
  const solved = s.cells.every((v, i) => v === s.solution[i]);
  return solved ? { ...s, winner: 0, solvedAt: Date.now() } : s;
}

const BLANK = Array<number>(81).fill(0);

export const sudoku: GameEngine<SudokuState, SudokuMove> = {
  id: 'sudoku',
  init(playerCount) {
    if (playerCount !== 1) throw new Error('Sudoku is single-player');
    return {
      phase: 'pick',
      difficulty: 'easy',
      givens: BLANK.slice(),
      cells: BLANK.slice(),
      pencil: BLANK.slice(),
      solution: BLANK.slice(),
      mistakes: 0,
      hintsUsed: 0,
      checkMode: false,
      history: [],
      startedAt: 0,
      solvedAt: null,
      winner: null,
    };
  },
  currentPlayer: () => 0,
  legalMoves(s) {
    if (s.winner !== null) return [];
    if (s.phase === 'pick') return SUDOKU_DIFFICULTIES.map((difficulty) => ({ type: 'start', difficulty }) as SudokuMove);
    const moves: SudokuMove[] = [{ type: 'hint' }, { type: 'toggle_check' }];
    if (s.history.length) moves.push({ type: 'undo' });
    for (let cell = 0; cell < 81; cell++) {
      if (s.givens[cell]) continue;
      const v = s.cells[cell]!;
      if (v || s.pencil[cell]) moves.push({ type: 'clear', cell });
      for (let value = 1; value <= 9; value++) {
        if (value !== v) moves.push({ type: 'set', cell, value });
        if (!v) moves.push({ type: 'pencil', cell, value });
      }
    }
    return moves;
  },
  applyMove(s, m, rng) {
    if (s.winner !== null) throw new IllegalMoveError('Puzzle already solved');
    if (m.type === 'start') {
      if (s.phase !== 'pick') throw new IllegalMoveError('Puzzle already started');
      const { givens, solution } = generateSudoku(rng, m.difficulty);
      return { ...s, phase: 'play', difficulty: m.difficulty, givens, cells: givens.slice(), pencil: BLANK.slice(), solution, startedAt: Date.now() };
    }
    if (s.phase !== 'play') throw new IllegalMoveError('Pick a difficulty first');
    switch (m.type) {
      case 'set': {
        if (!isCell(m.cell) || !isDigit(m.value) || s.givens[m.cell] || s.cells[m.cell] === m.value) throw new IllegalMoveError();
        const wrong = s.checkMode && m.value !== s.solution[m.cell];
        return finish({ ...s, ...place(s, m.cell, m.value), history: pushHistory(s), mistakes: s.mistakes + (wrong ? 1 : 0) });
      }
      case 'pencil': {
        if (!isCell(m.cell) || !isDigit(m.value) || s.givens[m.cell] || s.cells[m.cell]) throw new IllegalMoveError();
        const pencil = s.pencil.slice();
        pencil[m.cell]! ^= 1 << (m.value - 1);
        return { ...s, pencil, history: pushHistory(s) };
      }
      case 'clear': {
        if (!isCell(m.cell) || s.givens[m.cell] || (!s.cells[m.cell] && !s.pencil[m.cell])) throw new IllegalMoveError();
        const cells = s.cells.slice();
        const pencil = s.pencil.slice();
        cells[m.cell] = 0;
        pencil[m.cell] = 0;
        return { ...s, cells, pencil, history: pushHistory(s) };
      }
      case 'hint': {
        const hint = findHint(s);
        if (!hint) throw new IllegalMoveError('Nothing to hint');
        return finish({ ...s, ...place(s, hint.cell, hint.value), history: pushHistory(s), hintsUsed: s.hintsUsed + 1 });
      }
      case 'undo': {
        const prev = s.history[s.history.length - 1];
        if (!prev) throw new IllegalMoveError('Nothing to undo');
        return { ...s, cells: prev.cells, pencil: prev.pencil, history: s.history.slice(0, -1) };
      }
      case 'toggle_check':
        return { ...s, checkMode: !s.checkMode };
      default:
        throw new IllegalMoveError();
    }
  },
  isTerminal: (s) => s.winner !== null,
  winner: (s) => s.winner,
  parseMove(raw) {
    const r = raw as { type?: unknown; cell?: unknown; value?: unknown; difficulty?: unknown } | null;
    if (!r || typeof r !== 'object') return null;
    switch (r.type) {
      case 'start':
        return isDifficulty(r.difficulty) ? { type: 'start', difficulty: r.difficulty } : null;
      case 'set':
      case 'pencil':
        return isCell(r.cell) && isDigit(r.value) ? { type: r.type, cell: r.cell, value: r.value } : null;
      case 'clear':
        return isCell(r.cell) ? { type: 'clear', cell: r.cell } : null;
      case 'hint':
      case 'undo':
      case 'toggle_check':
        return { type: r.type };
      default:
        return null;
    }
  },
  sameMove(a, b) {
    if (a.type !== b.type) return false;
    switch (a.type) {
      case 'start':
        return a.difficulty === (b as typeof a).difficulty;
      case 'set':
      case 'pencil':
        return a.cell === (b as typeof a).cell && a.value === (b as typeof a).value;
      case 'clear':
        return a.cell === (b as typeof a).cell;
      default:
        return true;
    }
  },
  summary(s) {
    if (s.winner !== 0) return null;
    const secs = Math.max(0, Math.round(((s.solvedAt ?? Date.now()) - s.startedAt) / 1000));
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const hints = s.hintsUsed === 0 ? '' : ` with ${s.hintsUsed} hint${s.hintsUsed === 1 ? '' : 's'}`;
    return `Solved ${s.difficulty === 'easy' || s.difficulty === 'expert' ? 'an' : 'a'} ${s.difficulty} puzzle in ${time}${hints}`;
  },
};
