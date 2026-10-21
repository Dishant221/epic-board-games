import type { TicTacToeMove, TicTacToeState } from '@ebg/game-core';
import { useEffect } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { play } from '../../../lib/sound';

const MARK = ['✕', '◯'];
const COLOR = ['text-rose-400', 'text-sky-400'];

export default function TicTacToeBoard({ session, size }: { session: GameSessionView<TicTacToeState, TicTacToeMove>; size: number }) {
  const s = session.state;

  useEffect(() => {
    if (session.moveKey > 0) play('move');
  }, [session.moveKey]);

  if (!s) return null;
  return (
    <div
      className="game-board grid grid-cols-3 gap-2 rounded-3xl bg-ink-800/80 p-3 shadow-2xl shadow-cyan-900/30 ring-1 ring-white/10"
      style={{ width: Math.min(size, 520), height: Math.min(size, 520) }}
      role="grid"
      aria-label="Tic Tac Toe board"
    >
      {s.board.map((cell, i) => {
        const winning = s.winLine?.includes(i);
        const playable = cell === null && session.canMove;
        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            disabled={!playable}
            onClick={() => session.submitMove({ cell: i })}
            aria-label={`Cell ${i + 1}: ${cell === null ? 'empty' : cell === 0 ? 'X' : 'O'}`}
            className={`grid place-items-center rounded-2xl text-[min(16vw,7rem)] font-bold leading-none transition
              ${winning ? 'bg-yellow-300/20 ring-2 ring-yellow-300' : 'bg-ink-900/80'}
              ${playable ? 'hover:bg-white/10' : ''}`}
          >
            {cell !== null && <span className={`animate-pop ${COLOR[cell]} drop-shadow-[0_0_12px_currentColor]`}>{MARK[cell]}</span>}
          </button>
        );
      })}
    </div>
  );
}
