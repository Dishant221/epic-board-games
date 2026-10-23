import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { IllegalMoveError } from '../src/games/types';
import {
  findMatches,
  generateDeal,
  isFree,
  mahjong,
  MAHJONG_LAYOUTS,
  tileMatches,
  type MahjongState,
  type MahjongTile,
} from '../src/games/mahjong';

function started(layoutId = 'turtle', seed = 1): MahjongState {
  const rng = createRng(seed);
  return mahjong.applyMove(mahjong.init(1, rng), { type: 'start', layoutId }, rng);
}

/** Hand-built state from positions (kinds default to 'c1' so everything matches). */
function stateOf(tiles: Partial<MahjongTile>[]): MahjongState {
  return {
    ...mahjong.init(1, createRng(1)),
    phase: 'play',
    layoutId: 'turtle',
    tiles: tiles.map((t) => ({ kind: 'c1', x: 0, y: 0, z: 0, removed: false, ...t })),
  };
}

describe('mahjong layouts', () => {
  it('has at least 3 layouts of 144 non-overlapping, supported positions', () => {
    expect(MAHJONG_LAYOUTS.length).toBeGreaterThanOrEqual(3);
    expect(MAHJONG_LAYOUTS.map((l) => l.id)).toEqual(expect.arrayContaining(['turtle', 'pyramid', 'butterfly']));
    for (const layout of MAHJONG_LAYOUTS) {
      expect(layout.positions, layout.id).toHaveLength(144);
      const ps = layout.positions;
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i]!;
        expect(Number.isInteger(a.x) && Number.isInteger(a.y) && Number.isInteger(a.z)).toBe(true);
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j]!;
          const overlap = a.z === b.z && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
          expect(overlap, `${layout.id}: ${i} overlaps ${j}`).toBe(false);
        }
        // Every raised tile rests on at least one tile of the layer below.
        if (a.z > 0) expect(ps.some((b) => b.z === a.z - 1 && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2), `${layout.id}: ${i} floats`).toBe(true);
      }
    }
  });
});

describe('free-tile rule', () => {
  it('a lone tile is free; a tile with both sides blocked is not', () => {
    const row = stateOf([{ x: 0 }, { x: 2 }, { x: 4 }]);
    expect(isFree(row, 0)).toBe(true);
    expect(isFree(row, 1)).toBe(false);
    expect(isFree(row, 2)).toBe(true);
  });

  it('a tile covered from above is not free, even with a half offset', () => {
    const s = stateOf([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1, z: 1 }]);
    expect(isFree(s, 0)).toBe(false);
    expect(isFree(s, 1)).toBe(false);
    expect(isFree(s, 2)).toBe(true);
  });

  it('half-offset side neighbours block a side; vertical neighbours do not', () => {
    const s = stateOf([{ x: 2, y: 2 }, { x: 0, y: 1 }, { x: 4, y: 3 }]);
    expect(isFree(s, 0)).toBe(false);
    const vertical = stateOf([{ x: 2, y: 2 }, { x: 2, y: 0 }, { x: 2, y: 4 }]);
    expect(isFree(vertical, 0)).toBe(true);
  });

  it('removed tiles neither block nor count as free', () => {
    const s = stateOf([{ x: 0 }, { x: 2 }, { x: 4, removed: true }]);
    expect(isFree(s, 1)).toBe(true);
    expect(isFree(s, 2)).toBe(false);
  });

  it('tileMatches: identical kinds, any season / any flower', () => {
    expect(tileMatches('c1', 'c1')).toBe(true);
    expect(tileMatches('c1', 'c2')).toBe(false);
    expect(tileMatches('b1', 'c1')).toBe(false);
    expect(tileMatches('s1', 's4')).toBe(true);
    expect(tileMatches('f2', 'f3')).toBe(true);
    expect(tileMatches('s1', 'f1')).toBe(false);
    expect(tileMatches('dR', 'dG')).toBe(false);
  });
});

