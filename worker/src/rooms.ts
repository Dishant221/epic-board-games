import { getEngine, getGame, isDifficulty, isGameId, type AIDifficulty, type GameId, type PublicUser } from '@ebg/game-core';
import { requireUser } from './auth';
import { USER_HEADER } from './durable/ws';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';

const ROOM_ID_RE = /^[0-9a-f]{64}$/;

export function parseRoomId(env: Env, raw: unknown): DurableObjectId {
  if (typeof raw !== 'string' || !ROOM_ID_RE.test(raw)) throw new HttpError(400, 'Invalid room id');
  try {
    return env.GAME_ROOM.idFromString(raw);
  } catch {
    throw new HttpError(404, 'Room not found');
  }
}

function playableGame(raw: unknown): GameId {
  if (!isGameId(raw)) throw new HttpError(400, 'Unknown game');
  if (!getEngine(raw)) throw new HttpError(400, 'That game is coming soon');
  return raw;
}

function requireUpgrade(request: Request): void {
  if (request.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'Expected WebSocket upgrade');
}

/** Forwards a WebSocket upgrade to a Durable Object, tagging it with the verified user. */
function forwardUpgrade(request: Request, stub: { fetch(r: Request): Promise<Response> }, user: PublicUser, url?: string) {
  const headers = new Headers(request.headers);
  headers.set(USER_HEADER, JSON.stringify(user));
  return stub.fetch(new Request(url ?? request.url, { headers, method: 'GET' }));
}

/** GET /api/matchmaking/ws?game=<GameId> */
export async function handleMatchmakingWs(request: Request, env: Env): Promise<Response> {
  requireUpgrade(request);
  const user = await requireUser(request, env);
  const gameId = playableGame(new URL(request.url).searchParams.get('game'));
  if (getGame(gameId).maxPlayers < 2) throw new HttpError(400, 'That game is single-player');
  const stub = env.MATCHMAKER.get(env.MATCHMAKER.idFromName(gameId));
  return forwardUpgrade(request, stub, user);
}

/** GET /api/rooms/:id/ws */
export async function handleRoomWs(request: Request, env: Env, roomId: string): Promise<Response> {
  requireUpgrade(request);
  const user = await requireUser(request, env);
  return forwardUpgrade(request, env.GAME_ROOM.get(parseRoomId(env, roomId)), user);
}

/** GET /api/presence/ws */
export async function handlePresenceWs(request: Request, env: Env): Promise<Response> {
  requireUpgrade(request);
  const user = await requireUser(request, env);
  return forwardUpgrade(request, env.PRESENCE.get(env.PRESENCE.idFromName(user.id)), user);
}

/** POST /api/rooms/ai `{ gameId, opponents: AIDifficulty[] }` → `{ roomId }` */
export async function handleCreateAiRoom(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const gameId = playableGame(body.gameId);
  const game = getGame(gameId);
  if (game.ai !== 'opponent') throw new HttpError(400, 'That game has no AI opponent');
  const opponents = Array.isArray(body.opponents) ? body.opponents : [];
  if (opponents.length < 1 || opponents.length > Math.min(3, game.maxPlayers - 1) || !opponents.every(isDifficulty)) {
    throw new HttpError(400, `Choose 1–${Math.min(3, game.maxPlayers - 1)} AI opponents`);
  }
  const id = env.GAME_ROOM.newUniqueId();
  const roomId = id.toString();
  await env.GAME_ROOM.get(id).init({ roomId, gameId, mode: 'ai', humans: [user], ai: opponents as AIDifficulty[] });
  return json({ roomId }, { status: 201 });
}

/** POST /api/rooms/private `{ gameId }` → `{ roomId }` — share the id with friends. */
export async function handleCreatePrivateRoom(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const gameId = playableGame(body.gameId);
  if (getGame(gameId).maxPlayers < 2) throw new HttpError(400, 'That game is single-player');
  const id = env.GAME_ROOM.newUniqueId();
  const roomId = id.toString();
  await env.GAME_ROOM.get(id).init({ roomId, gameId, mode: 'private', humans: [user] });
  return json({ roomId }, { status: 201 });
}
