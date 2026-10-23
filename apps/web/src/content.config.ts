import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { GAMES, type GameId } from '@ebg/game-core';

const gameIds = GAMES.map((g) => g.id) as [GameId, ...GameId[]];

/**
 * Blog / guides. One Markdown file per post in `src/content/blog/<slug>.md`;
 * the file name is the URL slug (`/blog/<slug>`).
 */
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string().min(1).max(120),
    /** Meta description; search engines truncate around 160 characters. */
    description: z.string().min(1).max(160),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    /** The game this guide is about (links the post to `/games/<slug>`). */
    game: z.enum(gameIds),
    tags: z.array(z.string().min(1)).min(1),
    /** Root-relative path to the 1200×630 hero image (`/blog/heroes/<slug>.png`). */
    hero: z.string().startsWith('/'),
    heroAlt: z.string().min(1),
    draft: z.boolean().optional(),
  }),
});

export const collections = { blog };
