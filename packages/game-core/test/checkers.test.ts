import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai';
import {
  checkers,
  CHECKERS_QUIET_LIMIT,
  isJump,
  makeCheckersState,
  type CheckersMove,
  type CheckersPiece,
  type CheckersState,
} from '../src/games/checkers';
import { DRAW, IllegalMoveError } from '../src/games/types';
import { createRng } from '../src/rng';

const rng = createRng(1);

/** Board with only the given pieces (square index → piece). */
function board(pieces: Record<number, CheckersPiece>): string {
  const cells = Array<string>(64).fill('.');
  for (const [sq, p] of Object.entries(pieces)) cells[Number(sq)] = p;
  return cells.join('');
}

const position = (pieces: Record<number, CheckersPiece>, turn: 0 | 1, overrides?: Partial<CheckersState>) =>
  makeCheckersState(board(pieces), turn, overrides);

const sorted = (moves: CheckersMove[]) => moves.map((m) => `${m.from}-${m.to}`).sort();

describe('checkers rules', () => {
  it('starts with 12 men each on dark squares and 7 legal moves for red', () => {
    const s = checkers.init(2, rng);
    expect(s.board).toHaveLength(64);
    expect((s.board.match(/r/g) ?? []).length).toBe(12);
    expect((s.board.match(/b/g) ?? []).length).toBe(12);
    expect(s.turn).toBe(0);
    expect(checkers.init(2, createRng(99))).toEqual(s); // deterministic
    const moves = checkers.legalMoves(s);
    expect(moves).toHaveLength(7);
    expect(sorted(moves)).toEqual(sorted([
      { from: 16, to: 25 }, { from: 18, to: 25 }, { from: 18, to: 27 }, { from: 20, to: 27 },
      { from: 20, to: 29 }, { from: 22, to: 29 }, { from: 22, to: 31 },
    ]));
  });

  it('hides quiet moves when a capture is available and forces a multi-jump to continue with the same piece', () => {
    // Red man on c3 (18) can jump d4 (27) and then f6 (45); the man on a1 has a quiet move that must be hidden.
    let s = position({ 18: 'r', 0: 'r', 27: 'b', 45: 'b', 63: 'b' }, 0);
    expect(checkers.legalMoves(s)).toEqual([{ from: 18, to: 36 }]);
    expect(() => checkers.applyMove(s, { from: 0, to: 9 }, rng)).toThrow(IllegalMoveError);

    s = checkers.applyMove(s, { from: 18, to: 36 }, rng);
    expect(s.turn).toBe(0);
    expect(s.mustContinueFrom).toBe(36);
    expect(s.lastCapture).toBe(27);
    expect(s.captured).toEqual([1, 0]);
    expect(s.board.charAt(27)).toBe('.');
    // Only the jumping piece may move, and only by jumping.
    expect(checkers.legalMoves(s)).toEqual([{ from: 36, to: 54 }]);
    expect(() => checkers.applyMove(s, { from: 0, to: 9 }, rng)).toThrow(IllegalMoveError);
    expect(() => checkers.applyMove(s, { from: 36, to: 43 }, rng)).toThrow(IllegalMoveError);

    s = checkers.applyMove(s, { from: 36, to: 54 }, rng);
    expect(s.turn).toBe(1);
    expect(s.mustContinueFrom).toBeNull();
    expect(s.captured).toEqual([2, 0]);
    expect(s.board.charAt(54)).toBe('r');
    expect(s.board.charAt(45)).toBe('.');
    expect(s.winner).toBeNull();
  });

  it('crowning ends the move even when the new king could jump again', () => {
    // d6 (43) jumps e7 (52) landing on f8 (61) and is crowned; a king there could jump g7 (54) → h6 (47).
    let s = position({ 43: 'r', 52: 'b', 54: 'b' }, 0);
    expect(checkers.legalMoves(s)).toEqual([{ from: 43, to: 61 }]);
    s = checkers.applyMove(s, { from: 43, to: 61 }, rng);
    expect(s.board.charAt(61)).toBe('R');
    expect(s.lastCrowned).toBe(true);
    expect(s.mustContinueFrom).toBeNull();
    expect(s.turn).toBe(1);
  });

  it('kings move and capture backwards; men do not', () => {
    const king = position({ 36: 'R', 63: 'b' }, 0);
    expect(sorted(checkers.legalMoves(king))).toEqual(sorted([
      { from: 36, to: 27 }, { from: 36, to: 29 }, { from: 36, to: 43 }, { from: 36, to: 45 },
    ]));
    const man = position({ 36: 'r', 63: 'b' }, 0);
    expect(sorted(checkers.legalMoves(man))).toEqual(sorted([{ from: 36, to: 43 }, { from: 36, to: 45 }]));
    // Black king on e5 captures the red man "behind" it on f6.
    const blackKing = position({ 36: 'B', 45: 'r', 0: 'r' }, 1);
    expect(checkers.legalMoves(blackKing)).toEqual([{ from: 36, to: 54 }]);
  });

  it('a player with no legal moves loses', () => {
    // Black plays a3 → b2, leaving red's a1 man blocked (b2 occupied, c3 occupied).
    let s = position({ 0: 'r', 18: 'b', 16: 'b' }, 1);
    s = checkers.applyMove(s, { from: 16, to: 9 }, rng);
    expect(s.winner).toBe(1);
    expect(checkers.isTerminal(s)).toBe(true);
    expect(checkers.legalMoves(s)).toEqual([]);
    expect(() => checkers.applyMove(s, { from: 0, to: 9 }, rng)).toThrow(IllegalMoveError);
    expect(checkers.summary!(s)).toBe('Won with 2 pieces left');
  });

  it('capturing the last enemy piece wins', () => {
    let s = position({ 18: 'r', 27: 'b' }, 0);
    s = checkers.applyMove(s, { from: 18, to: 36 }, rng);
    expect(s.winner).toBe(0);
    expect(checkers.summary!(s)).toBe('Won with 1 piece left');
  });

  it(`draws after ${CHECKERS_QUIET_LIMIT} quiet moves, and a man move resets the count`, () => {
    const kings = position({ 0: 'R', 63: 'B' }, 0, { quietMoves: CHECKERS_QUIET_LIMIT - 1 });
    const drawn = checkers.applyMove(kings, { from: 0, to: 9 }, rng);
    expect(drawn.winner).toBe(DRAW);
    expect(checkers.summary!(drawn)).toBe(`Draw — ${CHECKERS_QUIET_LIMIT} quiet moves`);

    const men = position({ 0: 'r', 63: 'B' }, 0, { quietMoves: CHECKERS_QUIET_LIMIT - 1 });
    const reset = checkers.applyMove(men, { from: 0, to: 9 }, rng);
    expect(reset.quietMoves).toBe(0);
    expect(reset.winner).toBeNull();
  });

  it('draws on threefold repetition', () => {
    let s = position({ 0: 'R', 63: 'B' }, 0);
    const cycle: CheckersMove[] = [{ from: 0, to: 9 }, { from: 63, to: 54 }, { from: 9, to: 0 }, { from: 54, to: 63 }];
    for (const m of cycle) s = checkers.applyMove(s, m, rng);
    expect(s.winner).toBeNull();
    for (const m of cycle.slice(0, 3)) s = checkers.applyMove(s, m, rng);
    expect(s.winner).toBeNull();
    s = checkers.applyMove(s, cycle[3]!, rng); // start position for the third time
    expect(s.winner).toBe(DRAW);
    expect(checkers.summary!(s)).toBe('Draw — threefold repetition');
  });

  it('parseMove rejects garbage and accepts well-formed diagonal moves', () => {
    for (const bad of [null, undefined, 42, 'a1-b2', {}, { from: 0 }, { from: '0', to: 9 }, { from: 0, to: 64 }, { from: -1, to: 9 },
      { from: 0.5, to: 9 }, { from: 0, to: 0 }, { from: 0, to: 1 }, { from: 1, to: 10 }, { from: 0, to: 27 }, { from: 0, to: 16 }]) {
      expect(checkers.parseMove(bad)).toBeNull();
    }
    expect(checkers.parseMove({ from: 0, to: 9 })).toEqual({ from: 0, to: 9 });
    expect(checkers.parseMove({ from: 18, to: 36, extra: true })).toEqual({ from: 18, to: 36 });
    expect(checkers.sameMove({ from: 1, to: 2 }, { from: 1, to: 2 })).toBe(true);
    expect(checkers.sameMove({ from: 1, to: 2 }, { from: 2, to: 1 })).toBe(false);
  });

  it('keeps state as compact plain JSON', () => {
    const s = checkers.init(2, rng);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(JSON.stringify(s).length).toBeLessThan(1000);
  });
});

