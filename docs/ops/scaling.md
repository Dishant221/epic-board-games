# 4. Scaling

What the current limits are, what breaks first as you grow, and exactly what to do about
it. The good news: this architecture scales to a lot of users before you touch anything,
because static assets are edge-cached and the Worker is serverless (no servers to size).

## How far the current setup goes for free / cheap

Cloudflare's **Workers Paid plan ($5/month)** is the realistic baseline for a public site
and covers a large amount of traffic. Rough capacity signals (check current Cloudflare
pricing pages for exact numbers — they change):

| Resource | What scales it | First thing to watch |
|----------|----------------|----------------------|
| Static website | Edge cache, effectively unlimited | nothing — this is free and huge |
| Worker requests | Per-request billing on paid plan | monthly request count |
| D1 (database) | Rows read/written per day, storage | **daily rows-read** is usually the first wall |
| Durable Objects | Active game rooms + duration | concurrent live games |
| KV | Reads/writes/storage | rarely the bottleneck here |
| Rate Limiting | Built in, generous | not a cost concern |

## What breaks first, and the fix

### 1. D1 "rows read" — the most likely first limit

Every leaderboard load, profile view and friends list reads rows. Under load this is the
first thing to hit a daily cap.

**Fixes, in order of effort:**

1. **Cache hot reads in KV.** The leaderboard and public profiles change slowly. Wrap
   `handleLeaderboard`/`handleGetProfile` (`worker/src/stats.ts`) to read from KV first and
   fall back to D1, writing the result back to KV with a short TTL (e.g. 60s):
   ```ts
   const cached = await env.KV.get('leaderboard:chess', 'json');
   if (cached) return json(cached);
   const fresh = await computeFromD1();
   await env.KV.put('leaderboard:chess', JSON.stringify(fresh), { expirationTtl: 60 });
   ```
   This turns thousands of identical DB reads into one per minute.
2. **Add indexes** for any new query pattern (the schema already indexes the common ones).
   Check a slow query with `EXPLAIN QUERY PLAN` via `wrangler d1 execute`.
3. **Add the Cache API** for public, cacheable `GET` API responses so the edge answers
   repeat requests without invoking D1 at all.

### 2. Concurrent live games (Durable Objects)

Each in-progress game is one Durable Object with its players on WebSockets. DOs scale
horizontally automatically — Cloudflare spins up as many instances as there are rooms.
There's no single bottleneck object **except** the `Matchmaker` (one DO per game type holds
that game's queue) and `Presence`.

**If matchmaking becomes hot** (thousands waiting for the same game at once): shard the
matchmaker by adding a shard suffix to its DO id (e.g. `chess:0`…`chess:7`) and round-robin
new players across shards, then match within a shard. Only do this if you actually see
contention — it adds complexity.

### 3. Worker CPU time per request

The AI move search (negamax) is the heaviest CPU user. It already has a **time budget**
(iterative deepening stops when time runs out), so a single move can't run away. If you add
expensive work, keep it inside a budget or move it off the request path.

## A concrete scaling checklist

When you notice slowness or near a limit:

1. **Measure before changing anything.** Turn on Workers Analytics (observability is
   already enabled in `wrangler.jsonc`) and watch:
   ```bash
   npx wrangler tail --env testing          # live logs
   ```
   In the Cloudflare dashboard, look at Worker invocations, D1 "rows read/written", and DO
   usage. Find the actual limit being approached — don't guess.
2. **Cache the hottest read** (leaderboard/profile) into KV. Biggest win for least effort.
3. **Confirm you're on the Workers Paid plan** so you're billed per use instead of hitting
   free-tier daily caps.
4. **Add indexes** for any query that `EXPLAIN QUERY PLAN` shows scanning.
5. **Only then** consider sharding the matchmaker or splitting read replicas.

## When to add a custom domain

workers.dev is fine to start, but a **custom domain** (e.g. `epicboardgames.com`) is worth
it before you push on SEO/ads because:

- it's required for proper DNS-based verification in Search Console and better ad approval,
- it looks trustworthy to users and ad networks,
- you can put Cloudflare's CDN/WAF rules in front of it.

Steps: add the domain to the same Cloudflare account, then add a **Custom Domain** route to
the Worker (Workers & Pages → your Worker → Settings → Domains & Routes → Add custom
domain). No code change needed. Update `SITE_URL` in CI and the Astro `site` config so
canonical URLs and the sitemap use the new domain.

## What you do NOT need to do

- No load balancer, no autoscaling config, no container sizing — the platform handles it.
- No read replicas until D1 reads are genuinely the proven bottleneck *after* caching.
- No premature matchmaker sharding.

Scale reactively, guided by the dashboard numbers, not preemptively.
