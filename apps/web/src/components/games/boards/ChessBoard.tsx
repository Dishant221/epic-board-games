import { movesFrom, PIECE_VALUES, squareName, type ChessMove, type ChessPromo, type ChessState } from '@ebg/game-core/games/chess';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';
import '../../../styles/games/chess.css';

// Filled glyphs for both colours (coloured in CSS); VS15 keeps the pawn as text, not emoji.
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' };
const NAME: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const PROMOS: readonly ChessPromo[] = ['q', 'r', 'b', 'n'];
const DRAG_THRESHOLD = 6;

const isWhite = (piece: string) => piece <= 'Z';
const seatOf = (piece: string) => (isWhite(piece) ? 0 : 1);
const describe = (piece: string) => `${isWhite(piece) ? 'white' : 'black'} ${NAME[piece.toLowerCase()]}`;

interface PieceView {
  id: number;
  piece: string;
  sq: number;
}
interface View {
  board: string;
  pieces: PieceView[];
  nextId: number;
}

/**
 * Gives each piece a stable id across moves so React keeps the same element and
 * the CSS transform transition slides it. Works on the board diff alone, so it
 * copes with castling, en passant, promotion and server resyncs alike.
 */
function reconcile(prev: View | null, board: string): View {
  if (!prev || prev.board.length !== board.length) {
    const pieces: PieceView[] = [];
    let id = prev?.nextId ?? 1;
    for (let sq = 0; sq < board.length; sq++) if (board[sq] !== '.') pieces.push({ id: id++, piece: board[sq]!, sq });
    return { board, pieces, nextId: id };
  }
  if (prev.board === board) return prev;
  const pieces = prev.pieces.filter((p) => board[p.sq] === p.piece);
  const gone = prev.pieces.filter((p) => board[p.sq] !== p.piece);
  let nextId = prev.nextId;
  for (let sq = 0; sq < board.length; sq++) {
    const c = board[sq]!;
    if (c === '.' || prev.board[sq] === c) continue;
    // Prefer the same piece that vanished; a vanished pawn of this colour means a promotion.
    let i = gone.findIndex((p) => p.piece === c);
    if (i < 0) i = gone.findIndex((p) => p.piece === (isWhite(c) ? 'P' : 'p'));
    const moved = i >= 0 ? gone.splice(i, 1)[0] : undefined;
    pieces.push({ id: moved?.id ?? nextId++, piece: c, sq });
  }
  pieces.sort((a, b) => a.id - b.id);
  return { board, pieces, nextId };
}

function Glyph({ piece, className = '' }: { piece: string; className?: string }) {
  return (
    <span className={`chess-glyph ${isWhite(piece) ? 'white' : 'black'} ${className}`} aria-hidden="true">
      {GLYPH[piece.toLowerCase()]}
    </span>
  );
}

interface DragState {
  id: number;
  from: number;
  x: number;
  y: number;
  touch: boolean;
}

