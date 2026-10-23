import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { BLOG_AUTHOR, BLOG_DESCRIPTION, gameFor, getPublishedPosts, postUrl } from '../lib/blog';

export async function GET(context: APIContext) {
  const site = context.site!;
  const posts = await getPublishedPosts();
  return rss({
    title: 'Epic Board Games — Guides & Strategy',
    description: BLOG_DESCRIPTION,
    site,
    trailingSlash: false,
    stylesheet: false,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: postUrl(post),
      author: BLOG_AUTHOR,
      categories: [gameFor(post).name, ...post.data.tags],
      enclosure: { url: new URL(post.data.hero, site).toString(), type: 'image/png', length: 0 },
    })),
    customData: `<language>en-gb</language><image><url>${new URL('/icon-512.png', site)}</url><title>Epic Board Games</title><link>${site}</link></image>`,
  });
}
