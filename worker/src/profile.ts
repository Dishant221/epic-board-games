import { audit, requireUser } from './auth';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import { normalizeAvatar, normalizeDisplayName } from './security';

interface StatsRow {
  played: number;
  wins: number;
}

export async function handleGetProfile(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const stats = await env.DB.prepare(
    `SELECT COUNT(*) AS played, COALESCE(SUM(result = 'win'), 0) AS wins
     FROM game_players gp JOIN game_sessions gs ON gs.id = gp.game_session_id
     WHERE gp.user_id = ? AND gs.status = 'finished'`,
  )
    .bind(user.id)
    .first<StatsRow>();
  return json({ user, stats: { played: stats?.played ?? 0, wins: stats?.wins ?? 0 } });
}

/** Body `{ displayName?, avatar? }`. */
export async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const displayName = body.displayName === undefined ? user.displayName : normalizeDisplayName(body.displayName);
  const avatar = body.avatar === undefined ? user.avatar : normalizeAvatar(body.avatar);
  if (!displayName) throw new HttpError(400, 'Display name must be 1–32 characters', 'invalid_display_name');
  if (!avatar) throw new HttpError(400, 'Avatar must be a single emoji', 'invalid_avatar');

  await env.DB.prepare('UPDATE users SET display_name = ?, avatar = ?, updated_at = ? WHERE id = ?')
    .bind(displayName, avatar, Date.now(), user.id)
    .run();
  await audit(env, request, 'profile_update', user.id);
  return json({ user: { ...user, displayName, avatar } });
}
