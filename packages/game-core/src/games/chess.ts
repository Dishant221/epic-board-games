import { DRAW, IllegalMoveError, type GameEngine } from './types';

// Squares are 0..63 with a1 = 0, h1 = 7, a8 = 56, h8 = 63 (file = sq & 7, rank = sq >> 3).
// The board is a 64-char string: '.' empty, 'PNBRQK' White (seat 0), 'pnbrqk' Black (seat 1).

export type ChessPromo = 'q' | 'r' | 'b' | 'n';

export interface ChessMove {
  from: number;
  to: number;
  promo?: ChessPromo;
}

export type ChessResult = 'checkmate' | 'stalemate' | 'fifty' | 'repetition' | 'material';

export interface ChessState {
  board: string;
  turn: 0 | 1;
  /** Remaining castling rights as a subset of 'KQkq' ('' when none). */
  castling: string;
  /** En passant target square after a double pawn push, else null. */
  ep: number | null;
  /** Half-moves since the last capture or pawn move (50-move rule). */
  halfmove: number;
  fullmove: number;
  /** Position keys since the last irreversible move, for threefold repetition. */
  history: string[];
  lastMove: ChessMove | null;
  inCheck: boolean;
  result: ChessResult | null;
  winner: number | null;
  /** Captured pieces in order (piece letters, so the UI can group by colour). */
  captured: string[];
  /** Move list in Standard Algebraic Notation (capped). */
  san: string[];
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const FILES = 'abcdefgh';
const PROMOS: readonly ChessPromo[] = ['q', 'r', 'b', 'n'];
const SAN_CAP = 200;
const HISTORY_CAP = 150;

// Castling right bits.
const WK = 1;
const WQ = 2;
const BK = 4;
const BQ = 8;

/** Internal working position: board as a char array, castling as bits, ep = -1 when none. */
interface Pos {
  b: string[];
  turn: 0 | 1;
  castling: number;
  ep: number;
}

// ---------------------------------------------------------------- geometry

// Directions 0..3 are orthogonal, 4..7 diagonal.
const DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT_DIRS: readonly [number, number][] = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

const KNIGHT_T: number[][] = [];
const KING_T: number[][] = [];
/** RAYS[sq][dir] = squares along `dir` from `sq`, nearest first. */
const RAYS: number[][][] = [];

for (let sq = 0; sq < 64; sq++) {
  const f = sq & 7;
  const r = sq >> 3;
  const inside = (ff: number, rr: number) => ff >= 0 && ff < 8 && rr >= 0 && rr < 8;
  KNIGHT_T.push(KNIGHT_DIRS.filter(([df, dr]) => inside(f + df, r + dr)).map(([df, dr]) => (r + dr) * 8 + f + df));
  KING_T.push(DIRS.filter(([df, dr]) => inside(f + df, r + dr)).map(([df, dr]) => (r + dr) * 8 + f + df));
  RAYS.push(
    DIRS.map(([df, dr]) => {
      const ray: number[] = [];
      for (let ff = f + df, rr = r + dr; inside(ff, rr); ff += df, rr += dr) ray.push(rr * 8 + ff);
      return ray;
    }),
  );
}

export function squareName(sq: number): string {
  return `${FILES[sq & 7]}${(sq >> 3) + 1}`;
}

export function parseSquare(name: string): number | null {
  if (name.length !== 2) return null;
  const f = FILES.indexOf(name[0]!);
  const r = Number(name[1]) - 1;
  return f < 0 || !Number.isInteger(r) || r < 0 || r > 7 ? null : r * 8 + f;
}

// ----------------------------------------------------------------- helpers

const isWhite = (piece: string) => piece <= 'Z'; // uppercase sorts before lowercase; never called with '.'
const pieceSeat = (piece: string): 0 | 1 => (isWhite(piece) ? 0 : 1);

function castlingBits(str: string): number {
  return (str.includes('K') ? WK : 0) | (str.includes('Q') ? WQ : 0) | (str.includes('k') ? BK : 0) | (str.includes('q') ? BQ : 0);
}

function castlingString(bits: number): string {
  return (bits & WK ? 'K' : '') + (bits & WQ ? 'Q' : '') + (bits & BK ? 'k' : '') + (bits & BQ ? 'q' : '');
}

function posOf(s: ChessState): Pos {
  return { b: s.board.split(''), turn: s.turn, castling: castlingBits(s.castling), ep: s.ep ?? -1 };
}

/** True when `sq` is attacked by any piece of seat `by`. */
function isAttacked(b: string[], sq: number, by: 0 | 1): boolean {
  const f = sq & 7;
  if (by === 0) {
    // White pawns attack upwards, so they sit one rank below the square.
    if (sq >= 8 && ((f > 0 && b[sq - 9] === 'P') || (f < 7 && b[sq - 7] === 'P'))) return true;
  } else if (sq < 56 && ((f > 0 && b[sq + 7] === 'p') || (f < 7 && b[sq + 9] === 'p'))) {
    return true;
  }
  const n = by === 0 ? 'N' : 'n';
  const k = by === 0 ? 'K' : 'k';
  const r = by === 0 ? 'R' : 'r';
  const bi = by === 0 ? 'B' : 'b';
  const q = by === 0 ? 'Q' : 'q';
  for (const t of KNIGHT_T[sq]!) if (b[t] === n) return true;
  for (const t of KING_T[sq]!) if (b[t] === k) return true;
  const rays = RAYS[sq]!;
  for (let d = 0; d < 8; d++) {
    const slider = d < 4 ? r : bi;
    for (const t of rays[d]!) {
      const p = b[t]!;
      if (p === '.') continue;
      if (p === slider || p === q) return true;
      break;
    }
  }
  return false;
}

function kingSquare(b: string[], seat: 0 | 1): number {
  return b.indexOf(seat === 0 ? 'K' : 'k');
}

/** Pseudo-legal moves for the piece on `from` (own king safety not checked, castling fully checked). */
function pseudoFrom(p: Pos, from: number, out: ChessMove[]): void {
  const b = p.b;
  const piece = b[from]!;
  if (piece === '.') return;
  const white = isWhite(piece);
  if (white !== (p.turn === 0)) return;
  const own = (t: string | undefined) => t !== undefined && t !== '.' && isWhite(t) === white;
  const lower = white ? piece.toLowerCase() : piece;

  switch (lower) {
    case 'p': {
      const dir = white ? 8 : -8;
      const startRank = white ? 1 : 6;
      const promoRank = white ? 7 : 0;
      const push = (to: number) => {
        if (to >> 3 === promoRank) for (const promo of PROMOS) out.push({ from, to, promo });
        else out.push({ from, to });
      };
      const one = from + dir;
      if (one < 0 || one > 63) return;
      if (b[one] === '.') {
        push(one);
        if (from >> 3 === startRank && b[one + dir] === '.') out.push({ from, to: one + dir });
      }
      const f = from & 7;
      if (f > 0) {
        const to = one - 1;
        const t = b[to]!;
        if (to === p.ep || (t !== '.' && !own(t))) push(to);
      }
      if (f < 7) {
        const to = one + 1;
        const t = b[to]!;
        if (to === p.ep || (t !== '.' && !own(t))) push(to);
      }
      return;
    }
    case 'n':
      for (const to of KNIGHT_T[from]!) if (!own(b[to])) out.push({ from, to });
      return;
    case 'k': {
      for (const to of KING_T[from]!) if (!own(b[to])) out.push({ from, to });
      const rights = p.castling & (white ? WK | WQ : BK | BQ);
      if (!rights || from !== (white ? 4 : 60)) return;
      const enemy: 0 | 1 = white ? 1 : 0;
      const rook = white ? 'R' : 'r';
      // May not castle out of, through or into check.
      if (isAttacked(b, from, enemy)) return;
      if (rights & (white ? WK : BK) && b[from + 1] === '.' && b[from + 2] === '.' && b[from + 3] === rook && !isAttacked(b, from + 1, enemy) && !isAttacked(b, from + 2, enemy)) {
        out.push({ from, to: from + 2 });
      }
      if (rights & (white ? WQ : BQ) && b[from - 1] === '.' && b[from - 2] === '.' && b[from - 3] === '.' && b[from - 4] === rook && !isAttacked(b, from - 1, enemy) && !isAttacked(b, from - 2, enemy)) {
        out.push({ from, to: from - 2 });
      }
      return;
    }
    default: {
      // Sliders: bishop uses diagonal rays, rook orthogonal, queen both.
      const d0 = lower === 'b' ? 4 : 0;
      const d1 = lower === 'r' ? 4 : 8;
      const rays = RAYS[from]!;
      for (let d = d0; d < d1; d++) {
        for (const to of rays[d]!) {
          const t = b[to]!;
          if (t === '.') {
            out.push({ from, to });
            continue;
          }
          if (!own(t)) out.push({ from, to });
          break;
        }
      }
    }
  }
}

/** Applies a pseudo-legal move and returns the new position (never mutates). */
function makePos(p: Pos, m: ChessMove): Pos {
  const b = p.b.slice();
  const piece = b[m.from]!;
  const white = p.turn === 0;
  const lower = white ? piece.toLowerCase() : piece;
  let ep = -1;

  b[m.to] = m.promo ? (white ? m.promo.toUpperCase() : m.promo) : piece;
  b[m.from] = '.';
  if (lower === 'p') {
    if (m.to === p.ep) b[white ? m.to - 8 : m.to + 8] = '.';
    if (Math.abs(m.to - m.from) === 16) ep = (m.from + m.to) / 2;
  } else if (lower === 'k') {
    if (m.to - m.from === 2) {
      b[m.from + 1] = b[m.from + 3]!;
      b[m.from + 3] = '.';
    } else if (m.from - m.to === 2) {
      b[m.from - 1] = b[m.from - 4]!;
      b[m.from - 4] = '.';
    }
  }

  // Any move from a king/rook home square, or a capture on a rook square, kills the right.
  let castling = p.castling;
  if (m.from === 4) castling &= ~(WK | WQ);
  if (m.from === 60) castling &= ~(BK | BQ);
  if (m.from === 0 || m.to === 0) castling &= ~WQ;
  if (m.from === 7 || m.to === 7) castling &= ~WK;
  if (m.from === 56 || m.to === 56) castling &= ~BQ;
  if (m.from === 63 || m.to === 63) castling &= ~BK;

  return { b, turn: white ? 1 : 0, castling, ep };
}

function leavesKingSafe(p: Pos, m: ChessMove): boolean {
  const n = makePos(p, m);
  const k = kingSquare(n.b, p.turn);
  return k < 0 || !isAttacked(n.b, k, n.turn);
}

function legalFrom(p: Pos, from: number): ChessMove[] {
  const pseudo: ChessMove[] = [];
  pseudoFrom(p, from, pseudo);
  return pseudo.filter((m) => leavesKingSafe(p, m));
}

function legalAll(p: Pos): ChessMove[] {
  const out: ChessMove[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const pseudo: ChessMove[] = [];
    pseudoFrom(p, sq, pseudo);
    for (const m of pseudo) if (leavesKingSafe(p, m)) out.push(m);
  }
  return out;
}

function hasLegalMove(p: Pos): boolean {
  for (let sq = 0; sq < 64; sq++) {
    const pseudo: ChessMove[] = [];
    pseudoFrom(p, sq, pseudo);
    for (const m of pseudo) if (leavesKingSafe(p, m)) return true;
  }
  return false;
}

/** Repetition key. The ep square only counts when a pawn could actually capture there. */
function keyOf(p: Pos): string {
  let ep = '-';
  if (p.ep >= 0) {
    const pawn = p.turn === 0 ? 'P' : 'p';
    const f = p.ep & 7;
    const rank = p.turn === 0 ? p.ep - 8 : p.ep + 8;
    if ((f > 0 && p.b[rank - 1] === pawn) || (f < 7 && p.b[rank + 1] === pawn)) ep = String(p.ep);
  }
  return `${p.b.join('')}${p.turn}${p.castling}${ep}`;
}

/** K vs K, K+minor vs K, and bishops that are all on one square colour with no knights. */
function insufficientMaterial(b: string[]): boolean {
  let minors = 0;
  let knights = 0;
  let bishopColour = -1;
  let mixedBishops = false;
  for (let sq = 0; sq < 64; sq++) {
    const c = b[sq]!;
    if (c === '.') continue;
    const lower = c.toLowerCase();
    if (lower === 'p' || lower === 'r' || lower === 'q') return false;
    if (lower === 'n') {
      minors++;
      knights++;
    } else if (lower === 'b') {
      minors++;
      const colour = ((sq & 7) + (sq >> 3)) & 1;
      if (bishopColour === -1) bishopColour = colour;
      else if (bishopColour !== colour) mixedBishops = true;
    }
  }
  if (minors <= 1) return true;
  return knights === 0 && !mixedBishops;
}

function sanOf(p: Pos, m: ChessMove, check: boolean, mate: boolean): string {
  const piece = p.b[m.from]!;
  const lower = piece.toLowerCase();
  const suffix = mate ? '#' : check ? '+' : '';
  if (lower === 'k' && Math.abs(m.to - m.from) === 2) return (m.to > m.from ? 'O-O' : 'O-O-O') + suffix;
  const capture = p.b[m.to] !== '.' || (lower === 'p' && m.to === p.ep);
  const dest = squareName(m.to);
  if (lower === 'p') {
    const promo = m.promo ? `=${m.promo.toUpperCase()}` : '';
    return `${capture ? `${FILES[m.from & 7]}x` : ''}${dest}${promo}${suffix}`;
  }
  // Disambiguate when another piece of the same kind can legally reach the square.
  const others: number[] = [];
  for (let sq = 0; sq < 64; sq++) {
    if (sq === m.from || p.b[sq] !== piece) continue;
    if (legalFrom(p, sq).some((x) => x.to === m.to)) others.push(sq);
  }
  let disambig = '';
  if (others.length > 0) {
    const sameFile = others.some((sq) => (sq & 7) === (m.from & 7));
    const sameRank = others.some((sq) => sq >> 3 === m.from >> 3);
    disambig = !sameFile ? FILES[m.from & 7]! : !sameRank ? String((m.from >> 3) + 1) : squareName(m.from);
  }
  return `${piece.toUpperCase()}${disambig}${capture ? 'x' : ''}${dest}${suffix}`;
}

/** Pieces missing from a full set, so positions loaded from FEN still show captures. */
function missingPieces(b: string[]): string[] {
  const full: Record<string, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1, p: 8, n: 2, b: 2, r: 2, q: 1 };
  for (const c of b) if (c in full) full[c]!--;
  const out: string[] = [];
  for (const [piece, n] of Object.entries(full)) for (let i = 0; i < n; i++) out.push(piece);
  return out;
}

