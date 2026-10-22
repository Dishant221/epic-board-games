import { getGame, isGameId, type Notification } from '@ebg/game-core';
import { useEffect, useState } from 'react';
import { api, useAuth, wsUrl } from '../../lib/api';
import { play } from '../../lib/sound';

/** Live notifications (friend requests, game pings) over the Presence Durable Object socket. */
export default function NotificationBell() {
  const auth = useAuth();
  const signedIn = auth.status === 'ready' && !!auth.user;
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    api<{ notifications: Notification[] }>('/api/notifications').then((r) => setItems(r.notifications)).catch(() => {});
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: number | undefined;
    let closed = false;
    const connect = () => {
      ws = new WebSocket(wsUrl('/api/presence/ws'));
      ws.addEventListener('open', () => (retry = 0));
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type: string; payload?: Notification };
          if (msg.type === 'NOTIFICATION' && msg.payload) {
            const n = msg.payload;
            setItems((list) => [n, ...list.filter((x) => x.id !== n.id)].slice(0, 50));
            setToast(n);
            play('chat');
            window.setTimeout(() => setToast((t) => (t?.id === n.id ? null : t)), 8000);
          }
        } catch {
          /* ignore malformed frames */
        }
      });
      ws.addEventListener('close', (ev) => {
        if (closed || ev.code >= 4000) return;
        timer = window.setTimeout(connect, Math.min(2000 * 2 ** retry++, 30_000));
      });
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      ws?.close(1000);
    };
  }, [signedIn]);

  if (!signedIn) return null;
  const unread = items.filter((n) => !n.read).length;

  const markRead = () => {
    setOpen((o) => !o);
    if (unread > 0) {
      setItems((list) => list.map((n) => ({ ...n, read: true })));
      void api('/api/notifications/read', { body: {} }).catch(() => {});
    }
  };

  const describe = (n: Notification) => {
    const who = n.fromUser.displayName;
    if (n.kind === 'friend_request') return `${who} sent you a friend request`;
    if (n.kind === 'friend_accepted') return `${who} accepted your friend request`;
    const game = n.gameId && isGameId(n.gameId) ? getGame(n.gameId).name : 'a game';
    return `${who} wants to play ${game}!`;
  };
  const href = (n: Notification) =>
    n.kind === 'game_ping' && n.gameId && isGameId(n.gameId)
      ? `/games/${getGame(n.gameId).slug}${n.roomId ? `?room=${encodeURIComponent(n.roomId)}` : ''}`
      : '/friends';

  return (
    <div className="relative">
      <button type="button" onClick={markRead} className="relative grid size-9 place-items-center rounded-full bg-white/5 ring-1 ring-white/10 hover:bg-white/10" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} aria-expanded={open}>
        🔔
        {unread > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold">{unread}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 mt-2 max-h-96 w-72 overflow-y-auto p-2 shadow-xl">
          {items.length === 0 && <p className="p-3 text-sm text-slate-400">No notifications yet.</p>}
          <ul className="space-y-1">
            {items.map((n) => (
              <li key={n.id}>
                <a href={href(n)} className="flex gap-2 rounded-lg p-2 text-sm hover:bg-white/10">
                  <span aria-hidden="true">{n.fromUser.avatar}</span>
                  <span>{describe(n)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {toast && (
        <a href={href(toast)} className="card fixed right-4 bottom-24 z-50 flex max-w-xs animate-pop items-center gap-3 p-3 shadow-2xl md:bottom-4" role="status">
          <span className="text-2xl" aria-hidden="true">{toast.kind === 'game_ping' ? '🎲' : toast.fromUser.avatar}</span>
          <span className="text-sm">{describe(toast)}</span>
        </a>
      )}
    </div>
  );
}