describe('checkers AI', () => {
  it('impossible AI picks the capture that wins by multi-jump', () => {
    // 18→36 continues 36→54 and clears the board; 38→52 lets black recapture.
    const s = position({ 18: 'r', 38: 'r', 27: 'b', 45: 'b' }, 0);
    expect(sorted(checkers.legalMoves(s))).toEqual(sorted([{ from: 18, to: 36 }, { from: 38, to: 52 }]));
    expect(chooseMove(checkers, s, 'impossible', createRng(3))).toEqual({ from: 18, to: 36 });
  });

  it('impossible AI avoids stepping into a capture', () => {
    // d4 → e5 would be jumped by f6; d4 → c5 is safe.
    const s = position({ 27: 'r', 45: 'b', 63: 'b' }, 0);
    expect(sorted(checkers.legalMoves(s))).toEqual(sorted([{ from: 27, to: 34 }, { from: 27, to: 36 }]));
    expect(chooseMove(checkers, s, 'impossible', createRng(3))).toEqual({ from: 27, to: 34 });
  });

  it('never returns an illegal move over 50 random games', () => {
    for (let game = 0; game < 50; game++) {
      const r = createRng(1000 + game);
      let s = checkers.init(2, r);
      for (let ply = 0; ply < 300 && !checkers.isTerminal(s); ply++) {
        const legal = checkers.legalMoves(s);
        expect(legal.length).toBeGreaterThan(0);
        if (legal.some(isJump)) expect(legal.every(isJump)).toBe(true);
        const move = chooseMove(checkers, s, 'medium', r);
        expect(legal.some((m) => checkers.sameMove(m, move))).toBe(true);
        s = checkers.applyMove(s, move, r);
        expect(s.board).toHaveLength(64);
        expect(s.captured[0] + s.captured[1]).toBe(24 - (s.board.match(/[rRbB]/g) ?? []).length);
      }
    }
  }, 60_000);
});
