# QA report - TOTK Luma visual scope demo

Reviewer role: QA lead and product designer, fresh eyes.
Date: 2026-11-01.
Scope: everything under `demo/`. No code was changed for this review.

All gameplay, HDR values and telemetry in the demo are simulated. This report judges the demo as a scope preview, not as proof of HDR or emulation.

---

## 1. Command results

All commands were run in `demo/`. `node_modules/` was already present, so `npm ci` was skipped (as the brief allows). `npm ls --depth=0` reports a clean tree that matches the lock file.

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | Pass (exit 0) | `tsc -b --noEmit`, no output |
| `npm run lint` | Pass (exit 0) | No findings |
| `npm test` | Pass, 46 of 46 | 4 test files, about 150 ms |
| `npm run build` | Pass | One JS chunk (300.17 kB, 96.25 kB gzip), one CSS file (32.29 kB) |
| `npm run build:single` | Pass | `dist-single/totk-luma-demo.html` and `dist-artifact/totk-luma-scope.html`, 325 KB each |
| `npm run e2e` | Pass, 8 of 8 | 7.5 s, headless |
| `npm run screenshots` | Pass, 9 of 9 | 9.6 s; the PNGs were rewritten |
| Port 5199 afterwards | Free | No server left running |

Other checks:

- No absolute home paths, usernames or email addresses appear in the source, the build output or the docs in `demo/`.
- The fragment build starts with `<title>`, then the `claude:viewport-fit-sides` meta, then `<style>`, the root div and the inline module script, as specified.
- There are no `alert`, `confirm` or `prompt` calls. Every `localStorage` access is wrapped in try/catch.
- No webfonts are loaded.

Extra headless checks were run against the `file://` single-file build: full-page captures of every view and calibration step at 1440 px and 400 px, the A95L profile, the dashboard toggles, a cold cache with motion on, and the controller states. No console errors or warnings appeared and no dialogs opened.

---

## 2. Issue list (highest severity first)

Severity scale:

- **High:** shows the owner a wrong or self-contradicting picture of the product, which could skew the scope decision.
- **Medium:** a visible defect or a misleading detail in a key screen.
- **Low:** polish, copy or minor consistency.
- **Info:** a watch item with no change required.

### High

**H1. A95L peak depends on paper white, and the calibrated peak is silently overridden**

- **Where:** `src/sim/displays.ts` (A95L `potentialHeadroom: 6.4`) and `src/state/store.ts` `headroomFrom()`.
- **What is wrong:** the renderer peak is `paperWhite x min(potentialHeadroom, peak / paperWhite)`. For the A95L, the 6.4x ceiling comes from 1,300 / 203. So:
  - paper white 100 gives a renderer peak of **640 nits**;
  - paper white 203 gives **1,299 nits** (a rounding artefact that shows up on the dashboard and on the roll-off chart as "display peak 1,299");
  - a peak-test result of 1,400 nits is capped to 1,299 with no explanation (Summary: "Peak (from the pattern) 1,400" next to "Peak the renderer requests 1,299").

  HDR10 PQ is absolute. The TV's peak must not shrink when the owner lowers paper white. This contradicts the product's core promise of separate calibrated profiles.
- **Fix:**
  - For HDR10 PQ profiles, compute the renderer peak as `min(calibrated peak, example panel peak in nits)`, independent of paper white. Derive headroom only for display (`peak / paperWhite`).
  - Store the A95L ceiling in nits, not as a ratio.
  - When the calibrated peak is above the example panel peak, say so in the Summary ("capped at the example panel peak - to be measured").
  - Add a unit test: changing paper white on the A95L does not change the computed peak.

**H2. Telemetry goes stale: the FPS, frame-time and 1% low readouts ignore setting changes**