const cleanMove = (m: ChessMove): ChessMove => (m.promo ? { from: m.from, to: m.to, promo: m.promo } : { from: m.from, to: m.to });

/** Fills in the derived fields (check, result, winner) for a freshly built position. */
function finishState(base: Omit<ChessState, 'inCheck' | 'result' | 'winner'>, p: Pos, key: string): ChessState {
  const k = kingSquare(p.b, p.turn);
  const inCheck = k >= 0 && isAttacked(p.b, k, p.turn === 0 ? 1 : 0);
  let result: ChessResult | null = null;
  // Checkmate outranks every draw rule (FIDE 9.3/9.6 only apply if the game is not already over).
  if (!hasLegalMove(p)) result = inCheck ? 'checkmate' : 'stalemate';
  else if (base.halfmove >= 100) result = 'fifty';
  else if (base.history.filter((h) => h === key).length >= 3) result = 'repetition';
  else if (insufficientMaterial(p.b)) result = 'material';
  const winner = result === 'checkmate' ? (p.turn === 0 ? 1 : 0) : result ? DRAW : null;
  return { ...base, inCheck, result, winner };
}

// --------------------------------------------------------------- public API

export function fromFEN(fen: string): ChessState {
  const [placement, turnStr = 'w', castling = '-', epStr = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const rows = placement?.split('/') ?? [];
  if (rows.length !== 8) throw new Error('Invalid FEN: expected 8 ranks');
  const b = Array<string>(64).fill('.');
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let f = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') f += Number(ch);
      else if ('pnbrqkPNBRQK'.includes(ch) && f < 8) b[rank * 8 + f++] = ch;
      else throw new Error(`Invalid FEN rank: ${row}`);
    }
    if (f !== 8) throw new Error(`Invalid FEN rank: ${row}`);
  });
  if (b.indexOf('K') < 0 || b.indexOf('k') < 0) throw new Error('Invalid FEN: both kings required');
  const turn: 0 | 1 = turnStr === 'b' ? 1 : 0;
  const ep = epStr === '-' ? null : parseSquare(epStr);
  const halfmove = Math.max(0, Number(half) || 0);
  const fullmove = Math.max(1, Number(full) || 1);
  const p: Pos = { b, turn, castling: castlingBits(castling), ep: ep ?? -1 };
  const key = keyOf(p);
  return finishState(
    {
      board: b.join(''),
      turn,
      castling: castlingString(p.castling),
      ep,
      halfmove,
      fullmove,
      history: [key],
      lastMove: null,
      captured: missingPieces(b),
      san: [],
    },
    p,
    key,
  );
}

