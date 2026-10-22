import type { GameInfo } from '@ebg/game-core';

/** Placeholder until the arcade game lands; keeps the lazy import resolvable. */
export default function FlappyGame({ game, onExit }: { game: GameInfo; onExit(): void }) {
  return (
    <div className="card mx-auto max-w-lg p-6 text-center">
      <p>{game.name} is loading…</p>
      <button type="button" className="btn-ghost mt-4" onClick={onExit}>Back</button>
    </div>
  );
}
