// Player statistics and public leaderboards. Only finished games between
// humans count toward leaderboards (AI games are excluded, see schema).

import { GAMES, isGameId, type GameId, type LeaderboardEntry, type ProfileStats } from '@ebg/game-core';
import { PUBLIC_USER_COLUMNS, requireUser, toPublicUser, type UserRow } from './auth';
import type { Env } from './env';
import { HttpError, json } from './http';

interface PerGameRow {
  game_id: string;
  played: number;
  wins: number;
}

interface RecentRow {
  game_id: string;
  mode: string;
  ended_at: number;
  result: string | null;
  opponents: string | null;
}

export async function loadProfileStats(env: Env, userId: string): Promise<ProfileStats> {
  const [perGame, recent] = await Promise.all([
    env.DB.prepare(
      `SELECT gs.game_id, COUNT(*) AS played, COALESCE(SUM(gp.result = 'win'), 0) AS wins
       FROM game_players gp JOIN game_sessions gs ON gs.id = gp.game_session_id
       WHERE gp.user_id = ? AND gs.status = 'finished' GROUP BY gs.game_id`,
    )
      .bind(userId)
      .all<PerGameRow>(),
    env.DB.prepare(
      `SELECT gs.game_id, gs.mode, gs.ended_at, gp.result,
              (SELECT GROUP_CONCAT(COALESCE(u.display_name, CASE WHEN o.is_ai = 1 THEN 'AI' ELSE 'Former player' END), ', ')
                 FROM game_players o LEFT JOIN users u ON u.id = o.user_id
                WHERE o.game_session_id = gs.id AND o.seat != gp.seat) AS opponents
       FROM game_players gp JOIN game_sessions gs ON gs.id = gp.game_session_id
       WHERE gp.user_id = ? AND gs.status = 'finished' ORDER BY gs.ended_at DESC LIMIT 10`,
    )
      .bind(userId)
      .all<RecentRow>(),
  ]);
  const games = perGame.results.filter((r) => isGameId(r.game_id)).map((r) => ({ gameId: r.game_id as GameId, played: r.played, wins: r.wins }));
  return {
    played: games.reduce((n, g) => n + g.played, 0),
    wins: games.reduce((n, g) => n + g.wins, 0),
    games,
    recent: recent.results
      .filter((r) => isGameId(r.game_id))
      .map((r) => ({
        gameId: r.game_id as GameId,
        mode: r.mode as 'matchmaking' | 'ai' | 'private',
        endedAt: r.ended_at,
        result: (r.result ?? 'loss') as 'win' | 'loss' | 'draw' | 'forfeit',
        opponents: r.opponents ?? '',
      })),
  };
}

interface LeaderRow extends Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar'> {
  wins: number;
  played: number;
}

/** GET /api/leaderboard?game=<GameId>&period=month|all — public, cached for a minute. */
export async function handleLeaderboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const game = url.searchParams.get('game');
  const period = url.searchParams.get('period') === 'all' ? 'all' : 'month';
  if (game !== null && !isGameId(game)) throw new HttpError(400, 'Unknown game');
  const since = period === 'month' ? Date.now() - 30 * 24 * 60 * 60 * 1000 : 0;

  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_USER_COLUMNS}, COALESCE(SUM(gp.result = 'win'), 0) AS wins, COUNT(*) AS played
     FROM game_players gp
     JOIN game_sessions gs ON gs.id = gp.game_session_id
     JOIN users u ON u.id = gp.user_id
     WHERE gs.status = 'finished' AND gs.has_ai_players = 0 AND gs.ended_at >= ?1
       AND (?2 IS NULL OR gs.game_id = ?2) AND u.disabled = 0
     GROUP BY u.id HAVING wins > 0
     ORDER BY wins DESC, played ASC, u.display_name LIMIT 20`,
  )
    .bind(since, game)
    .all<LeaderRow>();

  const entries: LeaderboardEntry[] = results.map((r, i) => ({ rank: i + 1, user: toPublicUser(r), wins: r.wins, played: r.played }));
  return json(
    { game: game as GameId | null, period, entries, games: GAMES.filter((g) => g.multiplayer).map((g) => g.id) },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}

/** GET /api/profile — the signed-in user's profile with full statistics. */
export async function handleGetProfile(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  return json({ user, stats: await loadProfileStats(env, user.id) });
}
