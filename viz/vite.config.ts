import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
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
