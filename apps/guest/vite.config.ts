import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Guests open <slug>.qafe.localhost:5173; *.localhost resolves to 127.0.0.1.
    allowedHosts: ['.qafe.localhost'],
    proxy: {
      // The API reads the venue from the Host header, so it must reach the API unchanged
      // (changeOrigin: false), like Traefik does in production.
      '/api': {
        target: api,
        changeOrigin: false,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: { port: 5173, strictPort: true, allowedHosts: ['.qafe.localhost'] },
});
