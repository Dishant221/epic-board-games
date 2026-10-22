import { DurableObject } from 'cloudflare:workers';
import type { Notification } from '@ebg/game-core';
import type { Env } from '../env';
import { safeClose, safeSend, upgradeRequired } from './ws';

/** Messages pushed on /api/presence/ws. */
export type PresenceServerMessage = { type: 'NOTIFICATION'; payload: Notification } | { type: 'PONG' };

/**
 * One instance per user (idFromName(userId)). Holds that user's open tabs'
 * sockets so friends can ping them live, and answers "is this user online?".
 * Stateless beyond the sockets themselves, so hibernation is free.
 */
export class Presence extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalives are answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"PING"}', '{"type":"PONG"}'));
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return upgradeRequired();
    // Cap tabs per user so a single account cannot pin unbounded sockets.
    const open = this.ctx.getWebSockets();
    if (open.length >= 8 && open[0]) safeClose(open[0], 4001, 'Too many connections');
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  isOnline(): boolean {
    return this.ctx.getWebSockets().length > 0;
  }

  notify(notification: Notification): void {
    const frame = JSON.stringify({ type: 'NOTIFICATION', payload: notification } satisfies PresenceServerMessage);
    for (const ws of this.ctx.getWebSockets()) safeSend(ws, frame);
  }

  override webSocketMessage(): void {
    // Clients only send PING (auto-answered). Anything else is ignored.
  }

  override webSocketClose(ws: WebSocket): void {
    safeClose(ws);
  }
}
