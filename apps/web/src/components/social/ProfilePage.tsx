import { getGame, type ProfileResponse, type ProfileStats, type PublicUser } from '@ebg/game-core';
import { useEffect, useState, type SubmitEvent } from 'react';
import { api, loginRedirect, setCurrentUser, useAuth } from '../../lib/api';

const AVATARS = ['🙂', '😎', '🦊', '🐼', '🐸', '🦁', '🐯', '🐙', '🦄', '🐲', '👾', '🤖', '🧙', '🦸', '🐶', '🐱'];

const RESULT_LABEL = { win: '🏆 Won', loss: 'Lost', draw: '🤝 Draw', forfeit: 'Forfeit' } as const;
const MODE_LABEL = { matchmaking: 'Online', ai: 'vs AI', private: 'Friends' } as const;

function StatsPanel({ stats }: { stats: ProfileStats }) {
  const rate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  return (
    <section className="card p-6" aria-labelledby="stats-title">
      <h2 id="stats-title" className="font-display text-xl font-semibold">Your stats</h2>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-white/5 p-3"><dt className="text-xs text-slate-400">Games</dt><dd className="font-display text-2xl font-bold">{stats.played}</dd></div>
        <div className="rounded-xl bg-white/5 p-3"><dt className="text-xs text-slate-400">Wins</dt><dd className="font-display text-2xl font-bold">{stats.wins}</dd></div>
        <div className="rounded-xl bg-white/5 p-3"><dt className="text-xs text-slate-400">Win rate</dt><dd className="font-display text-2xl font-bold">{rate}%</dd></div>
      </dl>
      {stats.games.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {stats.games
            .slice()
            .sort((a, b) => b.played - a.played)
            .map((g) => {
              const game = getGame(g.gameId);
              const pct = g.played ? Math.round((g.wins / g.played) * 100) : 0;
              return (
                <li key={g.gameId} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
                  <span className="text-xl" aria-hidden="true">{game.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <a href={`/games/${game.slug}`} className="block truncate font-semibold hover:underline">{game.name}</a>
                    <span className="text-xs text-slate-400">{g.wins} wins · {g.played} played</span>
                  </span>
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10" aria-label={`${pct}% win rate`}>
                    <span className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" style={{ width: `${pct}%` }} />
                  </span>
                </li>
              );
            })}
        </ul>
      )}
      {stats.recent.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-slate-300">Recent games</h3>
          <ol className="mt-2 divide-y divide-white/5 text-sm">
            {stats.recent.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <span aria-hidden="true">{getGame(r.gameId).emoji}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{getGame(r.gameId).name}</span>
                  <span className="text-slate-400"> · {MODE_LABEL[r.mode]}{r.opponents ? ` · vs ${r.opponents}` : ''}</span>
                </span>
                <span className={r.result === 'win' ? 'text-emerald-300' : 'text-slate-400'}>{RESULT_LABEL[r.result]}</span>
                <time className="hidden text-xs text-slate-500 sm:inline" dateTime={new Date(r.endedAt).toISOString()}>{new Date(r.endedAt).toLocaleDateString()}</time>
              </li>
            ))}
          </ol>
        </>
      )}
      {stats.played === 0 && <p className="mt-3 text-sm text-slate-400">No finished games yet. <a href="/#games" className="text-violet-300 underline">Pick a game</a> and your results will show up here.</p>}
    </section>
  );
}

