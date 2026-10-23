# 2. Managing users and their data on Cloudflare

Everything about where user data lives, how to look at it, change it, export it and delete
it — and how to stay on the right side of privacy law. The schema source of truth is
[`migrations/0001_init.sql`](../../migrations/0001_init.sql).

## Where each kind of data lives

| Data | Store | Notes |
|------|-------|-------|
| Accounts, profiles, passwords (hashed) | **D1** `users` | the system of record |
| Login sessions | **D1** `sessions` | only a hash of the token is stored |
| Friends / family / blocks | **D1** `friendships` | |
| In-app notifications | **D1** `notifications` | auto-deleted after 90 days |
| Finished game history | **D1** `game_sessions`, `game_players` | kept anonymously after account deletion |
| Security/audit trail | **D1** `audit_log` | signup, logins, deletes… auto-deleted after 90 days |
| Contact-form messages | **D1** `contact_messages` | auto-deleted after 180 days if unhandled |
| **Live** game state (a game in progress) | **Durable Objects** | transient; not a backup target |

**There is no user data outside Cloudflare.** No third-party database, no analytics
vendor, no ad network (today). That makes privacy compliance much simpler.

## The database schema at a glance

```
users ──1:N──► sessions           (a user has many login sessions)
users ──M:N──► friendships         (friend / family / blocked, one row per pair)
users ──1:N──► notifications
users ──1:N──► game_players ──N:1──► game_sessions
users ──1:N──► audit_log
contact_messages                   (standalone; may reference nothing)
```

Key design choices (already implemented — don't undo them):

- **Passwords are never stored.** Only a PBKDF2-SHA256 hash + per-user salt (see
  [security.md](./security.md)).
- **Session tokens are never stored** — only `SHA-256(token)`. A database leak can't be
  replayed as a login.
- **Deleting a user cascades**: sessions, friendships and notifications are removed. Game
  history rows are **kept but anonymised** (`user_id` set to NULL) so opponents keep their
  stats. This is intentional and privacy-safe.
- All timestamps are **Unix epoch milliseconds**.

## Looking at / editing data with Wrangler

First authenticate (see [infrastructure.md](./infrastructure.md)):

```bash
set -a; . ./.env.cloudflare; set +a
```

Every command below uses the binding name `DB`. Add `--env testing` to target the testing
database; **omit it for production**. Use `--remote` to hit the real cloud database (the
default without it is your *local* dev copy).

> ⚠️ **`--remote` writes to live data.** Always `SELECT` before you `UPDATE`/`DELETE`, and
> prefer doing destructive things on `--env testing` first.

### Count users / recent signups

```bash
npx wrangler d1 execute DB --remote --command \
  "SELECT COUNT(*) AS users FROM users;"

npx wrangler d1 execute DB --remote --command \
  "SELECT username, email, datetime(created_at/1000,'unixepoch') AS joined
   FROM users ORDER BY created_at DESC LIMIT 20;"
```

### Find one user (never select the password columns unless you must)

```bash
npx wrangler d1 execute DB --remote --command \
  "SELECT id, username, email, display_name, disabled,
          datetime(last_login_at/1000,'unixepoch') AS last_login
   FROM users WHERE username = 'someusername';"
```

### Suspend / un-suspend an account (instead of deleting)

`disabled = 1` blocks login and hides the user without destroying data. This is the right
tool for abuse — reversible, auditable.

```bash
npx wrangler d1 execute DB --remote --command \
  "UPDATE users SET disabled = 1, updated_at = (strftime('%s','now')*1000)
   WHERE username = 'baduser';"
```

Set it back to `0` to restore.

### Force-log-out a user (revoke all their sessions)

```bash
npx wrangler d1 execute DB --remote --command \
  "DELETE FROM sessions WHERE user_id =
     (SELECT id FROM users WHERE username = 'someuser');"
```

### Read the audit trail for a user

```bash
npx wrangler d1 execute DB --remote --command \
  "SELECT event, ip, datetime(created_at/1000,'unixepoch') AS at
   FROM audit_log WHERE user_id =
     (SELECT id FROM users WHERE username='someuser')
   ORDER BY created_at DESC LIMIT 50;"
```

### Read contact-form messages

```bash
npx wrangler d1 execute DB --remote --command \
  "SELECT id, name, email, substr(message,1,80) AS preview,
          datetime(created_at/1000,'unixepoch') AS at, handled_at
   FROM contact_messages ORDER BY created_at DESC LIMIT 50;"
```

Mark one handled so the nightly job can clean it up later:

```bash
npx wrangler d1 execute DB --remote --command \
  "UPDATE contact_messages SET handled_at = (strftime('%s','now')*1000) WHERE id = 123;"
```

## What users can already do themselves (self-service, no admin needed)

These are built into the app and satisfy GDPR "data portability" and "right to erasure".
Code: [`worker/src/account.ts`](../../worker/src/account.ts).

| Action | Endpoint | What it does |
|--------|----------|--------------|
| Change password | `POST /api/auth/password` | Re-checks current password, re-hashes, **signs out all other devices**. |
| Export my data | `GET /api/account/export` | Downloads a JSON of account, friends, notifications, game history and sessions. |
| Delete my account | `DELETE /api/account` | Re-checks password, deletes the user (cascades; game history anonymised). |

Every one of these re-verifies the password and is written to `audit_log`.

## Handling a manual data request ("please delete me" by email)

1. Verify it's really them (they should use the in-app **Delete account** button — that's
   the audited, authenticated path).
2. If you must do it manually, find the user, then:
   ```bash
   npx wrangler d1 execute DB --remote --command \
     "DELETE FROM users WHERE username = 'theuser';"
   ```
   The cascade handles sessions/friends/notifications; game history is anonymised
   automatically.
3. For a data **export** on their behalf, run the four `SELECT`s from
   `handleExportAccount` in `account.ts`, or just ask them to use the in-app export.

## Retention — what gets auto-deleted and when

The nightly cron (`scheduled()` in `worker/src/index.ts`) enforces:

| Data | Kept for |
|------|----------|
| Expired sessions | until expiry, then removed nightly |
| Notifications | 90 days |
| Audit log | 90 days |
| Unhandled contact messages | 180 days |
| Accounts & game history | indefinitely (until the user deletes their account) |

If you change these windows, update the number in `index.ts`, the
[Privacy page](../../apps/web/src/pages) and this table together.

## Changing the schema

Never edit an applied migration. Add a new one — full steps in
[making-changes.md](./making-changes.md#database-migrations). D1 migrations are plain SQL
files in [`migrations/`](../../migrations), applied in filename order.
