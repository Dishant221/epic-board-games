import { DRAW, IllegalMoveError, type GameEngine } from './types';

// American checkers (English draughts): 8×8, 12 men each, mandatory captures,
// multi-jumps, crowning, short-range kings. Squares are 0..63 with a1 = 0 and
// index = row * 8 + col; red (seat 0) starts on rows 0–2 and moves "up"
// (+row), black (seat 1) starts on rows 5–7 and moves "down".

export const CHECKERS_SIZE = 8;
export const CHECKERS_SQUARES = 64;
/** Consecutive plies without a capture or man move that end the game in a draw. */
export const CHECKERS_QUIET_LIMIT = 40;

export type CheckersPiece = 'r' | 'R' | 'b' | 'B';
export type CheckersCell = CheckersPiece | '.';

export interface CheckersMove {
  from: number;
  to: number;
}

export interface CheckersState {
  /** 64 chars: '.' empty, 'r'/'R' red man/king (seat 0), 'b'/'B' black man/king (seat 1). */
  board: string;
  turn: 0 | 1;
  /** Square of the piece that is mid multi-jump and must keep capturing, else null. */
  mustContinueFrom: number | null;
  lastMove: CheckersMove | null;
  /** Square the last move captured from (for the pop-and-fade animation). */
  lastCapture: number | null;
  /** True when the last move crowned a man. */
  lastCrowned: boolean;
  /** Consecutive plies by both sides without a capture or a man move. */
  quietMoves: number;
  /** Position key (board + turn) → times seen since the last irreversible move. */
  history: Record<string, number>;
  /** Plies played; keeps terminal AI scores preferring the shortest win. */
  ply: number;
  winner: number | null;
  /** Pieces each seat has captured. */
  captured: [number, number];
}

// ------------------------------------------------------------ square helpers

export const sqRow = (sq: number) => sq >> 3;
export const sqCol = (sq: number) => sq & 7;
export const toSquare = (row: number, col: number) => row * CHECKERS_SIZE + col;
/** Play happens only on the dark squares (a1 is dark). */
export const isDarkSquare = (sq: number) => ((sqRow(sq) + sqCol(sq)) & 1) === 0;
export const isSquare = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < CHECKERS_SQUARES;
/** Algebraic name, e.g. 0 → "a1". */
export const squareName = (sq: number) => `${'abcdefgh'.charAt(sqCol(sq))}${sqRow(sq) + 1}`;

export const isKing = (c: string) => c === 'R' || c === 'B';
export function pieceSeat(c: string): 0 | 1 | null {
  if (c === 'r' || c === 'R') return 0;
  if (c === 'b' || c === 'B') return 1;
  return null;
}
/** A jump moves two rows; a quiet step moves one. */
export const isJump = (m: CheckersMove) => Math.abs(sqRow(m.to) - sqRow(m.from)) === 2;
/** The square between `from` and `to` of a jump. */
export const jumpedSquare = (m: CheckersMove) => (m.from + m.to) / 2;

export function countPieces(board: string, seat: number): number {
  let n = 0;
  for (let sq = 0; sq < CHECKERS_SQUARES; sq++) if (pieceSeat(board.charAt(sq)) === seat) n++;
  return n;
}

// ------------------------------------------------------------ move generation

type Dir = readonly [number, number];
const UP: readonly Dir[] = [[1, -1], [1, 1]];
const DOWN: readonly Dir[] = [[-1, -1], [-1, 1]];
const ALL: readonly Dir[] = [...UP, ...DOWN];

function dirsFor(piece: string): readonly Dir[] {
  if (isKing(piece)) return ALL;
  return piece === 'r' ? UP : DOWN;
}

const onBoard = (r: number, c: number) => r >= 0 && r < CHECKERS_SIZE && c >= 0 && c < CHECKERS_SIZE;

/** Captures available to the piece on `sq` (empty when none or no piece). */
export function jumpsFrom(board: string, sq: number): CheckersMove[] {
  const piece = board.charAt(sq);
  const seat = pieceSeat(piece);
  if (seat === null) return [];
  const row = sqRow(sq);
  const col = sqCol(sq);
  const moves: CheckersMove[] = [];
  for (const [dr, dc] of dirsFor(piece)) {
    const r2 = row + 2 * dr;
    const c2 = col + 2 * dc;
    if (!onBoard(r2, c2)) continue;
    const over = pieceSeat(board.charAt(toSquare(row + dr, col + dc)));
    const to = toSquare(r2, c2);
    if (over !== null && over !== seat && board.charAt(to) === '.') moves.push({ from: sq, to });
  }
  return moves;
}

