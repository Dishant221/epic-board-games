import { DRAW, IllegalMoveError, type GameEngine } from './types';

export type Cell = 0 | 1 | null; // seat 0 = X, seat 1 = O

export interface TicTacToeState {
  board: Cell[];
  turn: 0 | 1;
  winner: number | null;
  winLine: number[] | null;
  moves: number;
}

export interface TicTacToeMove {
  cell: number;
}

export const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

function findWin(board: Cell[]): { winner: 0 | 1; line: number[] } | null {
  for (const line of TTT_LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v != null && v === board[b] && v === board[c]) return { winner: v, line: [...line] };
  }
  return null;
}

export const ticTacToe: GameEngine<TicTacToeState, TicTacToeMove> = {
  id: 'tic_tac_toe',
  init: () => ({ board: Array<Cell>(9).fill(null), turn: 0, winner: null, winLine: null, moves: 0 }),
  currentPlayer: (s) => s.turn,
  legalMoves: (s) =>
    s.winner !== null ? [] : s.board.flatMap((c, i) => (c === null ? [{ cell: i }] : [])),
  applyMove(s, m) {
    if (s.winner !== null || m.cell < 0 || m.cell > 8 || s.board[m.cell] !== null) {
      throw new IllegalMoveError();
    }
    const board = s.board.slice();
    board[m.cell] = s.turn;
    const win = findWin(board);
    const moves = s.moves + 1;
    return {
      board,
      turn: s.turn === 0 ? 1 : 0,
      winner: win ? win.winner : moves === 9 ? DRAW : null,
      winLine: win?.line ?? null,
      moves,
    };
  },
  isTerminal: (s) => s.winner !== null,
  winner: (s) => s.winner,
  parseMove(raw) {
    const cell = (raw as { cell?: unknown } | null)?.cell;
    return typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < 9 ? { cell } : null;
  },
  sameMove: (a, b) => a.cell === b.cell,
};
