import { describe, expect, it } from 'vitest';
import { chooseMove, createRng, DRAW, IllegalMoveError } from '../src';
// Imported directly: the integrator registers the engine in games/index.ts.
import { chess, fromFEN, isInCheck, movesFrom, parseSquare, perft, START_FEN, toFEN, toSAN, type ChessMove, type ChessState } from '../src/games/chess';

const rng = createRng(1);
const sq = (name: string) => parseSquare(name)!;
const mv = (from: string, to: string, promo?: ChessMove['promo']): ChessMove => (promo ? { from: sq(from), to: sq(to), promo } : { from: sq(from), to: sq(to) });
const play = (s: ChessState, ...moves: ChessMove[]) => moves.reduce((st, m) => chess.applyMove(st, m, rng), s);
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

describe('chess move generation (perft)', () => {
  const start = chess.init(2, rng);

  it('counts the initial position', () => {
    expect(perft(start, 1)).toBe(20);
    expect(perft(start, 2)).toBe(400);
    expect(perft(start, 3)).toBe(8_902);
  });

  it('counts the initial position at depth 4', () => {
    expect(perft(start, 4)).toBe(197_281);
  });

  it('counts Kiwipete (castling, en passant, promotions, checks)', () => {
    const s = fromFEN(KIWIPETE);
    expect(perft(s, 1)).toBe(48);
    expect(perft(s, 2)).toBe(2_039);
  });

  it('legalMoves matches perft and FEN round-trips', () => {
    expect(chess.legalMoves(start)).toHaveLength(20);
    expect(toFEN(start)).toBe(START_FEN);
    expect(toFEN(fromFEN(KIWIPETE))).toBe(KIWIPETE);
    expect(movesFrom(start, sq('e2'))).toEqual([mv('e2', 'e3'), mv('e2', 'e4')]);
  });
});

