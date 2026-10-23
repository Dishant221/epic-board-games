# Operations handbook — Epic Board Games

This is the single entry point for running, changing, scaling, monetising, backing up
and securing Epic Board Games on Cloudflare. Each chapter is a standalone file so you
can edit one area without touching the rest.

> **Audience:** you (the owner/operator). It assumes no prior Cloudflare knowledge and
> spells out every command. Everything here is grounded in the actual code and config
> in this repo, not generic advice.

## The 60-second mental model

- One **Cloudflare Worker** (`epic-board-games`) serves *both* the website (the built
  Astro site in `apps/web/dist`, served as static assets) **and** the `/api/*` backend.
  There is no separate server. See [infrastructure.md](./infrastructure.md).
- **User accounts, friends, game history and audit logs** live in **D1** (Cloudflare's
  SQLite). Live game state lives in **Durable Objects**. Sessions/cache helpers use **KV**.
  See [user-data.md](./user-data.md).
- Two environments: **testing** (deployed from the `testing` branch) and **production**
  (deployed from `main`). They have *separate* databases, so you can break testing safely.

## Chapters

| # | File | What it answers |
|---|------|-----------------|
| 1 | [infrastructure.md](./infrastructure.md) | What's deployed, every resource and binding, how the two environments are wired, all the IDs. |
| 2 | [user-data.md](./user-data.md) | Where user data lives, the full database schema, how to view/edit/export/delete a user, GDPR/erasure, retention. |
| 3 | [making-changes.md](./making-changes.md) | Day-to-day: how to change code, run locally, migrate the DB, deploy to testing then production, roll back. |
| 4 | [scaling.md](./scaling.md) | What the free/paid limits are, what breaks first, and exactly what to do when traffic grows. |
| 5 | [monetization.md](./monetization.md) | Add Google AdSense (or Ezoic/Media.net/etc.) the compliant way, with the consent banner you legally need. |
| 6 | [analytics-seo.md](./analytics-seo.md) | Google Search Console + Google Analytics 4 setup, sitemaps, and SEO that's already built in. |
| 7 | [backup-recovery.md](./backup-recovery.md) | Back up the database, restore it, roll back a bad deploy, and a step-by-step "the site is down" runbook. |
| 8 | [security.md](./security.md) | Every security control already implemented, why, and a prioritised list of how to harden further. |
| 9 | [contactus.md](./contactus.md) | How the Contact us form works, where messages are stored, how to read/manage them, and every setting to configure. |

## Related docs already in the repo

- [`../../README.md`](../../README.md) — project overview, architecture, first-deploy steps.
- [`../../planchange.md`](../../planchange.md) — "where do I change X" function map for the code itself.
- [`../dev/game-contract.md`](../dev/game-contract.md) — the contract for building a new game.

## Key facts you'll need constantly

| Thing | Value |
|-------|-------|
| Cloudflare account ID | `05607df215f6fbb6d85e742ca0e6bc59` |
| workers.dev subdomain | `sarkkarijobseva` |
| Production Worker | `epic-board-games` (branch `main`) |
| Testing Worker | `epic-board-games-testing` (branch `testing`) |
| Testing URL | https://epic-board-games-testing.sarkkarijobseva.workers.dev |
| Credentials file (git-ignored) | `.env.cloudflare` — load with `set -a; . ./.env.cloudflare; set +a` |

> **Golden rule:** never push straight to `main`. Deploy and test on `testing`, then open a
> PR `testing → main` for production.
