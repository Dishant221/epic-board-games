import { AI_DIFFICULTIES, AI_PERSONAS, type AIDifficulty, type GameInfo } from '@ebg/game-core';
import { useState } from 'react';

export type ModeChoice =
  | { mode: 'online' }
  | { mode: 'ai'; opponents: AIDifficulty[] }
  | { mode: 'friends' }
  | { mode: 'local'; players: number }
  | { mode: 'solo' };

interface Props {
  game: GameInfo;
  signedIn: boolean;
  onChoose(choice: ModeChoice): void;
}

export function AIDifficultyPicker({ value, onChange, label }: { value: AIDifficulty; onChange(d: AIDifficulty): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-2">
      {AI_DIFFICULTIES.map((d) => {
        const p = AI_PERSONAS[d];
        const selected = d === value;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(d)}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-xs ring-1 transition ${
              selected ? 'bg-violet-500/25 ring-violet-400' : 'bg-white/5 ring-white/10 hover:bg-white/10'
            }`}
          >
            <span className="text-2xl" aria-hidden="true">{p.emoji}</span>
            <span className="font-semibold capitalize">{d}</span>
            <span className="text-[10px] text-slate-400">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function GameModeSelector({ game, signedIn, onChoose }: Props) {
  const maxAI = game.maxPlayers - 1;
  const [opponents, setOpponents] = useState<AIDifficulty[]>(['medium']);
  const [localPlayers, setLocalPlayers] = useState(2);

  const setCount = (n: number) =>
    setOpponents((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? prev.at(-1) ?? 'medium'));

  return (
    <div className="card mx-auto w-full max-w-lg animate-pop p-5 sm:p-6">
      <h2 className="font-display text-2xl font-bold">How do you want to play?</h2>

      <div className="mt-5 space-y-3">
        {game.minPlayers === 1 && (
          <button type="button" className="flex w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 p-4 text-left ring-1 ring-violet-400/40 transition hover:from-violet-500/30 hover:to-fuchsia-500/30" onClick={() => onChoose({ mode: 'solo' })} autoFocus>
            <span className="text-3xl" aria-hidden="true">{game.emoji}</span>
            <span>
              <span className="block font-semibold">{game.maxPlayers > 1 ? 'Play solo' : 'Play now'}</span>
              <span className="text-sm text-slate-400">
                {game.ai === 'hints' ? 'Single player · smart hints when you’re stuck' : 'Single player · starts instantly'}
              </span>
            </span>
          </button>
        )}

        {game.multiplayer && (
          <button type="button" className="flex w-full items-center gap-4 rounded-2xl bg-white/5 p-4 text-left ring-1 ring-white/10 transition hover:bg-white/10" onClick={() => onChoose({ mode: 'online' })}>
            <span className="text-3xl" aria-hidden="true">🌐</span>
            <span>
              <span className="block font-semibold">Online Multiplayer</span>
              <span className="text-sm text-slate-400">
                Match with real players · up to {game.maxPlayers} · 60s matchmaking{!signedIn && ' · sign in required'}
              </span>
            </span>
          </button>
        )}

        {game.ai === 'opponent' && (
          <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10" aria-labelledby="vs-ai">
            <div className="flex items-center gap-4">
              <span className="text-3xl" aria-hidden="true">🤖</span>
              <span>
                <span id="vs-ai" className="block font-semibold">Play vs AI</span>
                <span className="text-sm text-slate-400">No waiting — starts instantly</span>
              </span>
            </div>
            {maxAI > 1 && (
              <div className="mt-4 flex items-center gap-2 text-sm">
                <span className="text-slate-400">Opponents</span>
                {Array.from({ length: maxAI }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" aria-pressed={opponents.length === n} onClick={() => setCount(n)} className={`size-8 rounded-lg ring-1 ${opponents.length === n ? 'bg-violet-500/30 ring-violet-400' : 'bg-white/5 ring-white/10'}`}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-3">
              {opponents.map((d, i) => (
                <div key={i}>
                  {opponents.length > 1 && <p className="mb-1 text-xs text-slate-400">AI {i + 1}</p>}
                  <AIDifficultyPicker label={`Difficulty for AI ${i + 1}`} value={d} onChange={(nd) => setOpponents((o) => o.map((x, j) => (j === i ? nd : x)))} />
                </div>
              ))}
            </div>
            <button type="button" className="btn-primary mt-4 w-full" onClick={() => onChoose({ mode: 'ai', opponents })}>
              Start vs AI
            </button>
          </section>
        )}

        {game.multiplayer && (
          <button type="button" className="flex w-full items-center gap-4 rounded-2xl bg-white/5 p-4 text-left ring-1 ring-white/10 transition hover:bg-white/10" onClick={() => onChoose({ mode: 'friends' })}>
            <span className="text-3xl" aria-hidden="true">👥</span>
            <span>
              <span className="block font-semibold">Play with Friends</span>
              <span className="text-sm text-slate-400">Create a private room and invite friends or family</span>
            </span>
          </button>
        )}

        {game.maxPlayers > 1 && (
          <div className="flex items-center gap-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <span className="text-3xl" aria-hidden="true">🛋️</span>
            <span className="flex-1">
              <span className="block font-semibold">Pass &amp; Play</span>
              <span className="text-sm text-slate-400">Share one device</span>
            </span>
            {game.maxPlayers > 2 && (
              <select className="input w-auto py-1.5" value={localPlayers} onChange={(e) => setLocalPlayers(Number(e.target.value))} aria-label="Number of players">
                {Array.from({ length: game.maxPlayers - 1 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>{n} players</option>
                ))}
              </select>
            )}
            <button type="button" className="btn-ghost" onClick={() => onChoose({ mode: 'local', players: localPlayers })}>Play</button>
          </div>
        )}
      </div>
    </div>
  );
}
