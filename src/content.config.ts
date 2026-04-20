import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const lessons = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/lessons',
    generateId: ({ entry }) => {
      // Use filename without extension as the unique ID
      return entry.replace(/\.md$/, '');
    },
  }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    type: z.enum(['lesson', 'exercises', 'extra']),
    lesson: z.string(),
    slug: z.string(),
    duration: z.string().optional(),
  }),
});

export const collections = { lessons };
