import {
  findMatches,
  getMahjongLayout,
  isFree,
  MAHJONG_LAYOUTS,
  tileMatches,
  type MahjongLayout,
  type MahjongMove,
  type MahjongState,
} from '@ebg/game-core/games/mahjong';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import '../../../styles/games/mahjong.css';

type Props = { session: GameSessionView<MahjongState, MahjongMove>; size: number };

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const WIND_NAMES: Record<string, string> = { E: 'East', S: 'South', W: 'West', N: 'North' };
const FLOWER_NAMES = ['Plum', 'Orchid', 'Bamboo', 'Chrysanthemum'];
const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

/** Unicode Mahjong block glyph, short fallback label, suit class and spoken name for a kind. */
function tileFace(kind: string): { glyph: string; label: string; cls: string; name: string } {
  const suit = kind[0]!;
  const v = kind.slice(1);
  const n = Number(v);
  // Dragons share the 'd' prefix with dots but have a letter value.
  if (kind === 'dR') return { glyph: '🀄', label: 'R', cls: 'mj-dR', name: 'Red dragon' };
  if (kind === 'dG') return { glyph: '🀅', label: 'G', cls: 'mj-dG', name: 'Green dragon' };
  if (kind === 'dW') return { glyph: '🀆', label: 'W', cls: 'mj-dW', name: 'White dragon' };
  switch (suit) {
    case 'c':
      return { glyph: String.fromCodePoint(0x1f006 + n), label: `${n}万`, cls: 'mj-c', name: `${NUMBER_WORDS[n]} of characters` };
    case 'b':
      return { glyph: String.fromCodePoint(0x1f00f + n), label: `${n}|`, cls: 'mj-b', name: `${NUMBER_WORDS[n]} of bamboo` };
    case 'd':
      return { glyph: String.fromCodePoint(0x1f018 + n), label: `${n}●`, cls: 'mj-d', name: `${NUMBER_WORDS[n]} of dots` };
    case 'w':
      return { glyph: String.fromCodePoint(0x1f000 + 'ESWN'.indexOf(v)), label: v, cls: 'mj-w', name: `${WIND_NAMES[v]} wind` };
    default:
      break;
  }
  if (suit === 'f') return { glyph: String.fromCodePoint(0x1f021 + n), label: FLOWER_NAMES[n - 1]!.slice(0, 2), cls: 'mj-f', name: `${FLOWER_NAMES[n - 1]} flower` };
  return { glyph: String.fromCodePoint(0x1f025 + n), label: SEASON_NAMES[n - 1]!.slice(0, 2), cls: 'mj-s', name: `${SEASON_NAMES[n - 1]} season` };
}

function formatTime(ms: number) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** Tiny SVG footprint of a layout for the picker. */
function LayoutPreview({ layout }: { layout: MahjongLayout }) {
  const maxX = Math.max(...layout.positions.map((p) => p.x)) + 2;
  const maxY = Math.max(...layout.positions.map((p) => p.y)) + 2;
  const maxZ = Math.max(...layout.positions.map((p) => p.z));
  return (
    <svg viewBox={`-0.5 -0.5 ${maxX + 1} ${maxY + 1}`} className="w-full" aria-hidden="true">
      {layout.positions.map((p, i) => (
        <rect key={i} x={p.x - p.z * 0.25} y={p.y - p.z * 0.25} width={1.9} height={1.9} rx={0.3} fill={`hsl(45 70% ${75 + (p.z / Math.max(1, maxZ)) * 20}%)`} stroke="#7c5e2a" strokeWidth={0.12} />
      ))}
    </svg>
  );
}

