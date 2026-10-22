import type { GameInfo } from '@ebg/game-core';
import { useEffect, useRef, useState } from 'react';
import { detectPerformanceTier } from '../../../lib/performance-tier';
import { isMuted, play, setMuted } from '../../../lib/sound';
import { useFullscreen } from '../shared/GameScreen';
import { Renderer } from './flappy/render';
import { createSim, DT, flap, H, medalFor, nextMedal, resetRun, startRun, step, W, type Medal, type Phase, type Sim, type SimEvent } from './flappy/sim';
import '../../../styles/games/flappy.css';

const BEST_KEY = 'ebg:flappy:best';
/** Ignore taps for a moment after a crash so the result card is not dismissed by accident. */
const RESTART_LOCKOUT_MS = 600;
/** Header + hint + gaps that compete with the canvas for vertical space (outside fullscreen). */
const PAGE_CHROME_PX = 56;

function loadBest(): number {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}
function saveBest(n: number) {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* storage unavailable */
  }
}

const MEDAL_LABEL: Record<Medal, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };

function MedalBadge({ score }: { score: number }) {
  const medal = medalFor(score);
  const next = nextMedal(score);
  if (!medal) {
    return next ? <p className="text-xs text-slate-400">Reach {next[1]} for a {MEDAL_LABEL[next[0]].toLowerCase()} medal</p> : null;
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`flappy-medal flappy-medal--${medal}`} role="img" aria-label={`${MEDAL_LABEL[medal]} medal`}>
        <span aria-hidden="true">★</span>
      </div>
      <span className="text-sm text-slate-200">{MEDAL_LABEL[medal]} medal</span>
      {next && <span className="text-xs text-slate-400">{next[1]} for {MEDAL_LABEL[next[0]].toLowerCase()}</span>}
    </div>
  );
}

