import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Single-chunk build so scripts/inline-build.mjs can inline everything into one HTML file.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    rolldownOptions: {
      output: {
        // Rolldown's replacement for inlineDynamicImports: one JS chunk, no lazy chunks.
        codeSplitting: false,
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
