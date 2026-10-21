import type { PublicUser } from '@ebg/game-core/protocol';
import { useEffect, useState, type SubmitEvent } from 'react';
import { api, loginRedirect, setCurrentUser, useAuth } from '../../lib/api';

const AVATARS = ['🙂', '😎', '🦊', '🐼', '🐸', '🦁', '🐯', '🐙', '🦄', '🐲', '👾', '🤖', '🧙', '🦸', '🐶', '🐱'];

export default function ProfilePage() {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [avatar, setAvatar] = useState('🙂');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === 'ready' && auth.user) {
      setDisplayName(auth.user.displayName);
      setAvatar(auth.user.avatar);
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
  );
}
