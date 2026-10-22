import type { AIDifficulty } from '../ai';
import type { GameId } from '../catalog';
import type { Rng } from '../rng';

/** Winner value for a drawn game. */
export const DRAW = -1;
/** Winner value when a single-player game is lost (no seat wins). */
export const LOST = -2;

/**
 * Optional search configuration for the generic alpha-beta AI in `ai/index.ts`.
 * Engines that have decisions (not pure dice games) provide this so the same
 * AI code drives them in the browser and inside the GameRoom Durable Object.
 */
export interface EngineAI<S, M> {
  /** Heuristic score of `state` from `seat`'s point of view; higher is better. */
  evaluate(state: S, seat: number): number;
  /** Search depth (plies) per difficulty. */
  depth: Record<AIDifficulty, number>;
  /** Move ordering for better alpha-beta pruning (best-first). */
  orderMoves?(state: S, moves: M[]): M[];
  /**
   * Wall-clock budget per move in ms. When set the search uses iterative
   * deepening up to `depth` and stops when the budget is spent.
   */
  timeBudgetMs?: number;
  /**
   * Heuristic chooser used instead of tree search (e.g. buy/trade decisions
   * in games with chance). Receives the difficulty so it can play weaker.
   */
  choose?(state: S, difficulty: AIDifficulty, rng: Rng): M;
}

/**
 * A pure, deterministic turn-based game. The same engine runs in the browser
 * (local / vs-AI play) and inside the GameRoom Durable Object (authoritative
 * online play), so client and server can never disagree on the rules.
 */
export interface GameEngine<S, M> {
  readonly id: GameId;
  /**
   * Co-operative / untimed games (e.g. the jigsaw puzzle): any seat may move
   * at any time and there is no turn timer. `currentPlayer` is then advisory.
   */
  readonly simultaneous?: boolean;
  init(playerCount: number, rng: Rng): S;
  currentPlayer(state: S): number;
  legalMoves(state: S): M[];
  /**
   * Returns a new state; never mutates the input. Throws on illegal moves.
   * `seat` is the verified mover (needed by simultaneous games for scoring).
   */
  applyMove(state: S, move: M, rng: Rng, seat?: number): S;
  isTerminal(state: S): boolean;
  /** Seat index of the winner, DRAW, LOST (single-player), or null while running. */
  winner(state: S): number | null;
  /** Structural validation of untrusted move payloads from the network. */
  parseMove(raw: unknown): M | null;
  /** Equality used to check a submitted move against legalMoves(). */
  sameMove(a: M, b: M): boolean;
  /** Present when the AI can play this game. */
  ai?: EngineAI<S, M>;
  /** One-line result for the game-over dialog, e.g. "The word was CRANE". */
  summary?(state: S): string | null;
}

export class IllegalMoveError extends Error {
  constructor(message = 'Illegal move') {
    super(message);
    this.name = 'IllegalMoveError';
  }
}
