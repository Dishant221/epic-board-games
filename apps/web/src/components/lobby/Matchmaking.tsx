import { MATCH_WINDOW_MS, type GameInfo, type MatchServerMessage } from '@ebg/game-core';
import { useEffect, useState } from 'react';
import { wsUrl } from '../../lib/api';

interface Props {
  game: GameInfo;
  onMatched(roomId: string): void;
  onNoMatch(): void;
  onCancel(): void;
}

/** Joins the per-game Matchmaker Durable Object queue and shows the 60s window. */
export function Matchmaking({ game, onMatched, onNoMatch, onCancel }: Props) {
  const [waiting, setWaiting] = useState(1);
  const [deadline, setDeadline] = useState(Date.now() + MATCH_WINDOW_MS);
  const [now, setNow] = useState(Date.now());
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl(`/api/matchmaking/ws?game=${encodeURIComponent(game.id)}`));
    let done = false;
    ws.addEventListener('message', (ev) => {
      let msg: MatchServerMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      switch (msg.type) {
        case 'QUEUED':
          setWaiting(msg.playersWaiting);
          setDeadline(msg.deadline);
          break;
        case 'QUEUE_UPDATE':
          setWaiting(msg.playersWaiting);
          setDeadline(msg.deadline);
          break;
        case 'MATCH_FOUND':
          done = true;
          ws.close(1000);
          onMatched(msg.roomId);
          break;
        case 'NO_MATCH':
          done = true;
          ws.close(1000);
          setFailed(msg.reason);
          break;
        case 'ERROR':
          setFailed(msg.message);
          break;
      }
    });
    ws.addEventListener('close', (ev) => {
      if (!done && ev.code !== 1000) setFailed(ev.reason || 'Lost connection to matchmaking');
    });
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearInterval(tick);
      if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"LEAVE_QUEUE"}');
      ws.close(1000);
    };
  }, [game.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const progress = 1 - Math.max(0, deadline - now) / MATCH_WINDOW_MS;

  return (
    <div className="card mx-auto w-full max-w-md animate-pop p-6 text-center" aria-live="polite">
      {failed ? (
        <>
          <div className="text-5xl" aria-hidden="true">😴</div>
          <h2 className="mt-2 font-display text-2xl font-bold">No match this time</h2>
          <p className="mt-1 text-slate-400">{failed}</p>
          <div className="mt-6 flex gap-3">
            <button type="button" className="btn-ghost flex-1" onClick={onCancel}>Back</button>
            {game.ai === 'opponent' && <button type="button" className="btn-primary flex-1" onClick={onNoMatch}>Play vs AI</button>}
          </div>
        </>
      ) : (
        <>
          <div className="relative mx-auto size-32">
            <svg viewBox="0 0 100 100" className="-rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="8" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="url(#mm)" strokeWidth="8" strokeLinecap="round" strokeDasharray={276.5} strokeDashoffset={276.5 * (1 - progress)} />
              <defs>
                <linearGradient id="mm"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#d946ef" /></linearGradient>
              </defs>
            </svg>
            <span className="absolute inset-0 grid place-items-center font-display text-3xl font-bold">{remaining}s</span>
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold">Finding players…</h2>
          <p className="mt-1 text-slate-400">
            {waiting} of {game.maxPlayers} players ready. The game starts when the room is full, or after 60s with 2+ players.
          </p>
          <div className="mt-4 flex justify-center gap-2" aria-hidden="true">
            {Array.from({ length: game.maxPlayers }, (_, i) => (
              <span key={i} className={`grid size-10 place-items-center rounded-full text-lg ring-1 ${i < waiting ? 'bg-violet-500/30 ring-violet-400' : 'bg-white/5 ring-white/10 animate-pulse'}`}>
                {i < waiting ? '🙂' : '…'}
              </span>
            ))}
          </div>
          <button type="button" className="btn-ghost mt-6" onClick={onCancel}>Cancel</button>
        </>
      )}
    </div>
  );
}
