import { describe, expect, it } from 'vitest';
import {
  applyRoll,
  BOARD_SIZE,
  chooseMove,
  connect4,
  createRng,
  DRAW,
  IllegalMoveError,
  snakesLadders,
  squareToGrid,
  ticTacToe,
  type AIDifficulty,
  type TicTacToeState,
} from '../src';

describe('tic tac toe', () => {
  it('detects a row win', () => {
    const rng = createRng(1);
    let s = ticTacToe.init(2, rng);
    for (const cell of [0, 3, 1, 4, 2]) s = ticTacToe.applyMove(s, { cell }, rng);
    expect(s.winner).toBe(0);
    expect(s.winLine).toEqual([0, 1, 2]);
    expect(ticTacToe.legalMoves(s)).toEqual([]);
  });

  it('rejects occupied cells and out-of-range input', () => {
    const rng = createRng(1);
    const s = ticTacToe.applyMove(ticTacToe.init(2, rng), { cell: 4 }, rng);
    expect(() => ticTacToe.applyMove(s, { cell: 4 }, rng)).toThrow(IllegalMoveError);
    expect(ticTacToe.parseMove({ cell: 9 })).toBeNull();
    expect(ticTacToe.parseMove({ cell: '1' })).toBeNull();
    expect(ticTacToe.parseMove({ cell: 2 })).toEqual({ cell: 2 });
  });

  it('impossible AI never loses against any sequence of replies', () => {
    const rng = createRng(42);
    // Exhaustively explore every human reply with the AI as O (seat 1) and as X (seat 0).
    const explore = (s: TicTacToeState, aiSeat: number): void => {
      if (ticTacToe.isTerminal(s)) {
        expect(s.winner === DRAW || s.winner === aiSeat).toBe(true);
        return;
      }
      if (s.turn === aiSeat) {
        explore(ticTacToe.applyMove(s, chooseMove(ticTacToe, s, 'impossible', rng), rng), aiSeat);
      } else {
        for (const m of ticTacToe.legalMoves(s)) explore(ticTacToe.applyMove(s, m, rng), aiSeat);
      }
    };
    explore(ticTacToe.init(2, rng), 1);
    explore(ticTacToe.init(2, rng), 0);
  });
});

describe('connect 4', () => {
  it('stacks discs and detects a vertical win', () => {
    const rng = createRng(1);
    let s = connect4.init(2, rng);
    for (const col of [0, 1, 0, 1, 0, 1, 0]) s = connect4.applyMove(s, { col }, rng);
    expect(s.winner).toBe(0);
    expect(s.winCells).toHaveLength(4);
  });

  it('rejects full columns', () => {
    const rng = createRng(1);
    let s = connect4.init(2, rng);
    for (let i = 0; i < 6; i++) s = connect4.applyMove(s, { col: 2 }, rng);
    expect(connect4.legalMoves(s).some((m) => m.col === 2)).toBe(false);
    expect(() => connect4.applyMove(s, { col: 2 }, rng)).toThrow(IllegalMoveError);
  });

  // Hard keeps a 10% mistake rate, so only Impossible is deterministic.
  it('impossible AI takes a win and blocks a loss', () => {
    const difficulty: AIDifficulty = 'impossible';
    const rng = createRng(7);
    // X has three in column 0; O (to move) can win in column 1.
    let s = connect4.init(2, rng);
    for (const col of [0, 1, 0, 1, 0, 1, 5]) s = connect4.applyMove(s, { col }, rng);
    expect(s.turn).toBe(1);
    expect(chooseMove(connect4, s, difficulty, rng)).toEqual({ col: 1 });

    // X has 0,1,2 on the bottom row; O must block column 3.
    let b = connect4.init(2, rng);
    for (const col of [0, 6, 1, 6, 2]) b = connect4.applyMove(b, { col }, rng);
    expect(chooseMove(connect4, b, difficulty, rng)).toEqual({ col: 3 });
  });
});

describe('snakes & ladders', () => {
  const start = () => snakesLadders.init(2, createRng(1));

  it('climbs ladders and slides down snakes', () => {
    let s = applyRoll(start(), 4); // 0 → 4 ladder → 25
    expect(s.positions[0]).toBe(25);
    expect(s.lastEvent?.jump?.kind).toBe('ladder');
    s = applyRoll({ ...s, positions: [0, 23], turn: 1 }, 4); // 23 → 27 snake → 5
    expect(s.positions[1]).toBe(5);
    expect(s.lastEvent?.jump?.kind).toBe('snake');
  });

  it('requires an exact roll to finish', () => {
    const s = applyRoll({ ...start(), positions: [97, 0] }, 5);
    expect(s.positions[0]).toBe(97);
    expect(s.lastEvent?.bounced).toBe(true);
    const won = applyRoll({ ...start(), positions: [97, 0] }, 3);
    expect(won.positions[0]).toBe(BOARD_SIZE);
    expect(won.winner).toBe(0);
    expect(snakesLadders.legalMoves(won)).toEqual([]);
  });

  it('gives an extra turn on 6 and forfeits on three 6s', () => {
    let s = applyRoll({ ...start(), positions: [10, 0] }, 6);
    expect(s.turn).toBe(0);
    s = applyRoll(s, 6);
    expect(s.turn).toBe(0);
    const pos = s.positions[0];
    s = applyRoll(s, 6);
    expect(s.lastEvent?.forfeited).toBe(true);
    expect(s.positions[0]).toBe(pos);
    expect(s.turn).toBe(1);
  });

  it('maps squares onto a boustrophedon grid', () => {
    expect(squareToGrid(1)).toEqual({ row: 0, col: 0 });
    expect(squareToGrid(10)).toEqual({ row: 0, col: 9 });
    expect(squareToGrid(11)).toEqual({ row: 1, col: 9 });
    expect(squareToGrid(100)).toEqual({ row: 9, col: 0 });
  });

  it('plays a full random game to completion', () => {
    const rng = createRng(123);
    let s = snakesLadders.init(4, rng);
    let guard = 0;
    while (!snakesLadders.isTerminal(s) && guard++ < 10_000) s = snakesLadders.applyMove(s, { type: 'roll' }, rng);
    expect(s.winner).not.toBeNull();
  });
});
