// Helpers for the blog / guides content collection (`src/content/blog`).
// Used by the blog pages, the RSS feed and (via the integrator) game pages.
import { getCollection, type CollectionEntry } from 'astro:content';
import { GAMES, getGame, type GameId, type GameInfo } from '@ebg/game-core';

export type BlogPost = CollectionEntry<'blog'>;

export const BLOG_AUTHOR = 'Epic Board Games Team';
export const BLOG_TITLE = 'Guides & Strategy';
export const BLOG_DESCRIPTION =
  'Rules, strategy and family game-night guides for every game on Epic Board Games: chess, checkers, Connect 4, Sudoku, Snakes & Ladders and more.';

/** Root-relative URL of a post (no trailing slash; the site uses `build.format: 'file'`). */
export function postUrl(post: Pick<BlogPost, 'id'>): string {
  return `/blog/${post.id}`;
}

export function tagUrl(tag: string): string {
  return `/blog/tags/${encodeURIComponent(tag)}`;
}

/** All published posts, newest first. Drafts are excluded everywhere. */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime() || a.id.localeCompare(b.id));
}

/** Published posts about one game, newest first. */
export async function getPostsForGame(gameId: GameId): Promise<BlogPost[]> {
  const posts = await getPublishedPosts();
  return posts.filter((p) => p.data.game === gameId);
}

/** Posts grouped by game, in catalog order; games without posts are omitted. */
export async function getPostsByGame(): Promise<{ game: GameInfo; posts: BlogPost[] }[]> {
  const posts = await getPublishedPosts();
  return GAMES.map((game) => ({ game, posts: posts.filter((p) => p.data.game === game.id) })).filter((g) => g.posts.length > 0);
}

/** Tag → number of published posts, most used first. */
export async function getTagCounts(): Promise<{ tag: string; count: number }[]> {
  const posts = await getPublishedPosts();
  const counts = new Map<string, number>();
  for (const post of posts) for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function gameFor(post: BlogPost): GameInfo {
  return getGame(post.data.game);
}

/** Word count and reading time (at ~220 words per minute) from the raw Markdown body. */
export function readingTime(body: string | undefined): { words: number; minutes: number } {
  const text = (body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|\-]+/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 220)) };
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
