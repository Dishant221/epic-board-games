# 5. Monetisation (Google AdSense & other ad networks)

How to turn on advertising **without breaking privacy law or getting your AdSense account
banned**. Today the site runs **no ads and no ad cookies** — the
[cookies page](../../apps/web/src/pages/cookies.astro) says so explicitly, which is exactly
what you want *until* you flip this on and update that page in the same change.

> **Read this first:** AdSense will reject or later ban sites that show personalised ads in
> the EEA/UK without a Google-certified consent banner (a "CMP"). The order below is
> designed to keep you compliant. Don't skip the consent step.

## What's already in your favour

- A real **Privacy Policy**, **Cookie Policy**, **Terms**, **About**, **Contact** and
  **FAQ** — AdSense requires meaningful content and these pages. ✅
- A footer linking all policy pages on **every** page. ✅
- A simple **cookie notice component** (`apps/web/src/components/common/CookieNotice.tsx`)
  you'll upgrade into a real consent banner. ✅
- No CSP on the HTML pages (the strict CSP is only on `/api/*` JSON responses), so ad
  scripts can load without a config fight. ✅

## Step 1 — Get a custom domain first (strongly recommended)

AdSense approval is far smoother on a real domain than on `*.workers.dev`. See
[scaling.md](./scaling.md#when-to-add-a-custom-domain). You *can* apply on workers.dev, but
expect friction.

## Step 2 — Apply to AdSense

1. Create an account at https://adsense.google.com with the site URL.
2. AdSense gives you a snippet containing your **publisher ID** (`ca-pub-XXXXXXXXXXXXXXXX`).
3. Add the verification snippet to the site `<head>` — do it once in
   [`apps/web/src/layouts/BaseLayout.astro`](../../apps/web/src/layouts/BaseLayout.astro)
   so it's on every page:
   ```html
   <script async
     src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
     crossorigin="anonymous"></script>
   ```
   > Put the real publisher ID in a build-time env var (e.g. `PUBLIC_ADSENSE_CLIENT`) rather
   > than hard-coding it, so testing and production can differ and you can turn ads off by
   > unsetting it.
4. Deploy to testing, then production, and wait for approval (days to weeks).

## Step 3 — The consent banner (CMP) — do NOT skip

Before ads serve to EEA/UK/Swiss visitors you need a **Google-certified CMP** implementing
**IAB TCF v2.2** and **Google Consent Mode v2**. Two realistic paths:

- **Easiest:** use Google's own **Funding Choices / Privacy & messaging** inside the AdSense
  dashboard (Privacy & messaging → create a GDPR + CCPA message). Google hosts the banner;
  you just enable it. This replaces the need to build your own CMP.
- **Or** a certified third-party CMP (Cookiebot, Osano, etc.) — more control, a subscription
  cost.

Either way, **upgrade `CookieNotice.tsx`** from an informational notice into a real
accept/reject control, and only load the ad script *after* consent (or load it in
Consent Mode "denied by default" and update on accept). The component already has the
dismiss/localStorage plumbing to build on. The current copy in
`CookieNotice.tsx` and `cookies.astro` both promise "no advertising cookies" — you must
rewrite both in the same commit that enables ads.

## Step 4 — Place ad units

In the AdSense dashboard create ad units (or use Auto Ads). For manual units, drop the
unit snippet where you want it. Good, non-annoying placements for this site:

- The **blog/guide pages** (`apps/web/src/pages/blog/…`) — long-form content is where ads
  perform and where they're least intrusive.
- The **home page** below the game grid.
- **Never inside an active game board** — it hurts UX, and ads over interactive content risk
  invalid-traffic flags.

Make a small reusable Astro/React `<AdSlot>` component so placements are consistent and you
can disable them all from one place.

## Step 5 — Update the legal pages (same commit as going live)

- `cookies.astro`: change the "no advertising cookies" paragraph to name Google AdSense,
  describe the cookies, and link Google's policies.
- `privacy` page: add the advertising section (what's collected, the CMP, opt-out).
- Keep the FAQ answer about "no advertising trackers" in sync
  (`apps/web/src/pages/faq.astro`).

This keeps you honest and is itself an AdSense policy requirement.

## Other ad networks (if AdSense rejects you or you outgrow it)

| Network | When it fits | Notes |
|---------|-------------|-------|
| **Ezoic** | Small/medium traffic, want auto-optimisation | AI-places ads; integrates via their script or a Cloudflare app. Still needs a CMP. |
| **Media.net** | AdSense alternative / contextual | Yahoo-Bing network; similar integration to AdSense. |
| **PropellerAds / Adsterra** | Low-friction approval | Lower quality; can hurt UX and reputation — use cautiously. |
| **Mediavine / Raptive (AdThrive)** | Premium, high RPM | Require large monthly sessions (tens of thousands+); aim here once you have real traffic. |

The integration pattern is identical for all: add a script to the `<head>`, gate it behind
consent, place units, update the legal pages. Abstracting placements behind one `<AdSlot>`
component makes swapping networks painless.

## Non-advertising monetisation (worth considering)

- **Remove-ads / Pro membership** — a one-off or subscription that disables ads and adds
  perks (custom avatars, private rooms, themes). You already have accounts, so gating is
  easy. Payment via Stripe (hosted checkout → a webhook `/api/*` route → set a `pro` flag on
  the user).
- **Donations** (Buy Me a Coffee / Ko-fi) — zero integration, just a link.
- **Cosmetics** — sell avatar packs/board themes as one-off purchases.

For any paid feature, add a `pro` / entitlement column to `users` (a new migration) and
check it server-side, never trust the client.

## Compliance checklist before you flip ads on

- [ ] Custom domain live (recommended).
- [ ] AdSense approved.
- [ ] Certified CMP (Google Funding Choices or equivalent) live and blocking non-essential
      cookies until consent.
- [ ] `CookieNotice.tsx` upgraded to accept/reject.
- [ ] `cookies.astro`, privacy page and FAQ updated to name the ad vendor.
- [ ] `ads.txt` published at the site root listing your publisher ID (AdSense provides the
      line; add it to `apps/web/public/ads.txt`).
- [ ] Ads not placed over interactive game UI.
