import type { PublicUser } from '@ebg/game-core';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import {
  normalizeDisplayName,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearSessionCookie,
  clientIp,
  hashPassword,
  normalizeEmail,
  normalizeUsername,
  parseCookies,
  randomToken,
  sessionCookie,
  sha256Hex,
  validatePassword,
  verifyPassword,
  type PasswordHash,
} from './security';

export interface UserRow {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  disabled: number;
}

export const PUBLIC_USER_COLUMNS = 'u.id, u.username, u.display_name, u.avatar';

export function toPublicUser(row: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar'>): PublicUser {
  return { id: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar };
}

export async function audit(
  env: Env,
  request: Request,
  event: string,
  userId: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO audit_log (user_id, event, ip, user_agent, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(
      userId,
      event,
      clientIp(request),
      request.headers.get('User-Agent')?.slice(0, 256) ?? null,
      detail ? JSON.stringify(detail) : null,
      Date.now(),
    )
    .run();
}

/** Resolves the signed-in user from the session cookie, or null. */
export async function getSessionUser(request: Request, env: Env): Promise<PublicUser | null> {
  const token = parseCookies(request.headers.get('Cookie')).get(SESSION_COOKIE);
  if (!token || token.length > 128) return null;
  const row = await env.DB.prepare(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ? AND u.disabled = 0`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar'>>();
  return row ? toPublicUser(row) : null;
}

export async function requireUser(request: Request, env: Env): Promise<PublicUser> {
  const user = await getSessionUser(request, env);
  if (!user) throw new HttpError(401, 'Please sign in', 'unauthenticated');
  return user;
}

async function createSession(env: Env, request: Request, userId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS, request.headers.get('User-Agent')?.slice(0, 256) ?? null)
    .run();
  return token;
}

async function enforceAuthRateLimit(env: Env, request: Request, key: string): Promise<void> {
  const { success } = await env.AUTH_LIMITER.limit({ key: `${clientIp(request)}:${key}` });
  if (!success) throw new HttpError(429, 'Too many attempts. Please wait a minute and try again.', 'rate_limited');
}

const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🦁', '🐙', '🦄', '🐲', '🐧', '🐨'];

export async function handleSignup(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email);
  if (!username) throw new HttpError(400, 'Username must be 3–20 characters: a–z, 0–9 or _', 'invalid_username');
  if (!email) throw new HttpError(400, 'Please enter a valid email address', 'invalid_email');
  const passwordError = validatePassword(body.password);
  if (passwordError) throw new HttpError(400, passwordError, 'invalid_password');
  const displayName = body.displayName === undefined || body.displayName === '' ? username : normalizeDisplayName(body.displayName);
  if (!displayName) throw new HttpError(400, 'Display name must be 1–32 characters', 'invalid_display_name');
  // Consent to Terms/Privacy (and the 13+ age gate) is required and audited.
  if (body.acceptTerms !== true && body.acceptTerms !== 'true') {
    throw new HttpError(400, 'Please accept the Terms and Privacy Policy', 'terms_required');
  }
  await enforceAuthRateLimit(env, request, 'signup');

  const existing = await env.DB.prepare('SELECT 1 FROM users WHERE username = ? OR email = ?').bind(username, email).first();
  // Username availability is public by nature (profiles), so this does not leak
  // more than search does; we still avoid saying *which* field collided.
  if (existing) throw new HttpError(409, 'That username or email is already registered', 'taken');

  const pw = await hashPassword(body.password as string);
  const id = crypto.randomUUID();
  const now = Date.now();
  const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)]!;
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, username, email, display_name, avatar, password_hash, password_salt, password_iterations, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, username, email, displayName, avatar, pw.hash, pw.salt, pw.iterations, now, now, now)
      .run();
  } catch (err) {
    // Two signups raced for the same name: the UNIQUE constraint wins the tie.
    if (/UNIQUE/i.test(String(err))) throw new HttpError(409, 'That username or email is already registered', 'taken');
    throw err;
  }
  await audit(env, request, 'signup', id);

  const token = await createSession(env, request, id);
  return json(
    { user: { id, username, displayName, avatar } satisfies PublicUser },
    { status: 201, headers: { 'Set-Cookie': sessionCookie(token) } },
  );
}

// Used when the username is unknown so response timing does not reveal it.
let dummyHash: Promise<PasswordHash> | null = null;

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const login = typeof body.username === 'string' ? body.username.trim().toLowerCase().slice(0, 254) : '';
  const password = typeof body.password === 'string' ? body.password.slice(0, 256) : '';
  if (!login || !password) throw new HttpError(400, 'Username and password are required');
  await enforceAuthRateLimit(env, request, `login:${login}`);

  const row = await env.DB.prepare('SELECT * FROM users WHERE username = ? OR email = ?').bind(login, login).first<UserRow>();
  let ok = false;
  if (row) {
    ok = await verifyPassword(password, { hash: row.password_hash, salt: row.password_salt, iterations: row.password_iterations });
  } else {
    dummyHash ??= hashPassword('not-a-real-password');
    await verifyPassword(password, await dummyHash);
  }

  if (!row || !ok || row.disabled) {
    await audit(env, request, 'login_failure', row?.id ?? null, { login: login.slice(0, 64) });
    throw new HttpError(401, 'Incorrect username or password', 'bad_credentials');
  }

  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(Date.now(), row.id).run();
  await audit(env, request, 'login_success', row.id);
  const token = await createSession(env, request, row.id);
  return json({ user: toPublicUser(row) }, { headers: { 'Set-Cookie': sessionCookie(token) } });
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = parseCookies(request.headers.get('Cookie')).get(SESSION_COOKIE);
  if (token && token.length <= 128) {
    const id = await sha256Hex(token);
    const row = await env.DB.prepare('DELETE FROM sessions WHERE id = ? RETURNING user_id').bind(id).first<{ user_id: string }>();
    if (row) await audit(env, request, 'logout', row.user_id);
  }
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  return json({ user: await getSessionUser(request, env) });
}