export default function ChessBoard({ session, size }: { session: GameSessionView<ChessState, ChessMove>; size: number }) {
  const s = session.state;
  const boardRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const dragRef = useRef<{ id: number; from: number; startX: number; startY: number; moved: boolean; touch: boolean } | null>(null);
  const viewRef = useRef<View | null>(null);
  const soundRef = useRef<{ key: number; captured: number } | null>(null);
  const idBase = useId();

  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState<ChessMove | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);

  const board = s?.board ?? '';
  const view = useMemo(() => reconcile(viewRef.current, board), [board]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Black's view when this browser only controls Black.
  const flipped = session.mySeats.includes(1) && !session.mySeats.includes(0);
  const sqPx = size / 8;
  const toCell = (sq: number) => ({ col: flipped ? 7 - (sq & 7) : sq & 7, row: flipped ? sq >> 3 : 7 - (sq >> 3) });
  const fromCell = (col: number, row: number) => (flipped ? row : 7 - row) * 8 + (flipped ? 7 - col : col);

  const targets = useMemo(() => (s && selected !== null ? movesFrom(s, selected) : []), [s, selected]);
  const targetSet = useMemo(() => new Set(targets.map((m) => m.to)), [targets]);
  const selectable = (sq: number) => !!s && session.canMove && board[sq] !== '.' && seatOf(board[sq]!) === s.turn;

  // Sounds + housekeeping whenever a move lands (from either side).
  useEffect(() => {
    if (!s) return;
    const prev = soundRef.current;
    soundRef.current = { key: session.moveKey, captured: s.captured.length };
    setPending(null);
    setSelected(null);
    if (!prev || prev.key === session.moveKey || !s.lastMove) return;
    if (s.inCheck) play('check');
    else if (s.captured.length > prev.captured) play('capture');
    else play('move');
  }, [session.moveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A move the server never confirms must not leave a ghost piece behind.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(null), 4000);
    return () => window.clearTimeout(t);
  }, [pending]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (promo && !dialog.open) dialog.showModal();
    if (!promo && dialog.open) dialog.close();
  }, [promo]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [s?.san.length]);

  if (!s) return null;

  const submit = (move: ChessMove) => {
    if (!session.canMove) return;
    session.submitMove(move);
    setPending(move);
    setSelected(null);
  };

  const attemptMove = (from: number, to: number) => {
    const options = movesFrom(s, from).filter((m) => m.to === to);
    if (options.length === 0 || !session.canMove) return false;
    if (options[0]!.promo) setPromo({ from, to });
    else submit({ from, to });
    return true;
  };

  // ---------------------------------------------------------------- pointer

  const hitTest = (e: { clientX: number; clientY: number }) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x < rect.width && y < rect.height;
    const sq = inside ? fromCell(Math.floor((x / rect.width) * 8), Math.floor((y / rect.height) * 8)) : null;
    return { x: (x / rect.width) * size, y: (y / rect.height) * size, sq };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (promo || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const hit = hitTest(e);
    if (!hit || hit.sq === null) return;
    e.preventDefault();
    boardRef.current?.focus({ preventScroll: true });
    setCursor(hit.sq);
    if (selected !== null && targetSet.has(hit.sq)) {
      attemptMove(selected, hit.sq);
      return;
    }
    if (selectable(hit.sq)) {
      setSelected(hit.sq);
      const piece = view.pieces.find((p) => p.sq === hit.sq);
      if (piece) {
        const touch = e.pointerType !== 'mouse';
        dragRef.current = { id: piece.id, from: hit.sq, startX: hit.x, startY: hit.y, moved: false, touch };
        boardRef.current?.setPointerCapture(e.pointerId);
      }
      return;
    }
    setSelected(null);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const hit = hitTest(e);
    if (!hit) return;
    if (!d.moved && Math.hypot(hit.x - d.startX, hit.y - d.startY) < DRAG_THRESHOLD) return;
    d.moved = true;
    setDrag({ id: d.id, from: d.from, x: hit.x, y: hit.y, touch: d.touch });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, drop: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    setDrag(null);
    if (!d.moved) return; // a plain tap keeps the selection
    const hit = drop ? hitTest(e) : null;
    if (!hit || hit.sq === null) return setSelected(null); // dropped off the board
    if (hit.sq !== d.from && !attemptMove(d.from, hit.sq)) setSelected(null);
  };

  // --------------------------------------------------------------- keyboard

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (promo) return;
    if (e.key === 'Escape') {
      setSelected(null);
      return;
    }
    const cur = cursor ?? fromCell(4, 7);
    const { col, row } = toCell(cur);
    const step: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const delta = step[e.key];
    if (delta) {
      e.preventDefault();
      setCursor(fromCell(Math.max(0, Math.min(7, col + delta[0])), Math.max(0, Math.min(7, row + delta[1]))));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setCursor(cur);
      if (selected !== null && targetSet.has(cur)) attemptMove(selected, cur);
      else if (selected === cur) setSelected(null);
      else if (selectable(cur)) setSelected(cur);
      else setSelected(null);
    }
  };

  // ----------------------------------------------------------------- derived

  const kingSq = s.inCheck ? board.indexOf(s.turn === 0 ? 'K' : 'k') : -1;
  const lastSan = s.san.at(-1);
  const moverName = (seat: number) => session.players[seat]?.displayName ?? (seat === 0 ? 'White' : 'Black');
  const announcement = lastSan
    ? `${moverName(s.turn === 0 ? 1 : 0)} played ${lastSan}. ${s.result === 'checkmate' ? 'Checkmate!' : s.result === 'stalemate' ? 'Stalemate.' : s.inCheck ? 'Check!' : ''}`
    : '';

  const value = (piece: string) => PIECE_VALUES[piece.toLowerCase()] ?? 0;
  const capturedBy = (seat: number) => s.captured.filter((c) => seatOf(c) !== seat).sort((a, b) => value(b) - value(a));
  const material = (seat: number) => capturedBy(seat).reduce((n, c) => n + value(c), 0) - capturedBy(1 - seat).reduce((n, c) => n + value(c), 0);
  const topSeat = flipped ? 0 : 1;

  // Move list numbering survives positions that did not start from move 1.
  const startPly = s.fullmove * 2 + s.turn - s.san.length;
  const rows: { no: number; white?: string; black?: string }[] = [];
  s.san.forEach((san, i) => {
    const ply = startPly + i;
    const no = ply >> 1;
    const last = rows.at(-1);
    if (ply % 2 === 0) rows.push({ no, white: san });
    else if (last && last.no === no) last.black = san;
    else rows.push({ no, black: san });
  });

  const capturedRow = (seat: number) => {
    const pieces = capturedBy(seat);
    const diff = material(seat);
    return (
      <div role="group" className="flex min-h-7 items-center gap-0.5 px-1 text-lg leading-none" aria-label={`${moverName(seat)} has captured: ${pieces.length ? pieces.map(describe).join(', ') : 'nothing'}${diff > 0 ? `, ahead by ${diff / 100}` : ''}`}>
        {pieces.map((c, i) => (
          <Glyph key={i} piece={c} />
        ))}
        {diff > 0 && <span className="ml-1 text-xs font-semibold text-slate-300">+{diff / 100}</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1" style={{ width: size }}>
      {capturedRow(topSeat)}

      <div className="relative">
        <div
          ref={boardRef}
          className="chess-board game-board shadow-2xl shadow-ink-950/60 ring-1 ring-white/15"
          style={{ width: size, height: size, ['--sq' as string]: `${sqPx}px` }}
          role="grid"
          aria-label={`Chess board, ${flipped ? 'Black' : 'White'} at the bottom. Use the arrow keys to move the cursor, Enter to select a piece or move it, Escape to cancel.`}
          aria-activedescendant={focused && cursor !== null ? `${idBase}-${cursor}` : undefined}
          tabIndex={0}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e, true)}
          onPointerCancel={(e) => endDrag(e, false)}
        >
          {Array.from({ length: 64 }, (_, i) => {
            const col = i % 8;
            const row = Math.floor(i / 8);
            const sq = fromCell(col, row);
            const piece = board[sq]!;
            const light = ((sq & 7) + (sq >> 3)) % 2 === 1;
            const isTarget = targetSet.has(sq);
            const capture = isTarget && (piece !== '.' || (board[selected!] === (s.turn === 0 ? 'P' : 'p') && sq === s.ep));
            const cls = [
              'chess-sq',
              light ? 'light' : 'dark',
              s.lastMove && (s.lastMove.from === sq || s.lastMove.to === sq) ? 'last' : '',
              selected === sq ? 'selected' : '',
              isTarget ? (capture ? 'ring target' : 'dot target') : '',
              kingSq === sq ? 'check' : '',
              focused && cursor === sq ? 'cursor' : '',
              selectable(sq) ? 'grab' : '',
            ].join(' ');
            return (
              <div
                key={sq}
                id={`${idBase}-${sq}`}
                role="gridcell"
                className={cls}
                aria-label={`${squareName(sq)}, ${piece === '.' ? 'empty' : describe(piece)}${kingSq === sq ? ', in check' : ''}${isTarget ? ', legal move' : ''}`}
                aria-selected={selected === sq || undefined}
              >
                {row === 7 && <span className="chess-coord file">{squareName(sq)[0]}</span>}
                {col === 0 && <span className="chess-coord rank">{squareName(sq)[1]}</span>}
              </div>
            );
          })}

          <div className="chess-pieces">
            {view.pieces.map((p) => {
              const dragging = drag?.id === p.id;
              const at = pending && p.sq === pending.from ? pending.to : p.sq;
              const hidden = !!pending && p.sq === pending.to && p.sq !== pending.from;
              const { col, row } = toCell(at);
              const transform = dragging
                ? `translate(${drag.x - sqPx / 2}px, ${drag.y - sqPx / 2 - (drag.touch ? sqPx * 0.4 : 0)}px) scale(1.15)`
                : `translate(${col * 100}%, ${row * 100}%)`;
              return (
                <span key={p.id} className={`chess-piece chess-glyph ${isWhite(p.piece) ? 'white' : 'black'} ${dragging ? 'dragging' : ''}`} style={{ transform, opacity: hidden ? 0 : 1 }} aria-hidden="true">
                  {GLYPH[p.piece.toLowerCase()]}
                </span>
              );
            })}
          </div>
        </div>

        {s.inCheck && s.result === null && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center" aria-hidden="true">
            <span className="animate-pop rounded-full bg-rose-600/90 px-3 py-1 text-sm font-bold text-white shadow-lg">Check!</span>
          </div>
        )}
      </div>

      {capturedRow(1 - topSeat)}

      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>

      <ol ref={listRef} className="card flex max-h-24 flex-wrap content-start gap-x-3 gap-y-1 overflow-y-auto px-3 py-2 text-sm tabular-nums" aria-label="Move list">
        {rows.length === 0 && <li className="text-slate-500">No moves yet</li>}
        {rows.map((r) => (
          <li key={r.no} className="flex gap-1.5 whitespace-nowrap">
            <span className="text-slate-500">{r.no}.{r.white === undefined ? '..' : ''}</span>
            {r.white !== undefined && <span className="font-semibold text-slate-100">{r.white}</span>}
            {r.black !== undefined && <span className="font-semibold text-slate-300">{r.black}</span>}
          </li>
        ))}
      </ol>

      <dialog
        ref={dialogRef}
        onClose={() => setPromo(null)}
        className="m-auto rounded-2xl bg-ink-900 p-4 text-slate-100 ring-1 ring-white/10 backdrop:bg-black/60"
        aria-label="Choose a piece to promote to"
      >
        <p className="mb-3 text-center font-display text-lg font-semibold">Promote to</p>
        <div className="flex gap-2">
          {PROMOS.map((pr) => {
            const piece = s.turn === 0 ? pr.toUpperCase() : pr;
            return (
              <button
                key={pr}
                type="button"
                className="btn-ghost size-16 p-0 text-5xl"
                aria-label={NAME[pr]}
                onClick={() => {
                  if (promo) submit({ from: promo.from, to: promo.to, promo: pr });
                  setPromo(null);
                }}
              >
                <Glyph piece={piece} />
              </button>
            );
          })}
        </div>
        <button type="button" className="btn-ghost mt-3 w-full text-sm" onClick={() => setPromo(null)}>Cancel</button>
      </dialog>
    </div>
  );
}
