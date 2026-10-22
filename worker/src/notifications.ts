import type { GameId, Notification, PublicUser } from '@ebg/game-core';
import { requireUser, toPublicUser } from './auth';
import type { Env } from './env';
import { json, readJson } from './http';

interface NotificationRow {
  id: string;
  kind: Notification['kind'];
  game_id: string | null;
  room_id: string | null;
  created_at: number;
  read: number;
  username: string;
  display_name: string;
  avatar: string;
  from_user_id: string;
}

/** Persists a notification and pushes it live to the recipient's open tabs. */
export async function createNotification(
  env: Env,
  toUserId: string,
  kind: Notification['kind'],
  fromUser: PublicUser,
  extra: { gameId?: GameId; roomId?: string } = {},
): Promise<Notification> {
  const notification: Notification = {
    id: crypto.randomUUID(),
    kind,
    fromUser,
    createdAt: Date.now(),
    read: false,
    ...extra,
  };
  await env.DB.prepare(
    'INSERT INTO notifications (id, user_id, kind, from_user_id, game_id, room_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(notification.id, toUserId, kind, fromUser.id, extra.gameId ?? null, extra.roomId ?? null, notification.createdAt)
    .run();
  await env.PRESENCE.get(env.PRESENCE.idFromName(toUserId)).notify(notification);
  return notification;
}

export async function handleListNotifications(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.kind, n.game_id, n.room_id, n.created_at, n.read, n.from_user_id, u.username, u.display_name, u.avatar
     FROM notifications n JOIN users u ON u.id = n.from_user_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`,
  )
    .bind(user.id)
    .all<NotificationRow>();
  const notifications: Notification[] = results.map((r) => ({
    id: r.id,
    kind: r.kind,
    fromUser: toPublicUser({ id: r.from_user_id, username: r.username, display_name: r.display_name, avatar: r.avatar }),
    gameId: (r.game_id ?? undefined) as GameId | undefined,
    roomId: r.room_id ?? undefined,
    createdAt: r.created_at,
    read: r.read === 1,
  }));
  return json({ notifications });
}

/** Body `{ ids?: string[] }` — marks those (or all, when omitted) as read. */
export async function handleReadNotifications(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 100) : null;
  if (ids && ids.length > 0) {
    await env.DB.prepare(
      `UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    )
      .bind(user.id, ...ids)
      .run();
  } else {
    await env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').bind(user.id).run();
  }
  return json({ ok: true });
}
