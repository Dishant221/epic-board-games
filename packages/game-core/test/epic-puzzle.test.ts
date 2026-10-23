import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRng, DRAW, IllegalMoveError } from '../src';
import {
  epicPuzzle,
  formatPuzzleDuration,
  pieceSlot,
  PUZZLE_IMAGES,
  PUZZLE_SIZES,
  puzzlePlacedCount,
  type EpicPuzzleState,
} from '../src/games/epic-puzzle';

const PUBLIC_DIR = fileURLToPath(new URL('../../../apps/web/public', import.meta.url));

/**
 * Minimal XML well-formedness check (node has no XML parser): tags must nest
 * and close properly, attributes must be quoted and `&` must start an entity.
 */
function assertWellFormedXml(xml: string): void {
  expect(xml.includes('<?xml')).toBe(false);
  // Every `&` must be an entity reference.
  expect(xml.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, '')).not.toContain('&');
  const stack: string[] = [];
  const tag = /<!--[\s\S]*?-->|<(\/)?([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/)?>/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml)) !== null) {
    // No stray `<` between tags (would be malformed markup).
    expect(xml.slice(cursor, m.index)).not.toContain('<');
    cursor = m.index + m[0].length;
    if (m[0].startsWith('<!--')) continue;
    const [, close, name, , selfClose] = m;
    if (close) expect(stack.pop()).toBe(name);
    else if (!selfClose) stack.push(name!);
  }
  expect(xml.slice(cursor)).not.toContain('<');
  expect(stack).toEqual([]);
}

