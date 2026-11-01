# TOTK Luma - visual scope demo

An interactive web demo of the future TOTK Luma Mac app, built for **visual scope approval**.

It shows what the app would look like and what it would let the owner do. It is **not** evidence that
HDR or emulation works.

> Everything here is simulated: the game view is an original procedural scene, every HDR value is shown
> as an SDR preview in the browser, and all telemetry (FPS, frame times, cadence, GPU load, costs,
> display detection, VRR states, controller state) is generated. The demo says so on screen.

No Nintendo or Sony assets, logos, fonts, sounds, characters, UI likeness or controller artwork are
used. Product names appear as text only.

The demo follows the architecture decision records in `docs/adr/` (ADR 0001-0006). Where the demo and
an ADR disagree, the ADR wins.

---

## Features

| Area | What the demo shows | Source |
| --- | --- | --- |
| Dashboard toggle | The DualSense **mute** button toggles the dashboard (fallback chord Create + Options held 0.5 s if mute does not reach SDL); the backquote key is the keyboard toggle | ADR 0004 |
| Dashboard | Headroom, clipping, histogram, waveform, frame time, frame rate, presentation, and a **Source and pipeline** panel: source mode, look stages, output format, backend, CPU profile, who owns Player 1 | ADR 0002 D9 |
| Source mode | Always visible while the dashboard is open: "Scene HDR (tonemap replaced, planned P3)", "Expanded SDR (inverse tonemap fallback)" or "SDR (as the game outputs)". The demo simulates Scene HDR (labelled Simulated) with HDR on, and SDR with the Faithful SDR preset; it never simulates Expanded SDR | ADR 0002 D3 |
| Output | RGBA16F extended-linear sRGB (`EXTENDED_SRGB_LINEAR`), wide gamut carried as values outside 0-1, `EDRMetadata` nil, app-side tone mapping; on the A95L macOS converts EDR to HDR10 over HDMI | ADR 0002 D3, D4 |
| UI white | UI drawn at paper white x 0.85 (UI scale 0.6-1.0), shown in Calibrate step b and in the dashboard | ADR 0002 D9 |
| Labels | Every number is **signal (computed)**, **profile (target)** or **measured** (meter readings with window size, date and instrument). MacBook nits appear only as "assumed N nits at EDR 1.0" | ADR 0002 D9, R09 |
| Frame caps | Per-display menus: ProMotion 30/40/48/60 (+45 with a 20.8 / 20.8 / 25.0 ms warning, try 40 or 48); built-in fixed 60 Hz 30/60 (+45, 2,1,1, try 30); fixed 48 Hz 48 only; A95L fixed 120 Hz 30/40/60 (+45, 3,3,2, try 40); A95L fixed 60 Hz 30/60 (+45, try 30); A95L HDMI VRR 30/45/60 only behind the simulated "VRR verified (gate G6-1)" toggle. 60 is experimental. Without the D2 timing patch only "30 (native)". No unlocked or Unbounded cap | ADR 0003 §1-2 |
| Pacing | ProMotion modelled as discrete 4.17 ms steps (120, 80, 60, 48, 40, 34.3, 30 Hz ...), not continuous VRR; the presentation strip shows the cadence fit ("even", "uneven" or "VRR") and the suggested neighbour; host frame doubling below the reported 48 Hz VRR floor | ADR 0003 |
| Backends | MoltenVK 1.4.2-ryujinx.5 is the current baseline (Khronos deprecated MoltenVK on 2026-10-13); KosmicKrisp is a gated variant in a separate bundle; native Metal is not planned (reverted upstream in Ryubing #701) | ADR 0001 D2 |
| Hypervisor | "A+B fix built, in-game validation pending (gate G-AB)", with the known flash-artifact warning | ADR 0001 |
| Dolby Vision | "Dolby Vision: not supported (no macOS signalling path; licensed SDK). HDR10 / EDR only." in Calibrate step a and Help | ADR 0005 |
| Looks | Each slider shows its stage: scene stage (scene-linear, before the tonemap) or display stage (in nits, after it). Clear Air prefers the owner-installed Serfrost mod, never bundled; otherwise a display-stage approximation. ReShade FX through reshadefx is a later gated phase; librashader is not adopted | ADR 0006 |
| Controller | SDL3 HIDAPI for v1; USB recommended for measurement sessions; one profile binds both the USB and the Bluetooth ids; a disconnect shows a toast (no controller dialog); owner-wins automation (any physical input stops the agent pad until an explicit resume); haptics and adaptive triggers are a separate track | ADR 0004 |
| Help | macOS "High Dynamic Range" toggle; A95L HDMI 2.1 port (HDMI 3 or 4) with Enhanced format and HDR Tone Mapping Off for HGIG-style calibration; 45 judder (switch to 40 or 48); hypervisor flashes; cold shader cache (about 85-88 s on a new build); Dolby Vision | ADRs, research notes |

## What is simulated

Everything. In particular:

- the game view (an original procedural scene) and every HDR value (an SDR preview in the browser);
- all telemetry: FPS, frame times, cadence, GPU load and cost estimates;
- display detection, headroom, panel modes and VRR states, including the "VRR verified (gate G6-1)"
  toggle, which stands in for an attended test that has not happened;
- the "D2 timing patch: owner-supplied, experimental" toggle (the patch itself is never in this repository);
- the controller: bus, battery, connect and disconnect, rumble, gyro, the agent pad and its owner-wins stop;
- the Serfrost mod state ("not detected"), and saving, which only writes to this browser's local storage.

---

## Requirements

- Node.js 22.12 or newer (developed with Node 22.23 and npm 10.9).
- For the end-to-end tests and screenshots: a cached Playwright **chromium-headless-shell, revision
  1248**. `@playwright/test` 1.64.1 uses that revision, so an existing Playwright cache is found
  automatically. Do not run `playwright install` just for this demo.
  - To use a different headless shell binary, set `PW_CHROMIUM_PATH` to its path.

Everything runs headless. Nothing opens a browser window.

---

## Run and preview

All commands run from this `demo/` folder.

| Task | Command | Result |
| --- | --- | --- |
| Install exact, locked dependencies | `npm ci` | Uses `package-lock.json` |
| Development server | `npm run dev` | <http://localhost:5199/> (strict port) |
| Production build and preview | `npm run build && npm run preview` | <http://localhost:5199/> |
| Single-file builds | `npm run build:single` | See below |

Stop `dev` or `preview` with Ctrl+C.

**What to look at in the preview.** Press `` ` `` for the dashboard (source mode and pipeline on the
right, label classes on the left, cadence fit at the bottom right). Press `Esc` for the menu, then:
Performance to switch display and panel mode, try 45 and see its warning, turn the simulated
"VRR verified (gate G6-1)" toggle on the A95L, and turn the D2 patch off; Calibrate step b for UI white;
Visuals for the look stages; Controller for the owner-wins stop. Without a server, open
`dist-single/totk-luma-demo.html` after `npm run build:single`.

### Single-file builds

`npm run build:single` runs `npm run build` (type check, then `vite build` configured for one JS chunk,
one CSS file and inlined assets) and then `scripts/inline-build.mjs`, a small Node script with no extra dependency. It writes:

- `dist-single/totk-luma-demo.html` - a complete HTML document that works when opened from `file://`.
- `dist-artifact/totk-luma-scope.html` - the same page as a fragment for a Claude Artifact: no doctype,
  `html`, `head` or `body` tags. It starts with `<title>`, then
  `<meta name="claude:viewport-fit-sides" content="cover">`, then `<style>`, the root `div` and the
  inline module script. Any `</script` inside the inlined JavaScript is escaped.

---

## Checks

| Check | Command | What it covers |
| --- | --- | --- |
| Type check | `npm run typecheck` | TypeScript strict mode, app and tooling projects |
| Lint | `npm run lint` | ESLint flat config, typescript-eslint, react-hooks |
| Unit tests | `npm test` | `vitest run` over the simulation core in `src/sim/` and the derived state in `src/state/` |
| End-to-end | `npm run e2e` | Playwright, headless; builds and previews on port 5199 itself |
| Screenshots | `npm run screenshots` | Writes `screenshots/*.png` (same automatic server) |

The Playwright web server is started and stopped by Playwright, so no server is left running.
The e2e suite also inlines the fresh build and opens `dist-single/totk-luma-demo.html` from `file://`.

### Unit tests (simulation core)

- PQ (SMPTE ST 2084): PQ(0) = 0, PQ(10,000) = 1, PQ(100) is about 0.508, PQ(1,000) is about 0.752,
  and decode(encode(x)) is about x.
- Every tone mapper (hard clip, extended Reinhard, BT.2390 EETF, Luma soft knee) is monotonic and never
  exceeds the peak; the EETF is the identity below its knee.
- Cadence (ADR 0003 arithmetic): 30 on fixed 60 is 2:2; 45 on fixed 60 is 2,1,1; 45 on fixed 120 is
  3,3,2; 40 on 120 is even; ProMotion holds 30, 40, 48 and 60 evenly (8, 6, 5 and 4 steps of 4.17 ms)
  and 45 at best as 20.8 / 20.8 / 25.0 ms; HDMI VRR 48-120 shows 60 natively and doubles 30 and 45
  to 60 and 90 Hz.
- Cap menus: every row of ADR 0003 §2, "30 (native)" only without D2, no option above 60 or unlocked,
  HDMI VRR only after the simulated G6-1 pass, and the fallback when a cap is not on the menu.
- Source modes use the ADR 0002 names; look stages: highlight chroma acts after the tonemap (display
  stage) and vibrance before it (scene stage).
- UI white is paper white x 0.85 by default and follows the UI scale; measured readings start empty and
  carry their date and instrument, or say they were not entered.
- Waveform labels keep at least 12 px apart and the top label stays inside the canvas; gate ids, dates
  and numeric ranges such as "G-AB", "2026-10-13" and "8.33-41.67" never wrap at their hyphen.
- Histogram counts sum to the pixel count; the clip percentage is right on a synthetic buffer.
- Display headroom: on the A95L (HDR10 PQ) the computed peak does not change with paper white, and a
  calibrated peak above the example panel peak is capped and reported; on the MacBook the EDR headroom
  limits the peak at low paper white.
- GPU load falls when the frame cap leaves the GPU idle; the default is ProMotion, D2 on, cap 40, even
  cadence; a cap the scene cannot reach paces at the real frame rate and says so.

### End-to-end tests

- Loads with no console errors; the SIMULATED badge is visible; the intro names the mute button.
- The backquote key toggles the dashboard.
- Every view is reachable through the menu and through its hash.
- The default is ProMotion, D2 on, cap 40, even cadence; the ProMotion, fixed 60 Hz and fixed 48 Hz
  menus, the 45 cadence warning and its suggested caps.
- The A95L fixed 120 Hz menu, and HDMI VRR only behind the simulated G6-1 toggle (45 doubled to 90 Hz).
- Without the D2 timing patch only "30 (native)" is offered.
- Backend, hypervisor and shader-cache wording from ADR 0001.
- The dashboard shows the source mode (also in the compact layout and as SDR for Faithful SDR), the
  three label classes, UI white and the cadence fit; measured readings carry window size, date and
  instrument (also in the Summary), and MacBook nits read "assumed 203 nits at EDR 1.0".
- Calibrate step b shows UI white at paper white x 0.85; step a shows the Dolby Vision statement.
- Controller: mute toggle, SDL3 HIDAPI, bus advice, owner-wins stop and resume, disconnect toast.
- Visuals: the stage of each look, Clear Air with Serfrost, the ReShade FX plan.
- Help: HDR toggle, A95L port and tone mapping, 45 judder, flashes, cold cache, Dolby Vision.
- The calibration slider updates its value.
- Telemetry follows a cap change at once, with reduced motion (cap 30 gives about 30 FPS and a p99 of
  about 33 ms on the dashboard).
- On the A95L the requested peak stays at 1,300 nits when paper white changes, a 1,400-nit pattern
  result is capped with a note, and the Summary says when the peak test was not run.
- At a 400 px wide viewport there is no horizontal scroll.
- `dist-single/totk-luma-demo.html` loads from `file://` with no console errors.

### Screenshots

Saved at 1440 x 900 unless noted, with reduced motion so frames are stable:
`play.png`, `dashboard.png`, `calibrate-peak.png`, `calibrate-rolloff.png`, `performance.png`,
`visuals-split.png`, `controller.png`, `help.png`, and `mobile-dashboard.png` (400 x 860).

---

## Using the demo

| Input | Action |
| --- | --- |
| `` ` `` (backquote) | Toggle the HDR and performance dashboard. On the DualSense the toggle is the mute button (ADR 0004). |
| `Esc` | Open the menu from the game view; return to the game from the menu. |
| Mouse move or tap | Reveals small Dashboard and Menu buttons, which hide again after about 2.5 s. |

Views are hash-routed: `#play` (default), `#calibrate`, `#performance`, `#visuals`, `#controller`,
`#help`. With `prefers-reduced-motion: reduce` (or `?still` in the URL) the scene and telemetry pause.

Settings persist in this browser's `localStorage` only (every access is wrapped in `try`/`catch`).

---

## How the simulation works

| Module | Purpose |
| --- | --- |
| `src/sim/color.ts` | PQ encode and decode, sRGB transfer, BT.709 / P3 / BT.2020 matrices derived from primaries, luminance, EDR headroom (1.0 = paper white; headroom = peak / paper white) |
| `src/sim/tonemap.ts` | Hard clip, extended Reinhard, BT.2390 EETF, Luma soft knee, and the SDR preview mapping |
| `src/sim/scene.ts` | Deterministic procedural scene in scene-linear nits: sky gradient, sun disc (7,500 nits), clouds, floating rock islands, sea glints (up to about 4,200 nits), terrain, lantern, haze |
| `src/sim/pipeline.ts` | Grade, tone map to the display, SDR preview, 8-bit sRGB; zebra and false-colour overlays |
| `src/sim/scopes.ts` | Log-bin histogram, PQ waveform, clipping statistics |
| `src/sim/pacing.ts` | Cadence on a fixed panel, on ProMotion's 4.17 ms step grid and under HDMI VRR with host frame doubling; cadence fit; seeded frame times with cold-cache spikes; average FPS, 1% low, p99 |
| `src/sim/caps.ts` | Panel modes per display and the cap menus of ADR 0003 §2, with cadence warnings and suggested caps |
| `src/sim/source.ts` | Source-mode names (ADR 0002) and look stages (ADR 0006) |
| `src/sim/telemetry.ts` | An invented workload model (GPU-bound in open sky at 1.2x) that drives the simulated readouts |
| `src/sim/presets.ts`, `src/sim/displays.ts` | Visual presets; display profiles with a source and a status for every value |

The scene renders at 480 x 270 into a `Float32Array` of scene-linear nits, then is graded, tone mapped
to the active display profile and drawn to a canvas that the browser upscales. It animates at about
30 Hz and pauses under reduced motion.

### SDR preview of simulated HDR values

A browser shows SDR, so display nits are mapped to linear sRGB before encoding:

- 0 to paper white maps linearly to 0 to 0.62 (about 0.81 as an sRGB code value), so diffuse white and
  UI sit below the top of the range;
- paper white to the display peak is squeezed into 0.62 to 1.0 by a Reinhard-style shoulder that reaches
  exactly 1.0 at the peak.

The preview shows relative structure (what clips, what rolls off), never real brightness. Because
SDR paper white sits at about 81% grey, the Faithful SDR half of the Visuals before/after split looks
greyer than real SDR on an SDR screen; a caption under the split says so. Some
calibration patterns (peak, near-black, highlight ramp) stretch their greys further and say so.

---

## Dependencies

Pinned to exact versions published before 2026-10-15 (`.npmrc` sets `save-exact` and
`before=2026-10-15`), with `package-lock.json` committed.

| Package | Version | Kind |
| --- | --- | --- |
| react, react-dom | 19.2.9 | runtime |
| vite | 8.3.4 | dev |
| @vitejs/plugin-react | 6.1.2 | dev |
| typescript | 6.0.3 | dev |
| vitest | 5.0.4 | dev |
| eslint | 10.12.0 | dev |
| typescript-eslint | 8.71.2 | dev |
| eslint-plugin-react-hooks | 7.1.1 | dev |
| @playwright/test | 1.64.1 | dev (bundles chromium-headless-shell revision 1248) |
| @types/react | 19.2.18 | dev |
| @types/react-dom | 19.2.7 | dev |
| @types/node | 24.19.2 | dev (types for the Vite and Playwright configs) |

---

## Where the real plan lives

See `docs/` at the repository root for the overview, requirements, decisions and research notes, and
`docs/evidence/` for the bounded prior measurements this demo's copy refers to.
