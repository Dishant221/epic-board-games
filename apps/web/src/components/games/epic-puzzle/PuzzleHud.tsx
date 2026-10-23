import { formatPuzzleDuration, puzzlePlacedCount, type EpicPuzzleState } from '@ebg/game-core/games/epic-puzzle';
import { useEffect, useState } from 'react';
import type { GameSessionView } from '../../../lib/session';
import { SEAT_COLORS } from '../shared/PlayerPanel';

interface Props {
  state: EpicPuzzleState;
  session: Pick<GameSessionView, 'players' | 'mySeats' | 'mode' | 'winner' | 'rematch'>;
  title: string;
  preview: boolean;
  onTogglePreview(): void;
}

function Timer({ startedAt, finishedAt }: { startedAt: number; finishedAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (finishedAt !== null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [finishedAt]);
  const text = formatPuzzleDuration((finishedAt ?? now) - startedAt);
  return <span className="tabular-nums text-sm text-slate-300" aria-label={`Elapsed ${text}`}>⏱ {text}</span>;
}

/** Progress, per-player tallies, timer, preview toggle and "New puzzle". */
export function PuzzleHud({ state, session, title, preview, onTogglePreview }: Props) {
  const total = state.placed.length;
  const done = puzzlePlacedCount(state);
  const pct = total ? (done / total) * 100 : 0;
  // Online rooms only accept a rematch once the game is over.
  const canRestart = session.mode !== 'online' || session.winner !== null;
  const showTallies = session.players.length > 1;

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-display font-semibold">{title}</span>
        {state.startedAt !== null && <Timer startedAt={state.startedAt} finishedAt={state.finishedAt} />}
        <button type="button" className="btn-ghost min-h-9 px-2.5 py-1 text-xs" onClick={onTogglePreview} aria-pressed={preview} aria-label="Preview" title="Show a faint preview of the finished picture">
          <span aria-hidden="true">👁</span>
          <span className="hidden sm:inline">{preview ? 'Preview on' : 'Preview off'}</span>
        </button>
        <button type="button" className="btn-ghost min-h-9 px-2.5 py-1 text-xs" onClick={() => session.rematch()} disabled={!canRestart} aria-label="New puzzle" title={canRestart ? 'Pick a new image' : 'Finish this puzzle first'}>
          <span aria-hidden="true">🧩</span>
          <span className="hidden sm:inline">New puzzle</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Pieces placed">
          <div className="ep-progress" style={{ width: `${pct}%` }} />
        </div>
        <span className="tabular-nums text-sm font-semibold">
          {done} / {total}
        </span>
        {showTallies && (
          <ul className="flex items-center gap-2 text-xs" aria-label="Pieces per player">
            {session.players.map((p) => (
              <li key={p.seat} className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 ring-1" style={{ ['--tw-ring-color' as string]: SEAT_COLORS[p.seat] }}>
                <span className="size-2 rounded-full" style={{ background: SEAT_COLORS[p.seat] }} aria-hidden="true" />
                <span className="max-w-20 truncate">{session.mySeats.length === 1 && session.mySeats[0] === p.seat ? 'You' : p.displayName}</span>
                <span className="font-semibold tabular-nums">{state.scores[p.seat] ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
