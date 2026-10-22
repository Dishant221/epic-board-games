import type { GameId } from '../catalog';
import type { Rng } from '../rng';

/** Winner value for a drawn game. */
export const DRAW = -1;

/**
 * A pure, deterministic turn-based game. The same engine runs in the browser
 * (local / vs-AI play) and inside the GameRoom Durable Object (authoritative
 * online play), so client and server can never disagree on the rules.
 */
export interface GameEngine<S, M> {
  readonly id: GameId;
  init(playerCount: number, rng: Rng): S;
  currentPlayer(state: S): number;
  legalMoves(state: S): M[];
  /** Returns a new state; never mutates the input. Throws on illegal moves. */
  applyMove(state: S, move: M, rng: Rng): S;
  isTerminal(state: S): boolean;
  /** Seat index of the winner, DRAW, or null while the game is running. */
  winner(state: S): number | null;
  /** Structural validation of untrusted move payloads from the network. */
  parseMove(raw: unknown): M | null;
  /** Equality used to check a submitted move against legalMoves(). */
  sameMove(a: M, b: M): boolean;
}

export class IllegalMoveError extends Error {
  constructor(message = 'Illegal move') {
    super(message);
    this.name = 'IllegalMoveError';
  }
}
