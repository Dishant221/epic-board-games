import type { Rng } from '../rng';
import { IllegalMoveError, type GameEngine } from './types';
import { MAHJONG_FLOWERS, MAHJONG_LAYOUTS, MAHJONG_REGULAR_KINDS, MAHJONG_SEASONS, type MahjongLayout, type MahjongPos } from './mahjong-data';

export * from './mahjong-data';

export interface MahjongTile extends MahjongPos {
  kind: string;
  removed: boolean;
}

export interface MahjongState {
  phase: 'pick' | 'play';
  layoutId: string | null;
  tiles: MahjongTile[];
  /** Flat list of removed tile indices, two per match (for undo). */
  removedOrder: number[];
  shuffles: number;
  hintsUsed: number;
  startedAt: number | null;
  clearedAt: number | null;
  winner: number | null;
}

export type MahjongMove =
  | { type: 'start'; layoutId: string }
  | { type: 'match'; a: number; b: number }
  | { type: 'shuffle' }
  | { type: 'undo' }
  | { type: 'hint' };

export function getMahjongLayout(id: string | null): MahjongLayout | undefined {
  return MAHJONG_LAYOUTS.find((l) => l.id === id);
}

/** Identical kinds match; any season matches any season and any flower any flower. */
export function tileMatches(a: string, b: string): boolean {
  if (a === b) return true;
  const ca = a[0];
  return (ca === 's' || ca === 'f') && ca === b[0];
}

/** Match class used when pairing up kinds (seasons/flowers are interchangeable). */
function matchClass(kind: string): string {
  const c = kind[0];
  return c === 's' || c === 'f' ? c : kind;
}

/** Tiles overlap when their 2×2 footprints intersect. */
function overlaps(a: MahjongPos, b: MahjongPos): boolean {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}

/**
 * A tile is free when nothing above overlaps it and at least one long side
 * (left or right) has no touching/overlapping neighbour on its own layer.
 */
function isFreeIn(tiles: readonly MahjongPos[], present: (i: number) => boolean, i: number): boolean {
  const t = tiles[i];
  if (!t || !present(i)) return false;
  let left = false;
  let right = false;
  for (let j = 0; j < tiles.length; j++) {
    if (j === i || !present(j)) continue;
    const o = tiles[j]!;
    if (o.z > t.z && overlaps(o, t)) return false;
    if (o.z !== t.z || Math.abs(o.y - t.y) >= 2) continue;
    if (o.x < t.x && o.x + 2 >= t.x) left = true;
    else if (o.x > t.x && o.x <= t.x + 2) right = true;
    if (left && right) return false;
  }
  return true;
}

export function isFree(state: MahjongState, tileIndex: number): boolean {
  return isFreeIn(state.tiles, (i) => !state.tiles[i]!.removed, tileIndex);
}

/** Every matching pair of free tiles, as [a, b] with a < b. */
export function findMatches(state: MahjongState): [number, number][] {
  const free: number[] = [];
  for (let i = 0; i < state.tiles.length; i++) if (isFree(state, i)) free.push(i);
  const out: [number, number][] = [];
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (tileMatches(state.tiles[free[i]!]!.kind, state.tiles[free[j]!]!.kind)) out.push([free[i]!, free[j]!]);
    }
  }
  return out;
}

/** Shuffle a copy of `items` using the game rng (Fisher–Yates). */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The full 144-tile set grouped into 72 matching pairs. */
function fullPairs(): [string, string][] {
  const pairs: [string, string][] = [];
  for (const k of MAHJONG_REGULAR_KINDS) pairs.push([k, k], [k, k]);
  pairs.push([MAHJONG_SEASONS[0]!, MAHJONG_SEASONS[1]!], [MAHJONG_SEASONS[2]!, MAHJONG_SEASONS[3]!]);
  pairs.push([MAHJONG_FLOWERS[0]!, MAHJONG_FLOWERS[1]!], [MAHJONG_FLOWERS[2]!, MAHJONG_FLOWERS[3]!]);
  return pairs;
}

