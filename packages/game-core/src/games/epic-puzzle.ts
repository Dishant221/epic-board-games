import type { Rng } from '../rng';
import { getPuzzleImage, getPuzzleSize, PUZZLE_IMAGES, PUZZLE_SIZES, type PuzzleSizeId } from './epic-puzzle-data';
import { DRAW, IllegalMoveError, type GameEngine } from './types';

export * from './epic-puzzle-data';

/**
 * Co-operative jigsaw. Piece `i` belongs in slot `i` (row-major), so the
 * state only needs to know *who* placed each piece and which pieces remain in
 * the tray. The board decides whether a drop is close enough to snap; the
 * engine simply trusts a `place` move (there is nothing to cheat for).
 */
export interface EpicPuzzleState {
  phase: 'pick' | 'play';
  imageId: string | null;
  cols: number;
  rows: number;
  /** Seat that placed each piece (index = piece = correct slot), null while loose. */
  placed: (number | null)[];
  /** Unplaced pieces in shuffled tray order. */
  tray: number[];
  /** Pieces placed per seat. */
  scores: number[];
  startedAt: number | null;
  finishedAt: number | null;
  playerCount: number;
  winner: number | null;
}

export type EpicPuzzleMove = { type: 'start'; imageId: string; size: PuzzleSizeId } | { type: 'place'; piece: number };

const MAX_PIECES = Math.max(...PUZZLE_SIZES.map((s) => s.cols * s.rows));

function shuffledPieces(count: number, rng: Rng): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  // Fisher–Yates with the seeded rng so the server and tests can replay it.
  for (let i = count - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const t = order[i]!;
    order[i] = order[j]!;
    order[j] = t;
  }
  return order;
}

/** Most pieces wins; an exact tie is a draw. Solo always wins. */
function decideWinner(scores: number[]): number {
  let best = -1;
  let count = 0;
  let seat = 0;
  scores.forEach((n, i) => {
    if (n > best) {
      best = n;
      count = 1;
      seat = i;
    } else if (n === best) {
      count++;
    }
  });
  return count > 1 ? DRAW : seat;
}

export function formatPuzzleDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Grid position of a piece / slot (row-major). */
export function pieceSlot(piece: number, cols: number): { col: number; row: number } {
  return { col: piece % cols, row: Math.floor(piece / cols) };
}

export function puzzlePlacedCount(s: EpicPuzzleState): number {
  return s.placed.length - s.tray.length;
}

export const epicPuzzle: GameEngine<EpicPuzzleState, EpicPuzzleMove> = {
  id: 'epic_puzzle',
  simultaneous: true,
  init(playerCount) {
    if (playerCount < 1 || playerCount > 2) throw new Error('Epic Puzzle supports 1–2 players');
    return {
      phase: 'pick',
      imageId: null,
      cols: 0,
      rows: 0,
      placed: [],
      tray: [],
      scores: Array<number>(playerCount).fill(0),
      startedAt: null,
      finishedAt: null,
      playerCount,
      winner: null,
    };
  },
  // Advisory only: any seat may move at any time.
  currentPlayer: () => 0,
  legalMoves(s) {
    if (s.winner !== null) return [];
    if (s.phase === 'pick') {
      const moves: EpicPuzzleMove[] = [];
      for (const image of PUZZLE_IMAGES) for (const size of PUZZLE_SIZES) moves.push({ type: 'start', imageId: image.id, size: size.id });
      return moves;
    }
    return s.tray.map((piece) => ({ type: 'place', piece }) as EpicPuzzleMove);
  },
  applyMove(s, m, rng, seat = 0) {
    if (s.winner !== null) throw new IllegalMoveError('The puzzle is finished');
    if (m.type === 'start') {
      if (s.phase !== 'pick') throw new IllegalMoveError('The puzzle has already started');
      const image = getPuzzleImage(m.imageId);
      const size = getPuzzleSize(m.size);
      if (!image || !size) throw new IllegalMoveError('Unknown image or size');
      const count = size.cols * size.rows;
      return {
        ...s,
        phase: 'play',
        imageId: image.id,
        cols: size.cols,
        rows: size.rows,
        placed: Array<number | null>(count).fill(null),
        tray: shuffledPieces(count, rng),
        scores: Array<number>(s.playerCount).fill(0),
        // Wall-clock stamps only feed the timer / summary; rules never read them.
        startedAt: Date.now(),
        finishedAt: null,
      };
    }
    if (s.phase !== 'play') throw new IllegalMoveError('Pick an image first');
    if (!Number.isInteger(m.piece) || m.piece < 0 || m.piece >= s.placed.length) throw new IllegalMoveError('No such piece');
    if (s.placed[m.piece] !== null) throw new IllegalMoveError('Piece already placed');
    if (!Number.isInteger(seat) || seat < 0 || seat >= s.playerCount) throw new IllegalMoveError('Bad seat');
    const placed = s.placed.slice();
    placed[m.piece] = seat;
    const scores = s.scores.slice();
    scores[seat] = (scores[seat] ?? 0) + 1;
    const tray = s.tray.filter((p) => p !== m.piece);
    const done = tray.length === 0;
    return {
      ...s,
      placed,
      scores,
      tray,
      finishedAt: done ? Date.now() : null,
      winner: done ? decideWinner(scores) : null,
    };
  },
  isTerminal: (s) => s.winner !== null,
  winner: (s) => s.winner,
  parseMove(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as { type?: unknown; imageId?: unknown; size?: unknown; piece?: unknown };
    if (r.type === 'start') {
      if (typeof r.imageId !== 'string' || typeof r.size !== 'string') return null;
      if (!getPuzzleImage(r.imageId) || !getPuzzleSize(r.size)) return null;
      return { type: 'start', imageId: r.imageId, size: r.size as PuzzleSizeId };
    }
    if (r.type === 'place') {
      const piece = r.piece;
      if (typeof piece !== 'number' || !Number.isInteger(piece) || piece < 0 || piece >= MAX_PIECES) return null;
      return { type: 'place', piece };
    }
    return null;
  },
  sameMove(a, b) {
    if (a.type === 'start') return b.type === 'start' && a.imageId === b.imageId && a.size === b.size;
    return b.type === 'place' && a.piece === b.piece;
  },
  summary(s) {
    if (s.startedAt === null || s.finishedAt === null) return null;
    const time = formatPuzzleDuration(s.finishedAt - s.startedAt);
    if (s.playerCount === 1) return `Solved in ${time} — ${s.placed.length} pieces`;
    // The engine does not know display names; the board shows real ones.
    const tally = s.scores.map((n, i) => `Player ${i + 1} ${n}`).join(' · ');
    return `Solved together in ${time} — ${tally}`;
  },
};
