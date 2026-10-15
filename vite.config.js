import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Every demo is a directory with its own index.html; add it here to have it built.
const demos = ['nl_raster', 'relief'];

export default defineConfig({
  base: '/demo/',
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ...Object.fromEntries(demos.map((d) => [d, resolve(import.meta.dirname, d, 'index.html')])),
      },
    },
  },
});
