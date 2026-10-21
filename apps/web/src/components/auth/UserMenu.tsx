import { useState } from 'react';
import { api, setCurrentUser, useAuth } from '../../lib/api';

export default function UserMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);

  if (auth.status === 'loading') return <span className="size-9 animate-pulse rounded-full bg-white/10" aria-hidden="true" />;
  if (!auth.user) {
    return (
      <span className="flex items-center gap-2">
        <a href="/login" className="btn-ghost px-3 py-1.5 text-sm whitespace-nowrap">Sign in</a>
        <a href="/signup" className="btn-primary hidden px-3 py-1.5 text-sm whitespace-nowrap min-[420px]:inline-flex">Sign up</a>
      </span>
    );
  }

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    setCurrentUser(null);
    location.href = '/';
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-full bg-white/5 py-1 pr-3 pl-1 ring-1 ring-white/10 hover:bg-white/10">
        <span className="grid size-7 place-items-center rounded-full bg-violet-500/30 text-base" aria-hidden="true">{auth.user.avatar}</span>
        <span className="hidden max-w-28 truncate text-sm font-semibold sm:inline">{auth.user.displayName}</span>
      </button>
      {open && (
        <ul role="menu" className="card absolute right-0 mt-2 w-44 overflow-hidden p-1 text-sm shadow-xl">
          <li role="none"><a role="menuitem" href="/profile" className="block rounded-lg px-3 py-2 hover:bg-white/10">Profile</a></li>
          <li role="none"><a role="menuitem" href="/friends" className="block rounded-lg px-3 py-2 hover:bg-white/10">Friends &amp; family</a></li>
          <li role="none"><button role="menuitem" type="button" onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-rose-300 hover:bg-white/10">Sign out</button></li>
        </ul>
      )}
    </div>
  );
}
