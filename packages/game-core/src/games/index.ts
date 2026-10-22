import type { GameId } from '../catalog';
import { connect4 } from './connect4';
import { snakesLadders } from './snakes-ladders';
import { ticTacToe } from './tic-tac-toe';
import type { GameEngine } from './types';

export * from './types';
export * from './connect4';
export * from './snakes-ladders';
export * from './tic-tac-toe';

// Engines with complete rules. Games missing here are "coming soon" and the
// server refuses to open rooms for them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ENGINES: Partial<Record<GameId, GameEngine<any, any>>> = {
  tic_tac_toe: ticTacToe,
  connect4,
  snakes_ladders: snakesLadders,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEngine(id: GameId): GameEngine<any, any> | undefined {
  return ENGINES[id];
}
