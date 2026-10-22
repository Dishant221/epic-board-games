// Wire protocol between the browser and the Worker / Durable Objects.
// Every inbound message is untrusted: servers must validate with the
// parse helpers below (and engine.parseMove for move payloads).

import type { AIDifficulty, AIPersona } from './ai';
import type { GameId } from './catalog';

export const MATCH_WINDOW_MS = 60_000;
export const TURN_TIMEOUT_MS = 45_000;
export const MAX_WS_MESSAGE_BYTES = 16 * 1024;

// ---------------------------------------------------------------- REST API

// Structural copies of the DOM WebRTC types so this file also compiles for Workers.
export interface SdpInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface IceInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
}

export interface MeResponse {
  user: PublicUser | null;
}

export interface FriendEntry {
  user: PublicUser;
  status: 'pending_incoming' | 'pending_outgoing' | 'accepted';
  relation: 'friend' | 'family';
  online: boolean;
}

export interface Notification {
  id: string;
  kind: 'friend_request' | 'friend_accepted' | 'game_ping';
  fromUser: PublicUser;
  gameId?: GameId;
  roomId?: string;
  createdAt: number;
  read: boolean;
}

export interface ApiError {
  error: string;
}

// ------------------------------------------------------------ Matchmaking

export type MatchClientMessage = { type: 'LEAVE_QUEUE' } | { type: 'PING' };

export type MatchServerMessage =
  | { type: 'QUEUED'; gameId: GameId; position: number; playersWaiting: number; deadline: number; maxPlayers: number }
  | { type: 'QUEUE_UPDATE'; playersWaiting: number; deadline: number }
  | { type: 'MATCH_FOUND'; roomId: string; gameId: GameId }
  | { type: 'NO_MATCH'; reason: string }
  | { type: 'PONG' }
  | { type: 'ERROR'; message: string };

// --------------------------------------------------------------- Game room

export interface RoomPlayer {
  seat: number;
  userId: string;
  displayName: string;
  avatar: string;
  connected: boolean;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  aiPersona?: AIPersona['id'];
  voice: 'off' | 'on' | 'muted';
}

export interface ChatMessage {
  id: string;
  messageType: 'text' | 'emote' | 'system';
  content: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  timestamp: number;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomSnapshot<S = unknown> {
  roomId: string;
  gameId: GameId;
  status: RoomStatus;
  players: RoomPlayer[];
  state: S | null;
  /** Seat of the receiving client, or null for spectators. */
  yourSeat: number | null;
  turnDeadline: number | null;
  /** Move counter; echo it back in MOVE so the server can drop stale moves. */
  turn: number;
  winner: number | null;
  chat: ChatMessage[];
}

export type VoiceSignal =
  | { type: 'VOICE_OFFER'; payload: { targetPlayerId: string; sdp: SdpInit } }
  | { type: 'VOICE_ANSWER'; payload: { targetPlayerId: string; sdp: SdpInit } }
  | { type: 'VOICE_ICE_CANDIDATE'; payload: { targetPlayerId: string; candidate: IceInit } }
  | { type: 'VOICE_MUTE_STATUS'; payload: { muted: boolean } }
  | { type: 'VOICE_STATE'; payload: { voice: RoomPlayer['voice'] } };

export type RoomClientMessage =
  | { type: 'MOVE'; payload: { move: unknown; turn: number } }
  | { type: 'CHAT'; payload: { content: string } }
  | { type: 'EMOTE'; payload: { emoteId: string } }
  | { type: 'TYPING' }
  | { type: 'REMATCH' }
  | { type: 'PING' }
  | VoiceSignal;

export type RoomServerMessage<S = unknown> =
  | { type: 'SNAPSHOT'; payload: RoomSnapshot<S> }
  | { type: 'STATE'; payload: { state: S; lastMove: unknown; bySeat: number; turnDeadline: number | null; turn: number } }
  | { type: 'PLAYER_UPDATE'; payload: { players: RoomPlayer[] } }
  | { type: 'CHAT'; payload: ChatMessage }
  | { type: 'TYPING'; payload: { userId: string } }
  | { type: 'AI_THINKING'; payload: { seat: number } }
  | { type: 'GAME_OVER'; payload: { winner: number | null; reason: 'win' | 'draw' | 'forfeit' | 'abandoned' } }
  | { type: 'ERROR'; payload: { message: string; code?: string } }
  | { type: 'PONG' }
  | { type: 'VOICE_OFFER'; payload: { fromPlayerId: string; sdp: SdpInit } }
  | { type: 'VOICE_ANSWER'; payload: { fromPlayerId: string; sdp: SdpInit } }
  | { type: 'VOICE_ICE_CANDIDATE'; payload: { fromPlayerId: string; candidate: IceInit } }
  | { type: 'VOICE_MUTE_STATUS'; payload: { playerId: string; muted: boolean } };

const ROOM_TYPES = new Set([
  'MOVE', 'CHAT', 'EMOTE', 'TYPING', 'REMATCH', 'PING',
  'VOICE_OFFER', 'VOICE_ANSWER', 'VOICE_ICE_CANDIDATE', 'VOICE_MUTE_STATUS', 'VOICE_STATE',
]);

/** Shape-checks a raw WebSocket frame. Payload contents still need validating. */
export function parseRoomClientMessage(raw: string | ArrayBuffer): RoomClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_WS_MESSAGE_BYTES) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;
  const type = (msg as { type?: unknown }).type;
  if (typeof type !== 'string' || !ROOM_TYPES.has(type)) return null;
  return msg as RoomClientMessage;
}
