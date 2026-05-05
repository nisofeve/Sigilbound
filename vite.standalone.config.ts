import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
// @ts-expect-error — plain ESM file, no .d.ts
import { compressImagesPlugin } from './scripts/vite-plugin-compress-images.mjs';

// Standalone build — produces a single self-contained HTML file that opens
// directly in a browser via file:// with no server required.
//
// Key differences from the normal build:
//   · base: './'          — relative asset paths work on file://
//   · inlineDynamicImports — single JS bundle (no split chunks to fetch)
//   · cssCodeSplit: false  — single CSS file
//   · assetsInlineLimit    — images/fonts inlined as data URIs
//   · compressImagesPlugin — PNG/JPG → WebP transcode at build time so the
//                            inlined art bundle is 5–10× smaller
//   · sourcemap: false     — keeps the output compact
//   · outDir: dist-standalone — doesn't clobber the regular dist/

export default defineConfig({
  plugins: [
    compressImagesPlugin({ quality: 75 }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@app':          path.resolve(__dirname, 'src/app'),
      '@engine':       path.resolve(__dirname, 'src/engine'),
      '@data':         path.resolve(__dirname, 'src/data'),
      '@ui':           path.resolve(__dirname, 'src/ui'),
      '@game':         path.resolve(__dirname, 'src/game'),
      '@storage':      path.resolve(__dirname, 'src/storage'),
      '@firebase-app': path.resolve(__dirname, 'src/firebase'),
    },
  },
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-standalone',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
