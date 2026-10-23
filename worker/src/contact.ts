// Contact form: stores messages in D1 for the team to read. No email provider
// is wired yet, so nothing leaves the platform; a honeypot and the auth rate
// limiter keep bots out.

import { getSessionUser } from './auth';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import { clientIp, normalizeEmail } from './security';

const TOPICS = new Set(['bug', 'feature', 'account', 'privacy', 'business', 'other']);
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

const clean = (raw: unknown, max: number): string =>
  typeof raw === 'string' ? raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '';

/** POST /api/contact `{ name, email, topic, message, website? }` */
export async function handleContact(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  // Bots fill every field, including the hidden one; humans never see it.
  if (typeof body.website === 'string' && body.website.length > 0) return json({ ok: true });

  const { success } = await env.AUTH_LIMITER.limit({ key: `${clientIp(request)}:contact` });
  if (!success) throw new HttpError(429, 'Too many messages. Please wait a minute and try again.', 'rate_limited');

  const name = clean(body.name, 60);
  const email = normalizeEmail(body.email);
  const topic = typeof body.topic === 'string' && TOPICS.has(body.topic) ? body.topic : 'other';
  const message = clean(body.message, MESSAGE_MAX);
  if (!name) throw new HttpError(400, 'Please tell us your name');
  if (!email) throw new HttpError(400, 'Please enter a valid email address');
  if (message.length < MESSAGE_MIN) throw new HttpError(400, 'Please write a few more words so we can help');

  const user = await getSessionUser(request, env);
  await env.DB.prepare(
    'INSERT INTO contact_messages (id, user_id, name, email, topic, message, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), user?.id ?? null, name, email, topic, message, clientIp(request), request.headers.get('User-Agent')?.slice(0, 256) ?? null, Date.now())
    .run();
  return json({ ok: true }, { status: 201 });
}
