import type { Rng } from '../rng';
import { IllegalMoveError, type GameEngine } from './types';

export const BOARD_SIZE = 100;

export type JumpKind = 'ladder' | 'snake' | 'croc' | 'dragon';

export interface Jump {
  from: number;
  to: number;
  kind: JumpKind;
}

/** Start → end lookup. Ladders go up; snakes, crocs and the dragon go down. */
export const JUMPS: readonly Jump[] = [
  { from: 4, to: 25, kind: 'ladder' },
  { from: 13, to: 46, kind: 'ladder' },
  { from: 33, to: 49, kind: 'ladder' },
  { from: 42, to: 63, kind: 'ladder' },
  { from: 50, to: 69, kind: 'ladder' },
  { from: 62, to: 81, kind: 'ladder' },
  { from: 74, to: 92, kind: 'ladder' },
  { from: 27, to: 5, kind: 'snake' },
  { from: 40, to: 3, kind: 'snake' },
  { from: 54, to: 31, kind: 'croc' },
  { from: 66, to: 45, kind: 'snake' },
  { from: 76, to: 58, kind: 'croc' },
  { from: 89, to: 53, kind: 'snake' },
  { from: 99, to: 41, kind: 'dragon' },
];

const JUMP_BY_FROM = new Map(JUMPS.map((j) => [j.from, j]));

export interface SnakesLaddersEvent {
  seat: number;
  roll: number;
  from: number;
  /** Square reached by walking, before any jump. */
  landed: number;
  /** Final square after jump (equals landed if no jump). */
  to: number;
  jump: Jump | null;
  bounced: boolean;
  forfeited: boolean;
  extraTurn: boolean;
}

export interface SnakesLaddersState {
  /** 0 = waiting at start, 1..100 on board. */
  positions: number[];
  turn: number;
  sixStreak: number;
  winner: number | null;
  lastEvent: SnakesLaddersEvent | null;
  turnCount: number;
}

export type SnakesLaddersMove = { type: 'roll' };

export const snakesLadders: GameEngine<SnakesLaddersState, SnakesLaddersMove> = {
  id: 'snakes_ladders',
  init(playerCount) {
    if (playerCount < 1 || playerCount > 4) throw new Error('Snakes & Ladders supports 1–4 players');
    return {
      positions: Array<number>(playerCount).fill(0),
      turn: 0,
      sixStreak: 0,
      winner: null,
      lastEvent: null,
      turnCount: 0,
    };
  },
  currentPlayer: (s) => s.turn,
  legalMoves: (s) => (s.winner === null ? [{ type: 'roll' }] : []),
  applyMove(s, m, rng: Rng) {
    if (s.winner !== null || m.type !== 'roll') throw new IllegalMoveError();
    return applyRoll(s, rng.int(1, 6));
  },
  isTerminal: (s) => s.winner !== null,
  winner: (s) => s.winner,
  parseMove: (raw) => ((raw as { type?: unknown } | null)?.type === 'roll' ? { type: 'roll' } : null),
  sameMove: () => true,
};

/** Exposed separately so tests (and the Wasm parity tests) can force a roll. */
export function applyRoll(s: SnakesLaddersState, roll: number): SnakesLaddersState {
  const seat = s.turn;
  const from = s.positions[seat]!;
  const sixStreak = roll === 6 ? s.sixStreak + 1 : 0;
  const nextSeat = (seat + 1) % s.positions.length;

  // Three sixes in a row: the turn is forfeited and play passes on.
  if (sixStreak === 3) {
    return {
      ...s,
      turn: nextSeat,
      sixStreak: 0,
      turnCount: s.turnCount + 1,
      lastEvent: { seat, roll, from, landed: from, to: from, jump: null, bounced: false, forfeited: true, extraTurn: false },
    };
  }

  const target = from + roll;
  const bounced = target > BOARD_SIZE;
  const landed = bounced ? from : target;
  const jump = bounced ? null : JUMP_BY_FROM.get(landed) ?? null;
  const to = jump ? jump.to : landed;

  const positions = s.positions.slice();
  positions[seat] = to;
  const won = to === BOARD_SIZE;
  const extraTurn = roll === 6 && !won;

  return {
    positions,
    turn: extraTurn || won ? seat : nextSeat,
    sixStreak: extraTurn ? sixStreak : 0,
    winner: won ? seat : null,
    turnCount: s.turnCount + 1,
    lastEvent: { seat, roll, from, landed, to, jump, bounced, forfeited: false, extraTurn },
  };
}

/** Board square (1..100) → grid coordinates, boustrophedon from bottom-left. */
export function squareToGrid(square: number): { row: number; col: number } {
  const idx = Math.max(1, Math.min(BOARD_SIZE, square)) - 1;
  const row = Math.floor(idx / 10);
  const offset = idx % 10;
  return { row, col: row % 2 === 0 ? offset : 9 - offset };
}