/** Group an even multiset of kinds into matching pairs (used by shuffle). */
function pairUp(kinds: readonly string[]): [string, string][] {
  const groups = new Map<string, string[]>();
  for (const k of kinds) {
    const g = groups.get(matchClass(k)) ?? [];
    g.push(k);
    groups.set(matchClass(k), g);
  }
  const pairs: [string, string][] = [];
  for (const g of groups.values()) for (let i = 0; i + 1 < g.length; i += 2) pairs.push([g[i]!, g[i + 1]!]);
  return pairs;
}

export interface MahjongDeal {
  /** Kind per position. */
  kinds: string[];
  /** Removal order that solves the deal: pairs (order[2k], order[2k+1]). */
  order: number[];
}

/**
 * Build a solvable deal: starting from every position filled, repeatedly take
 * a random *free* pair and give it the next matching pair of kinds. Playing the
 * pairs back in the same order clears the board. Returns null on a dead end.
 */
function tryDeal(positions: readonly MahjongPos[], pairs: readonly [string, string][], rng: Rng): MahjongDeal | null {
  const present = Array<boolean>(positions.length).fill(true);
  const kinds = Array<string>(positions.length).fill('');
  const order: number[] = [];
  let remaining = positions.length;
  let p = 0;
  while (remaining > 0) {
    const free: number[] = [];
    for (let i = 0; i < positions.length; i++) if (present[i] && isFreeIn(positions, (j) => present[j]!, i)) free.push(i);
    if (free.length < 2) return null;
    const ai = rng.int(0, free.length - 1);
    let bi = rng.int(0, free.length - 2);
    if (bi >= ai) bi++;
    const [a, b] = [free[ai]!, free[bi]!];
    const pair = pairs[p++];
    if (!pair) return null;
    kinds[a] = pair[0];
    kinds[b] = pair[1];
    present[a] = present[b] = false;
    order.push(a, b);
    remaining -= 2;
  }
  return { kinds, order };
}

export const MAHJONG_DEAL_ATTEMPTS = 40;

/**
 * Deal `pairs` onto `positions`, retrying dead ends. If every attempt dead-ends
 * the kinds are placed at random so the game can still start (shuffle rescues it).
 */
export function generateDeal(positions: readonly MahjongPos[], rng: Rng, pairs: readonly [string, string][] = fullPairs()): MahjongDeal {
  if (pairs.length * 2 !== positions.length) throw new Error('Deal needs exactly one kind per position');
  for (let attempt = 0; attempt < MAHJONG_DEAL_ATTEMPTS; attempt++) {
    const deal = tryDeal(positions, shuffled(pairs, rng), rng);
    if (deal) return deal;
  }
  return { kinds: shuffled(pairs.flat(), rng), order: [] };
}

const PICK_STATE: MahjongState = {
  phase: 'pick',
  layoutId: null,
  tiles: [],
  removedOrder: [],
  shuffles: 0,
  hintsUsed: 0,
  startedAt: null,
  clearedAt: null,
  winner: null,
};

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

