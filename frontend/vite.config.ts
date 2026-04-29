import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiPort = Number(process.env.KB_API_PORT || process.env.PORT || 4310);
const frontendPort = Number(process.env.KB_FRONTEND_PORT || 4311);
const apiProxyTarget = process.env.KB_API_PROXY_TARGET || `http://localhost:${apiPort}`;
const frontendBasePath = process.env.VITE_KB_FRONTEND_BASE_PATH || process.env.KB_FRONTEND_BASE_PATH || '/';

export default defineConfig({
  root: __dirname,
  base: frontendBasePath,
  plugins: [react()],
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
  },
  server: {
    host: process.env.KB_FRONTEND_HOST || '127.0.0.1',
    strictPort: true,
    port: frontendPort,
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/app/test-setup.ts',
  },
});
