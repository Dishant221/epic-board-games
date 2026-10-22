import { DRAW, IllegalMoveError, type GameEngine } from './types';

export const C4_COLS = 7;
export const C4_ROWS = 6;

/** board[col][row], row 0 is the bottom. */
export interface Connect4State {
  board: (0 | 1 | null)[][];
  turn: 0 | 1;
  winner: number | null;
  winCells: [number, number][] | null;
  lastMove: { col: number; row: number } | null;
  moves: number;
}

export interface Connect4Move {
  col: number;
}

const DIRS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function c4Cell(s: Connect4State, col: number, row: number): 0 | 1 | null | undefined {
  if (col < 0 || col >= C4_COLS || row < 0 || row >= C4_ROWS) return undefined;
  return s.board[col]![row];
}

function findWinAt(s: Connect4State, col: number, row: number): [number, number][] | null {
  const me = c4Cell(s, col, row);
  if (me == null) return null;
  for (const [dc, dr] of DIRS) {
    const cells: [number, number][] = [[col, row]];
    for (const sign of [1, -1]) {
      let c = col + dc * sign;
      let r = row + dr * sign;
      while (c4Cell(s, c, r) === me) {
        cells.push([c, r]);
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

export const connect4: GameEngine<Connect4State, Connect4Move> = {
  id: 'connect4',
  init: () => ({
    board: Array.from({ length: C4_COLS }, () => Array<0 | 1 | null>(C4_ROWS).fill(null)),
    turn: 0,
    winner: null,
    winCells: null,
    lastMove: null,
    moves: 0,
  }),
  currentPlayer: (s) => s.turn,
  legalMoves(s) {
    if (s.winner !== null) return [];
    const moves: Connect4Move[] = [];
    for (let col = 0; col < C4_COLS; col++) if (s.board[col]![C4_ROWS - 1] === null) moves.push({ col });
    return moves;
  },
  applyMove(s, m) {
    const column = s.board[m.col];
    if (s.winner !== null || !column) throw new IllegalMoveError();
    const row = column.indexOf(null);
    if (row === -1) throw new IllegalMoveError('Column is full');
    const board = s.board.map((c, i) => (i === m.col ? c.slice() : c));
    board[m.col]![row] = s.turn;
    const next: Connect4State = {
      board,
      turn: s.turn === 0 ? 1 : 0,
      winner: null,
      winCells: null,
      lastMove: { col: m.col, row },
      moves: s.moves + 1,
    };
    const win = findWinAt(next, m.col, row);
    if (win) {
      next.winner = s.turn;
      next.winCells = win;
    } else if (next.moves === C4_COLS * C4_ROWS) {
      next.winner = DRAW;
    }
    return next;
  },
  isTerminal: (s) => s.winner !== null,
  winner: (s) => s.winner,
  parseMove(raw) {
    const col = (raw as { col?: unknown } | null)?.col;
    return typeof col === 'number' && Number.isInteger(col) && col >= 0 && col < C4_COLS ? { col } : null;
  },
  sameMove: (a, b) => a.col === b.col,
  ai: {
    depth: { easy: 1, medium: 3, hard: 6, impossible: 8 },
    timeBudgetMs: 1500,
    evaluate: (s, seat) => evaluateConnect4(s, seat),
    // Centre-first ordering prunes far more of the tree.
    orderMoves: (_s, moves) => moves.slice().sort((a, b) => Math.abs(a.col - 3) - Math.abs(b.col - 3)),
  },
};

/** Heuristic score from `seat`'s perspective, used by the alpha-beta AI. */
export function evaluateConnect4(s: Connect4State, seat: number): number {
  if (s.winner === seat) return 1_000_000 - s.moves;
  if (s.winner === DRAW) return 0;
  if (s.winner !== null) return -1_000_000 + s.moves;
  let score = 0;
  // Centre column control is the strongest positional factor in Connect 4.
  for (let row = 0; row < C4_ROWS; row++) {
    const v = s.board[3]![row];
    if (v === seat) score += 3;
    else if (v != null) score -= 3;
  }
  for (let col = 0; col < C4_COLS; col++) {
    for (let row = 0; row < C4_ROWS; row++) {
      for (const [dc, dr] of DIRS) {
        let mine = 0;
        let theirs = 0;
        let inBounds = true;
        for (let k = 0; k < 4; k++) {
          const v = c4Cell(s, col + dc * k, row + dr * k);
          if (v === undefined) { inBounds = false; break; }
          if (v === seat) mine++;
          else if (v !== null) theirs++;
        }
        if (!inBounds || (mine > 0 && theirs > 0)) continue;
        if (mine === 3) score += 5;
        else if (mine === 2) score += 2;
        if (theirs === 3) score -= 4;
        else if (theirs === 2) score -= 1;
      }
    }
  }
  return score;
}
