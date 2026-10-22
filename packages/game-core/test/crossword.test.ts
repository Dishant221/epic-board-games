import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { IllegalMoveError } from '../src/games/types';
import { cellsOfWord, crossword, CROSSWORD_PUZZLES, solutionAt, wordsOf, type CrosswordState } from '../src/games/crossword';

const rng = createRng(7);
const first = CROSSWORD_PUZZLES[0]!;

function started(puzzleId = first.id): CrosswordState {
  return crossword.applyMove(crossword.init(1, rng), { type: 'start', puzzleId }, rng);
}

describe('crossword data', () => {
  it('ships at least 8 themed puzzles with distinct ids and colours', () => {
    expect(CROSSWORD_PUZZLES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(CROSSWORD_PUZZLES.map((p) => p.id)).size).toBe(CROSSWORD_PUZZLES.length);
    expect(new Set(CROSSWORD_PUZZLES.map((p) => p.colors.bg)).size).toBe(CROSSWORD_PUZZLES.length);
    for (const p of CROSSWORD_PUZZLES) {
      expect(p.size).toBeGreaterThanOrEqual(9);
      expect(p.size).toBeLessThanOrEqual(11);
      for (const c of [p.colors.bg, p.colors.accent, p.colors.cell]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('grids are square with only A–Z and # characters', () => {
    for (const p of CROSSWORD_PUZZLES) {
      expect(p.grid).toHaveLength(p.size);
      for (const row of p.grid) {
        expect(row).toHaveLength(p.size);
        expect(row).toMatch(/^[A-Z#]+$/);
      }
    }
  });

  it('every derived entry is ≥ 3 letters and has exactly one clue; no extra clues', () => {
    for (const p of CROSSWORD_PUZZLES) {
      const words = wordsOf(p);
      expect(words.length).toBeGreaterThanOrEqual(14);
      expect(words.length).toBeLessThanOrEqual(24);
      const across = new Set<number>();
      const down = new Set<number>();
      for (const w of words) {
        expect(w.answer.length, `${p.id} ${w.number} ${w.dir}`).toBeGreaterThanOrEqual(3);
        expect(w.answer).toMatch(/^[A-Z]+$/);
        expect(w.clue, `${p.id} missing clue ${w.number} ${w.dir}`).not.toBe('');
        (w.dir === 'across' ? across : down).add(w.number);
      }
      // No clue without an entry.
      for (const n of Object.keys(p.clues.across)) expect(across.has(Number(n)), `${p.id} extra across ${n}`).toBe(true);
      for (const n of Object.keys(p.clues.down)) expect(down.has(Number(n)), `${p.id} extra down ${n}`).toBe(true);
      // No 2-letter runs hide anywhere: every letter cell belongs to at least one entry.
      const covered = new Set(words.flatMap((w) => w.cells));
      p.grid.join('').split('').forEach((ch, i) => {
        if (ch !== '#') expect(covered.has(i), `${p.id} orphan cell ${i}`).toBe(true);
      });
    }
  });

  it('numbers increase in reading order and cellsOfWord matches wordsOf', () => {
    for (const p of CROSSWORD_PUZZLES) {
      const words = wordsOf(p);
      for (let i = 1; i < words.length; i++) expect(words[i]!.number).toBeGreaterThanOrEqual(words[i - 1]!.number);
      for (const w of words) expect(cellsOfWord(p, w.index)).toEqual(w.cells);
    }
  });
});

describe('crossword engine', () => {
  it('starts in pick phase offering every puzzle', () => {
    const s = crossword.init(1, rng);
    expect(s.phase).toBe('pick');
    expect(crossword.legalMoves(s)).toEqual(CROSSWORD_PUZZLES.map((p) => ({ type: 'start', puzzleId: p.id })));
    expect(() => crossword.applyMove(s, { type: 'start', puzzleId: 'nope' }, rng)).toThrow(IllegalMoveError);
    expect(() => crossword.applyMove(s, { type: 'toggle_check' }, rng)).toThrow(IllegalMoveError);
  });

  it('start lays out blocks and empty cells', () => {
    const s = started();
    expect(s.phase).toBe('play');
    expect(s.cells).toHaveLength(first.size * first.size);
    s.cells.forEach((ch, i) => expect(ch).toBe(solutionAt(first, i) === '#' ? '#' : ''));
    expect(s.startedAt).not.toBeNull();
    expect(crossword.winner(s)).toBeNull();
  });

  it('set / clear respect blocks, revealed cells and the letter format', () => {
    let s = started();
    const block = s.cells.indexOf('#');
    const open = s.cells.indexOf('');
    expect(crossword.validateMove!(s, { type: 'set', cell: open, letter: 'Q' })).toBe(true);
    expect(crossword.validateMove!(s, { type: 'set', cell: block, letter: 'Q' })).toBe(false);
    expect(crossword.validateMove!(s, { type: 'set', cell: open, letter: 'q' })).toBe(false);
    expect(crossword.validateMove!(s, { type: 'set', cell: open, letter: 'QQ' })).toBe(false);
    expect(() => crossword.applyMove(s, { type: 'set', cell: block, letter: 'Q' }, rng)).toThrow(IllegalMoveError);
    s = crossword.applyMove(s, { type: 'set', cell: open, letter: 'Q' }, rng);
    expect(s.cells[open]).toBe('Q');
    expect(crossword.legalMoves(s)).toContainEqual({ type: 'clear', cell: open });
    s = crossword.applyMove(s, { type: 'clear', cell: open }, rng);
    expect(s.cells[open]).toBe('');
    s = crossword.applyMove(s, { type: 'reveal_letter', cell: open }, rng);
    expect(s.revealed[open]).toBe(true);
    expect(s.hintsUsed).toBe(1);
    expect(crossword.validateMove!(s, { type: 'set', cell: open, letter: 'Q' })).toBe(false);
    expect(() => crossword.applyMove(s, { type: 'clear', cell: open }, rng)).toThrow(IllegalMoveError);
    expect(() => crossword.applyMove(s, { type: 'reveal_letter', cell: open }, rng)).toThrow(IllegalMoveError);
  });

  it('reveal_word fills the whole word and counts one hint', () => {
    let s = started();
    const w = wordsOf(first)[0]!;
    s = crossword.applyMove(s, { type: 'reveal_word', word: w.index }, rng);
    for (const c of w.cells) {
      expect(s.cells[c]).toBe(solutionAt(first, c));
      expect(s.revealed[c]).toBe(true);
    }
    expect(s.hintsUsed).toBe(1);
    expect(crossword.legalMoves(s)).not.toContainEqual({ type: 'reveal_word', word: w.index });
    expect(() => crossword.applyMove(s, { type: 'reveal_word', word: w.index }, rng)).toThrow(IllegalMoveError);
    expect(() => crossword.applyMove(s, { type: 'reveal_word', word: 999 }, rng)).toThrow(IllegalMoveError);
  });

  it('toggle_check flips check mode', () => {
    let s = started();
    s = crossword.applyMove(s, { type: 'toggle_check' }, rng);
    expect(s.checked).toBe(true);
    s = crossword.applyMove(s, { type: 'toggle_check' }, rng);
    expect(s.checked).toBe(false);
  });

  it('wins when every cell matches; wrong letters do not win', () => {
    let s = started();
    const open = s.cells.indexOf('');
    const wrong = solutionAt(first, open) === 'Z' ? 'A' : 'Z';
    s.cells.forEach((ch, i) => {
      if (ch !== '#') s = crossword.applyMove(s, { type: 'set', cell: i, letter: i === open ? wrong : solutionAt(first, i) }, rng);
    });
    expect(crossword.winner(s)).toBeNull();
    s = crossword.applyMove(s, { type: 'set', cell: open, letter: solutionAt(first, open) }, rng);
    expect(crossword.winner(s)).toBe(0);
    expect(crossword.isTerminal(s)).toBe(true);
    expect(crossword.legalMoves(s)).toEqual([]);
    expect(crossword.summary!(s)).toMatch(/^Solved “Animal Kingdom” in \d+:\d\d with no hints$/);
    expect(() => crossword.applyMove(s, { type: 'toggle_check' }, rng)).toThrow(IllegalMoveError);
  });

  it('a reveal can finish the puzzle', () => {
    let s = started();
    for (const w of wordsOf(first)) if (w.cells.some((c) => !s.revealed[c])) s = crossword.applyMove(s, { type: 'reveal_word', word: w.index }, rng);
    expect(crossword.winner(s)).toBe(0);
    expect(crossword.summary!(s)).toContain('hints');
  });

  it('parseMove rejects garbage', () => {
    expect(crossword.parseMove(null)).toBeNull();
    expect(crossword.parseMove('set')).toBeNull();
    expect(crossword.parseMove({ type: 'nope' })).toBeNull();
    expect(crossword.parseMove({ type: 'set', cell: 1.5, letter: 'A' })).toBeNull();
    expect(crossword.parseMove({ type: 'set', cell: -1, letter: 'A' })).toBeNull();
    expect(crossword.parseMove({ type: 'set', cell: 3, letter: 'ab' })).toBeNull();
    expect(crossword.parseMove({ type: 'set', cell: 3, letter: 'a' })).toBeNull();
    expect(crossword.parseMove({ type: 'set', cell: 3, letter: 'A' })).toEqual({ type: 'set', cell: 3, letter: 'A' });
    expect(crossword.parseMove({ type: 'clear', cell: '3' })).toBeNull();
    expect(crossword.parseMove({ type: 'reveal_word', word: -2 })).toBeNull();
    expect(crossword.parseMove({ type: 'reveal_word', word: 4 })).toEqual({ type: 'reveal_word', word: 4 });
    expect(crossword.parseMove({ type: 'start', puzzleId: 42 })).toBeNull();
    expect(crossword.parseMove({ type: 'start', puzzleId: 'animals' })).toEqual({ type: 'start', puzzleId: 'animals' });
    expect(crossword.parseMove({ type: 'toggle_check', junk: 1 })).toEqual({ type: 'toggle_check' });
  });

  it('state stays plain JSON', () => {
    const s = crossword.applyMove(started(), { type: 'set', cell: started().cells.indexOf(''), letter: 'A' }, rng);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(JSON.stringify(s).length).toBeLessThan(30_000);
  });
});
