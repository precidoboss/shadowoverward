import { defineConfig } from 'vite';

// Three.js is large and changes rarely, so keep it in its own chunk for better browser caching
export default defineConfig({
  // Relative paths so the build works from any folder: itch.io serves games from a subpath inside an iframe
  base: './',
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] }
      }
    }
  }
});