- **Where:** `src/state/useTelemetry.ts`, which only appends frames while `live`. `live` is false in every menu view, while paused, and always under reduced motion.
- **What is wrong:**
  - On Performance, setting the cap to 30 updates the cadence blocks to 33.3 ms, but the frame-time graph in the same card still reads 22.4 ms at the 45 FPS line.
  - Opening the dashboard right after that shows "Game FPS 44.0 - cap 30" and takes about 10 s to converge (38.1 after 3 s).
  - With prefers-reduced-motion, the numbers never update: Game FPS stays at 45.0 with "cap 30", 1% low 44.3 and p99 22.5 ms. The same happens with the paused overlay after the timing patch is switched off.
  - The screenshot run uses reduced motion, so any future screenshot after a settings change would show contradictory data.
- **Fix:** when the simulation input changes, regenerate the 300-frame window at once (`simulateFrames(input, FRAME_WINDOW, seed)`) instead of waiting for live frames. Keep live appending only for animation. Add an e2e test: set the cap to 30, open the dashboard, and expect Game FPS to be about 30 and p99 to be about 33 ms.

### Medium

**M1. The paper-white scale has misplaced tick labels**

- **Where:** Calibrate step b, `StepPaper` in `src/views/CalibrateView.tsx` (`.hb-scale`).
- **What is wrong:** markers are placed on a log axis from 1 to max(peak, 1600), but the labels 1, 10, 100 and 1k are spread evenly as if the axis ran from 1 to 1000. The "1k" label sits at the right edge, where the value is actually 1,600. The paper-white marker reads 203 but sits where the labels imply about 145. This breaks the rule that axis labels must name values the chart actually reaches.
- **Fix:** position each tick with the same `pos()` function, absolutely, and label the end value (for example "1.6k").

**M2. The Summary claims a pattern result the owner never produced**

- **Where:** Calibrate step h.
- **What is wrong:** "Peak (from the pattern): 1,600 nits" is shown even when step c was never visited. 1,600 is just the spec default, so the line presents a spec value as a calibration result.
- **Fix:** track whether the peak test was run. Otherwise show "1,600 nits - spec default, peak test not run" with an "example / spec" chip.

**M3. The before/after split makes Faithful SDR look greyer than real SDR**

- **Where:** Visuals before/after, and `sdrPreview()` with `SDR_PREVIEW_WHITE = 0.62`.
- **What is wrong:** in the SDR preview, SDR paper white maps to about 81% sRGB grey, while the HDR side uses the full range up to 1.0. The left half therefore looks dull and washed out, which overstates the HDR benefit. The mapping is documented in the README, but not on the split itself.
- **Fix:** add a caption under the split: "Both halves use the same SDR preview mapping: paper white is held at 81% grey so highlights have room. Real SDR on an SDR screen looks brighter." Alternatively, offer a "Faithful SDR at full white" reference toggle.

**M4. The cadence timeline is unreadable at 400 px**

- **Where:** Performance, Cadence timeline, at narrow widths.
- **What is wrong:** the SVG scales down, so "display refresh (90 Hz)", "game frames on screen" and the block labels render at about 6 px. The frame-rate cadence strip is fine.
- **Fix:** at 760 px or less, render fewer refresh periods (for example 60 ms of the timeline) at a fixed pixel size, or use a viewBox that keeps text at 11 px or more. Add a screenshot of Performance at 400 px.

**M5. Overlapping labels on the dashboard histogram and waveform**

- **Where:** Dashboard, `src/components/charts.tsx`.
- **What is wrong:**
  - Histogram: "paper white 203" overlaps "display peak 1600", and "SDR ref 100" sits on the histogram bars.
  - Waveform: the "203" and "100" ticks touch each other.

  These are the hero HDR graphs in `dashboard.png`.
- **Fix:** stagger the marker labels into rows (peak on top, paper white in the middle, SDR ref at the bottom) with a background pill, or move them below the axis. On the waveform, drop the 100 tick label when 203 is shown, or offset it. A taller histogram (about 140 px in the full layout) would also help.

**M6. The roll-off ramp barely shows a difference between curves**

