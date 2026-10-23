# 1. Infrastructure

Everything Epic Board Games runs on, where it is, and how it's wired. The source of
truth is [`wrangler.jsonc`](../../wrangler.jsonc) at the repo root — this chapter
explains it in plain language.

## The whole thing is one Worker

There is **no separate frontend host and backend host**. A single Cloudflare Worker,
`epic-board-games`, does both jobs:

```
Browser ──► Cloudflare edge ──► Worker (epic-board-games)
                                   │
                                   ├─ URL starts with /api/*  ──► your backend code (worker/src/index.ts)
                                   └─ anything else           ──► static website files (apps/web/dist)
```

This is configured by the `assets` block in `wrangler.jsonc`:

- `"directory": "./apps/web/dist"` — the built Astro site is uploaded with the Worker.
- `"run_worker_first": ["/api/*"]` — only `/api/*` requests run your code; everything
  else is served straight from static assets (fast, cached at the edge, free).
- `"not_found_handling": "404-page"` — unknown paths serve the 404 page.

So "deploying" uploads the website **and** the backend together in one step.

## Environments

| | Production | Testing |
|---|---|---|
| Worker name | `epic-board-games` | `epic-board-games-testing` |
| Deployed from branch | `main` | `testing` |
| Deploy command | `npm run deploy:production` | `npm run deploy:testing` |
| `APP_ENV` var | `production` | `testing` |
| D1 database | `epic-board-games` | `epic-board-games-testing` |
| D1 database ID | `a76b84ee-39fe-4897-9884-cbaa29d4cac4` | `e0f51a44-cc6c-4164-9819-3313ffbf14f4` |
| KV namespace ID | `6092f1a144ac4d4ebf73c2fee726bfd6` | `f12b2ea5f7a54484856a59df950e70b3` |
| Nightly cron | `17 3 * * *` (03:17 UTC) | `47 3 * * *` (03:47 UTC) |
| URL | `epic-board-games.sarkkarijobseva.workers.dev` | `epic-board-games-testing.sarkkarijobseva.workers.dev` |

The two environments share **nothing** at runtime — separate databases, separate KV,
separate Durable Objects. Breaking testing cannot touch production data. In
`wrangler.jsonc`, production is the top-level config and testing is the `env.testing`
block.

## Resources (bindings) and what each is for

A "binding" is the name your code uses to reach a resource. They're in
[`worker/src/env.ts`](../../worker/src/env.ts).

| Binding | Type | Purpose | Where used |
|---------|------|---------|-----------|
| `ASSETS` | Static Assets | Serves the website files | `worker/src/index.ts` `fetch()` |
| `DB` | D1 (SQLite) | All persistent user data — accounts, friends, game history, audit log | everywhere in `worker/src` |
| `KV` | KV store | Fast key-value cache (e.g. ephemeral lookups) | available, light use today |
| `GAME_ROOM` | Durable Object | One live game's state + WebSocket connections | `worker/src/durable/game-room.ts` |
| `MATCHMAKER` | Durable Object | The matchmaking queue per game | `worker/src/durable/matchmaker.ts` |
| `PRESENCE` | Durable Object | Who's online / friend presence | `worker/src/durable/presence.ts` |
| `AUTH_LIMITER` | Rate Limit | Brute-force protection on login/signup (10 req / 60s per IP+key) | `worker/src/auth.ts`, `account.ts` |
| `API_LIMITER` | Rate Limit | Coarse abuse limit on all API (120 req / 60s per IP) | `worker/src/index.ts` |
| `TURN_KEY_ID` | Secret | Voice chat TURN relay key ID (optional) | `worker/src/voice.ts` |
| `TURN_API_TOKEN` | Secret | Voice chat TURN relay token (optional) | `worker/src/voice.ts` |

### Durable Objects

Durable Objects (DOs) are tiny stateful servers — each live game and each matchmaking
queue is one DO instance, so players in the same room all talk to the same object over
WebSockets. They use **SQLite-backed storage** (declared by
`"new_sqlite_classes": ["GameRoom", "Matchmaker", "Presence"]` under `migrations`).

DO state is **transient game state**, not your system of record. When a game ends, the
result is written to D1 (`game_sessions` / `game_players`); the DO's own storage is not
something you back up.

### Secrets vs vars

- **vars** (`APP_ENV`) are plain config, committed in `wrangler.jsonc`.
- **secrets** (`TURN_KEY_ID`, `TURN_API_TOKEN`) are never committed. Set them with:
  ```bash
  npx wrangler secret put TURN_KEY_ID                 # production
  npx wrangler secret put TURN_KEY_ID --env testing   # testing
  ```
  For **local dev**, copy `.dev.vars.example` to `.dev.vars` (git-ignored) and fill it in.
- Voice is optional: with no TURN secrets the app falls back to STUN-only, which works on
  most home networks.

## Scheduled job (cron)

The Worker's `scheduled()` handler (bottom of
[`worker/src/index.ts`](../../worker/src/index.ts)) runs nightly and does **data
retention cleanup** only:

- deletes expired `sessions`,
- deletes `notifications` and `audit_log` rows older than 90 days,
- deletes unhandled `contact_messages` older than 180 days.

This is what keeps the privacy policy's retention promises true. If you add more
scheduled work, add it here and keep it idempotent (safe to run twice).

## How a request flows (end to end)

1. Request hits the Cloudflare edge for `*.workers.dev`.
2. If the path is **not** `/api/*` → served from static assets. Done.
3. If it **is** `/api/*` → `handleApi()`:
   - State-changing methods and WebSocket upgrades get a **same-origin (CSRF) check**.
   - Non-WebSocket requests pass through `API_LIMITER`.
   - The URL is matched against `ROUTES` (a table of regex + handler).
   - The handler runs, talks to `DB`/DOs/KV, returns JSON.
   - `withApiHeaders()` adds security headers to every response.

## Authenticating the CLI

All `wrangler` commands need credentials. They live in the git-ignored `.env.cloudflare`
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Load them into your shell for a session:

```bash
set -a; . ./.env.cloudflare; set +a
npx wrangler whoami    # confirms you're authenticated
```

## Where to change infrastructure

| I want to… | Edit |
|------------|------|
| Add a KV namespace, DO, queue, R2 bucket, etc. | `wrangler.jsonc` (both top-level and `env.testing`), then `npx wrangler types` |
| Change a rate limit | the `ratelimits` blocks in `wrangler.jsonc` |
| Change the cron schedule | the `triggers.crons` in `wrangler.jsonc` and the logic in `index.ts` `scheduled()` |
| Add a secret | `npx wrangler secret put NAME [--env testing]` |
| Add an API route | `ROUTES` in `worker/src/index.ts` (see [making-changes.md](./making-changes.md)) |
