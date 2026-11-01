import type { Page } from '@playwright/test';

/** Collects console errors and uncaught page errors. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

export const MENU_VIEWS = [
  { id: 'calibrate', title: 'Calibrate' },
  { id: 'performance', title: 'Performance' },
  { id: 'visuals', title: 'Visuals' },
  { id: 'controller', title: 'Controller' },
  { id: 'help', title: 'Help' },
] as const;

/** Navigate and wait until the app has attached its keyboard shortcuts. */
export async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator('html[data-ready="1"]').waitFor({ state: 'attached' });
}
