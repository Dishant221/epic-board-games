import {
  checkers,
  CHECKERS_SIZE,
  CHECKERS_SQUARES,
  countPieces,
  isDarkSquare,
  isJump,
  isKing,
  pieceSeat,
  sqCol,
  sqRow,
  squareName,
  toSquare,
  type CheckersMove,
  type CheckersPiece,
  type CheckersState,
} from '@ebg/game-core/games/checkers';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import { SEAT_COLORS } from '../shared/PlayerPanel';
import '../../../styles/games/checkers.css';

const SEAT_NAME = ['Red', 'Black'];
/** Pointer travel (px) before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 4;

interface Piece {
  id: number;
  sq: number;
  type: CheckersPiece;
}
interface Ghost extends Piece {
  key: number;
}

/**
 * The engine state is a bare board string, so pieces have no identity. We
 * assign ids and carry them across moves using `lastMove`/`lastCapture`, which
 * lets React keep the same element per disc and CSS slide it to its new square.
 */
interface Tracker {
  board: string | null;
  ids: (number | null)[];
  nextId: number;
  pieces: Piece[];
  /** Piece removed by the latest transition (for the pop-and-fade ghost). */
  captured: Piece | null;
}

const EMPTY_TRACKER: Tracker = { board: null, ids: Array<number | null>(CHECKERS_SQUARES).fill(null), nextId: 1, pieces: [], captured: null };

function reconcile(t: Tracker, s: CheckersState): Tracker {
  if (t.board === s.board) return t; // idempotent: safe under StrictMode double renders
  let ids = t.ids.slice();
  let nextId = t.nextId;
  let captured: Piece | null = null;
  if (t.board !== null && s.lastMove) {
    const { from, to } = s.lastMove;
    if (s.lastCapture !== null && ids[s.lastCapture] != null) {
      captured = { id: ids[s.lastCapture]!, sq: s.lastCapture, type: t.board.charAt(s.lastCapture) as CheckersPiece };
      ids[s.lastCapture] = null;
    }
    ids[to] = ids[from] ?? null;
    ids[from] = null;
  }
  // Anything the last move does not explain (new game, resync) → fresh ids, no slide.
  let consistent = t.board !== null;
  for (let sq = 0; consistent && sq < CHECKERS_SQUARES; sq++) consistent = (s.board.charAt(sq) !== '.') === (ids[sq] != null);
  if (!consistent) {
    ids = Array<number | null>(CHECKERS_SQUARES).fill(null);
    captured = null;
    for (let sq = 0; sq < CHECKERS_SQUARES; sq++) if (s.board.charAt(sq) !== '.') ids[sq] = nextId++;
  }
  const pieces: Piece[] = [];
  for (let sq = 0; sq < CHECKERS_SQUARES; sq++) {
    const id = ids[sq];
    if (id != null) pieces.push({ id, sq, type: s.board.charAt(sq) as CheckersPiece });
  }
  pieces.sort((a, b) => a.id - b.id); // stable DOM order
  return { board: s.board, ids, nextId, pieces, captured };
}

interface Press {
  id: number;
  from: number;
  type: CheckersPiece;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

function Disc({ type, crownKey, capturer }: { type: CheckersPiece; crownKey?: number | string; capturer?: boolean }) {
  const seat = pieceSeat(type)!;
  return (
    <span className={`ck-disc ck-disc--${seat} ${capturer ? 'ck-disc--capturer' : ''}`}>
      {isKing(type) && (
        <span key={crownKey ?? 'crown'} className={`ck-crown ${crownKey !== undefined ? 'ck-crown--pop' : ''}`} aria-hidden="true">
          ♛
        </span>
      )}
    </span>
  );
}

export default function CheckersBoard({ session, size }: { session: GameSessionView<CheckersState, CheckersMove>; size: number }) {
  const s = session.state;
  const width = Math.min(size, 640);
  const flipped = session.mySeats.includes(1) && !session.mySeats.includes(0);

  const boardRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<Tracker>(EMPTY_TRACKER);
  const pressRef = useRef<Press | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const animatedBoard = useRef<string | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  /** Set once a press has travelled past the threshold: the disc follows the pointer. */
  const [drag, setDrag] = useState<Press | null>(null);
  const [droppedId, setDroppedId] = useState<number | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);

  if (s) trackerRef.current = reconcile(trackerRef.current, s);
  const pieces = trackerRef.current.pieces;

  // Display orientation: row 0 is red's home row, drawn at the bottom unless we sit as black.
  const toDisplay = (sq: number) => ({
    col: flipped ? CHECKERS_SIZE - 1 - sqCol(sq) : sqCol(sq),
    row: flipped ? sqRow(sq) : CHECKERS_SIZE - 1 - sqRow(sq),
  });
  const fromDisplay = (col: number, row: number) => toSquare(flipped ? row : CHECKERS_SIZE - 1 - row, flipped ? CHECKERS_SIZE - 1 - col : col);

