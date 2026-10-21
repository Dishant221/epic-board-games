import type { GameId } from '../catalog';
import { connect4, evaluateConnect4, type Connect4Move, type Connect4State } from '../games/connect4';
import { ticTacToe, type TicTacToeState } from '../games/tic-tac-toe';
import { DRAW, type GameEngine } from '../games/types';
import type { Rng } from '../rng';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';
export const AI_DIFFICULTIES: readonly AIDifficulty[] = ['easy', 'medium', 'hard', 'impossible'];

export interface AIPersona {
  id: 'buddy' | 'nova' | 'titan' | 'oracle';
  name: string;
  emoji: string;
  difficulty: AIDifficulty;
  blurb: string;
  /** Fake "thinking" delay for UX, in ms. */
  thinkDelayMs: number;
  /** Probability of deliberately playing a random legal move. */
  mistakeRate: number;
}

// Mirrors AIPlayer::new in rust-game-engine/src/ai/mod.rs — keep in sync.
export const AI_PERSONAS: Record<AIDifficulty, AIPersona> = {
  easy: { id: 'buddy', name: 'Buddy', emoji: '🐶', difficulty: 'easy', blurb: 'Friendly, casual moves', thinkDelayMs: 500, mistakeRate: 0.7 },
  medium: { id: 'nova', name: 'Nova', emoji: '🤖', difficulty: 'medium', blurb: 'Calculated moves', thinkDelayMs: 1000, mistakeRate: 0.4 },
  hard: { id: 'titan', name: 'Titan', emoji: '👹', difficulty: 'hard', blurb: 'Aggressive and sharp', thinkDelayMs: 1500, mistakeRate: 0.1 },
  impossible: { id: 'oracle', name: 'Oracle', emoji: '🔮', difficulty: 'impossible', blurb: 'Perfect play. Good luck.', thinkDelayMs: 2000, mistakeRate: 0 },
};

export function isDifficulty(v: unknown): v is AIDifficulty {
  return typeof v === 'string' && (AI_DIFFICULTIES as readonly string[]).includes(v);
}

/** Search depth (plies) per game and difficulty. */
const DEPTH: Partial<Record<GameId, Record<AIDifficulty, number>>> = {
  tic_tac_toe: { easy: 1, medium: 2, hard: 9, impossible: 9 },
  connect4: { easy: 1, medium: 3, hard: 6, impossible: 8 },
};

/**
 * Generic negamax with alpha-beta pruning for two-player, zero-sum,
 * deterministic games. `evaluate` scores a state from `seat`'s perspective.
 */
export function negamax<S, M>(
  engine: GameEngine<S, M>,
  state: S,
  depth: number,
  evaluate: (s: S, seat: number) => number,
  rng: Rng,
  alpha = -Infinity,
  beta = Infinity,
  orderMoves?: (moves: M[]) => M[],
): { score: number; move: M | null } {
  const seat = engine.currentPlayer(state);
  if (depth === 0 || engine.isTerminal(state)) return { score: evaluate(state, seat), move: null };

  let moves = engine.legalMoves(state);
  if (orderMoves) moves = orderMoves(moves);
  let best: { score: number; move: M | null } = { score: -Infinity, move: null };
  for (const move of moves) {
    const child = engine.applyMove(state, move, rng);
    const score = -negamax(engine, child, depth - 1, evaluate, rng, -beta, -alpha, orderMoves).score;
    if (score > best.score) best = { score, move };
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}

function evaluateTicTacToe(s: TicTacToeState, seat: number): number {
  if (s.winner === null || s.winner === DRAW) return 0;
  // Prefer faster wins and slower losses.
  return s.winner === seat ? 10 - s.moves : s.moves - 10;
}

const centreFirst = (moves: Connect4Move[]) =>
  moves.slice().sort((a, b) => Math.abs(a.col - 3) - Math.abs(b.col - 3));

/**
 * Pick a move for the AI. Every difficulty first rolls against its mistake
 * rate; a "mistake" is a uniformly random legal move. Otherwise it searches.
 */
export function chooseMove<S, M>(engine: GameEngine<S, M>, state: S, difficulty: AIDifficulty, rng: Rng): M {
  const moves = engine.legalMoves(state);
  if (moves.length === 0) throw new Error('AI asked to move in a finished game');
  if (moves.length === 1) return moves[0]!;
  if (rng.next() < AI_PERSONAS[difficulty].mistakeRate) return rng.pick(moves);

  const depth = DEPTH[engine.id]?.[difficulty] ?? 1;
  switch (engine.id) {
    case 'tic_tac_toe': {
      const res = negamax(ticTacToe, state as unknown as TicTacToeState, depth, evaluateTicTacToe, rng);
      return (res.move as M | null) ?? rng.pick(moves);
    }
    case 'connect4': {
      const res = negamax(
        connect4,
        state as unknown as Connect4State,
        depth,
        evaluateConnect4,
        rng,
        -Infinity,
        Infinity,
        centreFirst,
      );
      return (res.move as M | null) ?? rng.pick(moves);
    }
    default:
      // Dice games (Snakes & Ladders) have no decisions beyond "roll".
      return rng.pick(moves);
  }
}
