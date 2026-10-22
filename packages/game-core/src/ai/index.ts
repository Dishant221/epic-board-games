import type { GameEngine } from '../games/types';
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

/** Thrown inside the search when the time budget is exhausted. */
class OutOfTime extends Error {}

/**
 * Generic negamax with alpha-beta pruning for two-player, zero-sum,
 * deterministic games. `evaluate` scores a state from `seat`'s perspective.
 * `deadline` (performance.now() based) aborts the search via OutOfTime.
 */
export function negamax<S, M>(
  engine: GameEngine<S, M>,
  state: S,
  depth: number,
  evaluate: (s: S, seat: number) => number,
  rng: Rng,
  alpha = -Infinity,
  beta = Infinity,
  orderMoves?: (state: S, moves: M[]) => M[],
  deadline = Infinity,
  nodes = { count: 0 },
): { score: number; move: M | null } {
  const seat = engine.currentPlayer(state);
  if (depth === 0 || engine.isTerminal(state)) return { score: evaluate(state, seat), move: null };
  if ((++nodes.count & 1023) === 0 && now() > deadline) throw new OutOfTime();

  let moves = engine.legalMoves(state);
  if (moves.length === 0) return { score: evaluate(state, seat), move: null };
  if (orderMoves) moves = orderMoves(state, moves);
  let best: { score: number; move: M | null } = { score: -Infinity, move: null };
  for (const move of moves) {
    const child = engine.applyMove(state, move, rng, seat);
    // Games where a player moves again (e.g. multi-captures) keep the sign.
    const sameMover = engine.currentPlayer(child) === seat && !engine.isTerminal(child);
    const res = negamax(engine, child, depth - 1, evaluate, rng, sameMover ? alpha : -beta, sameMover ? beta : -alpha, orderMoves, deadline, nodes);
    const score = sameMover ? res.score : -res.score;
    if (score > best.score) best = { score, move };
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Pick a move for the AI. Every difficulty first rolls against its mistake
 * rate; a "mistake" is a uniformly random legal move. Otherwise it uses the
 * engine's heuristic chooser, or searches with iterative deepening inside the
 * engine's time budget.
 */
export function chooseMove<S, M>(engine: GameEngine<S, M>, state: S, difficulty: AIDifficulty, rng: Rng): M {
  const moves = engine.legalMoves(state);
  if (moves.length === 0) throw new Error('AI asked to move in a finished game');
  if (moves.length === 1) return moves[0]!;
  if (rng.next() < AI_PERSONAS[difficulty].mistakeRate) return rng.pick(moves);

  const ai = engine.ai;
  // Dice games (Snakes & Ladders) have no decisions beyond "roll".
  if (!ai) return rng.pick(moves);
  if (ai.choose) return ai.choose(state, difficulty, rng);

  const maxDepth = ai.depth[difficulty] ?? 1;
  const budget = ai.timeBudgetMs;
  const deadline = budget ? now() + budget : Infinity;
  let best: M | null = null;
  // Iterative deepening: always keep the best move from the last completed depth.
  for (let depth = budget ? 1 : maxDepth; depth <= maxDepth; depth++) {
    try {
      const res = negamax(engine, state, depth, ai.evaluate, rng, -Infinity, Infinity, ai.orderMoves, deadline);
      if (res.move !== null) best = res.move;
      // A forced win/loss found: deeper search cannot change the verdict.
      if (Math.abs(res.score) >= 900_000) break;
    } catch (err) {
      if (err instanceof OutOfTime) break;
      throw err;
    }
  }
  return best ?? rng.pick(moves);
}
