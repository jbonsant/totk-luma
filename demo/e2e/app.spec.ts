import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { MENU_VIEWS, gotoReady, trackErrors } from './helpers';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('loads with no console errors and shows the SIMULATED badge', async ({ page }) => {
  const errors = trackErrors(page);
  await gotoReady(page, '/');
  const badge = page.getByTestId('sim-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('SIMULATED');
  await expect(page.locator('#intro-toast')).toContainText('simulated scope demo');
  await expect(page.locator('#intro-toast')).toContainText('DualSense mute button');
  await expect(page.locator('#intro-toast')).not.toContainText('touchpad');
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});

test('the backquote key toggles the dashboard', async ({ page }) => {
  await gotoReady(page, '/');
  await expect(page.locator('#dashboard')).toHaveCount(0);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#dashboard')).toContainText('Luminance histogram');
  await expect(page.locator('#dashboard')).toContainText('Simulated');
  await page.keyboard.press('Backquote');
  await expect(page.locator('#dashboard')).toHaveCount(0);
});

test('every view is reachable through its hash', async ({ page }) => {
  for (const v of MENU_VIEWS) {
    await gotoReady(page, `/#${v.id}`);
    await expect(page.locator('.view-head h1')).toHaveText(v.title);
    await expect(page.locator('.scope-banner')).toContainText('not evidence that HDR or emulation works');
  }
  await gotoReady(page, '/#play');
  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(page.getByTestId('sim-badge')).toBeVisible();
});

test('every view is reachable through the menu', async ({ page }) => {
  await gotoReady(page, '/');
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toBeVisible();
  for (const v of MENU_VIEWS) {
    await page.locator(`#nav-${v.id}`).click();
    await expect(page).toHaveURL(new RegExp(`#${v.id}$`));
    await expect(page.locator('.view-head h1')).toHaveText(v.title);
  }
  await page.locator('#nav-play').click();
  await expect(page).toHaveURL(/#play$/);
  await expect(page.locator('.menu')).toHaveCount(0);
});

test('the default is built-in ProMotion, D2 on, cap 40, even cadence, and caps follow ADR 0003', async ({ page }) => {
  await gotoReady(page, '/#performance');
  const label = page.getByTestId('perf-presentation-label');
  await expect(page.locator('#panel-mode-promotion')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#frame-cap-40')).toHaveAttribute('aria-checked', 'true');
  await expect(label).toContainText('ProMotion, 4.17 ms steps - cap 40 - even cadence');
  await expect(page.getByTestId('perf-cadence-fit')).toContainText('Cadence fit: even');
  // ProMotion menu: 30, 40, 45, 48, 60 (experimental); no unlocked option
  await expect(page.locator('#frame-cap [role="radio"]')).toHaveText(['30', '40', '45', '48', '60 (experimental)']);
  await expect(page.locator('#frame-cap')).not.toContainText(/unlock|unbound/i);
  // 45 on ProMotion: cadence warning, suggests 40 or 48
  await page.locator('#frame-cap-45').click();
  await expect(label).toContainText('uneven cadence 20.8 / 20.8 / 25.0');
  await expect(page.getByTestId('cap-warning')).toContainText('20.8 / 20.8 / 25.0 ms');
  await expect(page.getByTestId('perf-cadence-fit')).toContainText('Suggested: 40 or 48');
  await page.locator('#use-cap-48').click();
  await expect(label).toContainText('cap 48 - even cadence');
  // fixed 48 Hz offers 48 only
  await page.locator('#panel-mode-fixed48').click();
  await expect(page.locator('#frame-cap [role="radio"]')).toHaveText(['48']);
  // fixed 60 Hz: 45 warns (2,1,1) and suggests 30
  await page.locator('#panel-mode-fixed60').click();
  await page.locator('#frame-cap-45').click();
  await expect(label).toContainText('Fixed 60 Hz - cap 45 - uneven cadence 2:1:1');
  await expect(page.getByTestId('cap-warning')).toContainText('Try 30');
});

test('the A95L menus: fixed 120 Hz by default, HDMI VRR only behind the simulated G6-1 toggle', async ({ page }) => {
  await gotoReady(page, '/#performance');
  await page.locator('#perf-display-a95l').click();
  const label = page.getByTestId('perf-presentation-label');
  await expect(page.locator('#panel-mode-fixed120')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#panel-mode-vrr')).toBeDisabled();
  await expect(page.locator('#vrr-verified')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#frame-cap [role="radio"]')).toHaveText(['30', '40', '45', '60 (experimental)']);
  await page.locator('#frame-cap-45').click();
  await expect(label).toContainText('Fixed 120 Hz - cap 45 - uneven cadence 3:3:2');
  await expect(page.getByTestId('cap-warning')).toContainText('Try 40');
  await expect(page.getByTestId('vrr-a95l-hdmi')).toContainText('Unverified');
  // simulated G6-1 pass: VRR row with 30, 45, 60
  await page.locator('#vrr-verified').click();
  await expect(page.locator('#panel-mode-vrr')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#frame-cap [role="radio"]')).toHaveText(['30', '45', '60 (experimental)']);
  await expect(label).toContainText('HDMI VRR 48-120 Hz - cap 45 - VRR, panel at 90');
  await expect(label).toContainText('host frame doubling');
  await expect(page.getByTestId('perf-cadence-fit')).toContainText('Cadence fit: VRR');
  await expect(page.getByTestId('cap-warning')).toHaveCount(0);
  await expect(page.getByTestId('vrr-a95l-hdmi')).toContainText('Verified (simulated)');
  await page.locator('#vrr-verified').click();
  await expect(page.locator('#panel-mode-fixed120')).toHaveAttribute('aria-checked', 'true');
});

test('without the D2 timing patch only 30 (native) is offered', async ({ page }) => {
  await gotoReady(page, '/#performance');
  await expect(page.locator('#timing-patch')).toContainText('D2 timing patch: owner-supplied, experimental');
  await page.locator('#timing-patch').click();
  await expect(page.locator('#frame-cap [role="radio"]')).toHaveText(['30 (native)']);
  await expect(page.getByTestId('d2-missing')).toContainText('Timing patch missing: 30 (native) only');
  await expect(page.getByTestId('perf-presentation-label')).toContainText('30 (native)');
  await page.locator('#timing-patch').click();
  await expect(page.locator('#frame-cap-40')).toHaveAttribute('aria-checked', 'true');
});

test('backends, hypervisor and shader cache read as ADR 0001 decides', async ({ page }) => {
  await gotoReady(page, '/#performance');
  await expect(page.locator('#backend-moltenvk')).toContainText(
    'Vulkan via MoltenVK 1.4.2-ryujinx.5: current baseline (Khronos deprecated MoltenVK on 2026-10-13)',
  );
  await expect(page.locator('#backend-kosmickrisp')).toContainText('KosmicKrisp: gated variant, separate bundle, needs owner approval');
  await expect(page.locator('#backend-metal')).toContainText('Native Metal backend: not planned (reverted upstream in Ryubing #701)');
  await expect(page.locator('.performance')).toContainText('A+B fix built, in-game validation pending (gate G-AB)');
  await expect(page.getByTestId('hypervisor-warning')).toContainText('Known artifact');
  await expect(page.locator('.performance')).toContainText('about 85-88 s');
});

test('telemetry follows a cap change at once, with motion reduced', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoReady(page, '/#performance');
  await page.locator('#frame-cap-30').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toHaveCount(0);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#dashboard')).toBeVisible();
  const fps = Number((await page.getByTestId('game-fps').textContent())?.trim());
  const p99 = Number.parseFloat((await page.getByTestId('p99-ms').textContent()) ?? '');
  expect(fps).toBeGreaterThan(29);
  expect(fps).toBeLessThan(31);
  expect(p99).toBeGreaterThan(32);
  expect(p99).toBeLessThan(36);
  await expect(page.locator('#dashboard')).toContainText('cap 30');
});

test('the A95L peak does not follow paper white, and the summary flags an untested peak', async ({ page }) => {
  await gotoReady(page, '/#calibrate');
  await page.locator('#profile-a95l').click();
  await page.locator('#step-summary').click();
  await expect(page.locator('.step-card')).toContainText('peak test not run');
  const peakRow = page.locator('tr', { hasText: 'Peak the renderer requests' });
  await expect(peakRow).toContainText('1,300 nits');
  await page.locator('#step-paper').click();
  await page.locator('#paper-white').fill('100');
  await page.locator('#step-summary').click();
  await expect(peakRow).toContainText('1,300 nits');
  await page.locator('#step-peak').click();
  await page.locator('#peak-nits').fill('1400');
  await page.locator('#step-summary').click();
  await expect(peakRow).toContainText('1,300 nits');
  await expect(page.getByTestId('peak-limit-note')).toContainText('capped at 1,300 nits');
});

test('the calibration slider updates its value', async ({ page }) => {
  await gotoReady(page, '/#calibrate');
  await page.locator('#step-paper').click();
  const slider = page.locator('#paper-white');
  await expect(slider).toBeVisible();
  await slider.fill('250');
  await expect(page.locator('#paper-white-value')).toHaveText('250 nits');
  await page.locator('#step-peak').click();
  await page.locator('#peak-nits').fill('1000');
  await expect(page.locator('#peak-nits-value')).toHaveText('1,000 nits');
});

test('no horizontal scroll at a 400 px wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  for (const hash of ['play', 'calibrate', 'performance', 'visuals', 'controller', 'help']) {
    await gotoReady(page, `/#${hash}`);
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const main = document.querySelector('.menu-main');
      return {
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        inner: window.innerWidth,
        mainOver: main ? main.scrollWidth - main.clientWidth : 0,
      };
    });
    expect(m.doc, hash).toBeLessThanOrEqual(m.inner);
    expect(m.body, hash).toBeLessThanOrEqual(m.inner);
    expect(m.mainOver, hash).toBeLessThanOrEqual(0);
  }
  // every calibration step, too
  await gotoReady(page, '/#calibrate');
  for (const step of ['mode', 'paper', 'peak', 'black', 'rolloff', 'gamut', 'measured', 'summary']) {
    await page.locator(`#step-${step}`).click();
    const m = await page.evaluate(() => {
      const main = document.querySelector('.menu-main')!;
      return { doc: document.documentElement.scrollWidth, inner: window.innerWidth, mainOver: main.scrollWidth - main.clientWidth };
    });
    expect(m.doc, step).toBeLessThanOrEqual(m.inner);
    expect(m.mainOver, step).toBeLessThanOrEqual(0);
  }
  await gotoReady(page, '/#play');
  await page.keyboard.press('Backquote');
  await expect(page.locator('#dashboard')).toBeVisible();
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, inner: window.innerWidth, dash: document.querySelector('#dashboard')!.scrollWidth - document.querySelector('#dashboard')!.clientWidth }));
  expect(w.doc).toBeLessThanOrEqual(w.inner);
  expect(w.dash).toBeLessThanOrEqual(0);
});