export function toFEN(s: ChessState): string {
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const c = s.board[rank * 8 + f]!;
      if (c === '.') {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += c;
    }
    if (empty) row += empty;
    ranks.push(row);
  }
  return `${ranks.join('/')} ${s.turn === 0 ? 'w' : 'b'} ${s.castling || '-'} ${s.ep === null ? '-' : squareName(s.ep)} ${s.halfmove} ${s.fullmove}`;
}

/** Whether `seat` (default: side to move) is currently in check. */
export function isInCheck(s: ChessState, seat: number = s.turn): boolean {
  const b = s.board.split('');
  const k = kingSquare(b, seat === 0 ? 0 : 1);
  return k >= 0 && isAttacked(b, k, seat === 0 ? 1 : 0);
}

/** Legal moves for the piece on `square` (empty when it is not the mover's piece or the game is over). */
export function movesFrom(s: ChessState, square: number): ChessMove[] {
  if (s.result !== null || square < 0 || square > 63) return [];
  return legalFrom(posOf(s), square);
}

/** Standard Algebraic Notation for `move` in position `s` (assumes the move is legal). */
export function toSAN(s: ChessState, move: ChessMove): string {
  const p = posOf(s);
  const n = makePos(p, move);
  const k = kingSquare(n.b, n.turn);
  const check = k >= 0 && isAttacked(n.b, k, p.turn);
  return sanOf(p, move, check, check && !hasLegalMove(n));
}

