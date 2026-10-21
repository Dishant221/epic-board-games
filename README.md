# 🎲 Epic Board Games

Free multiplayer board games in the browser: online matchmaking (2–4 players, 60-second window), AI opponents with four personas, friends and family, pings, in-game text, emote and voice chat. It runs entirely on Cloudflare and is responsive from a 320px phone up to a 4K screen.

Specs: [`docs/specs/first-prompt.txt`](docs/specs/first-prompt.txt) and [`docs/specs/boardgame-addendum-ai-chat-responsive.md`](docs/specs/boardgame-addendum-ai-chat-responsive.md).

## Status

| Area | State |
|---|---|
| Snakes, Dragons & Ladders (3D, Three.js) | ✅ Playable: vs AI, pass & play, online |
| Connect 4 | ✅ Playable: vs AI (alpha-beta), pass & play, online |
| Tic Tac Toe | ✅ Playable: vs AI (perfect minimax), pass & play, online |
| Epic Business, Epic Puzzle, Crossword, Sudoku, Flappy Flyer, Chess, Checkers, Mahjong, Word Puzzle | 🕐 Listed with SEO pages, marked "coming soon" |
| Accounts, sessions, profiles | ✅ |
| Friends & family, requests, live notifications, "ping to play" | ✅ |
| Matchmaking (fills to max, or starts after 60s with 2+ players) | ✅ |
| Private rooms with invite link | ✅ |
| Text chat (moderation, rate limits), quick emotes, typing indicator | ✅ |
| Voice chat (WebRTC mesh, Cloudflare TURN, mute/deafen/per-player volume, speaking indicator) | ✅ |
| Rust/Wasm engine (Snakes & Ladders, Tic Tac Toe, Connect 4 + AI) | ✅ Built in CI. The site runs the TypeScript engine; the Wasm engine has the same rules and is not wired in yet |

## Architecture

```
Browser (Astro static pages + React islands)
  │  same origin: one Worker serves both static pages and /api
  ▼
Cloudflare Worker  (worker/src/index.ts)
  ├─ Static assets: apps/web/dist (SEO HTML, JS, CSS, _headers)
  ├─ /api/auth, profile, friends, notifications, rooms, voice ─► D1 (SQLite)
  ├─ Rate limiting (Workers Rate Limiting API) + KV (profanity list, ping cooldowns)
  └─ WebSockets (Hibernation API):
       ├─ Matchmaker DO (one per game): queue, 60s alarm, creates rooms
       ├─ GameRoom DO (one per room): authoritative engine, AI turns, chat, voice signaling
       └─ Presence DO (one per user): live notifications + online status

packages/game-core   Pure TypeScript rules, AI, protocol, chat moderation, layout.
                     The same code runs in the browser (vs AI) and in GameRoom (online),
                     so client and server can't disagree on the rules.
rust-game-engine     Rust → Wasm port of the engines and AI (wasm-pack, built in CI).
```

**Security and compliance**
- Passwords are hashed with PBKDF2-SHA256 using a per-user salt and a constant-time compare.
- Sessions use a `__Host-` cookie (HttpOnly, Secure, SameSite=Lax). Only a SHA-256 hash of the token is stored in D1.
- Every state-changing request and WebSocket upgrade must pass an `Origin` check, which blocks CSRF and cross-site WebSocket hijacking.
- Auth and API calls are rate limited. Login errors are generic, so they don't reveal which usernames exist, and security events go to an audit log.
- The server is authoritative. Every move is checked for turn order, legality and a turn counter, and dice are rolled server-side with a stored seed so games can be replayed.
- Chat strips control and bidi characters, filters profanity, and applies length, spam and rate limits.
- Pages get a hash-based CSP from Astro. `_headers` adds HSTS, frame-ancestors, nosniff, Referrer-Policy, a Permissions-Policy that allows the microphone only for this site, and COOP.
- Fonts are self-hosted, and there are no third-party trackers. The only cookie is the session cookie.
- Signup requires accepting the Terms and Privacy Policy, plus a 13+ age statement. Draft privacy and terms pages are included and **need legal review before launch**.
- CI runs CodeQL, and Dependabot is configured.

**SEO**
- Every page is static HTML.
- Each game has its own page with the rules as crawlable text and `VideoGame`, `HowTo` and `BreadcrumbList` JSON-LD.
- The home page has `WebSite`, `ItemList` and `FAQPage` JSON-LD.
- Canonical URLs, OpenGraph and Twitter cards, a sitemap and robots.txt are generated. Account pages are marked noindex.

## Repository layout

```
apps/web/             Astro site (pages, React islands, Three.js scene, styles, public/_headers)
packages/game-core/   Shared engine, AI, protocol, chat moderation, layout + tests
worker/               Worker router, auth, social APIs, Durable Objects + tests
migrations/           D1 schema
rust-game-engine/     Rust/Wasm engine + AI (see its README)
.github/workflows/    CI, deploy (testing → testing env, main → production), CodeQL
```

## Local development

Requires Node 22 or newer. Rust and wasm-pack are optional and only needed to build the Wasm engine locally.

```bash
npm install
cp .dev.vars.example .dev.vars          # optional: TURN credentials for voice relay
npm run db:migrate:local                # create the local D1 schema
npm run dev                             # build the site + wrangler dev → http://localhost:8787
```

For fast UI work, run `npm run dev:web`. It starts Astro with hot reload on :4321 and proxies `/api` to a `wrangler dev` running on :8787.

| Command | What it does |
|---|---|
| `npm test` | Unit tests for game rules, AI strength, chat moderation, protocol, layout, worker security |
| `npm run typecheck` | `tsc` for game-core and the worker, `astro check` for the web app |
| `npm run build` | Static site → `apps/web/dist` |
| `cd rust-game-engine && cargo test` | Rust engine tests |

## First deploy (one-time setup)

1. In Cloudflare, create the resources and paste their ids into `wrangler.jsonc`, replacing the placeholder ids:
   ```bash
   npx wrangler d1 create epic-board-games
   npx wrangler d1 create epic-board-games-testing
   npx wrangler kv namespace create KV
   npx wrangler kv namespace create KV --env testing
   ```
2. Optional, for voice relay on strict networks: create a TURN key under **Realtime → TURN**, then run
   `npx wrangler secret put TURN_KEY_ID` and `npx wrangler secret put TURN_API_TOKEN`, once without a flag for production and once with `--env testing`.
3. In GitHub → Settings:
   - Add the repository secrets `CLOUDFLARE_API_TOKEN` (Workers, D1, KV edit permissions) and `CLOUDFLARE_ACCOUNT_ID`.
   - Create the environments `testing` and `production`. Give each a `SITE_URL` variable, for example `https://epic-board-games-testing.<you>.workers.dev`.
   - Add required reviewers to `production`.
4. Push to `testing` to deploy the testing Worker. Merge to `main` to deploy production. Both deploys run the tests and the D1 migrations first.

## Roadmap

These follow the phases in the spec:
1. Load the Wasm engine in the browser and check that it matches the TypeScript engine.
2. Epic Business, the property-trading game, with the heuristic AI from the spec.
3. Epic Puzzle, with 20+ images, a scrolling piece tray and snapping.
4. Chess and Checkers, including the alpha-beta AI with piece-square tables.
5. Sudoku, Crossword, Word Puzzle, Mahjong and Flappy Flyer.
6. Achievements, and a ranked leaderboard that excludes AI games.
