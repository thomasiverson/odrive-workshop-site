import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://thomasiverson.github.io',
  base: '/odrive-workshop-site/',
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