- **Where:** Calibrate step e, the highlight ramp.
- **What is wrong:** the "Luma soft knee" and "Hard clip" ramps look almost identical. Both reach near white by about 1k nits, so the ramp does not sell the roll-off concept, which is the main HDR promise. In one capture (A95L with BT.2390 EETF) the ramp labels were also cut off on the left ("F", "ip").
- **Fix:**
  - Stretch only the range from the knee to the peak (for example 500 to 1,600 nits mapped to the full grey range), or draw band steps (500, 800, 1,000, 1,300, 1,600, 3,000, 10,000) so the hard clip visibly merges bands.
  - Give the labels a fixed minimum width with no transition.

### Low

**L1. The knee slider stays active for curves that ignore it.** In step e, with Hard clip, Extended Reinhard or BT.2390 EETF selected, "Knee start (Luma soft knee)" remains enabled. Fix: disable it with a hint ("Only used by Luma soft knee"), or hide it.

**L2. The "Display refresh" selector disagrees with the shown refresh.** Under Auto/VRR with "120 Hz" selected, the timeline and dashboard say 90 Hz (LFC doubling). Fix: rename the control "Maximum refresh" under VRR, and add "panel runs at 90 Hz (45 x 2, LFC)" to the presentation line.

**L3. GPU load ignores the cap.** With the cap held at 30 (timing patch off), GPU load still reads 96% for 20 ms of GPU work per frame, when it should be about 60%. Fix: GPU load = `gpuMs / frame interval at the effective cap`.

**L4. Copy in the presentation strings.**
- "even cadence 2" (fixed 60, cap 30) should read "even cadence 2:2" or "each frame shown 2 refreshes".
- "(LFC x2)" wraps with the "x2)" orphaned in the dashboard card. Keep it together with a non-breaking space.

**L5. The scope banner scrolls away.** On long views (roll-off, Performance, Visuals) the banner leaves the viewport, as `calibrate-rolloff.png` shows. Fix: make `.scope-banner` sticky at the top of `.menu-main` (compact height when stuck).

**L6. The SIMULATED badge loses its subtitle at 400 px.** "SDR preview of simulated HDR values" is hidden on narrow screens. When the mobile dashboard is scrolled, the badge also overlaps chart text (the waveform axis). Fix: keep a short subtitle ("SDR preview") and give the dashboard a top padding equal to the badge height.

**L7. The intro toast only talks about keys.** On touch screens it mentions backquote and Esc only. Tapping does reveal the Dashboard and Menu buttons (verified), but the toast does not say so. Fix: on coarse pointers, add "Tap the scene to show the Dashboard and Menu buttons."

**L8. Compact dashboard readouts have no per-item tag.** Only the header says "SIMULATED TELEMETRY". The brief asks that every graph and readout carry a tag. Fix: add a small "Simulated" tag to the compact card, or accept the header tag as covering it and note that decision.

**L9. The zebra label overstates clipping.** "Zebra on clipped pixels" marks pixels above the display peak in the scene, which the soft roll-off compresses rather than clips (the panel text says so). Fix: rename it "Zebra above display peak" and keep "clipped" for Hard clip.

**L10. The first false-colour legend cell is unreadable.** "0.01" is dark text on a near-black cell. Fix: use a light label on the dark stops.

**L11. Frame-time spikes run off the chart unlabelled.** With a cold cache, spikes are capped with arrows at the top, and the chart never names their value. Fix: add a 50 ms guide or label the tallest spike ("89 ms").

**L12. Gamepad labels are tiny at 400 px.** L2, R2 and the face letters render at about 6 to 7 px, and the hit targets are below 24 px. Fix: give the diagram a minimum width with horizontal centring, or a tap list fallback ("Show all mappings").

**L13. Nested parentheses in the A95L peak copy.** It reads "clips at 1,300 nits (example - to be measured: Example value from third-party reviews of the A95L; to be measured by the owner (10% window, about 1,300 nits))". Fix: "Simulated panel clips at 1,300 nits. This is an example from third-party reviews, to be measured by the owner."

