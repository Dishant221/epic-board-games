# 6. Analytics, Search Console & SEO

How to connect Google Search Console and Google Analytics, and what SEO is already built so
you don't redo it.

## What's already built (don't rebuild these)

Set up in [`apps/web/src/layouts/BaseLayout.astro`](../../apps/web/src/layouts/BaseLayout.astro)
and the Astro config:

- **Canonical URLs** on every page (and a fix that strips `.html` and maps `index.html → /`).
- **Open Graph + Twitter card** tags for nice link previews.
- **JSON-LD structured data** (e.g. the FAQ page emits `FAQPage` + `BreadcrumbList` schema).
- **`robots` meta** per page (`noindex` supported where needed).
- **Sitemap** at `/sitemap-index.xml` and an **RSS feed** at `/rss.xml`.
- **Manifest + icons** (PWA-installable, apple-touch-icon).
- A colour-blind-safe, accessible UI (accessibility helps SEO indirectly).

So the site is already search-friendly. The two things left are **verifying ownership** and
**adding measurement**.

## Google Search Console

Search Console tells you how Google sees the site (indexing, queries, errors). 

### Verifying ownership

On `*.workers.dev` you **cannot** use the DNS method (you don't control workers.dev DNS).
Use one of these instead:

**Option A — HTML meta tag (simplest):**

1. Search Console → Add property → **URL prefix** → enter the full site URL.
2. Choose the **HTML tag** method; it gives you:
   ```html
   <meta name="google-site-verification" content="XXXXXXXXXXXXXXXXXXXX" />
   ```
3. Add it to the `<head>` in `BaseLayout.astro` (put the token in an env var like
   `PUBLIC_GSC_VERIFICATION` so it's easy to change). Deploy, then click **Verify**.

**Option B — HTML file:**

1. Choose the **HTML file** method; download `googlXXXX.html`.
2. Put it in [`apps/web/public/`](../../apps/web/public) so it's served at the site root
   (`/googlXXXX.html`). Deploy, then **Verify**.

> When you move to a **custom domain**, re-verify that domain (DNS TXT becomes available and
> is the most robust method) and set the custom domain as the primary property.

### After verifying

1. **Submit the sitemap:** Search Console → Sitemaps → enter `sitemap-index.xml` → Submit.
2. Check **Coverage/Pages** after a few days to see what's indexed.
3. Use **URL Inspection** to request indexing of new important pages (new game guides).

## Google Analytics 4 (GA4)

### Create the property

1. https://analytics.google.com → Admin → Create property → add a **Web** data stream for
   your site URL. You get a **Measurement ID** like `G-XXXXXXXXXX`.

### Add the tag — but gate it behind consent

Because GA sets cookies, in the EEA/UK it must respect consent (**Consent Mode v2**). Add
the tag to `BaseLayout.astro`, ideally only firing after consent (tie it to the same banner
you build for ads — see [monetization.md](./monetization.md#step-3--the-consent-banner-cmp--do-not-skip)):

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  // Consent Mode v2: denied by default, granted when the visitor accepts.
  gtag('consent', 'default', { ad_storage:'denied', analytics_storage:'denied' });
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

Then, in your consent banner's "accept" handler:
```js
gtag('consent', 'update', { analytics_storage:'granted' });  // and ad_storage if ads on
```

Put `G-XXXXXXXXXX` in a `PUBLIC_GA_ID` env var so testing and production can differ (you
usually do **not** want testing traffic polluting production analytics).

### Update the legal pages

Adding GA means you now use an analytics cookie. In the **same commit**:
- update `cookies.astro` (it currently says "no analytics"),
- update the privacy page,
- update the FAQ answer about trackers.

## A privacy-first alternative to GA

If you'd rather avoid cookie-consent complexity entirely, consider a **cookieless**
analytics tool (Cloudflare Web Analytics — free, privacy-first, no cookie banner needed; or
Plausible/Fathom). Cloudflare Web Analytics is the lowest-friction: enable it in the
Cloudflare dashboard (Analytics → Web Analytics), add its small beacon snippet to
`BaseLayout.astro`. Because it sets no cookies and collects no personal data, you typically
**don't** need a consent banner for it — a real advantage while you're small.

| Tool | Cookies? | Consent banner needed? | Cost |
|------|----------|------------------------|------|
| Cloudflare Web Analytics | No | No | Free |
| Plausible / Fathom | No | No | Paid |
| Google Analytics 4 | Yes | Yes (EEA/UK) | Free |

Recommendation: **start with Cloudflare Web Analytics** for traffic numbers, add GA4 later
only if you need its depth (or because an ad network wants it).

## Ongoing SEO wins (content, not code)

The engine is built; growth now comes from content:

- Keep publishing **game guides** (the blog) — long, genuinely useful "how to play / how to
  win" articles with images. These are your main organic-traffic engine and your best ad
  surface.
- Make sure each new page has a unique `title` and `description` (the layout already wires
  these through).
- Internally link guides to their game pages and vice-versa.
- After publishing, submit the new URL in Search Console's URL Inspection.
