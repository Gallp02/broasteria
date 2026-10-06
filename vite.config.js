import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      // Con barra final para que /api.js (archivo del frontend) no se capturen
      '/api/': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
