import { requireUser } from './auth';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import { parseRoomId } from './rooms';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const STUN_ONLY: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
// Short-lived on purpose: credentials only need to outlive one game session.
const TURN_TTL_SEC = 60 * 60;

/**
 * Body `{ roomId }` → `{ iceServers }`. Only players of that room get TURN
 * credentials, so the relay cannot be used as a free open proxy.
 */
export async function handleTurnCredentials(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const id = parseRoomId(env, body.roomId);
  if (!(await env.GAME_ROOM.get(id).isPlayer(user.id))) throw new HttpError(403, 'Not a player in this room');

  if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) return json({ iceServers: STUN_ONLY, ttl: null });

  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL_SEC }),
    },
  );
  if (!res.ok) {
    console.error('TURN credential request failed', res.status);
    // Degrade to STUN rather than blocking voice entirely.
    return json({ iceServers: STUN_ONLY, ttl: null });
  }
  const data = (await res.json()) as { iceServers?: IceServer[] | IceServer };
  const servers = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
  return json({ iceServers: servers.length > 0 ? servers : STUN_ONLY, ttl: TURN_TTL_SEC });
}
