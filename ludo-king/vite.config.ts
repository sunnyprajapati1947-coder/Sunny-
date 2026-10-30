import { defineConfig } from 'vite';

// The preview environment proxies a public host to this dev server, so the
// server must accept that Host header and allow embedding.
export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    cors: true,
    watch: {
      // The native project and build output must not trigger HMR reloads.
      ignored: ['**/android/**', '**/dist/**', '**/coverage/**'],
    },
    headers: {
      'X-Frame-Options': '',
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
});
