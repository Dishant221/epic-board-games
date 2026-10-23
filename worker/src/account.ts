// Account self-service: password change, data export (portability) and
// account deletion (right to erasure). Every action re-checks the password.

import type { GameId } from '@ebg/game-core';
import { audit, requireUser, type UserRow } from './auth';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import { SESSION_COOKIE, clearSessionCookie, clientIp, hashPassword, parseCookies, sha256Hex, validatePassword, verifyPassword } from './security';

async function loadUser(env: Env, id: string): Promise<UserRow> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND disabled = 0').bind(id).first<UserRow>();
  if (!row) throw new HttpError(401, 'Please sign in', 'unauthenticated');
  return row;
}

async function checkPassword(env: Env, request: Request, row: UserRow, raw: unknown): Promise<void> {
  // Same limiter as login so password guessing through these endpoints is no easier.
  const { success } = await env.AUTH_LIMITER.limit({ key: `${clientIp(request)}:reauth:${row.id}` });
  if (!success) throw new HttpError(429, 'Too many attempts. Please wait a minute and try again.', 'rate_limited');
  const password = typeof raw === 'string' ? raw.slice(0, 256) : '';
  const ok =
    password.length > 0 &&
    (await verifyPassword(password, { hash: row.password_hash, salt: row.password_salt, iterations: row.password_iterations }));
  if (!ok) {
    await audit(env, request, 'reauth_failure', row.id);
    throw new HttpError(403, 'Incorrect password', 'bad_password');
  }
}

/** POST /api/auth/password `{ currentPassword, newPassword }` — signs out every other device. */
export async function handleChangePassword(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const row = await loadUser(env, user.id);
  await checkPassword(env, request, row, body.currentPassword);
  const error = validatePassword(body.newPassword);
  if (error) throw new HttpError(400, error, 'invalid_password');
  if (body.newPassword === body.currentPassword) throw new HttpError(400, 'Choose a different password', 'same_password');

  const pw = await hashPassword(body.newPassword as string);
  const token = parseCookies(request.headers.get('Cookie')).get(SESSION_COOKIE) ?? '';
  const currentSession = await sha256Hex(token);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?').bind(
      pw.hash,
      pw.salt,
      pw.iterations,
      Date.now(),
      user.id,
    ),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(user.id, currentSession),
  ]);
  await audit(env, request, 'password_change', user.id);
  return json({ ok: true });
}

interface GameHistoryRow {
  game_id: GameId;
  mode: string;
  started_at: number;
  ended_at: number | null;
  result: string | null;
  seat: number;
  has_ai_players: number;
}

/** GET /api/account/export — everything we hold about the signed-in user, as JSON. */
export async function handleExportAccount(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const row = await loadUser(env, user.id);
  const [friends, notifications, games, sessions] = await Promise.all([
    env.DB.prepare(
      `SELECT CASE WHEN f.requester_id = ?1 THEN 'sent' ELSE 'received' END AS direction, f.status, f.relation, f.created_at, u.username
       FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END
       WHERE f.requester_id = ?1 OR f.addressee_id = ?1`,
    )
      .bind(user.id)
      .all(),
    env.DB.prepare('SELECT n.kind, n.game_id, n.created_at, n.read, u.username AS from_username FROM notifications n JOIN users u ON u.id = n.from_user_id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 500')
      .bind(user.id)
      .all(),
    env.DB.prepare(
      `SELECT gs.game_id, gs.mode, gs.started_at, gs.ended_at, gs.has_ai_players, gp.result, gp.seat
       FROM game_players gp JOIN game_sessions gs ON gs.id = gp.game_session_id
       WHERE gp.user_id = ? ORDER BY gs.started_at DESC LIMIT 1000`,
    )
      .bind(user.id)
      .all<GameHistoryRow>(),
    env.DB.prepare('SELECT created_at, expires_at, user_agent FROM sessions WHERE user_id = ?').bind(user.id).all(),
  ]);
  await audit(env, request, 'account_export', user.id);
  const body = {
    exportedAt: new Date().toISOString(),
    account: {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      avatar: row.avatar,
    },
    friends: friends.results,
    notifications: notifications.results,
    games: games.results,
    sessions: sessions.results,
  };
  return json(body, {
    headers: { 'Content-Disposition': `attachment; filename="epic-board-games-${row.username}.json"` },
  });
}

/** DELETE /api/account `{ password }` — permanently deletes the account and signs out. */
export async function handleDeleteAccount(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const row = await loadUser(env, user.id);
  await checkPassword(env, request, row, body.password);
  // Audit first (user_id becomes NULL via ON DELETE SET NULL, the event survives).
  await audit(env, request, 'account_delete', user.id, { username: row.username });
  // Cascades remove sessions, friendships and notifications; game history keeps
  // anonymous rows (user_id SET NULL) so opponents' stats stay intact.
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
