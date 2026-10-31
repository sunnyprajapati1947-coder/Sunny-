import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // In the Arena preview the browser is NOT inside the sandbox, so the dev-server
    // proxy must reach the backend by absolute host. Override with API_PROXY_TARGET.
    allowedHosts: true,
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: process.env.API_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: process.env.API_PROXY_TARGET || 'http://localhost:5000', ws: true },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600 },
});
