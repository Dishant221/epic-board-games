import { DRAW, LOST, type RoomPlayer } from '@ebg/game-core';
import { useEffect, useMemo } from 'react';
import { play } from '../../../lib/sound';

interface Props {
  winner: number;
  players: RoomPlayer[];
  mySeats: number[];
  /** Optional game-specific summary line (e.g. "Solved in 4 guesses"). */
  summary?: string | null;
  onRematch(): void;
  onExit(): void;
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 2.5 + Math.random() * 2,
        color: ['#56b4e9', '#e06a1b', '#0ba884', '#f0e442', '#a78bfa'][i % 5],
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece rounded-sm" style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }} />
      ))}
    </div>
  );
}

export function GameOverModal({ winner, players, mySeats, summary, onRematch, onExit }: Props) {
  const draw = winner === DRAW;
  const lost = winner === LOST;
  const solo = players.length === 1;
  const winnerPlayer = winner >= 0 ? players[winner] : undefined;
  // In pass-and-play every seat is "mine", so treat any finish as a celebration.
  const iWon = !draw && !lost && (mySeats.includes(winner) || mySeats.length > 1);

  useEffect(() => {
    play(draw ? 'move' : iWon ? 'win' : 'lose');
  }, [draw, iWon]);

  const title = lost
    ? 'Out of luck!'
    : draw
      ? 'It’s a draw!'
      : solo
        ? 'Puzzle solved!'
        : mySeats.length > 1 || !iWon
          ? `${winnerPlayer?.displayName ?? 'Someone'} wins!`
          : 'You win!';
  const blurb = lost ? 'Better luck next time.' : draw ? 'Evenly matched.' : iWon ? 'Brilliant play.' : 'So close — try again?';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
      {iWon && <Confetti />}
      <div className="card w-full max-w-sm animate-pop p-6 text-center">
        <div className="mb-2 text-6xl" aria-hidden="true">{lost ? '😅' : draw ? '🤝' : iWon ? '🏆' : winnerPlayer?.avatar ?? '🎲'}</div>
        <h2 id="game-over-title" className="font-display text-3xl font-bold">{title}</h2>
        <p className="mt-1 text-slate-400">{summary ?? blurb}</p>
        <div className="mt-6 flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onExit}>Exit</button>
          <button type="button" className="btn-primary flex-1" onClick={onRematch} autoFocus>{solo ? 'Play again' : 'Rematch'}</button>
        </div>
      </div>
    </div>
  );
}
