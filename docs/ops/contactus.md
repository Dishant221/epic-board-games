# Contact Us — how it works and how to configure it

This covers the public **Contact us** page, the API behind it, where messages are
stored, how you read and manage them, and every setting you can change. Everything here
is grounded in the actual code:

- Page: [`apps/web/src/pages/contact.astro`](../../apps/web/src/pages/contact.astro)
- Form (React island): [`apps/web/src/components/common/ContactForm.tsx`](../../apps/web/src/components/common/ContactForm.tsx)
- API handler: [`worker/src/contact.ts`](../../worker/src/contact.ts)
- Route registration: [`worker/src/index.ts`](../../worker/src/index.ts)
- Table: [`migrations/0002_contact_messages.sql`](../../migrations/0002_contact_messages.sql)

## The 60-second mental model

A visitor fills the form at **`/contact`**. The browser POSTs JSON to **`/api/contact`**
on the same Worker. The handler validates it, drops obvious bots, rate-limits by IP, and
**inserts a row into the D1 `contact_messages` table**. That's it — **no email is sent
anywhere**. You read messages by querying D1. A nightly cron job purges old, unhandled
messages after ~180 days.

> **There is no inbox and no admin UI.** "The team reads every message" means *you* run a
> `SELECT` against D1 (or build something that does). Until you wire up an email provider
> (see [Optional: get emailed on every message](#optional-get-emailed-on-every-message)),
> nothing notifies you — you have to look.

## The flow, end to end

1. **Page render** — `/contact` renders `BaseLayout` with `ContactPage` + `BreadcrumbList`
   JSON-LD schema and mounts `<ContactForm client:visible />`. The React island hydrates
   when scrolled into view. If the visitor is signed in, their display name pre-fills the
   name field (via `useAuth()`).
2. **Submit** — `ContactForm` serialises the form to JSON and calls
   `api('/api/contact', { body: data })`. That helper POSTs same-origin with
   `credentials: 'same-origin'`, so the HttpOnly session cookie rides along (used to link
   the message to the account, if any).
3. **Worker handles `POST /api/contact`** → `handleContact` in `worker/src/contact.ts`:
   - **Honeypot** — if the hidden `website` field is non-empty, it's a bot. The handler
     returns `{ ok: true }` (200) and silently discards it — the bot thinks it succeeded.
   - **Rate limit** — `AUTH_LIMITER.limit({ key: "<ip>:contact" })`. Over the limit →
     HTTP 429 "Too many messages." The IP comes from the `CF-Connecting-IP` header.
   - **Validate & sanitise** — name (≤60 chars, required), email (normalised + regex,
     required), topic (must be one of the allowed set, else `other`), message
     (10–2000 chars). Control characters are stripped. Bad input → HTTP 400 with a
     friendly message.
   - **Insert** — writes one row to `contact_messages` with a random UUID, the signed-in
     `user_id` (or `NULL`), the sanitised fields, `ip`, truncated `user_agent`, and
     `created_at` (epoch ms). Returns HTTP 201 `{ ok: true }`.
4. **Confirmation** — the form swaps to a "Thanks — we got it" panel. The copy promises a
   reply "within two working days" — that promise is only kept if *you* read the table.

## Configuration

### 1. Contact email addresses shown on the page

The addresses in the sidebar and in the JSON-LD schema are **placeholders** and must be
changed before launch. They are hard-coded in two files:

- [`apps/web/src/pages/contact.astro`](../../apps/web/src/pages/contact.astro) — the
  visible `mailto:` links (support / privacy / security) **and** the `contactPoint`
  entries in the schema.
- Search the repo for `epic-board-games.example.com` to catch every other page that
  references these addresses (privacy, terms, cookies, about, FAQ, `security.txt`).

```bash
grep -rn "epic-board-games.example.com" apps/web/src
```

Replace `support@…`, `privacy@…`, and `security@…` with real addresses (or a single
inbox). These are display-only — changing them does **not** make the form email anyone.

### 2. Topics in the dropdown

The list of topics must match in **three** places or submissions get coerced to `other`:

| Where | What to change |
|-------|----------------|
| `ContactForm.tsx` → `TOPICS` | the dropdown options (value + label) |
| `worker/src/contact.ts` → `TOPICS` set | the server-side allow-list |
| `migrations/0002_contact_messages.sql` → `CHECK (topic IN (…))` | the DB constraint |

The current set: `bug`, `feature`, `account`, `privacy`, `business`, `other`. Changing the
DB `CHECK` on an existing database needs a **new migration** (SQLite can't alter a CHECK in
place) — see [making-changes.md](./making-changes.md). Adding a topic only to the form
without updating the server set means it silently becomes `other`.

### 3. Validation limits

All in `worker/src/contact.ts` (keep the form's `minLength`/`maxLength` in
`ContactForm.tsx` in sync so client and server agree):

- `MESSAGE_MIN = 10`, `MESSAGE_MAX = 2000`
- name max `60`, email max `254`

### 4. Rate limit

Shared `AUTH_LIMITER` binding, configured in [`wrangler.jsonc`](../../wrangler.jsonc):

```jsonc
"ratelimits": [
  { "name": "AUTH_LIMITER", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } }
]
```

That's **10 requests / 60 s per key**, and contact uses the key `"<ip>:contact"`, so it's
10 messages per minute per IP, counted separately from login attempts. Testing uses
`namespace_id` `2001` under `env.testing`. Raise `limit` or `period` there to change it.

### 5. Retention / purge

The nightly cron in [`worker/src/index.ts`](../../worker/src/index.ts) deletes messages
older than `2 * RETENTION_MS` **only when `handled_at IS NULL`**:

```ts
env.DB.prepare('DELETE FROM contact_messages WHERE created_at < ? AND handled_at IS NULL')
  .bind(now - 2 * RETENTION_MS)
```

`RETENTION_MS` is 90 days, so unhandled messages are kept ~180 days. **Setting
`handled_at` on a row keeps it forever** — that's the signal "I've dealt with this."

## Reading and managing messages

There's no UI — query D1 directly with Wrangler. Add `--env testing` to hit the testing
database; **omit it for production**. `--remote` targets the real cloud DB. (See
[user-data.md](./user-data.md) for the same conventions on other tables.)

```bash
# The 20 most recent messages (production)
npx wrangler d1 execute DB --remote --command \
  "SELECT datetime(created_at/1000,'unixepoch') AS when_, topic, name, email, substr(message,1,80) AS preview, handled_at FROM contact_messages ORDER BY created_at DESC LIMIT 20;"

# Only unhandled messages
npx wrangler d1 execute DB --remote --command \
  "SELECT id, topic, name, email, message FROM contact_messages WHERE handled_at IS NULL ORDER BY created_at DESC;"

# Mark one as handled (so it's kept and drops off the unhandled list)
npx wrangler d1 execute DB --remote --command \
  "UPDATE contact_messages SET handled_at = unixepoch()*1000 WHERE id = '<uuid>';"
```

> ⚠️ **`--remote` writes to live data.** `SELECT` before you `UPDATE`/`DELETE`, and try
> destructive things on `--env testing` first.

The `user_id` column links the message to an account when the sender was signed in
(`ON DELETE SET NULL`, so deleting the account keeps the message but drops the link). `ip`
and `user_agent` are stored for abuse investigation — treat them as personal data under
your privacy policy.

## Optional: get emailed on every message

To actually be notified instead of polling D1, send an email from `handleContact` after
the insert. Cloudflare Email Sending (a Worker binding) or any transactional API (Resend,
Postmark, SendGrid) works. Keep the D1 insert as the durable record and treat the email as
a best-effort notification (don't fail the request if the email send fails). See the
`cloudflare-email-service` skill / [infrastructure.md](./infrastructure.md) for wiring a
binding, and add the provider's API key as a Worker secret, never in `wrangler.jsonc`.

## Testing it

```bash
# Local dev server (see making-changes.md)
curl -X POST http://localhost:8787/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com","topic":"bug","message":"Something broke on the chess board."}'
# → 201 {"ok":true}

# Honeypot: filled "website" is silently accepted but NOT stored
curl -X POST http://localhost:8787/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bot","email":"b@b.com","topic":"bug","message":"hi there pal","website":"spam"}'
# → 200 {"ok":true}, no row inserted
```

Then `SELECT` from `contact_messages` to confirm only the genuine message landed.

## Related

- [infrastructure.md](./infrastructure.md) — bindings, environments, resource IDs.
- [user-data.md](./user-data.md) — D1 conventions, privacy/retention, viewing user data.
- [making-changes.md](./making-changes.md) — running locally, migrations, deploy & roll back.
- [security.md](./security.md) — rate limiting, honeypot, input sanitisation rationale.
