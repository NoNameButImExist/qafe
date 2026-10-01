import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Integration tests start Docker containers.
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
