import type { GameId } from '../catalog';
import { checkers } from './checkers';
import { chess } from './chess';
import { connect4 } from './connect4';
import { crossword } from './crossword';
import { epicBusiness } from './epic-business';
import { mahjong } from './mahjong';
import { snakesLadders } from './snakes-ladders';
import { sudoku } from './sudoku';
import { ticTacToe } from './tic-tac-toe';
import type { GameEngine } from './types';
import { wordPuzzle } from './word-puzzle';

export * from './types';
export * from './connect4';
export * from './snakes-ladders';
export * from './tic-tac-toe';
// The larger engines share helper names (squareName, …), so they are exported
// by name here; boards import their full module via `@ebg/game-core/games/<name>`.
export { chess, type ChessState, type ChessMove } from './chess';
export { checkers, type CheckersState, type CheckersMove } from './checkers';
export { epicBusiness, type EpicBusinessState, type EpicBusinessMove } from './epic-business';
export { sudoku, type SudokuState, type SudokuMove } from './sudoku';
export { wordPuzzle, type WordPuzzleState, type WordPuzzleMove } from './word-puzzle';
export { crossword, type CrosswordState, type CrosswordMove } from './crossword';
export { mahjong, type MahjongState, type MahjongMove } from './mahjong';

// Engines with complete rules. Games missing here are "coming soon" and the
// server refuses to open rooms for them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ENGINES: Partial<Record<GameId, GameEngine<any, any>>> = {
  tic_tac_toe: ticTacToe,
  connect4,
  snakes_ladders: snakesLadders,
  chess,
  checkers,
  epic_business: epicBusiness,
  sudoku,
  word_puzzle: wordPuzzle,
  crossword,
  mahjong,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEngine(id: GameId): GameEngine<any, any> | undefined {
  return ENGINES[id];
}

/** True if `move` may be applied to `state` (uses validateMove when the engine has one). */
export function isLegalMove<S, M>(engine: GameEngine<S, M>, state: S, move: M): boolean {
  if (engine.validateMove) return engine.validateMove(state, move);
  return engine.legalMoves(state).some((m) => engine.sameMove(m, move));
}