/** Leaf-node count for move-generator verification (uses the fast internal path). */
export function perft(s: ChessState, depth: number): number {
  const go = (p: Pos, d: number): number => {
    const moves = legalAll(p);
    if (d <= 1) return moves.length;
    let n = 0;
    for (const m of moves) n += go(makePos(p, m), d - 1);
    return n;
  };
  return depth <= 0 ? 1 : go(posOf(s), depth);
}

export function chessPly(s: ChessState): number {
  return s.fullmove * 2 + s.turn;
}

const sameMove = (a: ChessMove, b: ChessMove) => a.from === b.from && a.to === b.to && (a.promo ?? null) === (b.promo ?? null);

export const chess: GameEngine<ChessState, ChessMove> = {
  id: 'chess',
  init: () => fromFEN(START_FEN),
  currentPlayer: (s) => s.turn,
  legalMoves: (s) => (s.result !== null ? [] : legalAll(posOf(s))),
  applyMove(s, m) {
    if (s.result !== null) throw new IllegalMoveError('The game is over');
    const p = posOf(s);
    if (m.from < 0 || m.from > 63 || !legalFrom(p, m.from).some((x) => sameMove(x, m))) throw new IllegalMoveError();

    const piece = p.b[m.from]!;
    const isPawn = piece === 'P' || piece === 'p';
    const captured = isPawn && m.to === p.ep ? (s.turn === 0 ? 'p' : 'P') : p.b[m.to]!;
    const n = makePos(p, m);
    const key = keyOf(n);
    const irreversible = isPawn || captured !== '.';
    const history = irreversible ? [key] : [...s.history, key].slice(-HISTORY_CAP);

    const oppKing = kingSquare(n.b, n.turn);
    const check = oppKing >= 0 && isAttacked(n.b, oppKing, s.turn);
    const next = finishState(
      {
        board: n.b.join(''),
        turn: n.turn,
        castling: castlingString(n.castling),
        ep: n.ep < 0 ? null : n.ep,
        halfmove: irreversible ? 0 : s.halfmove + 1,
        fullmove: s.turn === 1 ? s.fullmove + 1 : s.fullmove,
        history,
        lastMove: cleanMove(m),
        captured: captured === '.' ? s.captured : [...s.captured, captured],
        san: s.san,
      },
      n,
      key,
    );
    next.san = [...s.san, sanOf(p, m, check, next.result === 'checkmate')].slice(-SAN_CAP);
    return next;
  },
  isTerminal: (s) => s.result !== null,
  winner: (s) => s.winner,
  parseMove(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { from, to, promo } = raw as Record<string, unknown>;
    const isSquare = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 64;
    if (!isSquare(from) || !isSquare(to) || from === to) return null;
    if (promo === undefined) return { from, to };
    if (typeof promo !== 'string' || !(PROMOS as readonly string[]).includes(promo)) return null;
    return { from, to, promo: promo as ChessPromo };
  },
  sameMove,
  ai: {
    depth: { easy: 1, medium: 2, hard: 3, impossible: 4 },
    timeBudgetMs: 1500,
    evaluate: (s, seat) => evaluateChess(s, seat),
    orderMoves(s, moves) {
      const value = (c: string) => PIECE_VALUES[c.toLowerCase()] ?? 0;
      const score = (m: ChessMove) => {
        const attacker = s.board[m.from]!;
        const victim = s.board[m.to]!;
        let sc = 0;
        // MVV-LVA: take the most valuable victim with the least valuable attacker.
        if (victim !== '.') sc = 10_000 + value(victim) * 10 - value(attacker);
        else if ((attacker === 'P' || attacker === 'p') && m.to === s.ep) sc = 10_000 + 1000 - 100;
        if (m.promo) sc += 5_000 + value(m.promo);
        return sc;
      };
      return moves
        .map((m) => ({ m, sc: score(m) }))
        .sort((a, b) => b.sc - a.sc)
        .map((x) => x.m);
    },
  },
  summary(s) {
    switch (s.result) {
      case 'checkmate': {
        const moves = s.turn === 0 ? s.fullmove - 1 : s.fullmove;
        return `Checkmate in ${moves} move${moves === 1 ? '' : 's'}`;
      }
      case 'stalemate':
        return 'Draw by stalemate';
      case 'fifty':
        return 'Draw by the 50-move rule';
      case 'repetition':
        return 'Draw by threefold repetition';
      case 'material':
        return 'Draw by insufficient material';
      default:
        return null;
    }
  },
};

