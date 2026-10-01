import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5176,
    strictPort: true,
    // Same origin as the app in development: /api/* goes to the API without /api.
    proxy: {
      '/api': {
        // API_PROXY_TARGET points the dev server at another API (e.g. a second instance).
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: { port: 5176, strictPort: true },
});