export const mahjong: GameEngine<MahjongState, MahjongMove> = {
  id: 'mahjong',
  init: () => ({ ...PICK_STATE }),
  currentPlayer: () => 0,
  legalMoves(s) {
    if (s.winner !== null) return [];
    if (s.phase === 'pick') return MAHJONG_LAYOUTS.map((l) => ({ type: 'start', layoutId: l.id }));
    const matches = findMatches(s);
    const moves: MahjongMove[] = matches.map(([a, b]) => ({ type: 'match', a, b }));
    if (matches.length > 0) moves.push({ type: 'hint' });
    else moves.push({ type: 'shuffle' });
    if (s.removedOrder.length >= 2) moves.push({ type: 'undo' });
    return moves;
  },
  applyMove(s, m, rng) {
    if (s.winner !== null) throw new IllegalMoveError('Board already cleared');
    if (m.type === 'start') {
      const layout = getMahjongLayout(m.layoutId);
      if (s.phase !== 'pick' || !layout) throw new IllegalMoveError('Unknown layout');
      const deal = generateDeal(layout.positions, rng);
      const tiles = layout.positions.map((p, i) => ({ ...p, kind: deal.kinds[i]!, removed: false }));
      return { ...PICK_STATE, phase: 'play', layoutId: layout.id, tiles, startedAt: Date.now() };
    }
    if (s.phase !== 'play') throw new IllegalMoveError('Pick a layout first');
    switch (m.type) {
      case 'match': {
        const ta = s.tiles[m.a];
        const tb = s.tiles[m.b];
        if (!ta || !tb || m.a >= m.b) throw new IllegalMoveError('Bad tile pair');
        if (!isFree(s, m.a) || !isFree(s, m.b)) throw new IllegalMoveError('Tile is not free');
        if (!tileMatches(ta.kind, tb.kind)) throw new IllegalMoveError('Tiles do not match');
        const tiles = s.tiles.map((t, i) => (i === m.a || i === m.b ? { ...t, removed: true } : t));
        const cleared = tiles.every((t) => t.removed);
        return { ...s, tiles, removedOrder: [...s.removedOrder, m.a, m.b], winner: cleared ? 0 : null, clearedAt: cleared ? Date.now() : null };
      }
      case 'undo': {
        if (s.removedOrder.length < 2) throw new IllegalMoveError('Nothing to undo');
        const back = new Set(s.removedOrder.slice(-2));
        const tiles = s.tiles.map((t, i) => (back.has(i) ? { ...t, removed: false } : t));
        return { ...s, tiles, removedOrder: s.removedOrder.slice(0, -2) };
      }
      case 'shuffle': {
        if (findMatches(s).length > 0) throw new IllegalMoveError('Moves are still available');
        const live = s.tiles.map((t, i) => i).filter((i) => !s.tiles[i]!.removed);
        if (live.length === 0) throw new IllegalMoveError('Nothing to shuffle');
        const deal = generateDeal(live.map((i) => s.tiles[i]!), rng, pairUp(live.map((i) => s.tiles[i]!.kind)));
        const tiles = s.tiles.slice();
        live.forEach((idx, k) => (tiles[idx] = { ...tiles[idx]!, kind: deal.kinds[k]! }));
        return { ...s, tiles, shuffles: s.shuffles + 1 };
      }
      case 'hint':
        if (findMatches(s).length === 0) throw new IllegalMoveError('No matches to hint');
        return { ...s, hintsUsed: s.hintsUsed + 1 };
      default:
        throw new IllegalMoveError();
    }
  },
  isTerminal: (s) => s.winner !== null,
  winner: (s) => s.winner,
  parseMove(raw) {
    const r = raw as { type?: unknown; layoutId?: unknown; a?: unknown; b?: unknown } | null;
    if (!r || typeof r !== 'object') return null;
    switch (r.type) {
      case 'start':
        return typeof r.layoutId === 'string' && r.layoutId.length <= 40 ? { type: 'start', layoutId: r.layoutId } : null;
      case 'match':
        return isInt(r.a, 0, 199) && isInt(r.b, 0, 199) && r.a < r.b ? { type: 'match', a: r.a, b: r.b } : null;
      case 'shuffle':
      case 'undo':
      case 'hint':
        return { type: r.type };
      default:
        return null;
    }
  },
  sameMove(a, b) {
    if (a.type !== b.type) return false;
    if (a.type === 'start') return a.layoutId === (b as typeof a).layoutId;
    if (a.type === 'match') return a.a === (b as typeof a).a && a.b === (b as typeof a).b;
    return true;
  },
  summary(s) {
    const layout = getMahjongLayout(s.layoutId);
    if (!layout || s.winner !== 0) return null;
    const secs = Math.max(0, Math.round(((s.clearedAt ?? 0) - (s.startedAt ?? 0)) / 1000));
    return `Cleared the ${layout.name} in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  },
};
