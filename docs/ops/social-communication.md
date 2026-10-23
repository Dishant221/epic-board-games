# Friends, family & communication — how it works and how to change it

Everything about how two users connect and talk to each other: the friends/family
social graph, requests and blocking, presence (who's online), notifications and pings,
and the real-time **text chat, emotes and voice** inside a game room. All of it is
grounded in the actual code:

| Area | Code |
|------|------|
| Social graph API (friends, family, block, search, ping) | [`worker/src/friends.ts`](../../worker/src/friends.ts) |
| Notifications (store + live push) | [`worker/src/notifications.ts`](../../worker/src/notifications.ts) |
| Presence (online/offline, live socket) | [`worker/src/durable/presence.ts`](../../worker/src/durable/presence.ts) |
| In-game chat / emotes / voice | [`worker/src/durable/game-room.ts`](../../worker/src/durable/game-room.ts) |
| Chat moderation + emote list (shared) | [`packages/game-core/src/chat.ts`](../../packages/game-core/src/chat.ts) |
| Voice TURN credentials | [`worker/src/voice.ts`](../../worker/src/voice.ts) |
| Shared types (FriendEntry, Notification, ChatMessage) | [`packages/game-core/src/protocol.ts`](../../packages/game-core/src/protocol.ts) |
| Tables | [`migrations/0001_init.sql`](../../migrations/0001_init.sql) (`friendships`, `notifications`) |
| Routes | [`worker/src/index.ts`](../../worker/src/index.ts) |
| Friends page UI | [`apps/web/src/components/social/FriendsPage.tsx`](../../apps/web/src/components/social/FriendsPage.tsx) |
| Notification bell / toast UI | [`apps/web/src/components/social/NotificationBell.tsx`](../../apps/web/src/components/social/NotificationBell.tsx) |

## The 60-second mental model

There are **two separate channels** of communication, and it's important not to confuse them:

1. **Out-of-game (the social graph).** You add people as friends/family, see who's
   online, and **ping** them ("come play"). This is backed by the **D1 `friendships`
   table**, delivered as **notifications** (stored in D1 `notifications`) and pushed live
   over each user's **Presence Durable Object** WebSocket. There is **no direct messaging**
   — you cannot send a friend a free-text message outside a game. The only out-of-game
   signals are: friend request, friend accepted, and game ping.

2. **In-game (inside a room).** Once two people are in the same **GameRoom Durable
   Object**, they get real-time **text chat**, **quick emotes**, and **peer-to-peer voice
   chat** (WebRTC). This is moderated (profanity filter, rate limits) and lives entirely in
   the room DO; chat history is ephemeral (last 50 messages, gone when the room expires).

> **"Friend" vs "family" is a label only.** The `relation` column stores `friend` or
> `family` and the UI shows a 👪 badge for family, but **nothing in the code grants family
> any extra privilege** — same pings, same chat, same everything. If you want family to
> behave differently (e.g. auto-accept, bypass chat filters), you have to add that logic;
> see [Making changes](#making-changes).

---

## Part 1 — The social graph (friends & family)

### Data model

One table, **`friendships`**, holds every relationship as a single row per *unordered
pair* of users:

```sql
friendships(
  requester_id, addressee_id,          -- who asked, who received
  status   IN ('pending','accepted','blocked'),
  relation IN ('friend','family') DEFAULT 'friend',
  created_at, updated_at,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
)
-- idx_friendships_pair enforces ONE row per pair regardless of direction:
--   UNIQUE(MIN(requester_id,addressee_id), MAX(...))
```

So "A and B" is always exactly one row; the `requester_id`/`addressee_id` columns remember
who initiated it (which decides who sees a request as *incoming* vs *outgoing*). Deleting
a user cascades and removes their rows.

### The lifecycle

| Action | Route | What happens |
|--------|-------|--------------|
| Search for people | `GET /api/users/search?q=` | `handleUserSearch` — prefix match on username (2–20 chars), max 10 results. Hides anyone in a `blocked` relationship either way. |
| Send request | `POST /api/friends/request` `{ username, relation? }` | `handleFriendRequest` — inserts a `pending` row. **If they already requested you, it auto-accepts.** Notifies the target (`friend_request`). |
| Accept / decline | `POST /api/friends/respond` `{ userId, accept }` | `handleFriendRespond` — accept flips to `accepted` + notifies (`friend_accepted`); decline deletes the row. |
| List | `GET /api/friends` | `handleListFriends` — returns accepted first, with each accepted friend's live `online` flag. Capped at 200. |
| Remove | `DELETE /api/friends/:userId` | `handleRemoveFriend` — deletes the row (won't touch a `blocked` row). |
| Ping ("come play") | `POST /api/friends/ping` `{ userId, gameId, roomId? }` | `handleFriendPing` — **accepted friends only**; one ping per friend per minute (KV lock); sends a `game_ping` notification carrying the game and optional room. |
| Block | `POST /api/friends/block` `{ userId }` | `handleBlockUser` — deletes any existing relationship and writes a `blocked` row owned by the blocker. |
| Unblock | `DELETE /api/friends/block/:userId` | `handleUnblockUser` — removes the `blocked` row you own. |

**Status as each side sees it** (`FriendEntry.status`): the DB `pending` becomes
`pending_incoming` or `pending_outgoing` depending on who you are; `blocked` rows are only
ever returned to the person who placed the block (the blocked user never sees it).

Key limits (all in `friends.ts`): **`MAX_FRIENDS = 200`**, ping rate limit **1/min per
friend** (KV key `ping:<me>:<friend>`, 60 s TTL — 60 s is KV's minimum).

### UI

[`FriendsPage.tsx`](../../apps/web/src/components/social/FriendsPage.tsx) (`/friends`)
drives all of it: search + relation dropdown, incoming requests, your accepted list with
online dots and a **Ping** button, outgoing-pending line, and a Blocked section. When you
arrive with `?ping=<roomId>&game=<id>` (from inside a room's "invite" button) the page
pre-selects that game/room so a ping drops the friend straight into your room.

---

## Part 2 — Presence & notifications (the live layer)

### Presence Durable Object — "who's online"

[`presence.ts`](../../worker/src/durable/presence.ts): **one instance per user**
(`PRESENCE.idFromName(userId)`). It holds that user's open browser tabs' WebSockets and
does two jobs:

- **`isOnline()`** → true if any tab socket is open. `handleListFriends` calls this for
  each accepted friend to produce the green/grey dot.
- **`notify(notification)`** → fan-out a notification frame to all of the user's open tabs.

It's deliberately stateless beyond the sockets (free hibernation). Keepalive PINGs are
auto-answered by the runtime without waking the object. Tabs are capped at **8 per user**;
the oldest is dropped past that.

The browser connects via `GET /api/presence/ws` and the
[`NotificationBell`](../../apps/web/src/components/social/NotificationBell.tsx) component
keeps that socket alive (exponential-backoff reconnect) for as long as you're signed in.

### Notifications

Stored in **D1 `notifications`** and pushed live. Only **three kinds** exist (enforced by a
DB `CHECK`): `friend_request`, `friend_accepted`, `game_ping`.

`createNotification(env, toUserId, kind, fromUser, extra)` does both halves atomically
enough for our purposes: **(1)** INSERT the row, **(2)** call `PRESENCE.notify()` so any
open tab shows a toast immediately. If the user is offline, the row waits in D1 and is
fetched on next load.

| Route | Purpose |
|-------|---------|
| `GET /api/notifications` | last 50, newest first, each joined to the sender's public profile |
| `POST /api/notifications/read` `{ ids? }` | mark those ids read, or **all** when omitted |

The bell shows an unread count; opening it marks everything read. A `game_ping` links
straight to `/games/<slug>?room=<roomId>`; friend notifications link to `/friends`.

**Retention:** the nightly cron in [`index.ts`](../../worker/src/index.ts) deletes
notifications older than **90 days** (`RETENTION_MS`).

---

## Part 3 — In-game communication (chat, emotes, voice)

Once players are in a room, communication is handled by the **GameRoom Durable Object**
([`game-room.ts`](../../worker/src/durable/game-room.ts)) over the room WebSocket
(`/api/rooms/:id/ws`). The room is authoritative for everything below.

### Text chat

- Client sends `{ type: 'CHAT', payload: { content } }`. `onChat` runs it through
  **`validateChatMessage`** ([`chat.ts`](../../packages/game-core/src/chat.ts)) which:
  strips control/bidi characters, rejects empty / over-**200**-char / repeated-char spam /
  ALL-CAPS shouting, enforces a **sliding-window rate limit of 5 messages / 10 s per
  player**, and runs the **profanity filter** (matched words become `****`).
- **Spectators cannot chat** — only seated players. Valid messages are broadcast as
  `{ type: 'CHAT', payload: ChatMessage }` and appended to room history.
- **History is ephemeral:** last **50** messages (`CHAT_HISTORY`), kept only while the room
  lives, and the room self-expires after inactivity (`ROOM_TTL_MS`). Chat is **not** stored
  in D1 and cannot be retrieved later.
- `TYPING` broadcasts a throttled "is typing" signal; `System` messages (joins/leaves) are
  injected server-side.

**Profanity list:** baseline `DEFAULT_PROFANITY` in `chat.ts`, **extended at runtime from
KV** (`profanity:list`, a JSON array of strings) so moderators can update it without a
deploy. The room caches the compiled filter for `PROFANITY_CACHE_MS`.

### Emotes

A fixed set of 10 quick emotes (`QUICK_EMOTES` in `chat.ts`: gg, nice, hurry, oops,
laugh, angry, hi, bye, think, wow). Client sends `{ type: 'EMOTE', payload: { emoteId } }`;
the server looks it up, applies the same rate limiter, and broadcasts it as a chat message
of type `emote`. Emotes skip the profanity/length checks (they're a closed set).

### Voice chat (WebRTC, peer-to-peer)

- **Signalling** is relayed through the room DO: `VOICE_OFFER` / `VOICE_ANSWER` /
  `VOICE_ICE_CANDIDATE` are forwarded **point-to-point** between two human players of the
  room (`relayVoice`). Mute/among-state is broadcast via `VOICE_MUTE_STATUS` / `VOICE_STATE`.
- **Media** flows directly peer-to-peer, not through the Worker. To traverse NAT it needs
  STUN/TURN: `POST /api/voice/turn-credentials` `{ roomId }`
  ([`voice.ts`](../../worker/src/voice.ts)) returns short-lived (1 h) **Cloudflare Realtime
  TURN** credentials — **only to players actually in that room**, so the relay can't be
  abused as an open proxy.
- **Degrades gracefully:** if `TURN_KEY_ID` / `TURN_API_TOKEN` secrets aren't set (or the
  credential call fails), it falls back to **STUN-only** (`stun:stun.cloudflare.com:3478`).
  Voice then works on most networks but may fail behind strict NATs.

TURN is configured with two **Worker secrets** (never in `wrangler.jsonc`):

```bash
npx wrangler secret put TURN_KEY_ID      # add --env testing for testing
npx wrangler secret put TURN_API_TOKEN   # add --env testing for testing
```

Get the key + token from the Cloudflare dashboard → **Realtime (Calls) → TURN**. See
[infrastructure.md](./infrastructure.md).

---

## Making changes

A **"where do I change X"** map. Keep the server as the source of truth; the client copies
(e.g. the chat validator) only exist for instant UX feedback.

| You want to… | Change |
|--------------|--------|
| **Make family actually different from friends** | Add logic wherever `relation` is read — currently only `friends.ts` stores it and the UI shows a badge. There is no behavioural branch today. |
| **Add a new relation type** (e.g. `blocked_temporarily`, `favourite`) | Update the `CHECK (relation IN (...))` via a **new migration**, the `relation` handling in `handleFriendRequest`, the `FriendEntry['relation']` type in `protocol.ts`, and the `FriendsPage.tsx` dropdown. |
| **Add a new notification kind** | Add to the `CHECK (kind IN (...))` on `notifications` (**new migration**), to `Notification['kind']` in `protocol.ts`, call `createNotification` with it, and handle it in `NotificationBell.tsx` (`describe` + `href`). |
| **Change the friend cap** | `MAX_FRIENDS` in `friends.ts`. |
| **Change ping rate limit** | `handleFriendPing` in `friends.ts` (KV key `ping:*`, TTL — note KV minimum is 60 s). |
| **Add direct (out-of-game) messaging** | New feature: there is none today. You'd add a table, routes, and reuse `PRESENCE.notify()` for delivery. Design it against [security.md](./security.md) and [user-data.md](./user-data.md) (retention, blocking, moderation). |
| **Change chat length / rate limit / anti-spam rules** | `MAX_MESSAGE_LENGTH`, `RATE_LIMIT`, and `validateChatMessage` in `chat.ts` (shared by client + server — change once). |
| **Edit the emote set** | `QUICK_EMOTES` in `chat.ts`. |
| **Update the profanity list without deploying** | Put a JSON string array in KV under key `profanity:list` (takes effect within `PROFANITY_CACHE_MS`). Baseline words live in `DEFAULT_PROFANITY` in `chat.ts`. |
| **Change chat history length** | `CHAT_HISTORY` in `game-room.ts`. |
| **Persist chat to D1** | Not done today (privacy + cost). Would mean a new table, a write in `pushChat`, and a retention policy. |
| **Change presence tab cap / behaviour** | `presence.ts` (the `>= 8` check, `isOnline`, `notify`). |
| **Change voice TURN TTL / provider** | `TURN_TTL_SEC` and the fetch in `voice.ts`; secrets `TURN_KEY_ID` / `TURN_API_TOKEN`. |
| **Change notification retention** | `RETENTION_MS` / the cron `DELETE` in `index.ts`. |

### Updating a `CHECK` constraint

SQLite can't alter a `CHECK` in place, so changing the allowed `relation`/`kind`/`status`
values needs a **new migration** (recreate-table-and-copy, or a documented workaround). See
[making-changes.md](./making-changes.md) for the migration + deploy workflow (testing
first, then production).

### Inspecting the data

```bash
# Someone's relationships (production; add --env testing for testing)
npx wrangler d1 execute DB --remote --command \
  "SELECT status, relation, requester_id, addressee_id FROM friendships WHERE requester_id='<uid>' OR addressee_id='<uid>';"

# Their recent notifications
npx wrangler d1 execute DB --remote --command \
  "SELECT datetime(created_at/1000,'unixepoch') AS when_, kind, from_user_id, read FROM notifications WHERE user_id='<uid>' ORDER BY created_at DESC LIMIT 20;"
```

> ⚠️ `--remote` is live data — `SELECT` before any `UPDATE`/`DELETE`, and prefer
> `--env testing` for anything destructive. (See [user-data.md](./user-data.md).)

## Related

- [infrastructure.md](./infrastructure.md) — Durable Objects, bindings, TURN/Realtime, IDs.
- [user-data.md](./user-data.md) — the full schema, privacy, retention, viewing user data.
- [security.md](./security.md) — rate limiting, chat moderation, blocking, input sanitisation.
- [making-changes.md](./making-changes.md) — migrations, running locally, deploy & roll back.
- [`../../planchange.md`](../../planchange.md) — repo-wide "where do I change X" function map.