export default function FlappyGame({ game, onExit }: { game: GameInfo; onExit(): void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const restartBtnRef = useRef<HTMLButtonElement>(null);
  const { isFullscreen, fallback, toggle: toggleFullscreen } = useFullscreen(wrapperRef);

  const [sim] = useState<Sim>(createSim);
  const [lowTier] = useState(() => typeof document !== 'undefined' && detectPerformanceTier() === 'low');
  const [phase, setPhase] = useState<Phase>('ready');
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(loadBest);
  const [newBest, setNewBest] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [muted, setMutedState] = useState(isMuted);
  const [size, setSize] = useState({ w: W, h: H });

  // Mirrors for the loop and handlers, which live outside React's render cycle.
  const bestRef = useRef(best);
  const pausedRef = useRef(false);
  const overAtRef = useRef(0);
  const actRef = useRef<() => void>(() => {});
  const restartRef = useRef<() => void>(() => {});
  const fullscreenRef = useRef(isFullscreen);

  // Fit the 480×720 logical area to the column width and the viewport height.
  useEffect(() => {
    fullscreenRef.current = isFullscreen;
    const col = colRef.current;
    if (!col) return;
    const measure = () => {
      const hud = hudRef.current?.offsetHeight ?? 48;
      const chrome = fullscreenRef.current ? 0 : PAGE_CHROME_PX;
      const availH = Math.max(280, window.innerHeight - chrome - hud - 64);
      const w = Math.floor(Math.max(200, Math.min(col.clientWidth, W, availH * (W / H))));
      setSize((s) => (s.w === w ? s : { w, h: Math.round((w * H) / W) }));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(col);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [isFullscreen]);

  // Backing store follows CSS size × DPR (capped; 1× on low-end devices).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, lowTier ? 1 : 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
  }, [size, lowTier]);

  // Game loop, input and lifecycle. Runs once per mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const area = areaRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !area || !ctx) return;
    const renderer = new Renderer();
    sim.fxScale = lowTier ? 0.5 : 1;

    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = rm.matches;
    const onRm = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    rm.addEventListener('change', onRm);

    let winTimer: number | undefined;
    const setPausedBoth = (p: boolean) => {
      pausedRef.current = p;
      setPaused(p);
    };

    const onEvent = (ev: SimEvent) => {
      switch (ev) {
        case 'score': {
          const s = sim.score;
          setScore(s);
          play('score');
          if (s % 10 === 0) {
            const medal = medalFor(s);
            setAnnounce(medal ? `Score ${s}. ${MEDAL_LABEL[medal]} medal!` : `Score ${s}`);
          }
          break;
        }
        case 'crash':
          play('crash');
          break;
        case 'over': {
          const s = sim.score;
          const nb = s > bestRef.current;
          if (nb) {
            bestRef.current = s;
            saveBest(s);
            setBest(s);
            winTimer = window.setTimeout(() => play('win'), 450);
          }
          setNewBest(nb);
          overAtRef.current = performance.now();
          setPhase('over');
          setAnnounce(nb ? `Game over. New best score: ${s}!` : `Game over. Score ${s}. Best ${bestRef.current}.`);
          break;
        }
      }
    };

    const start = () => {
      startRun(sim);
      flap(sim);
      play('flap');
      setScore(0);
      setNewBest(false);
      setPhase('playing');
      setAnnounce('Go!');
      area.focus({ preventScroll: true });
    };
    const restart = () => {
      resetRun(sim);
      start();
    };
    const pause = () => {
      if (sim.phase === 'playing' && !pausedRef.current) setPausedBoth(true);
    };
    /** Primary action: start, flap, resume or restart depending on state. */
    const act = () => {
      if (pausedRef.current) return setPausedBoth(false);
      switch (sim.phase) {
        case 'ready':
          start();
          break;
        case 'playing':
          flap(sim);
          play('flap');
          break;
        case 'dying':
          break;
        case 'over':
          if (performance.now() - overAtRef.current > RESTART_LOCKOUT_MS) restart();
          break;
      }
    };
    actRef.current = act;
    restartRef.current = restart;

    const onPointer = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('button, a')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      area.focus({ preventScroll: true });
      act();
    };
    const stopTouch = (e: TouchEvent) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const onButton = !!t?.closest('button, a');
      const code = e.code || e.key;
      switch (code) {
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (sim.phase === 'playing') {
            e.preventDefault();
            if (pausedRef.current) setPausedBoth(false);
            else pause();
          }
          break;
        case 'Space':
        case ' ':
        case 'ArrowUp':
        case 'KeyW':
          // A focused button handles its own Space press (click), so do not double-fire.
          if (onButton && code !== 'ArrowUp' && code !== 'KeyW') return;
          e.preventDefault();
          act();
          break;
        case 'Enter':
          if (onButton) return;
          e.preventDefault();
          if (pausedRef.current) setPausedBoth(false);
          else if (sim.phase === 'ready') start();
          else if (sim.phase === 'over') restart();
          break;
      }
    };
    const onVisibility = () => {
      if (document.hidden) pause();
    };

    area.addEventListener('pointerdown', onPointer);
    area.addEventListener('touchmove', stopTouch, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', onVisibility);
    area.focus({ preventScroll: true });

    // Fixed 120 Hz physics with an accumulator; rendering interpolates between ticks.
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) {
        acc += dt;
        while (acc >= DT) {
          step(sim, DT);
          acc -= DT;
        }
        if (sim.events.length) {
          for (const ev of sim.events) onEvent(ev);
          sim.events.length = 0;
        }
      }
      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      renderer.draw(ctx, sim, acc / DT, { reducedMotion, lowTier });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(winTimer);
      rm.removeEventListener('change', onRm);
      area.removeEventListener('pointerdown', onPointer);
      area.removeEventListener('touchmove', stopTouch);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sim, lowTier, toggleFullscreen]);

  // Keyboard users land on Restart when the result card appears.
  useEffect(() => {
    if (phase === 'over') restartBtnRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const overlay = paused ? (
    <div className="flappy-overlay flappy-overlay--dim">
      <div className="flappy-card card w-[min(88%,300px)] p-5 text-center">
        <h2 className="font-display text-2xl font-bold">Paused</h2>
        <p className="mt-1 text-sm text-slate-300">Tap to resume</p>
        <button type="button" className="btn-primary mt-4 w-full" onClick={() => actRef.current()}>Resume</button>
      </div>
    </div>
  ) : phase === 'ready' ? (
    <div className="flappy-overlay">
      <div className="flappy-card card w-[min(88%,320px)] p-5 text-center">
        <div className="text-5xl" aria-hidden="true">{game.emoji}</div>
        <h2 className="mt-1 font-display text-3xl font-bold">{game.name}</h2>
        <p className="mt-1 text-sm text-slate-300">{game.tagline}</p>
        <p className="flappy-tap mt-4 font-display text-xl font-semibold text-yellow-300">Tap to start</p>
        <p className="mt-1 text-xs text-slate-400">Space, ↑ or W also flap</p>
        <p className="mt-3 text-sm text-slate-200">
          Best <span className="font-display text-lg font-bold tabular-nums">{best}</span>
        </p>
      </div>
    </div>
  ) : phase === 'over' ? (
    <div className="flappy-overlay flappy-overlay--dim">
      <div className="flappy-card card w-[min(88%,320px)] p-5 text-center" role="group" aria-label="Round results">
        <h2 className="font-display text-2xl font-bold">Game over</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-xs tracking-wide text-slate-400 uppercase">Score</div>
            <div className="font-display text-3xl font-bold tabular-nums">{score}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-xs tracking-wide text-slate-400 uppercase">Best</div>
            <div className={`font-display text-3xl font-bold tabular-nums ${newBest ? 'flappy-new-best' : ''}`}>{best}</div>
          </div>
        </div>
        {newBest && <p className="mt-2 font-display font-semibold text-yellow-300">New best!</p>}
        <div className="mt-3 flex justify-center">
          <MedalBadge score={score} />
        </div>
        <div className="mt-4 flex gap-2">
          <button ref={restartBtnRef} type="button" className="btn-primary flex-1" onClick={() => restartRef.current()} aria-label="Restart game">
            Restart
          </button>
          <button type="button" className="btn-ghost flex-1" onClick={onExit} aria-label="Exit to games">
            Exit
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Enter or Space restarts</p>
      </div>
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} className={`game-wrapper flappy-root w-full ${fallback ? 'game-fullscreen' : ''}`}>
      <div ref={colRef} className="flappy-col mx-auto flex w-full max-w-[480px] flex-col items-center gap-2 p-2 sm:p-3">
        <div ref={hudRef} className="game-hud flex w-full items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <span aria-hidden="true">{game.emoji}</span>
          <span className="truncate font-display font-semibold">{game.name}</span>
          <span className="text-sm text-slate-300 tabular-nums">Best {best}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={toggleSound} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={!muted}>
              {muted ? '🔈' : '🔊'}
            </button>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-sm"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-pressed={isFullscreen}
              title="Fullscreen (F)"
            >
              {isFullscreen ? '🗗' : '⛶'}
            </button>
            <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={onExit} aria-label="Leave game">🚪</button>
          </span>
        </div>

        <div
          ref={areaRef}
          className="game-board flappy-area"
          style={{ width: size.w, height: size.h }}
          tabIndex={0}
          role="group"
          aria-label="Play area. Tap or press Space to flap, Escape to pause."
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas
            ref={canvasRef}
            className="flappy-canvas"
            role="img"
            aria-label={`${game.name}: a yellow bird flying between green pipes over a scrolling city. Tap, click or press Space to flap.`}
          />
          {overlay}
        </div>

        <p className="text-center text-xs text-slate-400">Tap, Space, ↑ or W to flap · Esc pauses · F fullscreen</p>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announce}</div>
    </div>
  );
}
