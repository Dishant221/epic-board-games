# 3. Making changes & deploying

The day-to-day loop: change code, test locally, ship to testing, then production. For
*where in the code* to change a given feature, see
[`../../planchange.md`](../../planchange.md). This chapter is about the **process**.

## Prerequisites (once per machine)

- Node.js + npm, then `npm install` at the repo root (it's an npm-workspaces monorepo).
- Authenticate Wrangler for any deploy or DB command:
  ```bash
  set -a; . ./.env.cloudflare; set +a
  ```
- There is **no local Rust toolchain and no `gh` CLI** here — don't rely on them.

## The branches

- `main` → **production**. Never push to it directly.
- `testing` → **testing site**. Do your work here.
- Flow: commit to `testing` → `npm run deploy:testing` → verify on the testing URL →
  open a PR `testing → main` → merge → deploy production.

## Local development

```bash
npm run dev        # builds the web app, then runs `wrangler dev` (full stack locally)
# or, for just the website with hot reload:
npm run dev:web
```

`wrangler dev` uses **local** D1/KV/DO by default (data in `.wrangler/state`), so you can't
hurt real data. Local secrets come from `.dev.vars`.

Apply migrations to your local DB before testing DB features:

```bash
npm run db:migrate:local
```

## Before every deploy — the checks

```bash
npm run typecheck   # tsc for game-core + worker, astro check for the web app
npm run test        # vitest (unit tests for game rules, security helpers, etc.)
npm run build       # builds apps/web/dist
```

> **Windows gotcha:** if the build crashes with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`,
> a stray dev server is holding resources. Kill it first:
> ```bash
> taskkill //F //IM workerd.exe
> taskkill //F //IM wrangler.exe    # if present
> ```

## Deploy

```bash
# testing (from the `testing` branch)
npm run deploy:testing       # = npm run build && wrangler deploy --env testing

# production (from `main`, after the PR is merged)
npm run deploy:production     # = npm run build && wrangler deploy --env=""
```

A deploy uploads the website **and** the Worker code together. Each deploy creates a new
immutable **version** you can roll back to (see
[backup-recovery.md](./backup-recovery.md#roll-back-a-bad-deploy)).

After deploying, smoke-test:

```bash
curl https://epic-board-games-testing.sarkkarijobseva.workers.dev/api/health
# → {"ok":true,"env":"testing"}
```

## Adding an API endpoint

1. Write the handler in a file under `worker/src/` (e.g. `export async function handleX(request, env)`).
   Return via the `json()` helper; throw `HttpError(status, msg, code)` for errors.
2. Register it in the `ROUTES` table in [`worker/src/index.ts`](../../worker/src/index.ts):
   ```ts
   { method: 'POST', pattern: /^\/api\/my\/thing$/, handler: handleX },
   ```
3. State-changing methods automatically get the CSRF (same-origin) check and rate limiting —
   you don't add those yourself.
4. If it needs auth, call `await requireUser(request, env)` at the top (from `./auth`).
5. Add a test in `worker/test/`, run `npm run test`.

## Database migrations

D1 migrations are append-only SQL files in [`migrations/`](../../migrations), applied in
order. **Never edit a migration that's already been applied** — add a new one.

1. Create the file, numbered next in sequence, e.g. `migrations/0003_add_setting.sql`:
   ```sql
   ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
   ```
2. Apply locally and test:
   ```bash
   npm run db:migrate:local
   ```
3. Apply to **testing**, verify the app still works:
   ```bash
   npx wrangler d1 migrations apply DB --env testing --remote
   ```
4. Apply to **production** (during the production deploy):
   ```bash
   npx wrangler d1 migrations apply DB --remote
   ```

Take a backup before step 4 — see
[backup-recovery.md](./backup-recovery.md#backing-up-the-database).

## Changing config / resources

Edit [`wrangler.jsonc`](../../wrangler.jsonc) — remember most blocks exist **twice** (top
level for production and under `env.testing`). After changing bindings, regenerate types:

```bash
npx wrangler types
```

## Commit & PR conventions

- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- Pull request descriptions end with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```
- Keep commits scoped; run `npm run typecheck && npm run test` before committing.

## GitHub Actions (CI/CD)

CI lives in `.github/`. For the GitHub **deploy** job to work it needs repository secrets
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) and the `SITE_URL` variable. Until those
are set, deploy by hand with the `npm run deploy:*` commands above. When CI's D1 step fails,
it's almost always the missing secrets.
