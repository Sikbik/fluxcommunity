import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The API server (server/) listens on 42069 by default, the same port the deployed container uses.
// Override with API_ORIGIN=http://host:port, the dev server port with WEB_PORT and the cache with VITE_CACHE_DIR.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_ORIGIN || 'http://127.0.0.1:42069';
  const proxy = {
    '/api': { target, changeOrigin: false },
    '/healthz': { target, changeOrigin: false },
  };
  return {
    plugins: [react()],
    // Parallel dev servers can each use their own cache: VITE_CACHE_DIR=/tmp/vite-cache-<name>.
    cacheDir: env.VITE_CACHE_DIR || 'node_modules/.vite',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: Number(env.WEB_PORT || 5173),
      proxy,
      fs: { allow: ['..'] },
    },
    preview: {
      host: '127.0.0.1',
      port: Number(env.WEB_PORT || 4173),
      proxy,
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
    },
  };
});
