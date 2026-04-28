import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@data': path.resolve(__dirname, 'src/data'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@game': path.resolve(__dirname, 'src/game'),
      '@storage': path.resolve(__dirname, 'src/storage'),
      '@firebase-app': path.resolve(__dirname, 'src/firebase'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