test('the single-file build loads from file:// with no console errors', async ({ page }) => {
  // dist/ was just built by the web server; inline it into dist-single/ and dist-artifact/
  execFileSync(process.execPath, ['scripts/inline-build.mjs'], { cwd: root, stdio: 'pipe' });
  const file = resolve(root, 'dist-single/totk-luma-demo.html');
  expect(existsSync(file)).toBe(true);
  const errors = trackErrors(page);
  await gotoReady(page, pathToFileURL(file).href);
  await expect(page.getByTestId('sim-badge')).toBeVisible();
  await page.keyboard.press('Backquote');
  await expect(page.locator('#dashboard')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('the dashboard shows the source mode, label classes, UI white and the cadence fit', async ({ page }) => {
  await gotoReady(page, '/');
  await page.keyboard.press('Backquote');
  const dash = page.locator('#dashboard');
  await expect(dash).toBeVisible();
  await expect(page.getByTestId('source-mode')).toHaveText('Scene HDR (tonemap replaced, planned P3)');
  await expect(dash.locator('.pipeline')).toContainText('Simulated');
  await expect(dash).toContainText('RGBA16F extended-linear sRGB, EDRMetadata nil, app-side tone mapping');
  await expect(dash).not.toContainText('extended-linear P3');
  await expect(dash).toContainText('signal (computed)');
  await expect(dash).toContainText('profile (target)');
  await expect(dash).toContainText('measured');
  await expect(page.getByTestId('ui-white')).toContainText('173');
  await expect(dash).toContainText('paper white x 0.85');
  await expect(page.getByTestId('looks-stage')).toHaveText('Scene stage + display stage');
  await expect(page.getByTestId('cadence-fit')).toContainText('Cadence fit: even');
  await expect(page.getByTestId('presentation-label')).toContainText('cap 40');
  // compact layout keeps the source mode visible
  await page.locator('#dash-layout-compact').click();
  await expect(page.getByTestId('source-mode')).toHaveText('Scene HDR (tonemap replaced, planned P3)');
  // the Faithful SDR preset is labelled SDR, with display-stage looks only
  await page.keyboard.press('Escape');
  await page.locator('#nav-visuals').click();
  await page.locator('#preset-faithful').click();
  await page.keyboard.press('Backquote');
  await page.locator('#dash-layout-full').click();
  await expect(page.getByTestId('source-mode')).toHaveText('SDR (as the game outputs)');
  await expect(page.getByTestId('looks-stage')).toHaveText('Display stage only (approximate)');
});

test('measured readings carry their window size, date and instrument in the dashboard', async ({ page }) => {
  await gotoReady(page, '/#calibrate');
  await page.locator('#step-measured').click();
  await page.locator('#measured-peak').fill('1162');
  await page.locator('#measured-date').fill('2026-11-01');
  await page.locator('#step-summary').click();
  await expect(page.locator('.step-card')).toContainText('peak 1,162 nits (10% window); 2026-11-01, instrument not entered');
  await page.locator('#step-measured').click();
  await page.locator('#measured-instrument').fill('Example meter');
  await page.keyboard.press('Escape');
  // the view follows the hash; wait until the menu (and its focused text field) is gone
  await expect(page).toHaveURL(/#play$/);
  await expect(page.locator('#measured-instrument')).toHaveCount(0);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#dashboard .measured-list')).toContainText('Peak 1,162 nits, 10% window, 2026-11-01, Example meter');
  // ADR 0002 D9: Mac nits appear only as "assumed N nits at EDR 1.0"
  await expect(page.locator('#dashboard')).toContainText('assumed 203 nits at EDR 1.0');
});

test('the paper-white step shows UI white at paper white x 0.85', async ({ page }) => {
  await gotoReady(page, '/#calibrate');
  await page.locator('#step-paper').click();
  await expect(page.getByTestId('ui-white-line')).toContainText('173 nits = paper white 203 x 0.85');
  await page.locator('#paper-white').fill('100');
  await expect(page.getByTestId('ui-white-line')).toContainText('85 nits = paper white 100 x 0.85');
  await page.locator('#step-mode').click();
  await expect(page.locator('.step-card')).toContainText('Dolby Vision: not supported (no macOS signalling path; licensed SDK). HDR10 / EDR only.');
});

test('the controller view: mute toggles the dashboard, owner-wins automation, reconnect toast', async ({ page }) => {
  await gotoReady(page, '/#controller');
  const view = page.locator('.view.controller');
  await expect(view).toContainText('SDL3 HIDAPI (v1)');
  await expect(view).toContainText('USB is recommended for measurement sessions');
  await expect(view).toContainText('USB and Bluetooth have different device ids');
  await expect(view).toContainText('Haptics and adaptive triggers: not available, separate track.');
  await expect(view).not.toContainText('Create + touchpad');
  await expect(page.locator('.mapping-info')).toContainText('Mute button');
  await expect(page.locator('.mapping-info')).toContainText('Dashboard toggle');
  // owner wins: a physical press stops the agent pad until an explicit resume
  await page.locator('#agent-pad').click();
  await expect(page.getByTestId('agent-owner')).toContainText('Agent controls Player 1');
  await page.locator('#simulate-owner-input').click();
  await expect(page.getByTestId('agent-owner')).toContainText('Agent stopped: you took control');
  await page.locator('#agent-resume').click();
  await expect(page.getByTestId('agent-owner')).toContainText('Agent controls Player 1');
  // a disconnect shows a toast and no pause by default (ignore_applet)
  await page.locator('#pad-connection-bluetooth').click();
  await page.locator('#simulate-disconnect').click();
  await page.locator('#nav-play').click();
  await expect(page.locator('#pad-toast')).toContainText('Controller disconnected (Bluetooth)');
  await expect(page.locator('.pause-overlay')).toHaveCount(0);
  await page.locator('#pad-toast button').click();
  await expect(page.locator('#pad-toast')).toHaveCount(0);
});

test('visuals show the stage of every look, Clear Air and the ReShade FX plan', async ({ page }) => {
  await gotoReady(page, '/#visuals');
  await expect(page.getByTestId('stage-exposure')).toHaveText('Scene stage');
  await expect(page.getByTestId('stage-vibrance')).toHaveText('Scene stage');
  await expect(page.getByTestId('stage-highlight-saturation')).toHaveText('Display stage');
  await expect(page.getByTestId('stage-sharpening')).toHaveText('Display stage');
  await expect(page.locator('#clear-air')).toContainText('never bundles');
  await expect(page.locator('#clear-air')).toContainText('display-stage approximation');
  await expect(page.locator('#reshade-fx')).toContainText('reshadefx');
  await expect(page.locator('#reshade-fx')).toContainText('librashader is not adopted');
});

test('help covers HDR, the A95L port and tone mapping, 45 judder, flashes, cache and Dolby Vision', async ({ page }) => {
  await gotoReady(page, '/#help');
  const help = page.locator('.view.help');
  await expect(help).toContainText('High Dynamic Range');
  await expect(help).toContainText('HDR Tone Mapping Off');
  await expect(help).toContainText('HDMI 3 or 4');
  await expect(help).toContainText('Enhanced format');
  await expect(page.locator('#help-judder')).toContainText('40 or 48');
  await expect(page.locator('#help-flash')).toContainText('hypervisor flash issue');
  // gate ids never wrap at their hyphen ("gate G-" / "AB")
  await expect(page.locator('#help-flash .nobr')).toHaveText(['G-AB']);
  await expect(page.locator('#help-stutter')).toContainText('85-88 s');
  await expect(page.locator('#help-dv')).toContainText('Dolby Vision: not supported (no macOS signalling path; licensed SDK). HDR10 / EDR only.');
  await expect(help).not.toContainText('HGIG tone mapping');
});
