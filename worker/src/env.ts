import type { GameRoom } from './durable/game-room';
import type { Matchmaker } from './durable/matchmaker';
import type { Presence } from './durable/presence';

export interface Env {
  APP_ENV: 'production' | 'testing' | 'development';
  ASSETS: Fetcher;
  DB: D1Database;
  KV: KVNamespace;
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  PRESENCE: DurableObjectNamespace<Presence>;
  AUTH_LIMITER: RateLimit;
  API_LIMITER: RateLimit;
  /** Secrets — optional; voice falls back to STUN-only without them. */
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
}
