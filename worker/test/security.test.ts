import { describe, expect, it } from 'vitest';
import { HttpError, readJson } from '../src/http';
import {
  SESSION_COOKIE,
  assertSameOrigin,
  clearSessionCookie,
  hashPassword,
  isSameOrigin,
  normalizeAvatar,
  normalizeDisplayName,
  normalizeEmail,
  normalizeUsername,
  parseCookies,
  randomToken,
  sessionCookie,
  sha256Hex,
  timingSafeEqual,
  validatePassword,
  verifyPassword,
} from '../src/security';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correct horse battery', 1_000);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterY', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    const a = await hashPassword('same password!', 1_000);
    const b = await hashPassword('same password!', 1_000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('timingSafeEqual', () => {
  it('compares contents and lengths', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
  });
});

describe('tokens', () => {
  it('produces url-safe 32-byte tokens', () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
  });

  it('hashes to lowercase hex SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('cookies', () => {
  it('parses cookie headers and keeps the first duplicate', () => {
    const c = parseCookies(`a=1; ${SESSION_COOKIE}=tok%2Fen; a=2; broken; x=%E0%A4%A`);
    expect(c.get('a')).toBe('1');
    expect(c.get(SESSION_COOKIE)).toBe('tok/en');
    expect(c.has('x')).toBe(false);
  });

  it('sets a hardened __Host- session cookie', () => {
    const cookie = sessionCookie('abc');
    expect(cookie).toMatch(/^__Host-ebg_session=abc;/);
    for (const attr of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=2592000']) expect(cookie).toContain(attr);
    expect(cookie).not.toContain('Domain');
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});

describe('origin checks', () => {
  const req = (origin?: string) =>
    new Request('https://play.example.com/api/auth/login', { method: 'POST', headers: origin ? { Origin: origin } : {} });

  it('accepts same origin only', () => {
    expect(isSameOrigin(req('https://play.example.com'))).toBe(true);
    expect(isSameOrigin(req('https://evil.example.com'))).toBe(false);
    expect(isSameOrigin(req('null'))).toBe(false);
    expect(isSameOrigin(req())).toBe(false);
    expect(() => assertSameOrigin(req('https://evil.example.com'))).toThrow(HttpError);
  });
});

describe('validators', () => {
  it('normalises usernames', () => {
    expect(normalizeUsername('  Dice_King ')).toBe('dice_king');
    expect(normalizeUsername('ab')).toBeNull();
    expect(normalizeUsername('has space')).toBeNull();
    expect(normalizeUsername('a'.repeat(21))).toBeNull();
  });

  it('normalises emails', () => {
    expect(normalizeEmail(' Player@Example.COM ')).toBe('player@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
  });

  it('enforces password length', () => {
    expect(validatePassword('short')).toMatch(/at least 10/);
    expect(validatePassword('long enough pw')).toBeNull();
    expect(validatePassword('x'.repeat(129))).toMatch(/at most/);
    expect(validatePassword(undefined)).toBeTruthy();
  });

  it('cleans display names', () => {
    expect(normalizeDisplayName('  Dice   King‮ ')).toBe('Dice King');
    expect(normalizeDisplayName('   ')).toBeNull();
    expect(normalizeDisplayName('x'.repeat(33))).toBeNull();
  });

  it('accepts single emoji avatars only', () => {
    expect(normalizeAvatar('🦊')).toBe('🦊');
    expect(normalizeAvatar('👩‍🚀')).toBe('👩‍🚀');
    expect(normalizeAvatar('🇮🇳')).toBe('🇮🇳');
    expect(normalizeAvatar('<script>')).toBeNull();
    expect(normalizeAvatar('')).toBeNull();
  });
});

describe('readJson', () => {
  const post = (body: string, type = 'application/json') =>
    new Request('https://x.test/api', { method: 'POST', headers: { 'Content-Type': type }, body });

  it('parses objects', async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
  });

  it('rejects wrong content type, bad JSON, non-objects and oversize bodies', async () => {
    await expect(readJson(post('{}', 'text/plain'))).rejects.toMatchObject({ status: 415 });
    await expect(readJson(post('{nope'))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(post('[1,2]'))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(post(JSON.stringify({ a: 'x'.repeat(100) })), 50)).rejects.toMatchObject({ status: 413 });
  });
});
