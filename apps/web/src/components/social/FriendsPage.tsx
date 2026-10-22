import { GAMES, getEngine, isGameId, type FriendEntry, type GameId, type PublicUser } from '@ebg/game-core';
import { useEffect, useState, type SubmitEvent } from 'react';
import { api, loginRedirect, useAuth } from '../../lib/api';

const PLAYABLE = GAMES.filter((g) => g.multiplayer && getEngine(g.id));

export default function FriendsPage() {
  const auth = useAuth();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [results, setResults] = useState<PublicUser[]>([]);
  const [query, setQuery] = useState('');
  const [relation, setRelation] = useState<'friend' | 'family'>('friend');
  const [message, setMessage] = useState<string | null>(null);
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  const pingRoom = params.get('ping');
  const pingGameParam = params.get('game');
  const [pingGame, setPingGame] = useState<GameId>(pingGameParam && isGameId(pingGameParam) ? pingGameParam : 'snakes_ladders');

  const load = () => api<{ friends: FriendEntry[] }>('/api/friends').then((r) => setFriends(r.friends)).catch(() => {});

  useEffect(() => {
    if (auth.status === 'ready' && auth.user) void load();
  }, [auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (auth.status === 'loading') return <p className="text-slate-400">Loading…</p>;
  if (!auth.user) {
    return (
      <div className="card p-6 text-center">
        <p>Sign in to add friends and family.</p>
        <a className="btn-primary mt-4" href={loginRedirect()}>Sign in</a>
      </div>
    );
  }

  const flash = (m: string) => {
    setMessage(m);
    window.setTimeout(() => setMessage(null), 4000);
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      flash(ok);
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  const search = async (e: SubmitEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    const r = await api<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(query.trim())}`).catch(() => ({ users: [] }));
    setResults(r.users);
  };

  const ping = (userId: string) =>
    run(() => api('/api/friends/ping', { body: { userId, gameId: pingGame, roomId: pingRoom ?? undefined } }), 'Ping sent! 🎲');

  const incoming = friends.filter((f) => f.status === 'pending_incoming');
  const outgoing = friends.filter((f) => f.status === 'pending_outgoing');
  const accepted = friends.filter((f) => f.status === 'accepted');

  return (
    <div className="space-y-6">
      {message && <p role="status" className="rounded-xl bg-violet-500/15 px-4 py-2 text-sm">{message}</p>}

      <section className="card p-5">
        <h2 className="font-display text-xl font-semibold">Add friends &amp; family</h2>
        <form onSubmit={search} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="friend-search">Search by username</label>
          <input id="friend-search" className="input" placeholder="Search by username" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="input sm:w-36" value={relation} onChange={(e) => setRelation(e.target.value as 'friend' | 'family')} aria-label="Relation">
            <option value="friend">Friend</option>
            <option value="family">Family</option>
          </select>
          <button className="btn-primary" type="submit">Search</button>
        </form>
        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-white/5">
            {results.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2">
                <span className="text-xl" aria-hidden="true">{u.avatar}</span>
                <span className="flex-1"><span className="font-semibold">{u.displayName}</span> <span className="text-sm text-slate-400">@{u.username}</span></span>
                <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => void run(() => api('/api/friends/request', { body: { username: u.username, relation } }), 'Request sent')}>Add</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="card p-5">
          <h2 className="font-display text-xl font-semibold">Requests</h2>
          <ul className="mt-2 divide-y divide-white/5">
            {incoming.map((f) => (
              <li key={f.user.id} className="flex items-center gap-3 py-2">
                <span className="text-xl" aria-hidden="true">{f.user.avatar}</span>
                <span className="flex-1 font-semibold">{f.user.displayName} <span className="text-xs font-normal text-slate-400">wants to be your {f.relation}</span></span>
                <button type="button" className="btn-primary px-3 py-1 text-sm" onClick={() => void run(() => api('/api/friends/respond', { body: { userId: f.user.id, accept: true } }), 'Accepted')}>Accept</button>
                <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => void run(() => api('/api/friends/respond', { body: { userId: f.user.id, accept: false } }), 'Declined')}>Decline</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">Your friends &amp; family</h2>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            Ping to play
            <select className="input w-auto py-1.5" value={pingGame} onChange={(e) => setPingGame(e.target.value as GameId)}>
              {PLAYABLE.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        </div>
        {accepted.length === 0 && <p className="mt-3 text-sm text-slate-400">No friends yet — search above, or add the people you play with after a game.</p>}
        <ul className="mt-2 divide-y divide-white/5">
          {accepted.map((f) => (
            <li key={f.user.id} className="flex items-center gap-3 py-2">
              <span className="relative text-xl" aria-hidden="true">
                {f.user.avatar}
                <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-ink-800 ${f.online ? 'bg-green-400' : 'bg-slate-600'}`} />
              </span>
              <span className="flex-1">
                <span className="font-semibold">{f.user.displayName}</span>{' '}
                <span className="text-xs text-slate-400">{f.relation === 'family' ? '👪 family' : 'friend'} · {f.online ? 'online' : 'offline'}</span>
              </span>
              <button type="button" className="btn-primary px-3 py-1 text-sm" onClick={() => void ping(f.user.id)}>🔔 Ping</button>
              <button type="button" className="btn-ghost px-2 py-1 text-sm" aria-label={`Remove ${f.user.displayName}`} onClick={() => confirm(`Remove ${f.user.displayName}?`) && void run(() => api(`/api/friends/${encodeURIComponent(f.user.id)}`, { method: 'DELETE' }), 'Removed')}>✕</button>
            </li>
          ))}
        </ul>
        {outgoing.length > 0 && <p className="mt-3 text-xs text-slate-500">Pending: {outgoing.map((f) => f.user.displayName).join(', ')}</p>}
      </section>
    </div>
  );
}
