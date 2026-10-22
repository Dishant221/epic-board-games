import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) =>
  new Response(
    ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /profile', 'Disallow: /friends', '', `Sitemap: ${new URL('sitemap-index.xml', site)}`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