describe('deals', () => {
  it('generated deals use the standard 144-tile set and are solvable in generation order', () => {
    for (const layout of MAHJONG_LAYOUTS) {
      for (const seed of [1, 2, 3]) {
        const deal = generateDeal(layout.positions, createRng(seed));
        const counts = new Map<string, number>();
        for (const k of deal.kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
        expect(counts.size).toBe(34 + 8);
        for (const [k, n] of counts) expect(n, k).toBe(k[0] === 's' || k[0] === 'f' ? 1 : 4);
        expect(deal.order, `${layout.id} seed ${seed} dead-ended`).toHaveLength(144);

        let s = stateOf(layout.positions.map((p, i) => ({ ...p, kind: deal.kinds[i]! })));
        for (let k = 0; k < deal.order.length; k += 2) {
          const [a, b] = [Math.min(deal.order[k]!, deal.order[k + 1]!), Math.max(deal.order[k]!, deal.order[k + 1]!)];
          expect(findMatches(s)).toContainEqual([a, b]);
          s = mahjong.applyMove(s, { type: 'match', a, b }, createRng(1));
        }
        expect(mahjong.winner(s)).toBe(0);
      }
    }
  });

  it('start is deterministic for a given rng seed', () => {
    expect(started('pyramid', 9).tiles).toEqual(started('pyramid', 9).tiles);
    expect(started('pyramid', 9).tiles).not.toEqual(started('pyramid', 10).tiles);
  });
});

describe('mahjong engine', () => {
  it('pick phase offers every layout and rejects other moves', () => {
    const rng = createRng(1);
    const s = mahjong.init(1, rng);
    expect(mahjong.legalMoves(s)).toEqual(MAHJONG_LAYOUTS.map((l) => ({ type: 'start', layoutId: l.id })));
    expect(() => mahjong.applyMove(s, { type: 'start', layoutId: 'cube' }, rng)).toThrow(IllegalMoveError);
    expect(() => mahjong.applyMove(s, { type: 'undo' }, rng)).toThrow(IllegalMoveError);
  });

  it('match removes free matching tiles; rejects blocked, mismatched or reversed pairs', () => {
    const rng = createRng(1);
    let s = started();
    expect(s.tiles).toHaveLength(144);
    const [a, b] = findMatches(s)[0]!;
    expect(mahjong.legalMoves(s)).toContainEqual({ type: 'match', a, b });
    expect(() => mahjong.applyMove(s, { type: 'match', a: b, b: a }, rng)).toThrow(IllegalMoveError);
    const blocked = s.tiles.findIndex((_, i) => !isFree(s, i));
    expect(() => mahjong.applyMove(s, { type: 'match', a: Math.min(a, blocked), b: Math.max(a, blocked) }, rng)).toThrow(IllegalMoveError);
    const other = s.tiles.findIndex((t, i) => isFree(s, i) && !tileMatches(t.kind, s.tiles[a]!.kind));
    expect(() => mahjong.applyMove(s, { type: 'match', a: Math.min(a, other), b: Math.max(a, other) }, rng)).toThrow(IllegalMoveError);
    s = mahjong.applyMove(s, { type: 'match', a, b }, rng);
    expect(s.tiles[a]!.removed).toBe(true);
    expect(s.tiles[b]!.removed).toBe(true);
    expect(s.removedOrder).toEqual([a, b]);
    expect(s.tiles.filter((t) => !t.removed)).toHaveLength(142);
  });

  it('undo restores the last pair and is only offered when possible', () => {
    const rng = createRng(1);
    let s = started();
    expect(mahjong.legalMoves(s)).not.toContainEqual({ type: 'undo' });
    expect(() => mahjong.applyMove(s, { type: 'undo' }, rng)).toThrow(IllegalMoveError);
    const before = s;
    const [a, b] = findMatches(s)[0]!;
    s = mahjong.applyMove(s, { type: 'match', a, b }, rng);
    expect(mahjong.legalMoves(s)).toContainEqual({ type: 'undo' });
    s = mahjong.applyMove(s, { type: 'undo' }, rng);
    expect(s.tiles).toEqual(before.tiles);
    expect(s.removedOrder).toEqual([]);
  });

  it('hint counts a hint and is only legal when a match exists', () => {
    const rng = createRng(1);
    let s = started();
    s = mahjong.applyMove(s, { type: 'hint' }, rng);
    expect(s.hintsUsed).toBe(1);
    const stuck = stateOf([{ x: 0, kind: 'c1' }, { x: 4, kind: 'c2' }]);
    expect(() => mahjong.applyMove(stuck, { type: 'hint' }, rng)).toThrow(IllegalMoveError);
  });

  it('shuffle is only legal when stuck and re-deals the remaining tiles solvably', () => {
    const rng = createRng(1);
    const playing = started();
    expect(mahjong.legalMoves(playing)).not.toContainEqual({ type: 'shuffle' });
    expect(() => mahjong.applyMove(playing, { type: 'shuffle' }, rng)).toThrow(IllegalMoveError);

    // Four tiles in a row: c1 c2 c1 c2 — ends are c1/c2 so nothing matches.
    const stuck = stateOf([
      { x: 0, kind: 'c1' }, { x: 2, kind: 'c2' }, { x: 4, kind: 'c1' }, { x: 6, kind: 'c2' },
      { x: 10, kind: 's1', removed: true }, { x: 12, kind: 's3', removed: true },
    ]);
    stuck.removedOrder = [4, 5];
    expect(findMatches(stuck)).toEqual([]);
    expect(mahjong.legalMoves(stuck)).toEqual([{ type: 'shuffle' }, { type: 'undo' }]);
    const after = mahjong.applyMove(stuck, { type: 'shuffle' }, rng);
    expect(after.shuffles).toBe(1);
    expect(after.tiles.slice(4)).toEqual(stuck.tiles.slice(4));
    expect(after.tiles.slice(0, 4).map((t) => t.kind).sort()).toEqual(['c1', 'c1', 'c2', 'c2']);
    expect(findMatches(after).length).toBeGreaterThan(0);
    // Solvable: greedy matching clears a 4-tile row.
    let s = after;
    while (findMatches(s).length) {
      const [a, b] = findMatches(s)[0]!;
      s = mahjong.applyMove(s, { type: 'match', a, b }, rng);
    }
    expect(mahjong.winner(s)).toBe(0);
  });

  it('clearing the board wins and produces the summary line', () => {
    const rng = createRng(3);
    let s = stateOf([{ x: 0, kind: 'f1' }, { x: 2, kind: 'f4' }]);
    s = { ...s, startedAt: Date.now() - 465_000 };
    s = mahjong.applyMove(s, { type: 'match', a: 0, b: 1 }, rng);
    expect(mahjong.winner(s)).toBe(0);
    expect(mahjong.isTerminal(s)).toBe(true);
    expect(mahjong.legalMoves(s)).toEqual([]);
    expect(mahjong.summary!(s)).toMatch(/^Cleared the Turtle in 7:4\d$/);
    expect(() => mahjong.applyMove(s, { type: 'undo' }, rng)).toThrow(IllegalMoveError);
  });

  it('a full solve through the engine from a real deal', () => {
    const rng = createRng(5);
    const layout = MAHJONG_LAYOUTS[0]!;
    const deal = generateDeal(layout.positions, createRng(5));
    let s = started('turtle', 5);
    expect(s.tiles.map((t) => t.kind)).toEqual(deal.kinds);
    for (let k = 0; k < deal.order.length; k += 2) {
      const a = Math.min(deal.order[k]!, deal.order[k + 1]!);
      const b = Math.max(deal.order[k]!, deal.order[k + 1]!);
      s = mahjong.applyMove(s, { type: 'match', a, b }, rng);
    }
    expect(mahjong.winner(s)).toBe(0);
  });

  it('parseMove rejects garbage', () => {
    expect(mahjong.parseMove(null)).toBeNull();
    expect(mahjong.parseMove(5)).toBeNull();
    expect(mahjong.parseMove({ type: 'nope' })).toBeNull();
    expect(mahjong.parseMove({ type: 'match', a: 1, b: 1 })).toBeNull();
    expect(mahjong.parseMove({ type: 'match', a: 2, b: 1 })).toBeNull();
    expect(mahjong.parseMove({ type: 'match', a: '1', b: 2 })).toBeNull();
    expect(mahjong.parseMove({ type: 'match', a: 1.5, b: 2 })).toBeNull();
    expect(mahjong.parseMove({ type: 'match', a: 1, b: 2 })).toEqual({ type: 'match', a: 1, b: 2 });
    expect(mahjong.parseMove({ type: 'start', layoutId: {} })).toBeNull();
    expect(mahjong.parseMove({ type: 'start', layoutId: 'turtle' })).toEqual({ type: 'start', layoutId: 'turtle' });
    expect(mahjong.parseMove({ type: 'shuffle', extra: true })).toEqual({ type: 'shuffle' });
    expect(mahjong.parseMove({ type: 'hint' })).toEqual({ type: 'hint' });
  });

  it('state stays compact plain JSON', () => {
    const s = started();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(JSON.stringify(s).length).toBeLessThan(30_000);
  });
});
