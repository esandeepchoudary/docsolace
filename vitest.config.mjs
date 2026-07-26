import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['plugin/**/*.test.mjs', '__tests__/**/*.test.mjs'],
    exclude: ['demo-app/**', 'node_modules/**'],
  },
});