function PasswordForm() {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (data.get('newPassword') !== data.get('confirm')) return setStatus({ ok: false, text: 'New passwords do not match' });
    setBusy(true);
    try {
      await api('/api/auth/password', { body: { currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') } });
      form.reset();
      setStatus({ ok: true, text: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Could not change password' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="card space-y-3 p-6" aria-labelledby="pw-title">
      <h2 id="pw-title" className="font-display text-xl font-semibold">Change password</h2>
      <label className="block text-sm"><span className="mb-1 block text-slate-300">Current password</span><input className="input" name="currentPassword" type="password" required autoComplete="current-password" /></label>
      <label className="block text-sm"><span className="mb-1 block text-slate-300">New password</span><input className="input" name="newPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /><span className="mt-1 block text-xs text-slate-500">At least 10 characters.</span></label>
      <label className="block text-sm"><span className="mb-1 block text-slate-300">Confirm new password</span><input className="input" name="confirm" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></label>
      {status && <p role="status" className={`text-sm ${status.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{status.text}</p>}
      <button type="submit" className="btn-ghost" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}

function DangerZone({ username }: { username: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    setError(null);
    try {
      const res = await fetch('/api/account/export', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Could not export your data');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `epic-board-games-${username}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export your data');
    }
  };

  const remove = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/account', { method: 'DELETE', body: { password: new FormData(e.currentTarget).get('password') } });
      setCurrentUser(null);
      location.href = '/?deleted=1';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account');
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-3 p-6 ring-rose-500/30" aria-labelledby="data-title">
      <h2 id="data-title" className="font-display text-xl font-semibold">Your data</h2>
      <p className="text-sm text-slate-400">Download a copy of everything we store about you, or delete your account permanently. Deleting removes your profile, friends and notifications; finished games are kept anonymously so opponents keep their stats.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => void exportData()}>⬇️ Export my data</button>
        {!confirming && <button type="button" className="btn-ghost text-rose-300" onClick={() => setConfirming(true)}>Delete account…</button>}
      </div>
      {confirming && (
        <form onSubmit={remove} className="space-y-3 rounded-xl bg-rose-500/10 p-4 ring-1 ring-rose-400/30">
          <p className="text-sm text-rose-100">This cannot be undone. Enter your password to confirm.</p>
          <label className="block text-sm"><span className="sr-only">Password</span><input className="input" name="password" type="password" required autoComplete="current-password" placeholder="Your password" /></label>
          <div className="flex gap-2">
            <button type="submit" className="btn bg-rose-600 text-white hover:bg-rose-500" disabled={busy}>{busy ? 'Deleting…' : 'Delete my account'}</button>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}

export default function ProfilePage() {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [avatar, setAvatar] = useState('🙂');
  const [status, setStatus] = useState<string | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);

  useEffect(() => {
    if (auth.status === 'ready' && auth.user) {
      setDisplayName(auth.user.displayName);
      setAvatar(auth.user.avatar);
      api<ProfileResponse>('/api/profile').then((r) => setStats(r.stats)).catch(() => {});
    }
  }, [auth]);

  if (auth.status === 'loading') return <p className="text-slate-400">Loading…</p>;
  if (!auth.user) {
    return (
      <div className="card p-6 text-center">
        <p>Sign in to edit your profile.</p>
        <a className="btn-primary mt-4" href={loginRedirect()}>Sign in</a>
      </div>
    );
  }

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    try {
      const { user } = await api<{ user: PublicUser }>('/api/profile', { method: 'PATCH', body: { displayName, avatar } });
      setCurrentUser(user);
      setStatus('Saved!');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save');
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="card space-y-5 p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-full bg-violet-500/25 text-4xl" aria-hidden="true">{avatar}</span>
          <div>
            <p className="font-display text-2xl font-bold">{displayName || auth.user.username}</p>
            <p className="text-sm text-slate-400">@{auth.user.username}</p>
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Display name</span>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} required />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm text-slate-300">Avatar</legend>
          <div className="grid grid-cols-8 gap-2">
            {AVATARS.map((a) => (
              <button key={a} type="button" aria-pressed={a === avatar} aria-label={`Avatar ${a}`} onClick={() => setAvatar(a)} className={`grid aspect-square place-items-center rounded-xl text-2xl ring-1 ${a === avatar ? 'bg-violet-500/30 ring-violet-400' : 'bg-white/5 ring-white/10'}`}>
                {a}
              </button>
            ))}
          </div>
        </fieldset>
        {status && <p role="status" className="text-sm text-violet-200">{status}</p>}
        <button type="submit" className="btn-primary">Save profile</button>
      </form>

      {stats && <StatsPanel stats={stats} />}
      <PasswordForm />
      <DangerZone username={auth.user.username} />
    </div>
  );
}