export default function MahjongBoard({ session, size }: Props) {
  const s = session.state;
  const layout = useMemo(() => getMahjongLayout(s?.layoutId ?? null), [s?.layoutId]);
  const [sel, setSel] = useState<number | null>(null);
  const [hintPair, setHintPair] = useState<[number, number] | null>(null);
  const [leaving, setLeaving] = useState<Set<number>>(() => new Set());
  const [returning, setReturning] = useState<Set<number>>(() => new Set());
  const [shaking, setShaking] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prevRemoved = useRef<boolean[]>([]);

  const matches = useMemo(() => (s && s.phase === 'play' ? findMatches(s) : []), [s]);
  const canPlay = session.canMove && !!s && s.phase === 'play' && s.winner === null;

  // Fly-away animation for the pair just matched; pop for an undone pair.
  useEffect(() => {
    if (!s) return;
    const gone = new Set<number>();
    const back = new Set<number>();
    s.tiles.forEach((t, i) => {
      if (t.removed && prevRemoved.current[i] === false) gone.add(i);
      if (!t.removed && prevRemoved.current[i] === true) back.add(i);
    });
    prevRemoved.current = s.tiles.map((t) => t.removed);
    setHintPair(null);
    if (gone.size === 0 && back.size === 0) return;
    if (gone.size) play('capture');
    setLeaving(gone);
    setReturning(back);
    const t = window.setTimeout(() => {
      setLeaving(new Set());
      setReturning(new Set());
    }, 500);
    return () => window.clearTimeout(t);
  }, [session.moveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (s?.winner === 0) play('solve');
  }, [s?.winner]);

  // Game clock.
  useEffect(() => {
    if (!s || s.phase !== 'play' || s.winner !== null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [s?.phase, s?.winner, s?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sel !== null && s?.tiles[sel]?.removed) setSel(null);
  }, [s, sel]);

  if (!s) return null;

  // ------------------------------------------------------------ picker
  if (s.phase === 'pick' || !layout) {
    return (
      <div className="w-full" style={{ maxWidth: Math.max(size, size < 768 ? size : 820) }}>
        <h2 className="mb-3 text-center font-display text-2xl font-bold">Pick a layout</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MAHJONG_LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              className="card flex min-h-[44px] flex-col gap-2 p-3 text-left transition hover:-translate-y-0.5 hover:ring-white/30 disabled:opacity-60"
              disabled={!session.canMove}
              onClick={() => session.submitMove({ type: 'start', layoutId: l.id })}
              aria-label={`${l.name}: ${l.blurb} ${l.positions.length} tiles`}
            >
              <div className="rounded-lg bg-emerald-950/60 p-2"><LayoutPreview layout={l} /></div>
              <span className="font-display text-lg font-bold">{l.name}</span>
              <span className="text-xs text-slate-400">{l.blurb} · {l.positions.length} tiles</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------- play
  const maxX = Math.max(...s.tiles.map((t) => t.x)) + 2;
  const maxY = Math.max(...s.tiles.map((t) => t.y)) + 2;
  const maxZ = Math.max(...s.tiles.map((t) => t.z));
  const pad = 10;
  // Half-tile unit in px: the field must fit `size` including the layer offsets.
  const u = (size - pad * 2) / (maxX + maxZ * 0.5 + 0.5);
  const tileW = u * 2;
  const tileH = u * 2 * 1.28;
  const lift = u * 0.5;
  const depth = Math.max(2, u * 0.28);
  const fieldH = maxY * u * 1.28 + maxZ * lift + depth + pad * 2;
  const left = s.tiles.filter((t) => !t.removed).length;
  const solved = s.winner === 0;
  const elapsed = (solved ? s.clearedAt ?? now : now) - (s.startedAt ?? now);
  const hintSet = new Set(hintPair ?? []);

  const onTile = (i: number) => {
    if (!canPlay) return;
    if (!isFree(s, i)) {
      play('error');
      setShaking(i);
      window.setTimeout(() => setShaking(null), 400);
      return;
    }
    if (sel === i) {
      setSel(null);
      return;
    }
    if (sel !== null && tileMatches(s.tiles[sel]!.kind, s.tiles[i]!.kind)) {
      session.submitMove({ type: 'match', a: Math.min(sel, i), b: Math.max(sel, i) });
      setSel(null);
      return;
    }
    setSel(i);
    play('tile');
  };

  const hint = () => {
    if (!canPlay || matches.length === 0) return;
    const pair = (sel !== null && matches.find(([a, b]) => a === sel || b === sel)) || matches[Math.floor(Math.random() * matches.length)]!;
    setHintPair(pair);
    play('hint');
    session.submitMove({ type: 'hint' });
  };

  return (
    <div className="flex w-full flex-col items-center gap-2" style={{ width: size }}>
      {/* Counters */}
      <div className="flex w-full flex-wrap items-center justify-center gap-2 text-xs text-slate-300" role="status" aria-live="polite">
        <span className="mj-stat"><strong className="text-base text-white">{left}</strong>tiles left</span>
        <span className="mj-stat"><strong className={`text-base ${matches.length === 0 && !solved ? 'text-rose-300' : 'text-white'}`}>{matches.length}</strong>pairs free</span>
        <span className="mj-stat"><strong className="text-base text-white">{formatTime(elapsed)}</strong>time</span>
        <span className="font-display text-sm font-semibold text-amber-200">{layout.name}</span>
      </div>

      {/* Tile field */}
      <div
        className="mj-field game-board"
        style={{ width: size, height: fieldH }}
        role="group"
        aria-label={`${layout.name} layout, ${left} tiles left. Tab through free tiles, Enter to select.`}
      >
        {s.tiles.map((t, i) => {
          if (t.removed && !leaving.has(i)) return null;
          const free = isFree(s, i);
          const face = tileFace(t.kind);
          const cls = [
            'mj-tile',
            free ? '' : 'mj-blocked',
            sel === i ? 'mj-selected' : '',
            hintSet.has(i) ? 'mj-hint' : '',
            leaving.has(i) ? 'mj-leaving' : '',
            returning.has(i) ? 'mj-back' : '',
            shaking === i ? 'mj-shake' : '',
          ].join(' ');
          const x = pad + t.x * u + (maxZ - t.z) * lift;
          const y = pad + t.y * u * 1.28 + (maxZ - t.z) * lift;
          return (
            <button
              key={i}
              type="button"
              className={cls}
              style={{
                left: x,
                top: y,
                width: tileW,
                height: tileH,
                zIndex: t.z * 10000 + t.y * 100 + t.x,
                fontSize: tileW * 0.72,
                ['--mj-shadow' as string]: `${depth}px ${depth}px 0 #b89a62, ${depth + 1}px ${depth + 1}px 3px rgb(0 0 0 / 0.55)`,
              }}
              tabIndex={free && canPlay ? 0 : -1}
              aria-pressed={sel === i}
              aria-label={`${face.name}, ${free ? 'free' : 'blocked'}`}
              onClick={() => onTile(i)}
            >
              <span className={`mj-glyph ${face.cls}`} aria-hidden="true">{face.glyph}</span>
              <span className={`mj-label ${face.cls}`} aria-hidden="true">{face.label}</span>
            </button>
          );
        })}
        {solved && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="animate-pop rounded-2xl bg-ink-900/80 px-6 py-3 font-display text-3xl font-bold text-amber-200 ring-1 ring-white/20">Cleared!</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex w-full flex-wrap justify-center gap-2" role="toolbar" aria-label="Mahjong tools">
        <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={!canPlay || matches.length === 0} onClick={hint}>💡 Hint</button>
        <button type="button" className="btn-ghost min-h-[44px] text-sm" disabled={!canPlay || s.removedOrder.length < 2} onClick={() => session.submitMove({ type: 'undo' })}>↩ Undo</button>
        <button
          type="button"
          className={`min-h-[44px] text-sm ${matches.length === 0 && canPlay ? 'btn-primary' : 'btn-ghost'}`}
          disabled={!canPlay || matches.length > 0}
          onClick={() => session.submitMove({ type: 'shuffle' })}
          title={matches.length > 0 ? 'Shuffle unlocks when no matches remain' : 'No moves left: shuffle the remaining tiles'}
        >
          🔀 Shuffle
        </button>
        <button type="button" className="btn-ghost min-h-[44px] text-sm" onClick={session.rematch}>🀄 New layout</button>
        <span className="self-center text-xs text-slate-400">{s.hintsUsed} hint{s.hintsUsed === 1 ? '' : 's'} · {s.shuffles} shuffle{s.shuffles === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}
