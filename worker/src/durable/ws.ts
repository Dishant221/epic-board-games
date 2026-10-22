// Small helpers shared by the Durable Objects' WebSocket handling.

import type { PublicUser } from '@ebg/game-core';

/** Header the Worker uses to hand the authenticated user to a Durable Object. */
export const USER_HEADER = 'X-EBG-User';

export function userFromHeader(request: Request): PublicUser | null {
  const raw = request.headers.get(USER_HEADER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

/** Closes a socket, tolerating ones that are already closed. */
export function safeClose(ws: WebSocket, code = 1000, reason = 'Closing'): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

export function safeSend(ws: WebSocket, data: unknown): void {
  try {
    ws.send(typeof data === 'string' ? data : JSON.stringify(data));
  } catch {
    // Socket is closing; its close handler will clean up.
  }
}

export function upgradeRequired(): Response {
  return new Response('Expected WebSocket', { status: 426 });
}