**L14. `build:single` skips type checking.** It runs `vite build` without `tsc -b`, unlike `build`. Fix: `npm run build && node scripts/inline-build.mjs`.

**L15. The scene is heavy for its preview role.** In headless Chromium with the dashboard open, `requestAnimationFrame` ran at about 18 per second, because scene grading and scopes run on the main thread. It is fine on an M4 Pro, but it may stutter inside an artifact on a phone. Fix (optional): lower the scope update rate to about 10 Hz, or move grading to a worker.

**L16. Empty space in some cards.** The Cadence timeline card (lower half), Motion aiming (to the right of the gyro box), and Rumble before a test all leave large blank areas. The frame-time graph also has a lot of unused height. Fix: tighten the card heights or add a one-line explanation of the state, for example "Press Test rumble to see motor levels."

### Info (no change required)

**I1. Gamepad silhouette.** The diagram is original and tagged "GENERIC DIAGRAM", with no logos or glyph artwork. Its outline is close to a DualSense (centre touchpad, two pills, mute dot). That is acceptable under the rules, but keep it this abstract.

**I2. Untested interactions.** Pointer drag on the roll-off curve and the split handle is still untested (the handle is a proper `role="slider"`). Neither Safari nor the artifact fragment inside a real Claude Artifact has been tested.

---

## 3. Screenshot review

| Screenshot | Verdict | Notes |
|---|---|---|
| `play.png` | Good | Clean scene, legible badge, clear toast. The scene reads as original sky islands, with no proprietary motifs. The upscale is pixelated but acceptable for a placeholder. |
| `dashboard.png` | Good, with defects | Strong hierarchy. Computed and measured nits are clearly separated. Label collisions (M5). The frame-time graph is flat (warm cache), so it does not show the spike colouring. Consider a cold-cache variant. |
| `calibrate-peak.png` | Good | The pattern, state callout and step pills are clear. |
| `calibrate-rolloff.png` | Good chart, weak ramp | The log-log plot is excellent. The ramp does not differentiate the curves (M6). The scope banner is scrolled out of view (L5). |
| `performance.png` | Good | Shows only the top half. The game-speed guard, resolution, backend, shader cache and hypervisor sections are below the fold but present and well done. Consider a taller capture. |
| `visuals-split.png` | Good | The split, preset cards and defog caveat are clear. The SDR side looks greyer than real SDR (M3). The cost estimate and the ReShade placeholder are below the fold. |
| `controller.png` | Good | Original diagram, mapping card, automation card with ESTOP and the "off by default" chip. |
| `help.png` | Good | All 7 troubleshooting cards, Export diagnostics and About are present. |
| `mobile-dashboard.png` | Acceptable | Panels stack well, with no horizontal scroll. The badge subtitle is dropped (L6). The panels cover most of the scene once scrolled. |

---

## 4. Brief coverage

