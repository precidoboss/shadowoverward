import { defineConfig } from 'vite';

// Three.js is large and changes rarely, so keep it in its own chunk for better browser caching
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] }
      }
    }
  }
});
