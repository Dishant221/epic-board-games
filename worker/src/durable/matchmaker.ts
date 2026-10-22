import { DurableObject } from 'cloudflare:workers';
import {
  MATCH_WINDOW_MS,
  getEngine,
  getGame,
  isGameId,
  type GameId,
  type MatchServerMessage,
  type PublicUser,
} from '@ebg/game-core';
import type { Env } from '../env';
import { safeClose, safeSend, upgradeRequired, userFromHeader } from './ws';

interface QueueEntry {
  user: PublicUser;
  joinedAt: number;
}

/**
 * One queue per game (idFromName(gameId)). The first player to arrive opens
 * a 60-second window; the match starts as soon as the table is full, or when
 * the window closes with at least two players. A lone player gets NO_MATCH
 * and the client offers a game against the AI instead.
 */
export class Matchmaker extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"PING"}', '{"type":"PONG"}'));
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return upgradeRequired();
    const user = userFromHeader(request);
    const gameId = new URL(request.url).searchParams.get('game');
    if (!user) return new Response('Unauthenticated', { status: 401 });
    if (!isGameId(gameId) || !getEngine(gameId)) return new Response('Unknown game', { status: 400 });
    await this.ctx.storage.put('gameId', gameId);

    // One queue slot per user: a new tab replaces the old one.
    for (const old of this.ctx.getWebSockets(user.id)) safeClose(old, 4000, 'Replaced by a newer connection');

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [user.id]);
    server.serializeAttachment({ user, joinedAt: Date.now() } satisfies QueueEntry);

    let deadline = await this.ctx.storage.get<number>('deadline');
    if (!deadline || this.queue().length === 1) {
      deadline = Date.now() + MATCH_WINDOW_MS;
      await this.ctx.storage.put('deadline', deadline);
      await this.ctx.storage.setAlarm(deadline);
    }

    const { maxPlayers } = getGame(gameId);
    const queue = this.queue();
    safeSend(server, {
      type: 'QUEUED',
      gameId,
      position: queue.length,
      playersWaiting: queue.length,
      deadline,
      maxPlayers,
    } satisfies MatchServerMessage);

    if (queue.length >= maxPlayers) await this.startMatch(gameId, queue.slice(0, maxPlayers));
    else this.broadcastQueue(deadline);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > 256) return;
    let type: unknown;
    try {
      type = (JSON.parse(raw) as { type?: unknown }).type;
    } catch {
      return;
    }
    if (type === 'LEAVE_QUEUE') {
      safeClose(ws, 1000, 'Left queue');
      await this.onLeave(ws);
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    safeClose(ws);
    await this.onLeave(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onLeave(ws);
  }

  override async alarm(): Promise<void> {
    const gameId = await this.ctx.storage.get<GameId>('gameId');
    const queue = this.queue();
    await this.ctx.storage.delete('deadline');
    if (!gameId || queue.length === 0) return;

    const { minPlayers, maxPlayers } = getGame(gameId);
    if (queue.length >= Math.max(2, minPlayers)) {
      await this.startMatch(gameId, queue.slice(0, maxPlayers));
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      safeSend(ws, { type: 'NO_MATCH', reason: 'No other players joined in time' } satisfies MatchServerMessage);
      safeClose(ws, 1000, 'No match');
    }
  }

  /** Queued players, oldest first, excluding sockets that are closing. */
  private queue(except?: WebSocket): QueueEntry[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN)
      .map((ws) => ws.deserializeAttachment() as QueueEntry)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  private async startMatch(gameId: GameId, entries: QueueEntry[]): Promise<void> {
    const id = this.env.GAME_ROOM.newUniqueId();
    const roomId = id.toString();
    try {
      await this.env.GAME_ROOM.get(id).init({ roomId, gameId, mode: 'matchmaking', humans: entries.map((e) => e.user) });
    } catch (err) {
      console.error('room init failed', err);
      for (const e of entries) {
        for (const ws of this.ctx.getWebSockets(e.user.id)) {
          safeSend(ws, { type: 'ERROR', message: 'Could not create a room. Please try again.' } satisfies MatchServerMessage);
          safeClose(ws, 1011, 'Room creation failed');
        }
      }
      return;
    }

    const matched = new Set(entries.map((e) => e.user.id));
    for (const userId of matched) {
      for (const ws of this.ctx.getWebSockets(userId)) {
        safeSend(ws, { type: 'MATCH_FOUND', roomId, gameId } satisfies MatchServerMessage);
        safeClose(ws, 1000, 'Matched');
      }
    }

    // Anyone left over (queue larger than a table) starts a fresh window.
    const rest = this.queue().filter((e) => !matched.has(e.user.id));
    if (rest.length > 0) {
      const deadline = Date.now() + MATCH_WINDOW_MS;
      await this.ctx.storage.put('deadline', deadline);
      await this.ctx.storage.setAlarm(deadline);
      this.broadcastQueue(deadline);
    } else {
      await this.ctx.storage.delete('deadline');
      await this.ctx.storage.deleteAlarm();
    }
  }

  private async onLeave(ws: WebSocket): Promise<void> {
    const rest = this.queue(ws);
    if (rest.length === 0) {
      await this.ctx.storage.delete('deadline');
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const deadline = await this.ctx.storage.get<number>('deadline');
    if (deadline) this.broadcastQueue(deadline, ws);
  }

  private broadcastQueue(deadline: number, except?: WebSocket): void {
    const playersWaiting = this.queue(except).length;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) safeSend(ws, { type: 'QUEUE_UPDATE', playersWaiting, deadline } satisfies MatchServerMessage);
    }
  }
}
