import { BOARD_SIZE, LOCK_UP_SPACE, type EpicBusinessState } from '@ebg/game-core/games/epic-business';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { play } from '../../../lib/sound';

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Width of the element the board is mounted in, kept fresh with a ResizeObserver. */
export function useParentWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    };
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** setTimeout that is cleared automatically when the component unmounts. */
export function useTimers() {
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const set = timers.current;
    return () => {
      for (const t of set) window.clearTimeout(t);
      set.clear();
    };
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
}

/** Bumps a counter whenever `value` becomes true-ish for a new moveKey; used to re-trigger CSS animations. */
export function useAnimationKey(trigger: boolean, moveKey: number): number {
  const [key, setKey] = useState(0);
  const last = useRef(moveKey);
  useEffect(() => {
    if (moveKey === last.current) return;
    last.current = moveKey;
    if (trigger) setKey((k) => k + 1);
  }, [moveKey, trigger]);
  return key;
}

export type TokenMotion = 'hop' | 'jump' | null;

export interface TokenWalk {
  /** Space each token is drawn on right now (may lag the engine while walking). */
  display: number[];
  /** Seat currently moving and how. */
  motion: { seat: number; kind: TokenMotion; ms: number } | null;
}

interface WalkCallbacks {
  onPassPayday(seat: number): void;
}

/**
 * Tokens walk one space per tick so a roll reads as movement, not a teleport.
 * Short forward moves hop at 220 ms; long card moves speed up so they finish in
 * ~2 s; "go back 3" walks backwards; being sent to the Lock-up is a single arc.
 * A new move arriving mid-walk continues from the token's current square.
 */
export function useTokenWalk(s: EpicBusinessState | null, moveKey: number, { onPassPayday }: WalkCallbacks): TokenWalk {
  const targets = s ? s.players.map((p) => p.position) : [];
  const targetKey = targets.join(',');
  const [display, setDisplay] = useState<number[]>(targets);
  const [motion, setMotion] = useState<TokenWalk['motion']>(null);
  const displayRef = useRef(display);
  const lastMoveSound = useRef(0);
  const cb = useRef({ onPassPayday });
  cb.current = { onPassPayday };

  useEffect(() => {
    if (targets.length !== displayRef.current.length) {
      displayRef.current = targets;
      setDisplay(targets);
      return;
    }
    const seat = targets.findIndex((t, i) => t !== displayRef.current[i]);
    if (seat === -1) {
      // Nothing to walk (or a walk just finished and its final timer was cleared by this re-run).
      setMotion(null);
      return;
    }
    const target = targets[seat]!;
    const from = displayRef.current[seat]!;
    const put = (space: number) => {
      displayRef.current = displayRef.current.map((v, i) => (i === seat ? space : v));
      setDisplay(displayRef.current);
    };
    const forward = (target - from + BOARD_SIZE) % BOARD_SIZE;
    const player = s?.players[seat];
    const jump = player?.inLockUp && target === LOCK_UP_SPACE;
    let timer: number | undefined;

    if (reducedMotion()) {
      if (!jump && forward <= 20 && from > target) cb.current.onPassPayday(seat);
      put(target);
      return;
    }
    if (jump) {
      setMotion({ seat, kind: 'jump', ms: 650 });
      put(target);
      timer = window.setTimeout(() => setMotion(null), 700);
      return () => window.clearTimeout(timer);
    }
    const backwards = forward > 20;
    const steps = backwards ? BOARD_SIZE - forward : forward;
    const ms = Math.max(70, Math.min(220, Math.round(1800 / steps)));
    let cur = from;
    const tick = () => {
      cur = (cur + (backwards ? -1 : 1) + BOARD_SIZE) % BOARD_SIZE;
      put(cur);
      setMotion({ seat, kind: 'hop', ms });
      const now = performance.now();
      if (now - lastMoveSound.current >= 110) {
        lastMoveSound.current = now;
        play('move');
      }
      if (!backwards && cur === 0) cb.current.onPassPayday(seat);
      if (cur !== target) timer = window.setTimeout(tick, ms);
      else timer = window.setTimeout(() => setMotion(null), ms);
    };
    timer = window.setTimeout(tick, 140);
    return () => window.clearTimeout(timer);
    // Re-run on every applied move; positions are compared against what is drawn.
  }, [moveKey, targetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { display, motion };
}

export interface CashDelta {
  id: number;
  seat: number;
  amount: number;
}

export interface Flash {
  id: number;
  space: number;
  kind: 'bought' | 'built';
}

export interface Diffs {
  deltas: CashDelta[];
  flashes: Flash[];
}

/**
 * Compare consecutive states to drive floating "+200 / −120" labels over player
 * cards and tile flashes for purchases and new buildings. Entries expire on
 * their own; timers are cleared on unmount.
 */
export function useStateDiffs(s: EpicBusinessState | null, moveKey: number): Diffs {
  const prev = useRef<EpicBusinessState | null>(null);
  const lastKey = useRef(moveKey);
  const nextId = useRef(1);
  const [deltas, setDeltas] = useState<CashDelta[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const later = useTimers();

  useEffect(() => {
    if (!s) return;
    const p = prev.current;
    prev.current = s;
    if (moveKey === lastKey.current && p !== null) return;
    lastKey.current = moveKey;
    if (!p || p.players.length !== s.players.length) return;
    const newDeltas: CashDelta[] = [];
    s.players.forEach((pl, seat) => {
      const d = pl.cash - (p.players[seat]?.cash ?? pl.cash);
      if (d !== 0 && !pl.bankrupt) newDeltas.push({ id: nextId.current++, seat, amount: d });
    });
    const newFlashes: Flash[] = [];
    s.owners.forEach((o, i) => {
      if (o !== null && o !== p.owners[i]) newFlashes.push({ id: nextId.current++, space: i, kind: 'bought' });
    });
    s.buildings.forEach((b, i) => {
      if (b > (p.buildings[i] ?? 0)) newFlashes.push({ id: nextId.current++, space: i, kind: 'built' });
    });
    if (newDeltas.length) {
      setDeltas((d) => [...d, ...newDeltas]);
      const ids = new Set(newDeltas.map((d) => d.id));
      later(() => setDeltas((d) => d.filter((x) => !ids.has(x.id))), 1600);
    }
    if (newFlashes.length) {
      setFlashes((f) => [...f, ...newFlashes]);
      const ids = new Set(newFlashes.map((f) => f.id));
      later(() => setFlashes((f) => f.filter((x) => !ids.has(x.id))), 1400);
    }
  }, [moveKey, s, later]);

  return { deltas, flashes };
}

/** Client-side timestamps for engine log lines (the engine stores plain strings). */
export function useLogTimes(log: string[]): (number | null)[] {
  const seen = useRef<{ text: string; at: number | null }[] | null>(null);
  if (seen.current === null) {
    seen.current = log.map((text) => ({ text, at: null }));
  } else {
    const prev = seen.current;
    // The log is capped, so earlier lines fall off the front: find how many of
    // the previous lines survive at the head of the new log.
    let offset = 0;
    while (offset <= prev.length) {
      const tail = prev.slice(offset);
      const matches = tail.every((e, i) => log[i] === e.text) && tail.length <= log.length;
      if (matches) break;
      offset++;
    }
    const kept = offset > prev.length ? [] : prev.slice(offset);
    const now = Date.now();
    seen.current = log.map((text, i) => (i < kept.length ? kept[i]! : { text, at: now }));
  }
  return seen.current.map((e) => e.at);
}

/** Re-renders every `ms` so relative times tick. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