// ------------------------------------------------------------- evaluation

// Piece-square tables from White's point of view, indexed by square (rank 1 first,
// a-file first). Black mirrors the rank with `sq ^ 56`.
const PST_P = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, -20, -20, 10, 10, 5,
  5, -5, -10, 0, 0, -10, -5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, 5, 10, 25, 25, 10, 5, 5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_N = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const PST_B = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const PST_R = [
  0, 0, 0, 5, 5, 0, 0, 0,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  5, 10, 10, 10, 10, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_Q = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -10, 5, 5, 5, 5, 5, 0, -10,
  0, 0, 5, 5, 5, 5, 0, -5,
  -5, 0, 5, 5, 5, 5, 0, -5,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const PST_K_MID = [
  20, 30, 10, 0, 0, 10, 30, 20,
  20, 20, 0, 0, 0, 0, 20, 20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
];
const PST_K_END = [
  -50, -30, -30, -30, -30, -30, -30, -50,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -50, -40, -30, -20, -20, -30, -40, -50,
];
const PST: Record<string, number[]> = { p: PST_P, n: PST_N, b: PST_B, r: PST_R, q: PST_Q };
/** Bonus for a passed pawn by rank (from its own side), in centipawns. */
const PASSED = [0, 5, 10, 20, 35, 60, 100, 0];
/** Below this much non-pawn material (both sides) the king walks to the centre. */
const ENDGAME_MATERIAL = 2600;

/** Heuristic score from `seat`'s perspective in centipawns; mates are ±1,000,000 adjusted by ply. */
export function evaluateChess(s: ChessState, seat: number): number {
  if (s.result === 'checkmate') return s.winner === seat ? 1_000_000 - chessPly(s) : -1_000_000 + chessPly(s);
  if (s.result !== null) return 0;

  const b = s.board;
  let material = 0; // total non-pawn, non-king material: decides the game phase
  let score = 0; // from White's point of view
  const pawnFiles: [number[], number[]] = [Array<number>(8).fill(0), Array<number>(8).fill(0)];
  const bishops = [0, 0];
  const kings = [-1, -1];

  for (let sq = 0; sq < 64; sq++) {
    const c = b[sq]!;
    if (c === '.') continue;
    const white = c <= 'Z';
    const lower = white ? c.toLowerCase() : c;
    const side = white ? 0 : 1;
    const idx = white ? sq : sq ^ 56;
    const value = PIECE_VALUES[lower]!;
    let v = value + (PST[lower]?.[idx] ?? 0);
    if (lower === 'k') kings[side] = sq;
    else if (lower === 'p') pawnFiles[side]![sq & 7]!++;
    else {
      material += value;
      if (lower === 'b') bishops[side]!++;
      // Slider mobility: open lines are worth a little.
      if (lower !== 'n') {
        const d0 = lower === 'b' ? 4 : 0;
        const d1 = lower === 'r' ? 4 : 8;
        const rays = RAYS[sq]!;
        let mob = 0;
        for (let d = d0; d < d1; d++) {
          for (const t of rays[d]!) {
            mob++;
            if (b[t] !== '.') break;
          }
        }
        v += mob * (lower === 'q' ? 1 : 2);
      }
    }
    score += white ? v : -v;
  }

  const endgame = material < ENDGAME_MATERIAL;
  for (const side of [0, 1] as const) {
    const sign = side === 0 ? 1 : -1;
    const files = pawnFiles[side];
    const enemyFiles = pawnFiles[side === 0 ? 1 : 0];
    if (bishops[side]! >= 2) score += sign * 30;
    for (let f = 0; f < 8; f++) {
      const n = files[f]!;
      if (n === 0) continue;
      if (n > 1) score -= sign * 15 * (n - 1);
      if ((f === 0 || files[f - 1] === 0) && (f === 7 || files[f + 1] === 0)) score -= sign * 12;
    }
    // Passed pawns: no enemy pawn ahead on this or an adjacent file.
    const pawn = side === 0 ? 'P' : 'p';
    const enemyPawn = side === 0 ? 'p' : 'P';
    for (let sq = 8; sq < 56; sq++) {
      if (b[sq] !== pawn) continue;
      const f = sq & 7;
      if (enemyFiles[f] === 0 && (f === 0 || enemyFiles[f - 1] === 0) && (f === 7 || enemyFiles[f + 1] === 0)) {
        score += sign * PASSED[side === 0 ? sq >> 3 : 7 - (sq >> 3)]!;
        continue;
      }
      let passed = true;
      const step = side === 0 ? 8 : -8;
      for (let t = sq + step; t >= 0 && t < 64 && passed; t += step) {
        const tf = t & 7;
        if (b[t] === enemyPawn || (tf > 0 && b[t - 1] === enemyPawn) || (tf < 7 && b[t + 1] === enemyPawn)) passed = false;
      }
      if (passed) score += sign * PASSED[side === 0 ? sq >> 3 : 7 - (sq >> 3)]!;
    }
    const k = kings[side]!;
    if (k >= 0) {
      const idx = side === 0 ? k : k ^ 56;
      score += sign * (endgame ? PST_K_END[idx]! : PST_K_MID[idx]!);
      // Middlegame king safety: pawns in front of the king shield it.
      if (!endgame) {
        const ahead = side === 0 ? k + 8 : k - 8;
        if (ahead >= 0 && ahead < 64) {
          const f = k & 7;
          let shield = 0;
          for (const df of [-1, 0, 1]) {
            if (f + df < 0 || f + df > 7) continue;
            if (b[ahead + df] === pawn) shield++;
          }
          score += sign * shield * 10;
        }
      }
    }
  }
  return seat === 0 ? score : -score;
}
