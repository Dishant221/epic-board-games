import { getPuzzleImage, pieceSlot, puzzlePlacedCount, type EpicPuzzleMove, type EpicPuzzleState } from '@ebg/game-core/games/epic-puzzle';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import { puzzleGeometry, slotAt, slotOrigin, snapDistance, trayScale } from './geometry';
import { PuzzleHud } from './PuzzleHud';
import { PuzzlePiece } from './PuzzlePiece';

type Session = GameSessionView<EpicPuzzleState, EpicPuzzleMove>;

/** One in-flight pointer interaction on a tray piece (mutable, outside React state). */
interface Drag {
  piece: number;
  pointerId: number;
  startX: number;
  startY: number;
  /** Where the finger grabbed the piece, as fractions of its size. */
  grabFx: number;
  grabFy: number;
  /** False until the pointer moved far enough to count as a drag, not a tap/scroll. */
  active: boolean;
  /** Floating piece top-left, in board-root coordinates. */
  x: number;
  y: number;
  el: HTMLElement;
}

const TRAY_PAD = 4;
const PENDING_TIMEOUT_MS = 5000;
const SPARKS = 28;

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  session: Session;
  state: EpicPuzzleState;
  width: number;
}

/** Phase 'play': canvas with slots, scrollable tray, drag-and-drop and tap/keyboard placement. */
export function PuzzlePlay({ session, state: s, width }: Props) {
  const image = getPuzzleImage(s.imageId ?? '');
  const g = useMemo(() => puzzleGeometry(width, s.cols, s.rows), [width, s.cols, s.rows]);
  const tScale = trayScale(g);
  const trayPieceH = g.pieceH * tScale;
  const src = image?.src ?? '';
  const total = s.placed.length;
  const done = puzzlePlacedCount(s);
  const solved = s.tray.length === 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef(false);
  const prevPlacedRef = useRef<(number | null)[] | null>(null);

  const [dragging, setDragging] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [preview, setPreview] = useState(true);
  /** Pieces we dropped that the (possibly remote) state has not confirmed yet. */
  const [pending, setPending] = useState<number[]>([]);
  /** Recently confirmed placements, animated in. */
  const [recent, setRecent] = useState<number[]>([]);
  const [wrongSlot, setWrongSlot] = useState<number | null>(null);
  const [burst, setBurst] = useState(false);
  const [announce, setAnnounce] = useState('');

  // ---------------------------------------------------------------- effects

  // Diff `placed` to animate + sound every new piece, whoever placed it.
  useEffect(() => {
    const prev = prevPlacedRef.current;
    prevPlacedRef.current = s.placed;
    if (!prev) return;
    const added: number[] = [];
    s.placed.forEach((seat, piece) => seat !== null && prev[piece] === null && added.push(piece));
    if (added.length === 0) return;
    setPending((p) => p.filter((piece) => !added.includes(piece)));
    setRecent((r) => [...r, ...added]);
    if (s.tray.length === 0) {
      play('solve');
      setBurst(true);
    } else {
      play('place');
    }
    const t = window.setTimeout(() => setRecent((r) => r.filter((piece) => !added.includes(piece))), 700);
    return () => window.clearTimeout(t);
  }, [s.placed, s.tray.length]);

  // Optimistic pieces that never got confirmed (dropped socket, veto) fall back to the tray.
  useEffect(() => {
    if (pending.length === 0) return;
    const t = window.setTimeout(() => setPending([]), PENDING_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [pending]);

  useEffect(() => {
    if (wrongSlot === null) return;
    const t = window.setTimeout(() => setWrongSlot(null), 450);
    return () => window.clearTimeout(t);
  }, [wrongSlot]);

  useEffect(() => {
    if (!burst) return;
    const t = window.setTimeout(() => setBurst(false), 1600);
    return () => window.clearTimeout(t);
  }, [burst]);

  // ---------------------------------------------------------------- helpers

  const rootRect = () => rootRef.current!.getBoundingClientRect();
  const canvasOffset = () => {
    const r = rootRect();
    const c = canvasRef.current!.getBoundingClientRect();
    return { x: c.left - r.left, y: c.top - r.top };
  };
  const centreSlot = () => Math.floor(s.rows / 2) * s.cols + Math.floor(s.cols / 2);

  const positionFloat = (d: Drag) => {
    const el = floatRef.current;
    if (el) el.style.transform = `translate(${d.x}px, ${d.y}px)`;
  };

  const isNearSlot = (d: Drag) => {
    const off = canvasOffset();
    const o = slotOrigin(g, d.piece);
    const dx = d.x + g.pieceW / 2 - off.x - (o.x + g.pieceW / 2);
    const dy = d.y + g.pieceH / 2 - off.y - (o.y + g.pieceH / 2);
    return Math.hypot(dx, dy) <= snapDistance(g);
  };

  const markNear = (piece: number, on: boolean) => {
    canvasRef.current?.querySelector(`[data-slot="${piece}"]`)?.classList.toggle('ep-slot-near', on);
  };

  const placePiece = (piece: number) => {
    if (!session.canMove) return;
    setPending((p) => (p.includes(piece) ? p : [...p, piece]));
    setSelected(null);
    setCursor(null);
    session.submitMove({ type: 'place', piece });
  };

  const tryPlaceAt = (slot: number) => {
    if (selected === null) return;
    if (slot === selected) {
      placePiece(selected);
      setAnnounce('Piece placed!');
    } else {
      play('error');
      setWrongSlot(slot);
      setAnnounce('That piece does not fit there.');
    }
  };

  const flyBack = (d: Drag) => {
    const el = floatRef.current;
    const r = rootRect();
    const t = d.el.getBoundingClientRect();
    const tx = t.left - r.left + TRAY_PAD;
    const ty = t.top - r.top + TRAY_PAD;
    if (!el || typeof el.animate !== 'function' || reducedMotion()) return setDragging(null);
    const anim = el.animate(
      [{ transform: `translate(${d.x}px, ${d.y}px) scale(1)` }, { transform: `translate(${tx}px, ${ty}px) scale(${tScale})` }],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => setDragging(null);
    anim.oncancel = () => setDragging(null);
  };

  // ---------------------------------------------------------- pointer input

  const onPiecePointerDown = (e: React.PointerEvent<HTMLButtonElement>, piece: number) => {
    suppressClickRef.current = false;
    if (!session.canMove || dragRef.current) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      e.preventDefault(); // no text selection / native image drag
    }
    const r = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      piece,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabFx: (e.clientX - r.left) / r.width,
      grabFy: (e.clientY - r.top) / r.height,
      active: false,
      x: 0,
      y: 0,
      el: e.currentTarget,
    };
  };

  const onPiecePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      // Touch: a horizontal swipe scrolls the tray (touch-action: pan-x); only a
      // clearly vertical pull lifts the piece. Mouse: any small movement drags.
      const lifts = e.pointerType === 'mouse' ? Math.hypot(dx, dy) >= 4 : Math.abs(dy) >= 10 && Math.abs(dy) > Math.abs(dx);
      if (!lifts) return;
      d.active = true;
      suppressClickRef.current = true;
      try {
        d.el.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
      setSelected(null);
      setCursor(null);
      setDragging(d.piece);
    }
    const r = rootRect();
    d.x = e.clientX - r.left - d.grabFx * g.pieceW;
    d.y = e.clientY - r.top - d.grabFy * g.pieceH;
    positionFloat(d);
    markNear(d.piece, isNearSlot(d));
  };

  const onPiecePointerEnd = (e: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!d.active) return; // a tap: the click handler toggles selection
    try {
      d.el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    markNear(d.piece, false);
    if (!cancelled && isNearSlot(d)) {
      placePiece(d.piece);
      setDragging(null);
      return;
    }
    play('error');
    flyBack(d);
  };

  const onPieceClick = (piece: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!session.canMove) return;
    if (selected === piece) {
      setSelected(null);
      setCursor(null);
      setAnnounce('Selection cleared.');
      return;
    }
    play('tile');
    setSelected(piece);
    setCursor((c) => c ?? centreSlot());
    setAnnounce('Piece selected. Tap its spot on the canvas, or use the arrow keys and Enter.');
    canvasRef.current?.focus({ preventScroll: true });
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selected === null) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const slot = slotAt(g, e.clientX - r.left, e.clientY - r.top);
    if (slot !== null) tryPlaceAt(slot);
  };

  const onCanvasKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (selected === null) return;
    const cur = cursor ?? centreSlot();
    let { col, row } = pieceSlot(cur, s.cols);
    switch (e.key) {
      case 'ArrowLeft': col = Math.max(0, col - 1); break;
      case 'ArrowRight': col = Math.min(s.cols - 1, col + 1); break;
      case 'ArrowUp': row = Math.max(0, row - 1); break;
      case 'ArrowDown': row = Math.min(s.rows - 1, row + 1); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        tryPlaceAt(cur);
        return;
      case 'Escape': {
        e.preventDefault();
        const piece = selected;
        setSelected(null);
        setCursor(null);
        setAnnounce('Selection cleared.');
        trayRef.current?.querySelector<HTMLElement>(`[data-piece="${piece}"]`)?.focus();
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    const next = row * s.cols + col;
    setCursor(next);
    setAnnounce(`Slot row ${row + 1}, column ${col + 1}${s.placed[next] !== null ? ', already filled' : ''}.`);
  };

  const scrollTray = (dir: -1 | 1) => trayRef.current?.scrollBy({ left: dir * width * 0.6, behavior: reducedMotion() ? 'auto' : 'smooth' });

  // ----------------------------------------------------------------- render

  if (!image) return null;
  const trayPieces = s.tray.filter((p) => !pending.includes(p));
  const trayOverflows = trayPieces.length * (g.pieceW * tScale + TRAY_PAD * 2 + 8) > width;
  const sparks = burst
    ? Array.from({ length: SPARKS }, (_, i) => {
        const angle = (i / SPARKS) * Math.PI * 2 + (i % 2) * 0.2;
        const dist = (0.25 + ((i * 7) % 5) / 8) * Math.min(g.canvasW, g.canvasH);
        return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, c: image.palette[i % 3], d: (i % 4) * 60 };
      })
    : [];

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2 select-none" style={{ width }}>
      <PuzzleHud state={s} session={session} title={image.title} preview={preview} onTogglePreview={() => setPreview((p) => !p)} />

      <div
        ref={canvasRef}
        className={`game-board relative overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/10 outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${solved ? 'ep-solved ep-solved-glow' : ''}`}
        style={{ width: g.canvasW, height: g.canvasH }}
        role="group"
        tabIndex={0}
        aria-label={`Puzzle canvas, ${done} of ${total} pieces placed.${selected !== null ? ' Use the arrow keys to choose a slot and Enter to place the selected piece.' : ''}`}
        onClick={onCanvasClick}
        onKeyDown={onCanvasKey}
      >
        {/* Faint ghost of the finished picture. */}
        <div
          className="absolute inset-0 bg-no-repeat transition-opacity duration-300"
          style={{ backgroundImage: `url("${src}")`, backgroundSize: `${g.canvasW}px ${g.canvasH}px`, opacity: preview && !solved ? 0.22 : 0 }}
          aria-hidden="true"
        />
        {!solved &&
          s.placed.map((seat, piece) => {
            if (seat !== null || pending.includes(piece)) return null;
            const o = slotOrigin(g, piece);
            return <div key={piece} data-slot={piece} className={`ep-slot ${wrongSlot === piece ? 'ep-slot-wrong' : ''}`} style={{ left: o.x, top: o.y, width: g.pieceW, height: g.pieceH }} />;
          })}
        {s.placed.map((seat, piece) => {
          const isPending = seat === null && pending.includes(piece);
          if (seat === null && !isPending) return null;
          const o = slotOrigin(g, piece);
          return (
            <PuzzlePiece
              key={piece}
              src={src}
              geometry={g}
              piece={piece}
              placed
              className={recent.includes(piece) ? 'ep-snap-in' : ''}
              style={{ position: 'absolute', left: o.x, top: o.y, opacity: isPending ? 0.85 : 1, ['--ep-seat' as string]: SEAT_COLORS[seat ?? 0] }}
            />
          );
        })}
        {selected !== null && cursor !== null && (
          <div className="ep-cursor" style={{ left: slotOrigin(g, cursor).x, top: slotOrigin(g, cursor).y, width: g.pieceW, height: g.pieceH }} aria-hidden="true" />
        )}
        {sparks.map((sp, i) => (
          <span key={i} className="ep-spark" style={{ ['--dx' as string]: `${sp.dx}px`, ['--dy' as string]: `${sp.dy}px`, ['--c' as string]: sp.c, ['--d' as string]: `${sp.d}ms` }} aria-hidden="true" />
        ))}
        {solved && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="animate-pop rounded-full bg-black/70 px-4 py-2 font-display text-sm font-semibold shadow-lg">🎉 Puzzle complete!</span>
          </div>
        )}
      </div>

      {/* Tray */}
      <div className="relative" style={{ minHeight: trayPieceH + TRAY_PAD * 2 + 12 }}>
        <div
          ref={trayRef}
          className="no-scrollbar flex items-center gap-2 overflow-x-auto rounded-2xl bg-white/5 px-2 py-1.5 ring-1 ring-white/10"
          role="group"
          aria-label={`Piece tray, ${trayPieces.length} pieces left`}
          style={{ height: trayPieceH + TRAY_PAD * 2 + 12 }}
        >
          {trayPieces.length === 0 && <span className="w-full text-center text-sm text-slate-400">{solved ? 'All pieces placed!' : 'Placing…'}</span>}
          {trayPieces.map((piece, i) => (
            <button
              key={piece}
              type="button"
              data-piece={piece}
              className={`ep-tray-piece ${selected === piece ? 'ep-selected' : ''}`}
              style={{ opacity: dragging === piece ? 0.3 : undefined }}
              disabled={!session.canMove}
              aria-label={`Puzzle piece ${i + 1} of ${trayPieces.length}${selected === piece ? ', selected' : ''}`}
              aria-pressed={selected === piece}
              onPointerDown={(e) => onPiecePointerDown(e, piece)}
              onPointerMove={onPiecePointerMove}
              onPointerUp={(e) => onPiecePointerEnd(e, false)}
              onPointerCancel={(e) => onPiecePointerEnd(e, true)}
              onClick={() => onPieceClick(piece)}
            >
              <PuzzlePiece src={src} geometry={g} piece={piece} scale={tScale} />
            </button>
          ))}
        </div>
        {trayOverflows && (
          <>
            <button type="button" className="btn-ghost absolute top-1/2 left-1 size-9 -translate-y-1/2 p-0 opacity-80" onClick={() => scrollTray(-1)} aria-label="Scroll tray left">‹</button>
            <button type="button" className="btn-ghost absolute top-1/2 right-1 size-9 -translate-y-1/2 p-0 opacity-80" onClick={() => scrollTray(1)} aria-label="Scroll tray right">›</button>
          </>
        )}
      </div>

      {/* Floating piece while dragging / flying back. */}
      {dragging !== null && (
        <div
          ref={(el) => {
            floatRef.current = el;
            if (el && dragRef.current) positionFloat(dragRef.current);
          }}
          className="ep-drag"
        >
          <PuzzlePiece src={src} geometry={g} piece={dragging} />
        </div>
      )}

      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  );
}
