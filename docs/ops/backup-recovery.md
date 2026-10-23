# 7. Backup & disaster recovery

How to back up the one thing that matters (the D1 database), restore it, roll back a bad
deploy, and what to do when the site is down. Static files and code are already safe (they're
rebuilt from git), so **the database is the only irreplaceable state.**

## What needs backing up — and what doesn't

| Data | Backup needed? | Why |
|------|----------------|-----|
| D1 database (`users`, `game_sessions`, …) | **YES** | the only irreplaceable user data |
| Website files / Worker code | No | rebuilt from git at any time |
| Durable Object state (live games) | No | transient; a game in progress is not worth DR |
| KV | Usually no | cache/ephemeral; rebuilds itself |
| Secrets (`TURN_*`) | Keep a copy offline | not stored in git; you'd re-enter them |

## Backing up the database

Export the whole D1 database (schema + data) to a local `.sql` file. Authenticate first
(`set -a; . ./.env.cloudflare; set +a`).

```bash
# PRODUCTION backup
npx wrangler d1 export DB --remote \
  --output "backups/prod-$(date +%Y%m%d-%H%M%S).sql"

# TESTING backup
npx wrangler d1 export DB --env testing --remote \
  --output "backups/testing-$(date +%Y%m%d).sql"
```

- Schema only (handy before a migration): add `--no-data`.
- **Always back up production right before applying a migration** (see
  [making-changes.md](./making-changes.md#database-migrations)).

> Store backups **off this machine** — commit them to a private backup repo, or upload to
> R2/Drive. A backup sitting only on the same laptop isn't disaster recovery. Note the file
> contains hashed passwords and emails: treat it as sensitive, keep it private.

### Automating backups

Two good options:

1. **Local scheduled task** (simplest): a Windows Task Scheduler job running the export
   command weekly into a synced folder.
2. **Scheduled Worker → R2** (fully in-cloud): add a weekly cron that reads the data and
   writes a dump to an R2 bucket. More work; do it once backups matter enough to automate.

Cloudflare also keeps **D1 Time Travel** automatically (point-in-time restore within a
retention window) — see restore below. Your own exports are still worth having for long-term
and off-platform copies.

## Restoring the database

### Option A — D1 Time Travel (fastest, no file needed)

D1 can roll the database back to an earlier point in time within its retention window.

```bash
# See the current restore bookmark / timestamp options
npx wrangler d1 time-travel info DB --remote

# Restore to a timestamp (production)
npx wrangler d1 time-travel restore DB --remote --timestamp "2026-10-22T00:00:00Z"
```

Use this for "we deleted/corrupted data an hour ago" — it's the quickest undo.

### Option B — restore from your own export

```bash
# Into testing first, to verify the dump is good:
npx wrangler d1 execute DB --env testing --remote --file "backups/prod-YYYYMMDD-HHMMSS.sql"
```

> Restoring into a non-empty database can conflict. For a clean restore you typically restore
> into a freshly created empty database, point the binding's `database_id` at it in
> `wrangler.jsonc`, and redeploy. Practise this on testing before you ever need it on prod.

## Roll back a bad deploy

Every deploy is an immutable **version**. If a release breaks the site, roll back in seconds —
no rebuild needed.

```bash
# List recent versions
npx wrangler versions list                 # production
npx wrangler versions list --env testing    # testing

# Roll back to the previous version
npx wrangler rollback                        # production
# or to a specific version id:
npx wrangler rollback <VERSION_ID>
```

Rollback reverts **code and static assets**. It does **not** revert database migrations — if
the bad deploy also ran a migration, restore the DB separately (above). This is why you back
up before migrating.

## "The site is down" — runbook

Work top to bottom; stop when it's fixed.

1. **Confirm it's really down and where.**
   ```bash
   curl -i https://epic-board-games.sarkkarijobseva.workers.dev/api/health
   ```
   - `{"ok":true,...}` → the API is fine; the problem is likely the frontend or a specific
     page, not infra.
   - Times out / 5xx → continue.

2. **Check Cloudflare status.** https://www.cloudflarestatus.com — if Cloudflare itself is
   degraded, there's nothing to fix on your side; wait and monitor.

3. **Look at live logs** to see the actual error:
   ```bash
   npx wrangler tail                # production, live
   npx wrangler tail --status error
   ```
   Unhandled API errors are logged server-side (see `fetch()` catch in `index.ts`).

4. **Did it break right after a deploy?** Roll back (above). This fixes most self-inflicted
   outages instantly.

5. **Database errors in the logs** (D1 unavailable, constraint failures)?
   ```bash
   npx wrangler d1 execute DB --remote --command "SELECT 1;"
   ```
   - Fails → D1 incident (check status page) or the binding/ID is wrong in `wrangler.jsonc`.
   - A migration gone wrong → restore via Time Travel.

6. **Rate limiting / overload?** A flood of `429`s in logs means the limiters are doing their
   job; check for abuse (one IP) in the `audit_log` and Cloudflare Security analytics.

7. **Still stuck?** Redeploy a known-good version from a clean `main` checkout:
   ```bash
   npm run deploy:production
   ```

8. **Communicate.** If it's user-visible and prolonged, note it (and later, consider a simple
   status note on the site).

## Recovery readiness checklist

- [ ] A production DB export exists off this machine, < 1 week old.
- [ ] You've successfully restored an export **into testing** at least once (a backup you've
      never restored is a guess, not a backup).
- [ ] You know the last-known-good version id (`wrangler versions list`).
- [ ] `TURN_*` secrets are saved somewhere safe offline.
- [ ] `.env.cloudflare` (API token) is backed up securely — without it you can't run any of
      the recovery commands.
