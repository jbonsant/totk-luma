import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Writes demo/screenshots/*.png (1440 x 900 unless noted), with motion paused for stable frames. */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ['**/*.shot.ts'],
  use: {
    ...base.use,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  },
});
