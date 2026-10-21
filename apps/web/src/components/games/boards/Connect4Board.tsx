import { C4_COLS, C4_ROWS, type Connect4Move, type Connect4State } from '@ebg/game-core';
import { useEffect, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';

const DISC = ['bg-gradient-to-br from-rose-400 to-rose-600', 'bg-gradient-to-br from-yellow-200 to-yellow-400'];

export default function Connect4Board({ session, size }: { session: GameSessionView<Connect4State, Connect4Move>; size: number }) {
  const s = session.state;
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const width = Math.min(size, 640);
  const cell = width / C4_COLS;

  useEffect(() => {
    if (session.moveKey > 0 && s?.lastMove) play('drop');
  }, [session.moveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null;
  const winSet = new Set(s.winCells?.map(([c, r]) => `${c}:${r}`));
  const turnColor = s.turn;

  const onKey = (e: React.KeyboardEvent) => {
    if (!session.canMove) return;
    const col = hoverCol ?? 3;
    if (e.key === 'ArrowLeft') setHoverCol(Math.max(0, col - 1));
    if (e.key === 'ArrowRight') setHoverCol(Math.min(C4_COLS - 1, col + 1));
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      session.submitMove({ col });
    }
  };

  return (
    <div className="game-board select-none" style={{ width }}>
      {/* Hover preview disc */}
      <div className="relative mb-1" style={{ height: cell * 0.9 }} aria-hidden="true">
        {session.canMove && hoverCol !== null && (
          <span
            className={`absolute top-0 rounded-full shadow-lg transition-[left] duration-150 ${DISC[turnColor]}`}
            style={{ width: cell * 0.8, height: cell * 0.8, left: hoverCol * cell + cell * 0.1 }}
          />
        )}
      </div>
      <div
        className="relative grid rounded-3xl bg-gradient-to-b from-blue-600 to-blue-800 p-[1.5%] shadow-2xl shadow-blue-950/60 ring-1 ring-white/20"
        style={{ gridTemplateColumns: `repeat(${C4_COLS}, 1fr)` }}
        role="grid"
        aria-label="Connect 4 board. Use arrow keys to choose a column and Enter to drop."
        tabIndex={0}
        onKeyDown={onKey}
        onMouseLeave={() => setHoverCol(null)}
      >
        {Array.from({ length: C4_COLS }, (_, col) => (
          <button
            key={col}
            type="button"
            className="flex flex-col-reverse disabled:cursor-default"
            disabled={!session.canMove || s.board[col]![C4_ROWS - 1] !== null}
            onMouseEnter={() => setHoverCol(col)}
            onFocus={() => setHoverCol(col)}
            onClick={() => session.submitMove({ col })}
            aria-label={`Column ${col + 1}`}
            tabIndex={-1}
          >
            {Array.from({ length: C4_ROWS }, (_, row) => {
              const v = s.board[col]![row];
              const isLast = s.lastMove?.col === col && s.lastMove.row === row;
              return (
                <span key={row} className="relative grid aspect-square place-items-center p-[8%]">
                  <span className="absolute inset-[8%] rounded-full bg-ink-950/90 shadow-[inset_0_4px_8px_rgba(0,0,0,0.6)]" />
                  {v !== null && v !== undefined && (
                    <span
                      key={isLast ? session.moveKey : undefined}
                      className={`relative size-full rounded-full shadow-[inset_0_-4px_6px_rgba(0,0,0,0.3)] ${DISC[v]} ${isLast ? 'animate-drop' : ''} ${winSet.has(`${col}:${row}`) ? 'ring-4 ring-white animate-pulse' : ''}`}
                      style={{ ['--drop-from' as string]: `-${(C4_ROWS - row) * 110}%` }}
                    />
                  )}
                </span>
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}
