# 8. Security

Every security control already in the code, why it's there, and a prioritised list of how to
go further. Each item cites the file so you can review or change it.

## What's already implemented

### Passwords

- **Hashed with PBKDF2-SHA256, 100,000 iterations, a unique 16-byte random salt per user.**
  Plaintext passwords are never stored. (`worker/src/security.ts` → `hashPassword`,
  `PBKDF2_ITERATIONS`.)
- The iteration count is **stored per user** (`password_iterations` column), so you can raise
  the cost later without breaking existing logins.
- Verification is **constant-time** (`timingSafeEqual`) to avoid timing attacks.
- **Minimum length 10, maximum 128** (`validatePassword`).
- Login against an **unknown** username still runs a dummy hash (`dummyHash` in `auth.ts`), so
  response timing doesn't reveal whether a username exists.

### Sessions

- The session token is a **256-bit random value**; only its **SHA-256 hash** is stored in the
  `sessions` table. A database leak **cannot be replayed** as a login. (`auth.ts` →
  `createSession`, `getSessionUser`.)
- Cookie is **`__Host-ebg_session`**: the `__Host-` prefix forces `Secure`, `Path=/` and no
  `Domain`, so a sibling subdomain can't set or overwrite it. Also **`HttpOnly`** (JS can't
  read it) and **`SameSite=Lax`**. (`security.ts` → `sessionCookie`.)
- **30-day expiry**, enforced in the query (`expires_at > now`) and cleaned up nightly.
- **Changing your password revokes every other session** (`account.ts` →
  `handleChangePassword`).
- Disabled accounts (`disabled = 1`) can't resolve a session.

### CSRF

- Every **state-changing** request (POST/PATCH/DELETE) and every **WebSocket upgrade** must be
  **same-origin** — the `Origin` header must match the host, else `403`. (`security.ts` →
  `assertSameOrigin`; enforced in `index.ts` `handleApi`.) Browsers always send `Origin` on
  cross-origin writes and WS handshakes, so this is a solid CSRF defence.

### Rate limiting / brute force

- **`AUTH_LIMITER`** — 10 requests / 60s, keyed by **IP + action + username/user** on login,
  signup and re-auth (password change, delete, export). Makes credential stuffing and
  password guessing impractical. (`auth.ts` `enforceAuthRateLimit`, `account.ts`
  `checkPassword`.)
- **`API_LIMITER`** — 120 requests / 60s per IP across the whole API. (`index.ts`.)

### Input validation & request hardening

- **Strict validators** for username (`^[a-z0-9_]{3,20}$`), email, display name
  (strips control/bidi chars), avatar (emoji only). (`security.ts`.)
- **JSON body size cap** (16 KB) and a required `application/json` content type
  (`http.ts` → `readJson`). Blocks oversized-payload abuse.
- **Parameterised SQL everywhere** (D1 prepared statements with `.bind(...)`) — no string
  concatenation, so no SQL injection.
- **UUID-shaped route params** are constrained by the route regex (e.g. friend/room ids), so
  malformed ids never reach handlers.

### Response headers (on every `/api/*` response)

From `http.ts` `API_HEADERS`:

- `Cache-Control: no-store` — API responses never cached.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY` + `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
  — API can't be framed or used as a script source.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Cross-Origin-Resource-Policy: same-origin`.
- Errors are sanitised — internal errors are logged server-side but the client only sees a
  generic message (`index.ts` `fetch` catch), so stack traces never leak.

### Privacy & auditing

- **Audit log** of security events (signup, login success/failure, logout, password change,
  re-auth failure, export, delete) with IP and user agent, **never secrets**. (`auth.ts`
  `audit`.)
- **Data export and deletion** are self-service and re-authenticated (GDPR). (`account.ts`.)
- **Retention**: sessions, notifications and audit logs auto-expire (90 days); contact
  messages (180 days). (`index.ts` `scheduled`.)
- **Consent & age gate** at signup: `acceptTerms` is required and audited; the app states a
  13+ minimum. (`auth.ts` `handleSignup`.)
- Account enumeration is minimised — signup/login errors don't reveal which field collided.

### Secrets handling

- TURN secrets are **Wrangler secrets**, never in git; `.dev.vars` (local) and
  `.env.cloudflare` (CLI token) are git-ignored.

## How to enhance it — prioritised

### High value, low effort

1. **Add a Content-Security-Policy to the HTML pages**, not just the API. Right now the
   website pages have no CSP header. Add one via a Worker response transform or Astro so that
   even if an XSS slips in, script sources are restricted. (Do this *before* adding ad/analytics
   scripts, and whitelist exactly those hosts — see
   [monetization.md](./monetization.md).)
2. **Turnstile on signup/login/contact.** You have the `turnstile-spin` skill available.
   Cloudflare Turnstile blocks bots without annoying users — a strong complement to the rate
   limiter for stopping automated signups and contact spam.
3. **Add `HSTS`** (`Strict-Transport-Security`) on HTML responses so browsers refuse plain
   HTTP. (workers.dev is HTTPS-only already, but it matters once you add a custom domain.)
4. **Alert on audit anomalies.** A tiny addition to the nightly cron: count
   `login_failure` / `reauth_failure` per IP in the last day and log/notify if a threshold is
   crossed. Early warning of an attack.

### Medium

5. **Email verification + password reset.** Today there's no email flow (no email provider is
   wired). Adding verified email enables password reset and reduces fake accounts. Use the
   `cloudflare-email-service` skill; add a `email_verified` column (migration) and tokenised
   verify/reset endpoints (reuse the `randomToken` + hash-stored pattern from sessions).
6. **Raise PBKDF2 cost or move to a memory-hard KDF** as hardware improves. Because
   `password_iterations` is per-user, you can bump new hashes and re-hash on next login. (The
   Workers runtime caps PBKDF2 at 100k; if you need stronger, consider hashing at a verified
   edge boundary or a dedicated service.)
7. **Per-account lockout / step-up** after N failed logins (beyond the per-IP limiter), to
   resist distributed guessing against one account.
8. **Security headers audit**: run the deployed site through https://securityheaders.com and
   https://observatory.mozilla.org and close any gaps they flag.

### Ongoing hygiene

9. **Dependabot is already configured** (there's a dependabot branch in git) — keep merging
   its PRs promptly; most real-world breaches are known-CVE dependencies.
10. **Rotate the Cloudflare API token** periodically and scope it to least privilege (only the
    permissions deploy/D1/KV need).
11. **Review the audit log** occasionally for unusual patterns (many `login_failure` from one
    IP, mass signups).
12. **Run `npm run test`** — `worker/test/security.test.ts` covers the security helpers; add
    cases when you touch auth.
13. **Principle of least privilege for secrets** — never log them, never return them in API
    responses, keep `.env.cloudflare` backed up but private.

## Quick self-check before any auth-related change

- [ ] Still parameterised SQL (no string building)?
- [ ] New state-changing route → covered by the same-origin check automatically (it is, via
      `handleApi`) and rate limited?
- [ ] Any new sensitive action re-verifies the password and writes an `audit` row?
- [ ] No secret or internal error detail in any response body?
- [ ] Tests updated in `worker/test/`?