/** Quiet one-square steps available to the piece on `sq`. */
export function stepsFrom(board: string, sq: number): CheckersMove[] {
  const piece = board.charAt(sq);
  if (pieceSeat(piece) === null) return [];
  const row = sqRow(sq);
  const col = sqCol(sq);
  const moves: CheckersMove[] = [];
  for (const [dr, dc] of dirsFor(piece)) {
    const r = row + dr;
    const c = col + dc;
    if (!onBoard(r, c)) continue;
    const to = toSquare(r, c);
    if (board.charAt(to) === '.') moves.push({ from: sq, to });
  }
  return moves;
}

/** Allocation-free probe for the AI's hot path: can the piece on `sq` move (or, with `jumpsOnly`, capture)? */
function canMove(board: string, sq: number, jumpsOnly: boolean): boolean {
  const piece = board.charAt(sq);
  const seat = pieceSeat(piece);
  if (seat === null) return false;
  const row = sqRow(sq);
  const col = sqCol(sq);
  for (const [dr, dc] of dirsFor(piece)) {
    const r = row + dr;
    const c = col + dc;
    if (!onBoard(r, c)) continue;
    const over = pieceSeat(board.charAt(toSquare(r, c)));
    if (over === null) {
      if (!jumpsOnly) return true;
      continue;
    }
    if (over === seat) continue;
    if (onBoard(r + dr, c + dc) && board.charAt(toSquare(r + dr, c + dc)) === '.') return true;
  }
  return false;
}

function sideCanJump(board: string, seat: number): boolean {
  for (let sq = 0; sq < CHECKERS_SQUARES; sq++) if (pieceSeat(board.charAt(sq)) === seat && canMove(board, sq, true)) return true;
  return false;
}

function sideHasMove(s: CheckersState): boolean {
  if (s.mustContinueFrom !== null) return canMove(s.board, s.mustContinueFrom, true);
  for (let sq = 0; sq < CHECKERS_SQUARES; sq++) if (pieceSeat(s.board.charAt(sq)) === s.turn && canMove(s.board, sq, false)) return true;
  return false;
}

/** Same verdict as `checkersLegalMoves(s).some(sameMove)` without enumerating every move. */
function isLegal(s: CheckersState, m: CheckersMove): boolean {
  if (s.winner !== null || !isSquare(m.from) || !isSquare(m.to) || pieceSeat(s.board.charAt(m.from)) !== s.turn) return false;
  const jump = jumpsFrom(s.board, m.from).some((x) => x.to === m.to);
  if (s.mustContinueFrom !== null) return m.from === s.mustContinueFrom && jump;
  if (jump) return true;
  return !sideCanJump(s.board, s.turn) && stepsFrom(s.board, m.from).some((x) => x.to === m.to);
}

/** Every legal move: only jumps while any exist (captures are mandatory). */
export function checkersLegalMoves(s: CheckersState): CheckersMove[] {
  if (s.winner !== null) return [];
  if (s.mustContinueFrom !== null) return jumpsFrom(s.board, s.mustContinueFrom);
  const jumps: CheckersMove[] = [];
  const steps: CheckersMove[] = [];
  for (let sq = 0; sq < CHECKERS_SQUARES; sq++) {
    if (pieceSeat(s.board.charAt(sq)) !== s.turn) continue;
    jumps.push(...jumpsFrom(s.board, sq));
    if (jumps.length === 0) steps.push(...stepsFrom(s.board, sq));
  }
  return jumps.length > 0 ? jumps : steps;
}

const positionKey = (board: string, turn: number) => board + turn;

/**
 * Build a state from a board string, e.g. for tests or puzzles. The side to
 * move with no legal move has already lost, mirroring `applyMove`.
 */
export function makeCheckersState(board: string, turn: 0 | 1, overrides: Partial<CheckersState> = {}): CheckersState {
  if (board.length !== CHECKERS_SQUARES || /[^.rRbB]/.test(board)) throw new Error('Checkers board must be 64 chars of . r R b B');
  const s: CheckersState = {
    board,
    turn,
    mustContinueFrom: null,
    lastMove: null,
    lastCapture: null,
    lastCrowned: false,
    quietMoves: 0,
    history: { [positionKey(board, turn)]: 1 },
    ply: 0,
    winner: null,
    captured: [0, 0],
    ...overrides,
  };
  if (s.winner === null && !sideHasMove(s)) s.winner = turn === 0 ? 1 : 0;
  return s;
}

function initialBoard(): string {
  let board = '';
  for (let sq = 0; sq < CHECKERS_SQUARES; sq++) {
    const row = sqRow(sq);
    board += !isDarkSquare(sq) ? '.' : row < 3 ? 'r' : row > 4 ? 'b' : '.';
  }
  return board;
}

// --------------------------------------------------------------------- engine

