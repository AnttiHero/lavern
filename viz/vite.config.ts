import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // When served embedded in the API, base is /dashboard/.
  // For standalone deployment (Vercel, etc.), set VITE_BASE_PATH=/ in env.
  base: process.env.VITE_BASE_PATH || '/dashboard/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API + WebSocket calls to the Shem backend
      '/api': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
    },
  },
});