| Requirement | Status |
|---|---|
| Views and hash routing (#play default, calibrate, performance, visuals, controller, help; no forbidden names) | Present, all reachable through the menu and the hash |
| Toast, auto-hiding buttons (2.5 s), Esc menu, rail that becomes bottom tabs | Present. Tapping also reveals the buttons on touch. |
| Dashboard: histogram, waveform, clipping with zebra and false colour, headroom card, frame time, FPS block, presentation strip, compact and full | Present (see M5, H2) |
| Calibrate wizard a to h, dynamic EDR explanation | Present (see H1, M1, M2, M6) |
| Performance: cap, mode, refresh, VRR states, cadence timeline, game-speed guard, resolution with GPU load, cache, backend chips, hypervisor warning | Present (see H2, L2, L3) |
| Visuals: 5 presets, 6 sliders, draggable split, cost estimate, shader-effects placeholder | Present. Moving a slider switches to Custom. |
| Controller: status, battery, reconnect pause, diagram with hover and focus, layout choice, gyro, touchpad, rumble, haptics study, automation pad | Present. Disconnect shows the pause overlay. |
| Help cards, Export diagnostics (simulated JSON), About with docs pointers | Present. `docs/evidence/` exists. |
| SIMULATED badge, scope banner on every menu view, Simulated tags on graphs | Present (see L5, L6, L8) |
| Content rules (no Nintendo or Sony assets or motifs) | Pass. Names appear in text only. |
| Accessibility: focus ring, aria-labelled canvases, labelled inputs with ids, landmarks, reduced motion | Pass. Every canvas has an aria-label, every input has a label and an id, and there are no unnamed buttons. The focus ring is a 2 px solid outline. `main` and `nav` landmarks are present. |
| 400 px: no horizontal scroll | Pass on every view, every calibration step and the dashboard. No element extends past the viewport. |

---

## 5. Suggested test additions

- Set the cap to 30, then open the dashboard: Game FPS should be about 30 (catches H2).
- On the A95L, change paper white: the computed peak should stay unchanged (catches H1).
- The paper-white tick for 100 should sit at the same x as a value of 100 on the bar (catches M1).
- Visit the Summary without visiting step c: the peak should be labelled as the spec default (catches M2).
- Drag the before/after handle with the pointer and check `aria-valuenow`.

---

## 6. Resolution

Date: 2026-11-01. All fixes are in `demo/`. Everything in the demo is still simulated.

### Final command results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no findings |
| `npm test` | Pass, 58 of 58 (6 files; was 46) |
| `npm run build` | Pass: one JS chunk (about 307 kB) and one CSS file (about 34 kB) |
| `npm run build:single` | Pass: both files about 333 KB; now type-checks first |
| `npm run e2e` | Pass, 10 of 10 (was 8) |
| `npm run screenshots` | Pass, 9 of 9; all PNGs rewritten and reviewed |
| Port 5199 afterwards | Free |

Extra headless checks of the `file://` build at 400 px (dashboard scrolled, Performance, Visuals, Controller, Calibrate paper white, roll-off and summary) showed no console errors and no overlaps.

### Fixed

| Issue | What changed |
| --- | --- |
| **H1** | Display profiles now carry a peak ceiling in nits (`peakCeilingNits`) instead of a ratio for the A95L. For HDR10 PQ, the renderer peak is `min(calibrated peak, panel ceiling)` and does not move with paper white; EDR (MacBook) is still limited by paper white x EDR headroom. `headroomFrom` reports which limit applied. The Summary shows a "Peak capped at the panel ceiling" chip and a note when the pattern result is above the example panel peak; the dashboard says "capped at the example panel peak". New unit tests (`src/state/store.test.ts`) and an e2e test (paper white 100 and a 1,400-nit pattern result both keep 1,300 nits). |
| **H2** | `useTelemetry` rebuilds the 300-frame window from the new settings at once; live frames are only appended for animation and are dropped when the settings change. Readouts are right in menu views, while paused and under reduced motion. New e2e test: cap 30 with reduced motion gives about 30 FPS and a p99 of about 33 ms on the dashboard. The Performance frame-time caption now prints the current average and p99. |
| **M1** | Paper-white scale ticks use the same log position function as the markers; the end label names the real maximum (1.6k), and a decade tick too close to the end is dropped. The paper-white and peak labels sit on two rows so they never collide. |
| **M2** | Calibration tracks `peakTested`. Until step c is used, the Summary reads "Peak (profile default) ... spec default, peak test not run" with a "Peak test not run" chip. Covered by the new e2e test. |
| **M3** | A caption under the before/after split says both halves use the same SDR preview mapping, paper white sits at about 81% grey, real SDR looks brighter, and the split therefore overstates the HDR gain. The README says the same. |
| **M4** | The cadence timeline is drawn at its real pixel width with fixed 12 px text and shows 100, 75 or 50 ms depending on width, with 0 and end labels. |
| **M5** | Histogram marker labels sit on three rows with dark plates; the waveform tick labels are pushed apart by a tested `spreadLabels` helper (`src/sim/scopes.ts`), so 203 and 100 no longer touch. |
| **M6** | The canvas ramp is replaced by labelled bands (500 to 10,000 scene nits) showing the output nits per curve, with greys stretched from 400 nits to the peak. Bands that land exactly on the peak are outlined, so the hard clip visibly merges every band from the peak up, while the roll-off keeps them apart. Row labels are text in their own column (their own row on narrow screens), so nothing is cut off. |
| **L1** | The knee slider is disabled with "Only used by the Luma soft knee" for other curves; "scene value that lands on the peak" is disabled for Hard clip. |
| **L2** | Under Auto/VRR the control is called "Maximum refresh", and a note says when the panel runs at another rate ("The panel runs at 90 Hz here (2 refreshes per game frame, below the 48 Hz VRR floor); 120 Hz is the maximum."). The LFC label names the panel rate. |
| **L3** | GPU load is GPU time divided by the frame interval at the effective cap (about 60% at cap 30, also when the game holds 30). Unit-tested. |
| **L4** | Even fixed cadences read "2:2"; the LFC label uses non-breaking spaces ("panel at 90 Hz (LFC x2)"). Unit-tested. |
| **L5** | The scope banner is sticky at the top of every menu view, on an opaque glass background, with nothing peeking above it. |
| **L6** | At 760 px or less the badge keeps a short subtitle ("SDR preview"), and the dashboard scroll area starts below the badge, so panels no longer slide under it. |
| **L7** | The intro toast also says "Move the mouse or tap the scene to show the Dashboard and Menu buttons"; a pointer down now reveals them as well as a pointer move. |
| **L8** | The compact dashboard's Summary card has its own "Simulated" tag. |
| **L9** | The toggle reads "Zebra above display peak" unless the curve is Hard clip (or output is SDR), where it stays "Zebra on clipped pixels". |
| **L10** | False-colour legend cells pick light or dark text from the cell luminance. |
| **L11** | The tallest off-chart frame-time spike is labelled with its value (for example "89 ms"). |
| **L12** | At 760 px or less the gamepad labels are larger, and a "Show all mappings" list gives every mapping as text with normal tap targets. |
| **L13** | The A95L peak copy is now "This is an example from third-party reviews, to be measured by the owner." with no nested parentheses. |
| **L14** | `build:single` runs `npm run build` (type check included) before inlining. README updated. |
| **L16** | Rumble shows "Press Test rumble to see the motor levels" (or what is playing); motion aiming explains the dot's state; the cadence card's frame-time graph is taller with a sub-heading. |

Found while fixing (not in the list): the dashboard scopes could stay empty ("-") under reduced motion when the dashboard opened within 180 ms of the last scene frame, because the 5 Hz throttle dropped the only frame. `useScopes` now never throttles the first frame and processes a throttled frame when the interval ends.

### Deliberately left

- **L15 (main-thread cost):** not changed. Scopes already update at about 5 Hz; the cost is the 480 x 270 scene grade at about 30 Hz on the main thread. Moving it to a worker is a larger change than this pass warrants for a scope preview. Reduced motion pauses it.
- **Full-white SDR reference toggle (M3 alternative):** not added; the caption was the lighter of the two suggested fixes.
- **Performance screenshot at 400 px:** checked headlessly but not added to `screenshots/`, to keep the required set of nine.
- **I1 and I2:** unchanged. Pointer drag on the roll-off handles and the split handle, Safari, and the fragment inside a real Claude Artifact are still untested.

---

## 7. Final QA (alignment pass)

Date: 2026-11-01. Reviewer: fresh-eyes final QA after the ADR 0001-0006 alignment pass. All work stayed in `demo/`; `docs/` was read only. Everything in the demo is still simulated, and every honesty label (SIMULATED badges, the scope banner, the signal / profile / measured chips) is kept.

### Command results

The alignment engineer's results were reproduced first (typecheck, lint, 90 of 90 unit tests, build, build:single, 19 of 19 e2e, 9 of 9 screenshots, all passing). After the fixes below:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no findings |
| `npm test` | Pass, 97 of 97 (10 files; was 90 in 9) |
| `npm run build` | Pass: one JS chunk (about 327 kB) and one CSS file (about 37 kB) |
| `npm run build:single` | Pass: `dist-single/totk-luma-demo.html` 356 KB, `dist-artifact/totk-luma-scope.html` 355 KB |
| `npm run e2e` | Pass, 19 of 19 (two tests extended) |
| `npm run screenshots` | Pass, 9 of 9; all PNGs regenerated and reviewed |
| `dist-single/totk-luma-demo.html` from `file://`, headless | No console errors or warnings across the dashboard (full and compact), every Performance state below, Calibrate steps a, b, g and h, Visuals, Controller with the agent stop, and Help |
| Port 5199 afterwards | Free |
| Home paths or usernames in `demo/` | None found |

### Screenshot and state review

All nine screenshots were opened, plus headless captures of: ProMotion with 45 (warning, "Use 40 / 48"), the A95L with the simulated G6-1 pass at 45 and at 30 (host frame doubling to 60 Hz), D2 off ("30 (native)" only), the lower Performance cards, the compact dashboard, Calibrate steps a, b, g and h, the lower Visuals cards (Clear Air, ReShade FX), the agent stop, and the end of Help.

The default state is coherent: MacBook XDR, ProMotion fullscreen, D2 on, cap 40, "ProMotion, 4.17 ms steps - cap 40 - even cadence, 25.0 ms per frame (panel at 40 Hz)", cadence fit "even", source mode "Scene HDR (tonemap replaced, planned P3)" with a Simulated chip, output "RGBA16F extended-linear sRGB, EDRMetadata nil, app-side tone mapping", MoltenVK baseline, Hypervisor Off at 1.2x (the ADR 0001 default until G-AB).

### Alignment targets checked against the ADRs

| Target | Verdict |
| --- | --- |
| 1. Mute button toggle (ADR 0004) | Matches: intro toast, sidebar hint, controller diagram, Help and README; Create + Options held 0.5 s only as the G-INP-1 fallback. |
| 2. Output, UI white, source mode (ADR 0002) | Matches the D3, D4 and D9 wording; the scene-HDR default is labelled Simulated, also in the compact layout. |
| 3. Caps and pacing (ADR 0003 §1-2) | Every row of the §2 table matches, including "30 (native)" without D2, no Unbounded option, 60 experimental, the 4.17 ms ProMotion grid, and HDMI VRR only behind the simulated G6-1 toggle. |
| 4. Backends and hypervisor (ADR 0001) | Exact wording, gate ids G-KK, G-METAL and G-AB, and the flash warning. |
| 5. Dolby Vision (ADR 0005) | Exact sentence in Calibrate step a and Help. |
| 6. Visuals (ADR 0006) | Stage tag on every slider; Serfrost installed by the owner and never bundled; reshadefx behind G-FX after P4; librashader not adopted. |
| 7. Controller (ADR 0004) | Matches; pausing on disconnect is labelled as a proposed owner option that no ADR decides. |
| 8. Help | All five requested items present. |
| 9. Labels | Was missing the instrument that ADR 0002 D9 requires for a measured reading. Fixed (F1). |

### Fixed in this pass

| Id | Issue | Fix | Tests |
| --- | --- | --- | --- |
| F1 | ADR 0002 D9 asks for "instrument, window size and date" with every measured reading; the demo had no instrument | New "Instrument" field in Calibrate step g (placeholder "meter model and correction"). The dashboard and Summary show "window, date, instrument" and say "instrument not entered" when it is empty | Unit: `measuredContext` and the empty default. E2E: Summary text before the instrument is entered, dashboard text after |
| F2 | ADR 0002 D9: Mac nits appear only as "assumed N nits at EDR 1.0"; the dashboard said "EDR 1.0, assumed nits" and "assumed nits (EDR 1.0 = paper white)" | Dashboard paper white and peak sub-labels, and the Summary paper-white row on the MacBook, now read "assumed 203 nits at EDR 1.0" (N follows paper white) | E2E: dashboard text |
| F3 | The waveform's top label ("10k") was cut off at the top edge of the 92 px dashboard canvas | `spreadLabels` takes `min` and `max` bounds and runs to convergence; the waveform keeps every label 6 px inside the canvas and 11 px apart, so 10k and 0.1 are both whole | Unit: top bound, and all eight ticks inside a 92 px canvas |
| F4 | The sticky scope banner was 90% opaque, so scrolled text showed through it in Calibrate, Performance, Visuals and Help | The banner background is now opaque | Visual check |
| F5 | Gate ids, dates and ranges wrapped at their hyphen ("gate G-" / "AB", "2026-" / "10-13", "8.33-" / "41.67 ms") | New `NoBreak` helper keeps them whole in Help, the backend rows and the VRR-by-connection rows | Unit: `splitNoBreak`. E2E: `#help-flash .nobr` is "G-AB" |
| F6 | The ReShade FX card used larger text than the Clear Air card beside it | Same small size; still dimmed as a later phase | Visual check |
| F7 | The "not measured" placeholder was clipped in the step g reading fields | Reading fields are 140 px wide | Visual check |
| F8 | E2E timing: the view follows the URL hash, so a backquote pressed right after Escape could reach the still-focused text field | The measured-readings test waits for `#play` and for the field to unmount before pressing backquote. A person cannot type that fast; noted, not changed in the app | E2E, run 3 times in a row |

`README.md` was updated for F1, F2, F3 and F5 (labels row, unit and e2e test lists) and now says "Mouse move or tap" reveals the Dashboard and Menu buttons, which is what the app does.

### README preview instructions

Checked and runnable as written: `npm ci`, `npm run dev` (served on port 5199, strict port, stopped cleanly), `npm run build && npm run preview` (the e2e web server runs exactly this), `npm run build:single`, and opening `dist-single/totk-luma-demo.html` without a server. "What to look at in the preview" matches the screens: the source mode and pipeline are on the right of the dashboard, label classes on the left, cadence fit at the bottom right. Node 22.23 and npm 10.9 match the stated versions.

### Left as is

- Earlier deliberate items from section 6 (L15 main-thread cost, I1 and I2) are unchanged.
- The instrument is one free-text field; the correction file is not a separate field (see the spec mismatch below).
- Calibrate steps b and c still set the MacBook paper white and peak in nits; only the dashboard and Summary use the "assumed N nits at EDR 1.0" form.
- The demo has no step c2 (A95L full-field peak), no Interactive dashboard state, no 512-frame multi-series graph and no source-clip or outside-P3 counters. `docs/06-ux-spec.md` §1.1 already lists these as known demo differences.

### `docs/06-ux-spec.md` and the demo (reported, not edited)

`docs/06-ux-spec.md` §1.1 has been updated by others during this pass and now lists most of the alignment engineer's mismatches as known demo differences. It also fixes the earlier step-count conflict: §7.1 now reads "eight steps, plus step c2 on the A95L only". Two §1.1 rows are now partly out of date because of this pass:

1. "Measured readings carry date and window size only": the demo now also carries the instrument. The correction file is only part of the free-text field, not a separate field as §6 asks.
2. "MacBook paper white and peak in nits, labelled assumed": the dashboard and Summary now use "assumed N nits at EDR 1.0". The calibration sliders are still in nits.

Not listed in §1.1:

3. §2.1 asks for "one vocabulary everywhere" (Verified, Experimental, Unverified, Cadence warning, Not available, Withdrawn, Approximate, Assumed, Simulated). The demo also uses other chips: "Not continuous VRR" (ProMotion connection row), "Current baseline", "Gated variant" and "Not planned" (backends), "Check", "Info" and "Known issue" (Help), "Not bundled" and "Later phase" (Visuals), and "Control case, not a target". Either the spec adds these or the demo maps them onto the nine.