export const checkers: GameEngine<CheckersState, CheckersMove> = {
  id: 'checkers',
  init(playerCount) {
    if (playerCount !== 2) throw new Error('Checkers is a 2-player game');
    return makeCheckersState(initialBoard(), 0);
  },
  currentPlayer: (s) => s.turn,
  legalMoves: checkersLegalMoves,
  applyMove(s, m) {
    if (!isLegal(s, m)) throw new IllegalMoveError(s.winner !== null ? 'Game is over' : 'Illegal move');

    const cells = s.board.split('');
    const piece = cells[m.from] as CheckersPiece;
    const jump = isJump(m);
    const farRow = s.turn === 0 ? CHECKERS_SIZE - 1 : 0;
    const crowned = !isKing(piece) && sqRow(m.to) === farRow;
    cells[m.from] = '.';
    if (jump) cells[jumpedSquare(m)] = '.';
    cells[m.to] = crowned ? piece.toUpperCase() : piece;
    const board = cells.join('');

    const captured: [number, number] = [s.captured[0], s.captured[1]];
    if (jump) captured[s.turn]++;
    // A crowned man's move ends even if the new king could jump on.
    const continues = jump && !crowned && canMove(board, m.to, true);
    // Captures and man moves can never be undone, so repetition is reset too.
    const irreversible = jump || !isKing(piece);
    const turn: 0 | 1 = continues ? s.turn : s.turn === 0 ? 1 : 0;

    const next: CheckersState = {
      board,
      turn,
      mustContinueFrom: continues ? m.to : null,
      lastMove: { from: m.from, to: m.to },
      lastCapture: jump ? jumpedSquare(m) : null,
      lastCrowned: crowned,
      quietMoves: irreversible ? 0 : s.quietMoves + 1,
      history: irreversible ? {} : { ...s.history },
      ply: s.ply + 1,
      winner: null,
      captured,
    };
    if (!continues) {
      const key = positionKey(board, turn);
      next.history[key] = (next.history[key] ?? 0) + 1;
      if (!sideHasMove(next)) next.winner = s.turn; // no pieces left or every piece blocked
      else if (next.quietMoves >= CHECKERS_QUIET_LIMIT || next.history[key] >= 3) next.winner = DRAW;
    }
    return next;
  },
  isTerminal: (s) => s.winner !== null,
  winner: (s) => s.winner,
  parseMove(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { from, to } = raw as { from?: unknown; to?: unknown };
    if (!isSquare(from) || !isSquare(to) || !isDarkSquare(from) || !isDarkSquare(to)) return null;
    const dr = Math.abs(sqRow(to) - sqRow(from));
    const dc = Math.abs(sqCol(to) - sqCol(from));
    if (dr !== dc || (dr !== 1 && dr !== 2)) return null;
    return { from, to };
  },
  sameMove: (a, b) => a.from === b.from && a.to === b.to,
  ai: {
    depth: { easy: 1, medium: 3, hard: 6, impossible: 9 },
    timeBudgetMs: 1500,
    evaluate: (s, seat) => evaluateCheckers(s, seat),
    orderMoves: (s, moves) => moves.slice().sort((a, b) => moveRank(s, b) - moveRank(s, a)),
  },
  summary(s) {
    if (s.winner === null) return null;
    if (s.winner === DRAW) return s.quietMoves >= CHECKERS_QUIET_LIMIT ? `Draw — ${CHECKERS_QUIET_LIMIT} quiet moves` : 'Draw — threefold repetition';
    const left = countPieces(s.board, s.winner);
    return `Won with ${left} piece${left === 1 ? '' : 's'} left`;
  },
};

// ------------------------------------------------------------------------- AI

const MAN = 100;
const KING = 160;

/** Captures first, then crowning moves, then centralising steps. */
function moveRank(s: CheckersState, m: CheckersMove): number {
  let rank = isJump(m) ? 1000 : 0;
  if (!isKing(s.board.charAt(m.from)) && sqRow(m.to) === (s.turn === 0 ? 7 : 0)) rank += 500;
  return rank + 4 - Math.abs(3.5 - sqCol(m.to)) * 2;
}

/** Heuristic score from `seat`'s perspective, used by the alpha-beta AI. */
export function evaluateCheckers(s: CheckersState, seat: number): number {
  if (s.winner !== null) {
    if (s.winner === DRAW) return 0;
    return s.winner === seat ? 1_000_000 - s.ply : -1_000_000 + s.ply;
  }
  const board = s.board;
  let score = 0;
  for (let sq = 0; sq < CHECKERS_SQUARES; sq++) {
    const c = board.charAt(sq);
    const owner = pieceSeat(c);
    if (owner === null) continue;
    const row = sqRow(sq);
    const col = sqCol(sq);
    let v: number;
    if (isKing(c)) {
      v = KING;
    } else {
      const advance = owner === 0 ? row : CHECKERS_SIZE - 1 - row;
      v = MAN + advance * 3;
      // Men left on the back rank stop the enemy crowning.
      if (advance === 0) v += 6;
    }
    if (row >= 2 && row <= 5 && col >= 2 && col <= 5) v += 4;
    // A piece with nowhere to go is a liability (and a fully blocked side loses).
    if (!canMove(board, sq, false)) v -= 8;
    score += owner === seat ? v : -v;
  }
  return score;
}
