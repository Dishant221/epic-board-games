import { handleLogin, handleLogout, handleMe, handleSignup } from './auth';
import type { Env } from './env';
import {
  handleFriendPing,
  handleFriendRequest,
  handleFriendRespond,
  handleListFriends,
  handleRemoveFriend,
  handleUserSearch,
} from './friends';
import { HttpError, errorResponse, json, withApiHeaders } from './http';
import { handleListNotifications, handleReadNotifications } from './notifications';
import { handleGetProfile, handleUpdateProfile } from './profile';
import {
  handleCreateAiRoom,
  handleCreatePrivateRoom,
  handleMatchmakingWs,
  handlePresenceWs,
  handleRoomWs,
} from './rooms';
import { assertSameOrigin, clientIp } from './security';
import { handleTurnCredentials } from './voice';

export { GameRoom } from './durable/game-room';
export { Matchmaker } from './durable/matchmaker';
export { Presence } from './durable/presence';

type Handler = (request: Request, env: Env, param: string) => Promise<Response>;

interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  pattern: RegExp;
  handler: Handler;
}

const ROUTES: Route[] = [
  { method: 'GET', pattern: /^\/api\/health$/, handler: async (_r, env) => json({ ok: true, env: env.APP_ENV }) },
  { method: 'POST', pattern: /^\/api\/auth\/signup$/, handler: handleSignup },
  { method: 'POST', pattern: /^\/api\/auth\/login$/, handler: handleLogin },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/, handler: handleLogout },
  { method: 'GET', pattern: /^\/api\/auth\/me$/, handler: handleMe },
  { method: 'GET', pattern: /^\/api\/profile$/, handler: handleGetProfile },
  { method: 'PATCH', pattern: /^\/api\/profile$/, handler: handleUpdateProfile },
  { method: 'GET', pattern: /^\/api\/users\/search$/, handler: handleUserSearch },
  { method: 'GET', pattern: /^\/api\/friends$/, handler: handleListFriends },
  { method: 'POST', pattern: /^\/api\/friends\/request$/, handler: handleFriendRequest },
  { method: 'POST', pattern: /^\/api\/friends\/respond$/, handler: handleFriendRespond },
  { method: 'POST', pattern: /^\/api\/friends\/ping$/, handler: handleFriendPing },
  { method: 'DELETE', pattern: /^\/api\/friends\/([0-9a-f-]{36})$/, handler: handleRemoveFriend },
  { method: 'GET', pattern: /^\/api\/notifications$/, handler: handleListNotifications },
  { method: 'POST', pattern: /^\/api\/notifications\/read$/, handler: handleReadNotifications },
  { method: 'GET', pattern: /^\/api\/presence\/ws$/, handler: handlePresenceWs },
  { method: 'GET', pattern: /^\/api\/matchmaking\/ws$/, handler: handleMatchmakingWs },
  { method: 'POST', pattern: /^\/api\/rooms\/ai$/, handler: handleCreateAiRoom },
  { method: 'POST', pattern: /^\/api\/rooms\/private$/, handler: handleCreatePrivateRoom },
  { method: 'GET', pattern: /^\/api\/rooms\/([0-9a-f]{64})\/ws$/, handler: handleRoomWs },
  { method: 'POST', pattern: /^\/api\/voice\/turn-credentials$/, handler: handleTurnCredentials },
];

async function handleApi(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const isUpgrade = request.headers.get('Upgrade') === 'websocket';

  // CSRF: every state change and every WebSocket handshake must be same-origin.
  if (request.method !== 'GET' && request.method !== 'HEAD') assertSameOrigin(request);
  if (isUpgrade) assertSameOrigin(request);

  // Coarse per-IP abuse limit (auth endpoints also have their own stricter limiter).
  if (!isUpgrade) {
    const { success } = await env.API_LIMITER.limit({ key: clientIp(request) });
    if (!success) throw new HttpError(429, 'Too many requests', 'rate_limited');
  }

  let pathMatched = false;
  for (const route of ROUTES) {
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    pathMatched = true;
    if (route.method === request.method) return route.handler(request, env, m[1] ?? '');
  }
  throw pathMatched ? new HttpError(405, 'Method not allowed') : new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    // run_worker_first only routes /api/* here; everything else is a static asset.
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      return withApiHeaders(await handleApi(request, env));
    } catch (err) {
      if (err instanceof HttpError) return withApiHeaders(errorResponse(err.status, err.message, err.code));
      // Log server-side; never leak internals to the client.
      console.error('Unhandled API error', { path: pathname, method: request.method, error: String(err), stack: (err as Error)?.stack });
      return withApiHeaders(errorResponse(500, 'Something went wrong. Please try again.'));
    }
  },
} satisfies ExportedHandler<Env>;
