import type { SnakesLaddersMove, SnakesLaddersState } from '@ebg/game-core';
import { useEffect, useRef, useState } from 'react';
import { detectPerformanceTier, getGraphicsSettings, webglAvailable, type PerformanceTier } from '../../../lib/performance-tier';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import type { SnakesScene } from '../../../lib/snakes-scene';
import { Dice } from '../shared/Dice';
import { SEAT_COLORS } from '../shared/PlayerPanel';

interface Props {
  session: GameSessionView<SnakesLaddersState, SnakesLaddersMove>;
  size: number;
  dicePosition: 'corner' | 'bottom-center' | 'floating';
}

const JUMP_TEXT = { ladder: 'climbed a ladder! 🪜', snake: 'was bitten by a snake! 🐍', croc: 'got chomped by a croc! 🐊', dragon: 'was scorched by the dragon! 🐉' };
const BITE_SFX = { snake: 'hiss', croc: 'chomp', dragon: 'roar' } as const;

/** Player override for the graphics tier; null = auto-detect. Purely cosmetic, so storage failures are ignored. */
type Detail = 'low' | 'high';
const DETAIL_KEY = 'ebg:snakes:detail';

function readDetail(): Detail | null {
  try {
    const v = localStorage.getItem(DETAIL_KEY);
    return v === 'low' || v === 'high' ? v : null;
  } catch {
    return null;
  }
}

export default function SnakesLaddersBoard({ session, size, dicePosition }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SnakesScene | null>(null);
  const lastKey = useRef(-1);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(readDetail);
  const [tier, setTier] = useState<PerformanceTier | null>(null);
  const s = session.state;

  // Lazy-load Three.js so the landing page and other games stay light.
  // Re-runs (rebuilding the scene) when the player count or detail override changes.
  useEffect(() => {
    if (!containerRef.current || !s) return;
    if (!webglAvailable()) {
      setError('Your browser or device does not support WebGL, which this 3D board needs. Try a recent version of Chrome, Firefox, Safari or Edge.');
      return;
    }
    const effective: PerformanceTier = detail ?? detectPerformanceTier();
    setTier(effective);
    let disposed = false;
    import('../../../lib/snakes-scene')
      .then(({ SnakesScene }) => {
        if (disposed || !containerRef.current) return;
        const scene = new SnakesScene(containerRef.current, s.positions.length, getGraphicsSettings(effective), {
          onHop: () => play('move'),
          onJump: (kind) => play(kind === 'ladder' ? 'ladder' : 'snake'),
          onBite: (kind) => play(BITE_SFX[kind]),
          // GameOverModal plays the 'win' fanfare; this is just the sparkle burst.
          onWin: () => play('cash'),
        });
        scene.setPositions(s.positions);
        lastKey.current = session.moveKey;
        sceneRef.current = scene;
      })
      .catch(() => setError('The 3D board failed to load. Please refresh the page.'));
    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [s?.positions.length, detail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Turn state changes into pawn animations.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !s || session.moveKey === lastKey.current) return;
    lastKey.current = session.moveKey;
    const ev = s.lastEvent;
    if (!ev || s.turnCount === 0) {
      scene.setPositions(s.positions);
      return;
    }
    play('dice');
    scene.animateMove(ev.seat, ev.from, ev.landed, ev.jump);
    const name = session.players[ev.seat]?.displayName ?? 'Player';
    const msg = ev.forfeited ? `${name} rolled three 6s — turn lost!` : ev.jump ? `${name} ${JUMP_TEXT[ev.jump.kind]}` : ev.bounced ? `${name} needs an exact roll to finish.` : ev.extraTurn ? `${name} rolled a 6 — roll again!` : null;
    if (msg) {
      setToast(msg);
      const t = window.setTimeout(() => setToast(null), 2600);
      return () => window.clearTimeout(t);
    }
  }, [session.moveKey, s, session.players]);

  if (!s) return null;
  const roll = () => session.canMove && session.submitMove({ type: 'roll' });
  const diceColor = session.currentSeat === null ? undefined : SEAT_COLORS[session.currentSeat];

  const detailLabel = tier === 'low' ? 'Low' : 'High';
  const toggleDetail = () => {
    const next: Detail = tier === 'low' ? 'high' : 'low';
    setDetail(next);
    try {
      localStorage.setItem(DETAIL_KEY, next);
    } catch {
      /* storage unavailable */
    }
  };

  const diceClass =
    dicePosition === 'corner'
      ? 'absolute right-3 bottom-3'
      : dicePosition === 'bottom-center'
        ? 'absolute bottom-3 left-1/2 -translate-x-1/2'
        : 'absolute right-2 bottom-2 z-10';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        ref={containerRef}
        className="game-board size-full overflow-hidden rounded-3xl bg-gradient-to-b from-ink-800 to-ink-900 ring-1 ring-white/10"
        role="img"
        aria-label={`Snakes and Ladders board. ${session.players.map((p) => `${p.displayName} on square ${s.positions[p.seat]}`).join(', ')}.`}
      />
      {error && (
        <div role="alert" className="absolute inset-4 grid place-items-center rounded-2xl bg-rose-950/90 p-6 text-center text-rose-100">
          {error}
        </div>
      )}
      {!error && (
        <div className="absolute top-2 right-2 flex gap-1" role="toolbar" aria-label="Board view">
          <button type="button" className="btn-ghost min-h-11 min-w-11 px-2 py-1 text-xs sm:min-h-9" onClick={() => sceneRef.current?.resetCamera()} title="Reset camera">
            Reset camera
          </button>
          <button type="button" className="btn-ghost min-h-11 min-w-11 px-2 py-1 text-xs sm:min-h-9" onClick={toggleDetail} aria-pressed={tier !== 'low'} title="Toggle graphics detail" disabled={tier === null}>
            Detail: {detailLabel}
          </button>
        </div>
      )}
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center" aria-live="polite">
          <span className="animate-pop rounded-full bg-black/70 px-4 py-2 text-sm font-semibold shadow-lg">{toast}</span>
        </div>
      )}
      <div className={diceClass}>
        <Dice value={s.lastEvent?.roll ?? null} rollKey={s.turnCount} canRoll={session.canMove} onRoll={roll} size={dicePosition === 'floating' ? 52 : 64} color={diceColor} />
      </div>
    </div>
  );
}
