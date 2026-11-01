import { defineConfig } from '@playwright/test';

/*
 * Headless Chromium only. @playwright/test 1.64.1 uses the cached
 * chromium-headless-shell revision 1248, so no browser download is needed.
 * Set PW_CHROMIUM_PATH to point at a different headless shell binary.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const PORT = 5199;

export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['**/*.shot.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}/`,
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath, headless: true },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
