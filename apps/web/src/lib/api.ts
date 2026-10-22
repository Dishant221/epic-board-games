import type { MeResponse, PublicUser } from '@ebg/game-core/protocol';
import { useEffect, useState } from 'react';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Same-origin JSON fetch. The session cookie is HttpOnly, so it rides along automatically. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiRequestError(data.error ?? `Request failed (${res.status})`, res.status);
  return data;
}

export function wsUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}

// ------------------------------------------------------------ auth store

type AuthState = { status: 'loading' } | { status: 'ready'; user: PublicUser | null };

let authState: AuthState = { status: 'loading' };
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: AuthState) => void>();

function setAuth(next: AuthState) {
  authState = next;
  listeners.forEach((l) => l(next));
}

export function refreshAuth(): Promise<void> {
  inflight ??= api<MeResponse>('/api/auth/me')
    .then((r) => setAuth({ status: 'ready', user: r.user }))
    .catch(() => setAuth({ status: 'ready', user: null }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function setCurrentUser(user: PublicUser | null) {
  setAuth({ status: 'ready', user });
}

export function useAuth(): AuthState {
  // Always start as 'loading' so the first client render matches the static HTML
  // (islands hydrate at different times and may otherwise see a cached user).
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  useEffect(() => {
    listeners.add(setState);
    if (authState.status === 'loading') void refreshAuth();
    else setState(authState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function loginRedirect(): string {
  return `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}

/** Only allow same-site relative redirects after login (prevents open redirects). */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
}
