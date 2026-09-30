import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Nest DI needs decorator metadata, which esbuild/oxc do not emit, so tests compile with SWC.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
