import { describe, expect, it } from 'vitest';
import { createRng, IllegalMoveError } from '../src';
// Imported by path until the integrator registers the engine in games/index.ts.
import {
  BOX_OF,
  countSolutions,
  findHint,
  generateSudoku,
  solveSudoku,
  sudoku,
  SUDOKU_CLUES,
  SUDOKU_DIFFICULTIES,
  type SudokuState,
} from '../src/games/sudoku';

const parse = (puzzle: string) => puzzle.replace(/\s+/g, '').split('').map((ch) => (ch === '.' ? 0 : Number(ch)));

/** Checks every row, column and box holds 1–9 exactly once. */
function isValidSolution(grid: number[]): boolean {
  if (grid.length !== 81) return false;
  for (let u = 0; u < 9; u++) {
    const row = new Set<number>(), col = new Set<number>(), box = new Set<number>();
    for (let k = 0; k < 9; k++) {
      row.add(grid[u * 9 + k]!);
      col.add(grid[k * 9 + u]!);
      box.add(grid[Math.floor(u / 3) * 27 + (u % 3) * 3 + Math.floor(k / 3) * 9 + (k % 3)]!);
    }
    for (const set of [row, col, box]) if (set.size !== 9 || set.has(0)) return false;
  }
  return true;
}

// "AI Escargot" — a famously hard but uniquely solvable puzzle.
const HARD = parse(`
  1....7.9. .3..2...8 ..96..5.. ..53..9.. .1..8...2
  6....4... 3......1. .4......7 ..7...3..
`);
const HARD_SOLUTION = parse(`
  162857493 534129678 789643521 475312986 913586742
  628794135 356478219 241935867 897261354
`);

function started(seed: number, difficulty: SudokuState['difficulty'] = 'easy'): SudokuState {
  const rng = createRng(seed);
  return sudoku.applyMove(sudoku.init(1, rng), { type: 'start', difficulty }, rng);
}

describe('sudoku solver', () => {
  it('solves a known hard puzzle', () => {
    expect(solveSudoku(HARD)).toEqual(HARD_SOLUTION);
    expect(countSolutions(HARD, 2)).toBe(1);
  });

  it('counts multiple solutions and detects unsolvable grids', () => {
    expect(countSolutions(Array<number>(81).fill(0), 3)).toBe(3);
    const clash = Array<number>(81).fill(0);
    clash[0] = 5;
    clash[1] = 5;
    expect(countSolutions(clash)).toBe(0);
    expect(solveSudoku(clash)).toBeNull();
  });
});

describe('sudoku generator', () => {
  it.each(SUDOKU_DIFFICULTIES)('generates a valid, unique %s puzzle quickly', (difficulty) => {
    const t0 = performance.now();
    const { givens, solution } = generateSudoku(createRng(123), difficulty);
    const elapsed = performance.now() - t0;
    expect(isValidSolution(solution)).toBe(true);
    const clues = givens.filter(Boolean).length;
    expect(clues).toBeGreaterThanOrEqual(SUDOKU_CLUES[difficulty]);
    expect(clues).toBeLessThanOrEqual(SUDOKU_CLUES[difficulty] + 6);
    givens.forEach((v, i) => v && expect(v).toBe(solution[i]));
    expect(countSolutions(givens, 2)).toBe(1);
    expect(solveSudoku(givens)).toEqual(solution);
    expect(elapsed).toBeLessThan(1500); // generous CI bound; typically well under 300 ms
  });

  it('is deterministic for the same seed and differs across seeds', () => {
    const a = generateSudoku(createRng(99), 'hard');
    const b = generateSudoku(createRng(99), 'hard');
    const c = generateSudoku(createRng(100), 'hard');
    expect(a).toEqual(b);
    expect(c.solution).not.toEqual(a.solution);
    expect(started(5, 'medium').givens).toEqual(started(5, 'medium').givens);
  });
});

