import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Standalone: / (Vercel auto-sets VERCEL=1; also accepts explicit VITE_BASE_PATH).
  // Embedded in API server: /dashboard/.
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API + WebSocket calls to the Shem backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
