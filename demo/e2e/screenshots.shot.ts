import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { gotoReady } from './helpers';

const out = (name: string) => resolve(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots', name);

async function settle(page: Page, ms = 400) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(ms);
}

async function dismissToast(page: Page) {
  const t = page.locator('#intro-toast button');
  if (await t.count()) await t.click();
}

test('play', async ({ page }) => {
  await gotoReady(page, '/');
  await expect(page.getByTestId('sim-badge')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('play.png') });
});

test('dashboard', async ({ page }) => {
  await gotoReady(page, '/');
  await dismissToast(page);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#dashboard')).toBeVisible();
  await settle(page, 700);
  await page.screenshot({ path: out('dashboard.png') });
});

test('calibrate-peak', async ({ page }) => {
  await gotoReady(page, '/#calibrate');
  await page.locator('#step-peak').click();
  await page.locator('#peak-nits').fill('1200');
  await settle(page);
  await page.screenshot({ path: out('calibrate-peak.png') });
});

test('calibrate-rolloff', async ({ page }) => {
  await gotoReady(page, '/#calibrate');
  await page.locator('#step-rolloff').click();
  await expect(page.locator('.curve-plot')).toBeVisible();
  await page.locator('.step-card').scrollIntoViewIfNeeded();
  await page.locator('.menu-main').evaluate((el) => el.scrollTo({ top: 150 }));
  await settle(page);
  await page.screenshot({ path: out('calibrate-rolloff.png') });
});

test('performance', async ({ page }) => {
  await gotoReady(page, '/#performance');
  await settle(page);
  await page.screenshot({ path: out('performance.png') });
});

test('visuals-split', async ({ page }) => {
  await gotoReady(page, '/#visuals');
  await page.locator('#preset-vivid').click();
  await expect(page.locator('.split-preview')).toBeVisible();
  await settle(page, 600);
  await page.screenshot({ path: out('visuals-split.png') });
});

test('controller', async ({ page }) => {
  await gotoReady(page, '/#controller');
  await page.locator('.pad-part[aria-label^="Circle"]').hover();
  await settle(page);
  await page.screenshot({ path: out('controller.png') });
});

test('help', async ({ page }) => {
  await gotoReady(page, '/#help');
  await settle(page);
  await page.screenshot({ path: out('help.png') });
});

test('mobile-dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await gotoReady(page, '/');
  await dismissToast(page);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#dashboard')).toBeVisible();
  await settle(page, 700);
  await page.screenshot({ path: out('mobile-dashboard.png') });
});
