import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Integration tests start Docker containers.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