describe('epic puzzle gallery data', () => {
  it('has at least 20 images with unique ids across the three categories', () => {
    expect(PUZZLE_IMAGES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(PUZZLE_IMAGES.map((i) => i.id)).size).toBe(PUZZLE_IMAGES.length);
    expect(new Set(PUZZLE_IMAGES.map((i) => i.src)).size).toBe(PUZZLE_IMAGES.length);
    for (const category of ['Paintings', 'Cartoons', 'Creatures']) expect(PUZZLE_IMAGES.filter((i) => i.category === category).length).toBeGreaterThanOrEqual(6);
    for (const image of PUZZLE_IMAGES) {
      expect(image.title.length).toBeGreaterThan(0);
      expect(image.alt.length).toBeGreaterThan(10);
      expect(image.palette).toHaveLength(3);
      for (const c of image.palette) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('points every src at a real, self-contained SVG under apps/web/public/puzzles', () => {
    for (const image of PUZZLE_IMAGES) {
      expect(image.src).toMatch(/^\/puzzles\/[a-z0-9-]+\.svg$/);
      const file = join(PUBLIC_DIR, ...image.src.split('/').filter(Boolean));
      expect(existsSync(file), `${image.src} is missing`).toBe(true);
      expect(statSync(file).size, `${image.src} exceeds 60 KB`).toBeLessThanOrEqual(60 * 1024);
      const xml = readFileSync(file, 'utf8');
      expect(xml.startsWith('<svg'), `${image.src} must start with <svg`).toBe(true);
      expect(xml).toMatch(/viewBox="0 0 1200 800"/);
      expect(xml).not.toMatch(/<script|<image|<foreignObject/i);
      expect(xml.replace(/xmlns(:\w+)?="[^"]*"/g, '')).not.toMatch(/https?:\/\//);
      assertWellFormedXml(xml);
    }
  });

  it('ships no stray files in the puzzles folder', () => {
    const known = new Set(PUZZLE_IMAGES.map((i) => i.src.split('/').pop()));
    for (const f of readdirSync(join(PUBLIC_DIR, 'puzzles'))) expect(known.has(f), `${f} is not in PUZZLE_IMAGES`).toBe(true);
  });

  it('defines the four sizes', () => {
    expect(PUZZLE_SIZES.map((s) => s.id)).toEqual(['easy', 'medium', 'hard', 'expert']);
    expect(PUZZLE_SIZES.map((s) => s.cols * s.rows)).toEqual([12, 24, 48, 80]);
  });
});

describe('epic puzzle engine', () => {
  const image = PUZZLE_IMAGES[0]!.id;
  const start = (seed = 1, players = 2) => {
    const rng = createRng(seed);
    const s = epicPuzzle.applyMove(epicPuzzle.init(players, rng), { type: 'start', imageId: image, size: 'easy' }, rng, 0);
    return { s, rng };
  };

  it('is simultaneous and starts in the pick phase with every image × size as a legal move', () => {
    expect(epicPuzzle.simultaneous).toBe(true);
    const s = epicPuzzle.init(2, createRng(1));
    expect(s.phase).toBe('pick');
    expect(s.scores).toEqual([0, 0]);
    expect(epicPuzzle.currentPlayer(s)).toBe(0);
    const moves = epicPuzzle.legalMoves(s);
    expect(moves).toHaveLength(PUZZLE_IMAGES.length * PUZZLE_SIZES.length);
    expect(moves.length).toBeLessThanOrEqual(100);
    expect(moves.every((m) => m.type === 'start')).toBe(true);
    expect(() => epicPuzzle.init(3, createRng(1))).toThrow();
  });

  it('start deals a tray that is a permutation of all pieces, deterministic per seed', () => {
    const { s } = start(7);
    expect(s.phase).toBe('play');
    expect(s.cols).toBe(4);
    expect(s.rows).toBe(3);
    expect(s.placed).toEqual(Array(12).fill(null));
    expect(s.tray.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(s.tray).not.toEqual(Array.from({ length: 12 }, (_, i) => i)); // actually shuffled
    expect(s.startedAt).not.toBeNull();
    expect(start(7).s.tray).toEqual(s.tray);
    expect(start(8).s.tray).not.toEqual(s.tray);
    expect(epicPuzzle.legalMoves(s).map((m) => (m.type === 'place' ? m.piece : -1))).toEqual(s.tray);
  });

  it('rejects placing in pick phase and starting twice', () => {
    const rng = createRng(1);
    const fresh = epicPuzzle.init(1, rng);
    expect(() => epicPuzzle.applyMove(fresh, { type: 'place', piece: 0 }, rng, 0)).toThrow(IllegalMoveError);
    const { s } = start();
    expect(() => epicPuzzle.applyMove(s, { type: 'start', imageId: image, size: 'hard' }, rng, 0)).toThrow(IllegalMoveError);
    expect(() => epicPuzzle.applyMove(fresh, { type: 'start', imageId: 'nope', size: 'easy' }, rng, 0)).toThrow(IllegalMoveError);
  });

  it('place credits the seat that moved and removes the piece from the tray', () => {
    const { s, rng } = start();
    const a = epicPuzzle.applyMove(s, { type: 'place', piece: 5 }, rng, 1);
    expect(a.placed[5]).toBe(1);
    expect(a.scores).toEqual([0, 1]);
    expect(a.tray).not.toContain(5);
    expect(a.tray).toHaveLength(11);
    expect(puzzlePlacedCount(a)).toBe(1);
    expect(s.placed[5]).toBeNull(); // input not mutated
    expect(s.tray).toHaveLength(12);
    const b = epicPuzzle.applyMove(a, { type: 'place', piece: 0 }, rng, 0);
    expect(b.scores).toEqual([1, 1]);
    expect(b.winner).toBeNull();
  });

  it('rejects duplicate, out-of-range and garbage moves', () => {
    const { s, rng } = start();
    const a = epicPuzzle.applyMove(s, { type: 'place', piece: 3 }, rng, 0);
    expect(() => epicPuzzle.applyMove(a, { type: 'place', piece: 3 }, rng, 1)).toThrow(IllegalMoveError);
    expect(() => epicPuzzle.applyMove(a, { type: 'place', piece: 12 }, rng, 0)).toThrow(IllegalMoveError);
    expect(() => epicPuzzle.applyMove(a, { type: 'place', piece: -1 }, rng, 0)).toThrow(IllegalMoveError);
    expect(() => epicPuzzle.applyMove(a, { type: 'place', piece: 1 }, rng, 2)).toThrow(IllegalMoveError);
    expect(epicPuzzle.legalMoves(a).some((m) => epicPuzzle.sameMove(m, { type: 'place', piece: 3 }))).toBe(false);

    expect(epicPuzzle.parseMove(null)).toBeNull();
    expect(epicPuzzle.parseMove('place')).toBeNull();
    expect(epicPuzzle.parseMove({ type: 'place' })).toBeNull();
    expect(epicPuzzle.parseMove({ type: 'place', piece: '3' })).toBeNull();
    expect(epicPuzzle.parseMove({ type: 'place', piece: 2.5 })).toBeNull();
    expect(epicPuzzle.parseMove({ type: 'place', piece: 999 })).toBeNull();
    expect(epicPuzzle.parseMove({ type: 'place', piece: 4 })).toEqual({ type: 'place', piece: 4 });
    expect(epicPuzzle.parseMove({ type: 'start', imageId: image, size: 'huge' })).toBeNull();
    expect(epicPuzzle.parseMove({ type: 'start', imageId: 'missing', size: 'easy' })).toBeNull();
    expect(epicPuzzle.parseMove({ type: 'start', imageId: image, size: 'medium', extra: 1 })).toEqual({ type: 'start', imageId: image, size: 'medium' });
    expect(epicPuzzle.parseMove({ type: 'roll' })).toBeNull();
  });

  it('declares the seat with the most pieces the winner, or a draw on a tie', () => {
    const finish = (seatFor: (piece: number) => number) => {
      let { s } = start();
      const rng = createRng(3);
      for (const piece of s.tray.slice()) s = epicPuzzle.applyMove(s, { type: 'place', piece }, rng, seatFor(piece));
      return s;
    };
    const win = finish((p) => (p < 8 ? 1 : 0));
    expect(win.scores).toEqual([4, 8]);
    expect(win.winner).toBe(1);
    expect(epicPuzzle.isTerminal(win)).toBe(true);
    expect(epicPuzzle.legalMoves(win)).toEqual([]);
    expect(win.finishedAt).not.toBeNull();
    expect(() => epicPuzzle.applyMove(win, { type: 'place', piece: 0 }, createRng(1), 0)).toThrow(IllegalMoveError);

    const tie = finish((p) => p % 2);
    expect(tie.scores).toEqual([6, 6]);
    expect(tie.winner).toBe(DRAW);
  });

  it('solo player wins when solved', () => {
    let { s } = start(5, 1);
    const rng = createRng(1);
    for (const piece of s.tray.slice()) s = epicPuzzle.applyMove(s, { type: 'place', piece }, rng, 0);
    expect(s.winner).toBe(0);
    expect(s.scores).toEqual([12]);
  });

  it('summarises time and tally', () => {
    const base: EpicPuzzleState = { ...start().s, startedAt: 1_000, finishedAt: 1_000 + 272_000, scores: [14, 10] };
    expect(epicPuzzle.summary?.(base)).toBe('Solved together in 4:32 — Player 1 14 · Player 2 10');
    expect(epicPuzzle.summary?.({ ...base, playerCount: 1, scores: [12] })).toBe('Solved in 4:32 — 12 pieces');
    expect(epicPuzzle.summary?.({ ...base, finishedAt: null })).toBeNull();
    expect(formatPuzzleDuration(59_999)).toBe('0:59');
    expect(formatPuzzleDuration(600_000)).toBe('10:00');
  });

  it('maps pieces to row-major slots and keeps state JSON-safe', () => {
    expect(pieceSlot(0, 4)).toEqual({ col: 0, row: 0 });
    expect(pieceSlot(5, 4)).toEqual({ col: 1, row: 1 });
    expect(pieceSlot(11, 4)).toEqual({ col: 3, row: 2 });
    const { s } = start();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
