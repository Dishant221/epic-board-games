// Pure security helpers: crypto primitives, cookies, CSRF origin checks and
// input validators. Kept free of bindings so they are unit-testable in Node.

import { HttpError } from './http';

const encoder = new TextEncoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/** URL-safe random token (32 bytes → 43 chars). */
export function randomToken(bytes = 32): string {
  return bytesToBase64Url(randomBytes(bytes));
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Length-independent-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// ---------------------------------------------------------------- passwords

/** Workers caps PBKDF2 at 100k iterations. Stored per user so it can be raised later. */
export const PBKDF2_ITERATIONS = 100_000;

export interface PasswordHash {
  hash: string;
  salt: string;
  iterations: number;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, iterations);
  return { hash: bytesToBase64(hash), salt: bytesToBase64(salt), iterations };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const hash = await pbkdf2(password, base64ToBytes(stored.salt), stored.iterations);
  return timingSafeEqual(hash, base64ToBytes(stored.hash));
}

// ------------------------------------------------------------------ cookies

export const SESSION_COOKIE = '__Host-ebg_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function parseCookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!out.has(name)) {
      try {
        out.set(name, decodeURIComponent(value));
      } catch {
        // Malformed encoding: ignore this cookie rather than failing the request.
      }
    }
  }
  return out;
}

/**
 * `__Host-` prefix forces Secure, Path=/ and no Domain, so the cookie cannot be
 * set or overwritten by a sibling subdomain.
 */
export function sessionCookie(token: string, maxAgeSec = SESSION_TTL_MS / 1000): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(maxAgeSec)}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// --------------------------------------------------------------------- CSRF

/**
 * Same-origin check for state-changing requests and WebSocket upgrades.
 * Browsers always send Origin on cross-origin POST/PATCH/DELETE and on
 * WebSocket handshakes, so a missing or foreign Origin is rejected.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function assertSameOrigin(request: Request): void {
  if (!isSameOrigin(request)) throw new HttpError(403, 'Cross-origin request blocked', 'bad_origin');
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

// --------------------------------------------------------------- validation

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
// Pragmatic check; deliverability is what actually proves an address.
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
const DISPLAY_NAME_MAX = 32;

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim().toLowerCase();
  return USERNAME_RE.test(u) ? u : null;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function validatePassword(raw: unknown): string | null {
  if (typeof raw !== 'string') return 'Password is required';
  if (raw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (raw.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  return null;
}

/** Strips control/bidi characters and collapses whitespace. */
export function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length >= 1 && [...s].length <= DISPLAY_NAME_MAX ? s : null;
}

/** Avatar is a single emoji (up to a few code points for ZWJ sequences/flags). */
export function normalizeAvatar(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length === 0 || s.length > 16) return null;
  return /^[\p{Extended_Pictographic}\p{Regional_Indicator}‍️\u{1f3fb}-\u{1f3ff}]+$/u.test(s) ? s : null;
}