  const legal = useMemo(() => (s && session.canMove ? checkers.legalMoves(s) : []), [s, session.canMove]);
  const movable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);
  const mustCapture = legal.length > 0 && isJump(legal[0]!);
  const continuing = !!s && s.mustContinueFrom !== null && session.canMove;
  const effectiveSelected = continuing ? s!.mustContinueFrom : selected !== null && movable.has(selected) ? selected : null;
  const targets = useMemo(() => new Set(legal.filter((m) => m.from === effectiveSelected).map((m) => m.to)), [legal, effectiveSelected]);

  // Each applied move: sound, captured-piece ghost, clear selection / drop marker.
  useEffect(() => {
    if (!s || animatedBoard.current === s.board) return;
    const first = animatedBoard.current === null;
    animatedBoard.current = s.board;
    setSelected(null);
    setDroppedId(null);
    if (first || !s.lastMove || s.ply === 0) return;
    const cap = trackerRef.current.captured;
    if (cap) {
      const ghost: Ghost = { ...cap, key: session.moveKey };
      setGhosts((g) => [...g, ghost]);
      window.setTimeout(() => setGhosts((g) => g.filter((x) => x.key !== ghost.key)), 600);
      play('capture');
    } else if (!s.lastCrowned) {
      play('move');
    }
    if (s.lastCrowned) play('hint');
  }, [s, session.moveKey]);

  const boardPoint = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top, cell: rect.width / CHECKERS_SIZE };
  };

  const squareAt = (clientX: number, clientY: number): number | null => {
    const p = boardPoint(clientX, clientY);
    if (!p) return null;
    const col = Math.floor(p.x / p.cell);
    const row = Math.floor(p.y / p.cell);
    if (col < 0 || col >= CHECKERS_SIZE || row < 0 || row >= CHECKERS_SIZE) return null;
    return fromDisplay(col, row);
  };

  const avatarTransform = () => {
    const p = boardPoint(pointerRef.current.x, pointerRef.current.y);
    return p ? `translate(${p.x - p.cell / 2}px, ${p.y - p.cell / 2}px)` : undefined;
  };

  const submit = (move: CheckersMove) => {
    if (!session.canMove) return;
    session.submitMove(move);
    setSelected(null);
  };

  /** Tap / Enter on a square: move there if it is a target, else (de)select. */
  const activate = (sq: number) => {
    if (!s || !session.canMove) return;
    if (effectiveSelected !== null && targets.has(sq)) {
      submit({ from: effectiveSelected, to: sq });
      return;
    }
    if (continuing) return; // locked onto the jumping piece
    if (movable.has(sq)) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (sq === null || !s) return;
    setKeyboard(false);
    setCursor(sq);
    const id = trackerRef.current.ids[sq];
    const canDrag = session.canMove && movable.has(sq) && (!continuing || s.mustContinueFrom === sq) && id != null;
    if (!canDrag) {
      activate(sq);
      return;
    }
    pointerRef.current = { x: e.clientX, y: e.clientY };
    pressRef.current = { id, from: sq, type: s.board.charAt(sq) as CheckersPiece, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
    setSelected(sq);
    boardRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pressRef.current;
    if (!p || p.pointerId !== e.pointerId) return;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    if (!p.moved && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > DRAG_THRESHOLD) {
      p.moved = true;
      setDrag({ ...p }); // mounts the avatar (positioned from pointerRef during render)
    }
    // Follow the pointer without re-rendering the whole board.
    if (p.moved && avatarRef.current) avatarRef.current.style.transform = avatarTransform() ?? '';
  };

  const endPress = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const p = pressRef.current;
    if (!p || p.pointerId !== e.pointerId) return;
    pressRef.current = null;
    setDrag(null);
    if (boardRef.current?.hasPointerCapture(e.pointerId)) boardRef.current.releasePointerCapture(e.pointerId);
    if (cancelled || !p.moved) return; // a plain tap keeps the selection
    const sq = squareAt(e.clientX, e.clientY);
    if (sq !== null && legal.some((m) => m.from === p.from && m.to === sq)) {
      setDroppedId(p.id); // the disc was dropped here: appear without a slide
      submit({ from: p.from, to: sq });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!s) return;
    const cur = cursor ?? effectiveSelected ?? legal[0]?.from ?? fromDisplay(0, CHECKERS_SIZE - 1);
    let dr = 0;
    let dc = 0;
    switch (e.key) {
      case 'ArrowUp': dr = flipped ? -1 : 1; break;
      case 'ArrowDown': dr = flipped ? 1 : -1; break;
      case 'ArrowLeft': dc = flipped ? 1 : -1; break;
      case 'ArrowRight': dc = flipped ? -1 : 1; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        setKeyboard(true);
        setCursor(cur);
        activate(cur);
        return;
      case 'Escape':
        setSelected(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    setKeyboard(true);
    const row = Math.max(0, Math.min(CHECKERS_SIZE - 1, sqRow(cur) + dr));
    const col = Math.max(0, Math.min(CHECKERS_SIZE - 1, sqCol(cur) + dc));
    setCursor(toSquare(row, col));
  };

  if (!s) return null;

  const cell = width / CHECKERS_SIZE;
  const topSeat = flipped ? 0 : 1;
  const bottomSeat = flipped ? 1 : 0;
  const showCursor = keyboard && cursor !== null;
  const hint = !session.canMove ? '' : continuing ? 'You must continue jumping' : mustCapture ? 'Capture available — you must take it' : '';
  const lastFrom = s.lastMove?.from ?? -1;
  const lastTo = s.lastMove?.to ?? -1;

  const describe = (sq: number) => {
    const c = s.board.charAt(sq);
    const seat = pieceSeat(c);
    const what = seat === null ? 'empty' : `${SEAT_NAME[seat]} ${isKing(c) ? 'king' : 'man'}`;
    const extra = [sq === effectiveSelected && 'selected', targets.has(sq) && 'legal target', movable.has(sq) && 'can move', sq === lastTo && 'last move']
      .filter(Boolean)
      .join(', ');
    return `${squareName(sq)}: ${what}${extra ? `, ${extra}` : ''}`;
  };

  const transformFor = (sq: number) => {
    const { col, row } = toDisplay(sq);
    return `translate(${col * 100}%, ${row * 100}%)`;
  };

  const capturedRow = (seat: number) => {
    const player = session.players[seat];
    const taken = s.captured[seat] ?? 0;
    const left = countPieces(s.board, seat);
    const active = session.currentSeat === seat && session.winner === null;
    return (
      <div className={`flex min-h-7 items-center gap-2 px-1 text-xs sm:text-sm ${active ? 'text-white' : 'text-slate-400'}`}>
        <span className="size-3 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: SEAT_COLORS[seat] }} aria-hidden="true" />
        <span className="truncate font-semibold">{player?.displayName ?? SEAT_NAME[seat]}</span>
        <span className="text-slate-500" aria-hidden="true">·</span>
        <span className="tabular-nums">{left} left</span>
        <span className="ml-auto flex items-center gap-1" aria-label={`${SEAT_NAME[seat]} captured ${taken} piece${taken === 1 ? '' : 's'}`}>
          {taken > 0 && <span className="tabular-nums text-slate-400">+{taken}</span>}
          <span className="flex items-center gap-0.5" aria-hidden="true">
            {Array.from({ length: taken }, (_, i) => (
              <span key={i} className={`ck-mini ck-disc--${1 - seat}`} />
            ))}
          </span>
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1" style={{ width }}>
      {capturedRow(topSeat)}
      <div className="ck-frame game-board">
        <div
          ref={boardRef}
          className="ck-board"
          style={{ ['--cell' as string]: `${cell}px` }}
          role="grid"
          aria-label={`Checkers board. ${SEAT_NAME[bottomSeat]} plays from the bottom. Use arrow keys to move the cursor, Enter to select or move, Escape to cancel.`}
          aria-activedescendant={showCursor ? `ck-sq-${cursor}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endPress(e, false)}
          onPointerCancel={(e) => endPress(e, true)}
        >
          {Array.from({ length: CHECKERS_SIZE }, (_, dRow) => (
            <div key={dRow} role="row" className="contents">
              {Array.from({ length: CHECKERS_SIZE }, (_, dCol) => {
                const sq = fromDisplay(dCol, dRow);
                const cls = [
                  'ck-sq',
                  isDarkSquare(sq) ? 'ck-sq--dark' : 'ck-sq--light',
                  (sq === lastFrom || sq === lastTo) && 'ck-sq--last',
                  sq === effectiveSelected && 'ck-sq--selected',
                  showCursor && cursor === sq && 'ck-sq--cursor',
                  targets.has(sq) && (mustCapture ? 'ck-sq--capture-target' : 'ck-sq--target'),
                  movable.has(sq) && !continuing && 'ck-sq--movable',
                ]
                  .filter(Boolean)
                  .join(' ');
                return <div key={sq} id={`ck-sq-${sq}`} role="gridcell" className={cls} aria-label={describe(sq)} aria-selected={sq === effectiveSelected || undefined} />;
              })}
            </div>
          ))}

          <div className="ck-pieces" aria-hidden="true">
            {pieces.map((p) => {
              const cls = ['ck-piece', drag?.id === p.id && 'ck-piece--lifted', droppedId === p.id && 'ck-piece--instant', p.sq === lastTo && 'ck-piece--moving']
                .filter(Boolean)
                .join(' ');
              return (
                <div key={p.id} className={cls} style={{ transform: transformFor(p.sq) }}>
                  <Disc
                    type={p.type}
                    crownKey={s.lastCrowned && p.sq === lastTo ? session.moveKey : undefined}
                    capturer={mustCapture && movable.has(p.sq) && effectiveSelected === null}
                  />
                </div>
              );
            })}
            {ghosts.map((g) => (
              <div key={`ghost-${g.key}`} className="ck-piece ck-piece--ghost ck-piece--instant" style={{ transform: transformFor(g.sq) }}>
                <Disc type={g.type} />
              </div>
            ))}
            {drag && (
              <div ref={avatarRef} className="ck-piece ck-avatar" style={{ transform: avatarTransform() }}>
                <Disc type={drag.type} />
              </div>
            )}
          </div>
        </div>
      </div>
      {capturedRow(bottomSeat)}
      <p className="min-h-5 px-1 text-center text-xs font-semibold text-amber-200" aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