describe('chess rules', () => {
  it('castles both ways and moves the rook', () => {
    const s = fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const moves = chess.legalMoves(s);
    expect(moves).toContainEqual(mv('e1', 'g1'));
    expect(moves).toContainEqual(mv('e1', 'c1'));
    const short = chess.applyMove(s, mv('e1', 'g1'), rng);
    expect(short.board[sq('g1')]).toBe('K');
    expect(short.board[sq('f1')]).toBe('R');
    expect(short.board[sq('h1')]).toBe('.');
    expect(short.castling).toBe('kq');
    expect(short.san.at(-1)).toBe('O-O');
    const long = chess.applyMove(chess.applyMove(s, mv('a1', 'a2'), rng), mv('e8', 'c8'), rng);
    expect(long.board[sq('c8')]).toBe('k');
    expect(long.board[sq('d8')]).toBe('r');
    expect(long.san.at(-1)).toBe('O-O-O');
    // Moving the king forfeits both rights.
    expect(chess.applyMove(s, mv('e1', 'd1'), rng).castling).toBe('kq');
    // Moving a rook forfeits that side only.
    expect(chess.applyMove(s, mv('h1', 'h2'), rng).castling).toBe('Qkq');
  });

  it('refuses to castle out of, through or into check, or across pieces', () => {
    // Rook on f2 attacks f1: short castling passes through check; long is fine.
    const through = chess.legalMoves(fromFEN('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1'));
    expect(through).not.toContainEqual(mv('e1', 'g1'));
    expect(through).toContainEqual(mv('e1', 'c1'));
    // Rook on g2 attacks g1: castling into check.
    expect(chess.legalMoves(fromFEN('r3k2r/8/8/8/8/8/6r1/R3K2R w KQkq - 0 1'))).not.toContainEqual(mv('e1', 'g1'));
    // Rook on e2 gives check: no castling at all.
    const inCheck = fromFEN('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1');
    expect(inCheck.inCheck).toBe(true);
    expect(chess.legalMoves(inCheck).filter((m) => m.from === sq('e1') && Math.abs(m.to - m.from) === 2)).toEqual([]);
    // b1 occupied blocks long castling even though the king never crosses it.
    expect(chess.legalMoves(fromFEN('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1'))).not.toContainEqual(mv('e1', 'c1'));
    expect(chess.legalMoves(chess.init(2, rng))).not.toContainEqual(mv('e1', 'g1'));
  });

  it('captures en passant and the right expires after one move', () => {
    let s = play(chess.init(2, rng), mv('e2', 'e4'), mv('a7', 'a6'), mv('e4', 'e5'), mv('d7', 'd5'));
    expect(s.ep).toBe(sq('d6'));
    expect(movesFrom(s, sq('e5'))).toContainEqual(mv('e5', 'd6'));
    const after = chess.applyMove(s, mv('e5', 'd6'), rng);
    expect(after.board[sq('d6')]).toBe('P');
    expect(after.board[sq('d5')]).toBe('.');
    expect(after.captured).toEqual(['p']);
    expect(after.san.at(-1)).toBe('exd6');
    expect(after.halfmove).toBe(0);
    // Any other move loses the en passant right.
    s = play(s, mv('a2', 'a3'), mv('a6', 'a5'));
    expect(s.ep).toBeNull();
    expect(movesFrom(s, sq('e5'))).not.toContainEqual(mv('e5', 'd6'));
  });

  it('promotes to the chosen piece and requires a promo flag on the last rank', () => {
    const s = fromFEN('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const promos = movesFrom(s, sq('a7'));
    expect(promos).toHaveLength(4);
    expect(promos.every((m) => m.promo)).toBe(true);
    expect(() => chess.applyMove(s, mv('a7', 'a8'), rng)).toThrow(IllegalMoveError);
    const knight = chess.applyMove(s, mv('a7', 'a8', 'n'), rng);
    expect(knight.board[sq('a8')]).toBe('N');
    expect(knight.san.at(-1)).toBe('a8=N');
    const queen = chess.applyMove(s, mv('a7', 'a8', 'q'), rng);
    expect(queen.board[sq('a8')]).toBe('Q');
    expect(queen.inCheck).toBe(true);
    expect(queen.san.at(-1)).toBe('a8=Q+');
  });

  it("fool's mate is checkmate for Black", () => {
    const s = play(chess.init(2, rng), mv('f2', 'f3'), mv('e7', 'e5'), mv('g2', 'g4'), mv('d8', 'h4'));
    expect(s.result).toBe('checkmate');
    expect(s.winner).toBe(1);
    expect(s.inCheck).toBe(true);
    expect(isInCheck(s, 0)).toBe(true);
    expect(chess.isTerminal(s)).toBe(true);
    expect(chess.legalMoves(s)).toEqual([]);
    expect(s.san).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(chess.summary?.(s)).toBe('Checkmate in 2 moves');
    expect(() => chess.applyMove(s, mv('a2', 'a3'), rng)).toThrow(IllegalMoveError);
  });

  it('detects stalemate', () => {
    const s = chess.applyMove(fromFEN('7k/8/6K1/8/8/8/8/5Q2 w - - 0 1'), mv('f1', 'f7'), rng);
    expect(s.inCheck).toBe(false);
    expect(s.result).toBe('stalemate');
    expect(s.winner).toBe(DRAW);
    expect(chess.summary?.(s)).toBe('Draw by stalemate');
    expect(fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').result).toBe('stalemate');
  });

  it('draws on insufficient material', () => {
    const s = chess.applyMove(fromFEN('8/8/8/8/6n1/2k5/8/K2B4 w - - 0 1'), mv('d1', 'g4'), rng);
    expect(s.result).toBe('material');
    expect(s.winner).toBe(DRAW);
    expect(fromFEN('8/8/8/8/8/2k5/8/K7 w - - 0 1').result).toBe('material');
    // Same-colour bishops: dead; opposite colours: still playable.
    expect(fromFEN('kb6/8/8/8/8/8/8/K1B5 w - - 0 1').result).toBe('material');
    expect(fromFEN('k1b5/8/8/8/8/8/8/K1B5 w - - 0 1').result).toBeNull();
    expect(fromFEN('k7/8/8/8/8/8/8/K1B4N w - - 0 1').result).toBeNull();
    expect(fromFEN('k7/p7/8/8/8/8/8/K7 w - - 0 1').result).toBeNull();
  });

  it('draws by the 50-move rule but checkmate takes precedence', () => {
    const s = fromFEN('k7/8/8/8/8/8/8/K6R w - - 99 80');
    expect(s.result).toBeNull();
    const drawn = chess.applyMove(s, mv('h1', 'h2'), rng);
    expect(drawn.halfmove).toBe(100);
    expect(drawn.result).toBe('fifty');
    expect(chess.summary?.(drawn)).toBe('Draw by the 50-move rule');
    const mate = chess.applyMove(fromFEN('k7/8/K7/8/8/8/8/7R w - - 99 80'), mv('h1', 'h8'), rng);
    expect(mate.result).toBe('checkmate');
    expect(mate.winner).toBe(0);
    // A pawn move or capture resets the counter.
    expect(chess.applyMove(fromFEN('k7/8/8/8/8/8/P7/K7 w - - 99 80'), mv('a2', 'a3'), rng).halfmove).toBe(0);
  });

  it('draws by threefold repetition', () => {
    const shuffle = [mv('g1', 'f3'), mv('g8', 'f6'), mv('f3', 'g1'), mv('f6', 'g8')];
    const s7 = play(chess.init(2, rng), ...shuffle, ...shuffle.slice(0, 3));
    expect(s7.result).toBeNull();
    const s8 = chess.applyMove(s7, shuffle[3]!, rng);
    expect(s8.result).toBe('repetition');
    expect(s8.winner).toBe(DRAW);
    expect(chess.summary?.(s8)).toBe('Draw by threefold repetition');
  });

  it('never allows leaving the own king in check', () => {
    // The rook on e8 pins the knight on e2 to the king on e1.
    const s = fromFEN('4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1');
    expect(movesFrom(s, sq('e2'))).toEqual([]);
    expect(s.inCheck).toBe(false);
    // In check: only moves that resolve it.
    const checked = fromFEN('4r2k/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(checked.inCheck).toBe(true);
    for (const m of chess.legalMoves(checked)) expect(chess.applyMove(checked, m, rng).turn).toBe(1);
    expect(chess.legalMoves(checked).every((m) => (m.to & 7) !== 4)).toBe(true);
  });

  it('writes SAN with captures, disambiguation and checks', () => {
    const s = fromFEN('k7/8/8/8/8/8/R6R/K7 w - - 0 1');
    expect(toSAN(s, mv('a2', 'e2'))).toBe('Rae2');
    expect(toSAN(s, mv('h2', 'h8'))).toBe('Rh8+');
    const knights = fromFEN('k7/8/8/8/8/8/N1N5/K7 w - - 0 1');
    expect(toSAN(knights, mv('a2', 'b4'))).toBe('Nab4');
    const capture = play(chess.init(2, rng), mv('e2', 'e4'), mv('d7', 'd5'));
    expect(toSAN(capture, mv('e4', 'd5'))).toBe('exd5');
    expect(play(capture, mv('e4', 'd5'), mv('d8', 'd5')).san).toEqual(['e4', 'd5', 'exd5', 'Qxd5']);
  });

  it('parseMove rejects garbage and keeps clean objects', () => {
    expect(chess.parseMove(null)).toBeNull();
    expect(chess.parseMove('e2e4')).toBeNull();
    expect(chess.parseMove({})).toBeNull();
    expect(chess.parseMove({ from: '12', to: 28 })).toBeNull();
    expect(chess.parseMove({ from: 12, to: 64 })).toBeNull();
    expect(chess.parseMove({ from: -1, to: 28 })).toBeNull();
    expect(chess.parseMove({ from: 1.5, to: 28 })).toBeNull();
    expect(chess.parseMove({ from: 12, to: 12 })).toBeNull();
    expect(chess.parseMove({ from: 48, to: 56, promo: 'k' })).toBeNull();
    expect(chess.parseMove({ from: 48, to: 56, promo: null })).toBeNull();
    expect(chess.parseMove({ from: 12, to: 28, extra: true })).toEqual({ from: 12, to: 28 });
    expect(chess.parseMove({ from: 48, to: 56, promo: 'q' })).toEqual({ from: 48, to: 56, promo: 'q' });
    expect(chess.sameMove({ from: 1, to: 2 }, { from: 1, to: 2 })).toBe(true);
    expect(chess.sameMove({ from: 1, to: 2, promo: 'q' }, { from: 1, to: 2, promo: 'r' })).toBe(false);
  });

  it('keeps the state plain JSON and compact', () => {
    let s = chess.init(2, rng);
    const r = createRng(99);
    for (let i = 0; i < 60 && !chess.isTerminal(s); i++) s = chess.applyMove(s, r.pick(chess.legalMoves(s)), r);
    const json = JSON.stringify(s);
    expect(JSON.parse(json)).toEqual(s);
    expect(json.length).toBeLessThan(30_000);
  });
});

describe('chess AI', () => {
  it('impossible finds mate in one', () => {
    // Scholar's mate: 4. Qxf7#.
    const s = fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const m = chooseMove(chess, s, 'impossible', createRng(3));
    expect(m).toEqual(mv('h5', 'f7'));
    expect(chess.applyMove(s, m, rng).result).toBe('checkmate');
    // Back-rank mate as Black: Ra1#.
    const black = fromFEN('r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1');
    const bm = chooseMove(chess, black, 'impossible', createRng(3));
    expect(bm).toEqual(mv('a8', 'a1'));
    expect(chess.applyMove(black, bm, rng).result).toBe('checkmate');
  });

  it('never returns an illegal move over 50 random positions', () => {
    const r = createRng(2024);
    for (let i = 0; i < 50; i++) {
      let s = chess.init(2, r);
      const plies = r.int(0, 40);
      for (let p = 0; p < plies && !chess.isTerminal(s); p++) s = chess.applyMove(s, r.pick(chess.legalMoves(s)), r);
      if (chess.isTerminal(s)) continue;
      const difficulty = i % 10 === 0 ? 'hard' : 'medium';
      const m = chooseMove(chess, s, difficulty, r);
      const legal = chess.legalMoves(s);
      expect(legal.some((x) => chess.sameMove(x, m))).toBe(true);
      expect(() => chess.applyMove(s, m, r)).not.toThrow();
    }
  });

  it('prefers winning material', () => {
    // White queen can take a free rook on d8.
    const s = fromFEN('3r3k/8/8/8/8/8/8/3Q3K w - - 0 1');
    expect(chooseMove(chess, s, 'impossible', createRng(5))).toEqual(mv('d1', 'd8'));
  });
});
