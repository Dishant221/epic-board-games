import { getGame, type GameId, type LeaderboardResponse } from '@ebg/game-core';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Top players for one game (or all games) over the last 30 days. Human-vs-human games only. */
export default function Leaderboard({ gameId }: { gameId?: GameId }) {
  const [period, setPeriod] = useState<'month' | 'all'>('month');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams({ period });
    if (gameId) q.set('game', gameId);
    setData(null);
    api<LeaderboardResponse>(`/api/leaderboard?${q}`)
      .then(setData)
      .catch(() => setError(true));
  }, [gameId, period]);

  return (
    <section className="card p-5" aria-labelledby="lb-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="lb-title" className="font-display text-xl font-semibold">🏆 Top players{gameId ? ` · ${getGame(gameId).name}` : ''}</h2>
        <div role="radiogroup" aria-label="Period" className="flex rounded-lg bg-white/5 p-0.5 text-xs">
          {(['month', 'all'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} className={`rounded-md px-2.5 py-1 ${period === p ? 'bg-violet-500/40 text-white' : 'text-slate-400'}`}>
              {p === 'month' ? 'Last 30 days' : 'All time'}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-slate-400">The leaderboard is taking a break. Try again later.</p>}
      {!error && !data && <p className="mt-3 animate-pulse text-sm text-slate-500">Loading…</p>}
      {data && data.entries.length === 0 && (
        <p className="mt-3 text-sm text-slate-400">No online wins recorded yet. Win a game against another player to claim the first spot!</p>
      )}
      {data && data.entries.length > 0 && (
        <ol className="mt-3 divide-y divide-white/5 text-sm">
          {data.entries.map((e) => (
            <li key={e.user.id} className="flex items-center gap-3 py-2">
              <span className="w-7 text-center font-display text-base" aria-label={`Rank ${e.rank}`}>{MEDALS[e.rank - 1] ?? e.rank}</span>
              <span className="text-xl" aria-hidden="true">{e.user.avatar}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{e.user.displayName} <span className="text-xs font-normal text-slate-400">@{e.user.username}</span></span>
              <span className="tabular-nums"><strong>{e.wins}</strong> <span className="text-slate-400">wins</span></span>
              <span className="hidden tabular-nums text-slate-400 sm:inline">{Math.round((e.wins / e.played) * 100)}%</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-slate-500">Only finished games between real players count. Games against the AI are great practice but stay off the board.</p>
    </section>
  );
}
