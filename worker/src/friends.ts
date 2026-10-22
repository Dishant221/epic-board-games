import { getGame, isGameId, type FriendEntry, type PublicUser } from '@ebg/game-core';
import { requireUser, toPublicUser, type UserRow } from './auth';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import { createNotification } from './notifications';
import { normalizeUsername } from './security';

const MAX_FRIENDS = 200;
const ROOM_ID_RE = /^[0-9a-f]{64}$/;

interface FriendRow {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  relation: 'friend' | 'family';
  id: string;
  username: string;
  display_name: string;
  avatar: string;
}

function parseUserId(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[0-9a-f-]{36}$/.test(raw)) throw new HttpError(400, 'Invalid user id');
  return raw;
}

async function relationshipBetween(env: Env, a: string, b: string) {
  return env.DB.prepare(
    `SELECT requester_id, addressee_id, status, relation FROM friendships
     WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)`,
  )
    .bind(a, b)
    .first<Pick<FriendRow, 'requester_id' | 'addressee_id' | 'status' | 'relation'>>();
}

export async function handleListFriends(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  const { results } = await env.DB.prepare(
    `SELECT f.requester_id, f.addressee_id, f.status, f.relation, u.id, u.username, u.display_name, u.avatar
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END
     WHERE (f.requester_id = ?1 OR f.addressee_id = ?1) AND f.status != 'blocked' AND u.disabled = 0
     ORDER BY f.status = 'accepted' DESC, u.display_name
     LIMIT ${MAX_FRIENDS}`,
  )
    .bind(me.id)
    .all<FriendRow>();

  // Presence is per-user Durable Object; only ask for accepted friends.
  const friends: FriendEntry[] = await Promise.all(
    results.map(async (r) => {
      const status: FriendEntry['status'] =
        r.status === 'accepted' ? 'accepted' : r.requester_id === me.id ? 'pending_outgoing' : 'pending_incoming';
      const online =
        status === 'accepted' ? await env.PRESENCE.get(env.PRESENCE.idFromName(r.id)).isOnline() : false;
      return { user: toPublicUser(r), status, relation: r.relation, online };
    }),
  );
  return json({ friends });
}

/** Body `{ username, relation?: 'friend' | 'family' }`. */
export async function handleFriendRequest(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const relation = body.relation === 'family' ? 'family' : 'friend';
  if (!username) throw new HttpError(400, 'Invalid username');

  const target = await env.DB.prepare('SELECT id, username, display_name, avatar FROM users WHERE username = ? AND disabled = 0')
    .bind(username)
    .first<Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar'>>();
  if (!target) throw new HttpError(404, 'User not found');
  if (target.id === me.id) throw new HttpError(400, 'You cannot add yourself');

  const existing = await relationshipBetween(env, me.id, target.id);
  const now = Date.now();
  if (existing?.status === 'accepted') throw new HttpError(409, 'Already friends');
  if (existing?.status === 'blocked') throw new HttpError(404, 'User not found');
  if (existing?.status === 'pending') {
    // They already asked us: treat our request as acceptance.
    if (existing.requester_id === target.id) {
      await env.DB.prepare(
        "UPDATE friendships SET status = 'accepted', updated_at = ? WHERE requester_id = ? AND addressee_id = ?",
      )
        .bind(now, target.id, me.id)
        .run();
      await createNotification(env, target.id, 'friend_accepted', me);
      return json({ status: 'accepted' });
    }
    throw new HttpError(409, 'Request already sent');
  }

  await env.DB.prepare(
    "INSERT INTO friendships (requester_id, addressee_id, status, relation, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?, ?)",
  )
    .bind(me.id, target.id, relation, now, now)
    .run();
  await createNotification(env, target.id, 'friend_request', me);
  return json({ status: 'pending_outgoing' }, { status: 201 });
}

/** Body `{ userId, accept: boolean }` — answers an incoming request. */
export async function handleFriendRespond(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  const body = await readJson(request);
  const fromId = parseUserId(body.userId);
  const accept = body.accept === true;

  const row = await env.DB.prepare(
    "SELECT 1 FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'",
  )
    .bind(fromId, me.id)
    .first();
  if (!row) throw new HttpError(404, 'No pending request from that user');

  if (accept) {
    await env.DB.prepare(
      "UPDATE friendships SET status = 'accepted', updated_at = ? WHERE requester_id = ? AND addressee_id = ?",
    )
      .bind(Date.now(), fromId, me.id)
      .run();
    await createNotification(env, fromId, 'friend_accepted', me);
  } else {
    await env.DB.prepare('DELETE FROM friendships WHERE requester_id = ? AND addressee_id = ?').bind(fromId, me.id).run();
  }
  return json({ status: accept ? 'accepted' : 'declined' });
}

export async function handleRemoveFriend(request: Request, env: Env, userId: string): Promise<Response> {
  const me = await requireUser(request, env);
  const other = parseUserId(userId);
  await env.DB.prepare(
    `DELETE FROM friendships WHERE status != 'blocked' AND
     ((requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1))`,
  )
    .bind(me.id, other)
    .run();
  return json({ ok: true });
}

/** Body `{ userId, gameId, roomId? }` — "come play with me". Friends only. */
export async function handleFriendPing(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  const body = await readJson(request);
  const friendId = parseUserId(body.userId);
  if (!isGameId(body.gameId)) throw new HttpError(400, 'Unknown game');
  const roomId = typeof body.roomId === 'string' && ROOM_ID_RE.test(body.roomId) ? body.roomId : undefined;

  const rel = await relationshipBetween(env, me.id, friendId);
  if (rel?.status !== 'accepted') throw new HttpError(403, 'You can only ping friends');

  // Cheap anti-spam: one ping per friend per minute (KV minimum TTL is 60s).
  const key = `ping:${me.id}:${friendId}`;
  if (await env.KV.get(key)) throw new HttpError(429, 'You just pinged them — try again in a minute', 'rate_limited');
  await env.KV.put(key, '1', { expirationTtl: 60 });

  await createNotification(env, friendId, 'game_ping', me, { gameId: getGame(body.gameId).id, roomId });
  return json({ ok: true });
}

export async function handleUserSearch(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();
  if (!/^[a-z0-9_]{2,20}$/.test(q)) return json({ users: [] as PublicUser[] });
  const { results } = await env.DB.prepare(
    "SELECT id, username, display_name, avatar FROM users WHERE username LIKE ? ESCAPE '\\' AND id != ? AND disabled = 0 ORDER BY username LIMIT 10",
  )
    .bind(`${q.replace(/_/g, '\\_')}%`, me.id)
    .all<Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar'>>();
  return json({ users: results.map(toPublicUser) });
}
