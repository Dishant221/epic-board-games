import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'worker/test/**/*.test.ts'],
    environment: 'node',
  },
});
