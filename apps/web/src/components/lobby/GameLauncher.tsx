import { getGame, getEngine, type GameId, type GameInfo } from '@ebg/game-core';
import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
import { api, loginRedirect, useAuth } from '../../lib/api';
import { useLocalSession, useOnlineSession, type LocalSetup } from '../../lib/session';
import { GameScreen } from '../games/shared/GameScreen';
import { GameModeSelector, type ModeChoice } from './GameModeSelector';
import { Matchmaking } from './Matchmaking';

type Phase =
  | { kind: 'menu' }
  | { kind: 'matchmaking' }
  | { kind: 'local'; setup: LocalSetup }
  | { kind: 'room'; roomId: string; invite?: boolean };

const LOCAL_AVATARS = ['🦊', '🐼', '🐸', '🦁'];

/** Realtime (arcade) games own their loop and screen; they bypass the turn engine. */
type RealtimeProps = { game: GameInfo; onExit(): void };
const REALTIME: Partial<Record<GameId, ComponentType<RealtimeProps>>> = {
  flappy_bird: lazy(() => import('../games/arcade/FlappyGame')),
};

function LocalGame({ game, setup, onExit }: { game: GameInfo; setup: LocalSetup; onExit(): void }) {
  const session = useLocalSession(setup);
  return <GameScreen game={game} session={session} onExit={onExit} />;
}

function OnlineGame({ game, roomId, userId, invite, onExit }: { game: GameInfo; roomId: string; userId: string; invite?: boolean; onExit(): void }) {
  const session = useOnlineSession(roomId, game.id, userId);
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/games/${game.slug}?room=${encodeURIComponent(roomId)}`;
  return (
    <>
      {invite && session.status === 'waiting' && (
        <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl bg-violet-500/15 px-4 py-3 text-sm ring-1 ring-violet-400/30">
          <span>Invite friends with this link:</span>
          <code className="min-w-0 flex-1 truncate rounded bg-black/30 px-2 py-1">{link}</code>
          <button
            type="button"
            className="btn-ghost px-3 py-1"
            onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <a href={`/friends?ping=${encodeURIComponent(roomId)}&game=${game.id}`} className="btn-ghost px-3 py-1">Ping a friend</a>
          {/* The server treats REMATCH from the host of a waiting room as "start now". */}
          <button type="button" className="btn-primary px-3 py-1" disabled={session.players.length < 2} onClick={session.rematch}>
            Start game ({session.players.length}/{game.maxPlayers})
          </button>
        </div>
      )}
      <GameScreen game={game} session={session} roomId={roomId} onExit={onExit} />
    </>
  );
}

export default function GameLauncher({ gameId }: { gameId: GameId }) {
  const game = getGame(gameId);
  const auth = useAuth();
  const user = auth.status === 'ready' ? auth.user : null;
  const [phase, setPhase] = useState<Phase>({ kind: 'menu' });
  const [error, setError] = useState<string | null>(null);
  const Realtime = REALTIME[game.id];
  const playable = game.status === 'playable' && (game.kind === 'realtime' ? !!Realtime : !!getEngine(game.id));

  // Deep link: /games/<slug>?room=<id> joins a friend's room.
  const roomParam = useMemo(() => new URLSearchParams(location.search).get('room'), []);
  useEffect(() => {
    if (roomParam && /^[A-Za-z0-9_-]{8,64}$/.test(roomParam)) setPhase({ kind: 'room', roomId: roomParam });
  }, [roomParam]);

  const exit = () => {
    history.replaceState(null, '', location.pathname);
    setPhase({ kind: 'menu' });
  };

  const requireLogin = () => {
    location.href = loginRedirect();
  };

  const me = { name: user?.displayName ?? 'You', avatar: user?.avatar ?? '🙂' };

  const choose = async (choice: ModeChoice) => {
    setError(null);
    switch (choice.mode) {
      case 'solo':
        setPhase({ kind: 'local', setup: { gameId, ai: [], humans: [me] } });
        break;
      case 'ai':
        setPhase({ kind: 'local', setup: { gameId, ai: choice.opponents, humans: [me] } });
        break;
      case 'local':
        setPhase({
          kind: 'local',
          setup: { gameId, ai: [], humans: Array.from({ length: choice.players }, (_, i) => ({ name: `Player ${i + 1}`, avatar: LOCAL_AVATARS[i]! })) },
        });
        break;
      case 'online':
        if (!user) return requireLogin();
        setPhase({ kind: 'matchmaking' });
        break;
      case 'friends':
        if (!user) return requireLogin();
        try {
          const { roomId } = await api<{ roomId: string }>('/api/rooms/private', { body: { gameId } });
          history.replaceState(null, '', `?room=${encodeURIComponent(roomId)}`);
          setPhase({ kind: 'room', roomId, invite: true });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not create a room');
        }
        break;
    }
  };

  if (!playable) {
    return (
      <div className="card mx-auto max-w-lg p-6 text-center">
        <div className="text-5xl" aria-hidden="true">{game.emoji}</div>
        <h2 className="mt-2 font-display text-2xl font-bold">Coming soon</h2>
        <p className="mt-1 text-slate-400">{game.name} is being built. Try one of the other games in the meantime!</p>
        <a href="/#games" className="btn-primary mt-5">Browse games</a>
      </div>
    );
  }

  // Arcade games have no modes: straight into the action.
  if (Realtime) {
    return (
      <Suspense fallback={<div className="grid min-h-[60dvh] place-items-center text-slate-400">Loading {game.name}…</div>}>
        <Realtime game={game} onExit={() => (location.href = '/#games')} />
      </Suspense>
    );
  }

  switch (phase.kind) {
    case 'menu':
      return (
        <div className="px-4 py-6">
          {error && <p role="alert" className="mx-auto mb-3 max-w-lg rounded-xl bg-rose-500/15 px-4 py-2 text-rose-200">{error}</p>}
          <GameModeSelector game={game} signedIn={!!user} onChoose={(c) => void choose(c)} />
        </div>
      );
    case 'matchmaking':
      return (
        <div className="px-4 py-10">
          <Matchmaking
            game={game}
            onMatched={(roomId) => setPhase({ kind: 'room', roomId })}
            onNoMatch={() => void choose(game.ai === 'opponent' ? { mode: 'ai', opponents: ['medium'] } : { mode: 'solo' })}
            onCancel={exit}
          />
        </div>
      );
    case 'local':
      return <LocalGame game={game} setup={phase.setup} onExit={exit} />;
    case 'room':
      if (auth.status === 'loading') return <p className="p-10 text-center text-slate-400">Loading…</p>;
      if (!user) {
        return (
          <div className="card mx-auto mt-10 max-w-md p-6 text-center">
            <h2 className="font-display text-2xl font-bold">Sign in to join this room</h2>
            <a href={loginRedirect()} className="btn-primary mt-5">Sign in</a>
          </div>
        );
      }
      return <OnlineGame game={game} roomId={phase.roomId} userId={user.id} invite={phase.invite} onExit={exit} />;
  }
}