describe('sudoku engine', () => {
  it('starts in the picker and only offers start moves there', () => {
    const rng = createRng(1);
    const s = sudoku.init(1, rng);
    expect(s.phase).toBe('pick');
    expect(sudoku.legalMoves(s)).toEqual(SUDOKU_DIFFICULTIES.map((difficulty) => ({ type: 'start', difficulty })));
    expect(() => sudoku.applyMove(s, { type: 'set', cell: 0, value: 1 }, rng)).toThrow(IllegalMoveError);
    const p = sudoku.applyMove(s, { type: 'start', difficulty: 'hard' }, rng);
    expect(p.phase).toBe('play');
    expect(p.difficulty).toBe('hard');
    expect(p.cells).toEqual(p.givens);
    expect(p.startedAt).toBeGreaterThan(0);
    expect(() => sudoku.applyMove(p, { type: 'start', difficulty: 'easy' }, rng)).toThrow(IllegalMoveError);
  });

  it('set / pencil / clear / undo behave and respect givens', () => {
    const rng = createRng(2);
    let s = started(2);
    const empty = s.cells.indexOf(0);
    const given = s.cells.findIndex((v) => v !== 0);

    expect(() => sudoku.applyMove(s, { type: 'set', cell: given, value: 1 }, rng)).toThrow(IllegalMoveError);
    expect(() => sudoku.applyMove(s, { type: 'pencil', cell: given, value: 1 }, rng)).toThrow(IllegalMoveError);
    expect(() => sudoku.applyMove(s, { type: 'clear', cell: empty }, rng)).toThrow(IllegalMoveError);
    expect(() => sudoku.applyMove(s, { type: 'undo' }, rng)).toThrow(IllegalMoveError);

    s = sudoku.applyMove(s, { type: 'pencil', cell: empty, value: 3 }, rng);
    s = sudoku.applyMove(s, { type: 'pencil', cell: empty, value: 7 }, rng);
    expect(s.pencil[empty]).toBe((1 << 2) | (1 << 6));
    s = sudoku.applyMove(s, { type: 'pencil', cell: empty, value: 3 }, rng);
    expect(s.pencil[empty]).toBe(1 << 6);

    // A placed digit wipes the cell's marks and that digit from its peers' marks.
    const peer = s.cells.findIndex((v, i) => v === 0 && i !== empty && Math.floor(i / 9) === Math.floor(empty / 9));
    s = sudoku.applyMove(s, { type: 'pencil', cell: peer, value: 5 }, rng);
    s = sudoku.applyMove(s, { type: 'set', cell: empty, value: 5 }, rng);
    expect(s.cells[empty]).toBe(5);
    expect(s.pencil[empty]).toBe(0);
    expect(s.pencil[peer]).toBe(0);
    expect(() => sudoku.applyMove(s, { type: 'pencil', cell: empty, value: 1 }, rng)).toThrow(IllegalMoveError);

    const before = s;
    s = sudoku.applyMove(s, { type: 'clear', cell: empty }, rng);
    expect(s.cells[empty]).toBe(0);
    s = sudoku.applyMove(s, { type: 'undo' }, rng);
    expect(s.cells).toEqual(before.cells);
    expect(s.pencil).toEqual(before.pencil);
    expect(s.history).toHaveLength(before.history.length);
    expect(before.cells[empty]).toBe(5); // never mutated
  });

  it('counts mistakes only in check mode and legalMoves matches applyMove', () => {
    const rng = createRng(3);
    let s = started(3);
    const cell = s.cells.indexOf(0);
    const wrong = (s.solution[cell]! % 9) + 1;
    s = sudoku.applyMove(s, { type: 'set', cell, value: wrong }, rng);
    expect(s.mistakes).toBe(0);
    s = sudoku.applyMove(s, { type: 'toggle_check' }, rng);
    expect(s.checkMode).toBe(true);
    const other = s.cells.indexOf(0);
    s = sudoku.applyMove(s, { type: 'set', cell: other, value: (s.solution[other]! % 9) + 1 }, rng);
    expect(s.mistakes).toBe(1);

    const moves = sudoku.legalMoves(s);
    expect(moves.length).toBeLessThan(1600);
    expect(moves.some((m) => sudoku.sameMove(m, { type: 'set', cell, value: wrong }))).toBe(false);
    expect(moves.some((m) => sudoku.sameMove(m, { type: 'clear', cell }))).toBe(true);
    expect(moves.some((m) => sudoku.sameMove(m, { type: 'undo' }))).toBe(true);
    for (const m of moves) expect(() => sudoku.applyMove(s, m, rng)).not.toThrow();
  });

  it('hints fill a correct cell, prefer logic, and fix wrong digits', () => {
    const rng = createRng(4);
    let s = started(4);
    const hint = findHint(s)!;
    expect(hint.value).toBe(s.solution[hint.cell]);
    expect(['naked', 'hidden']).toContain(hint.reason); // easy puzzles always have a single
    s = sudoku.applyMove(s, { type: 'hint' }, rng);
    expect(s.cells[hint.cell]).toBe(hint.value);
    expect(s.hintsUsed).toBe(1);

    // Fill everything but one wrong cell: the hint must repair it.
    const full: SudokuState = { ...s, cells: s.solution.slice() };
    const target = full.givens.indexOf(0);
    full.cells[target] = (full.solution[target]! % 9) + 1;
    expect(findHint(full)).toEqual({ cell: target, value: full.solution[target], reason: 'fix' });
  });

  it('declares the winner when every cell matches and produces a summary', () => {
    const rng = createRng(6);
    let s = started(6, 'expert');
    const empties = s.cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    for (const cell of empties.slice(0, -1)) s = sudoku.applyMove(s, { type: 'set', cell, value: s.solution[cell]! }, rng);
    expect(s.winner).toBeNull();
    const last = empties[empties.length - 1]!;
    s = sudoku.applyMove(s, { type: 'set', cell: last, value: s.solution[last]! }, rng);
    expect(s.winner).toBe(0);
    expect(sudoku.isTerminal(s)).toBe(true);
    expect(sudoku.legalMoves(s)).toEqual([]);
    expect(s.history.length).toBeLessThanOrEqual(24);
    expect(sudoku.summary!(s)).toMatch(/^Solved an expert puzzle in \d+:\d\d$/);
    expect(sudoku.summary!({ ...s, hintsUsed: 1, difficulty: 'hard' })).toMatch(/^Solved a hard puzzle in \d+:\d\d with 1 hint$/);
    expect(() => sudoku.applyMove(s, { type: 'hint' }, rng)).toThrow(IllegalMoveError);
  });

  it('parseMove rejects garbage and accepts well-formed moves', () => {
    expect(sudoku.parseMove(null)).toBeNull();
    expect(sudoku.parseMove('hint')).toBeNull();
    expect(sudoku.parseMove({ type: 'set', cell: 81, value: 1 })).toBeNull();
    expect(sudoku.parseMove({ type: 'set', cell: 0, value: 0 })).toBeNull();
    expect(sudoku.parseMove({ type: 'set', cell: '3', value: 1 })).toBeNull();
    expect(sudoku.parseMove({ type: 'pencil', cell: 4.5, value: 2 })).toBeNull();
    expect(sudoku.parseMove({ type: 'start', difficulty: 'insane' })).toBeNull();
    expect(sudoku.parseMove({ type: 'explode' })).toBeNull();
    expect(sudoku.parseMove({ type: 'set', cell: 80, value: 9 })).toEqual({ type: 'set', cell: 80, value: 9 });
    expect(sudoku.parseMove({ type: 'clear', cell: 2 })).toEqual({ type: 'clear', cell: 2 });
    expect(sudoku.parseMove({ type: 'hint', extra: true })).toEqual({ type: 'hint' });
    expect(sudoku.parseMove({ type: 'start', difficulty: 'medium' })).toEqual({ type: 'start', difficulty: 'medium' });
    expect(BOX_OF[40]).toBe(4);
  });
});
