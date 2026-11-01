# TOTK Luma requirements and non-goals

Status: Proposed, 2026-11-01

This document lists what TOTK Luma must do, how well it must do it, and what it will not do. It follows the six
proposed ADRs in `docs/adr/` (all awaiting owner approval). Nothing here authorises production emulator work; the
current phase is specification only.

---

## How to read this document

**Priority.**

- **MUST**: required for the phase named in the row. If it cannot be met, its gate decides the fallback.
- **SHOULD**: expected, but it can slip to a later phase or be dropped by an owner decision.
- **COULD**: optional or gated. It starts only when its gate fires and the owner approves.

**Phase.** P0 to P5, as in the ADR index (`docs/adr/README.md`). P1 and P2 can run in parallel.

**Acceptance.** Each row names a test family and, in brackets, the evidence gate it proves. A test family is a
short name for a group of test ids in [04-test-acceptance-matrices.md](04-test-acceptance-matrices.md); the table
below maps each family to the actual ids there. If test numbering in that file changes, the gate name is the stable
link.

| Test family | Covers | Test ids in 04 |
|---|---|---|
| T-PERF-xx | Baselines, profiling, backend and setting A/B tests | PERF-01 to PERF-15 (§1.1); MH-01 to MH-03 (§4.2) |
| T-CAP-xx | Frame caps, frame pacing and game speed | CAP-01 to CAP-09, CAP-18, CAP-19 (§1.2, §1.4); SPD-01 to SPD-10 (§1.5) |
| T-VRR-xx | VRR, display modes and refresh fallbacks per display and connection | CAP-10 to CAP-17, CAP-20 and table 1.3a (§1.3a, §1.4) |
| T-HDR-xx | The HDR pipeline, from tonemap to drawable | PIPE-01 to PIPE-14, PIPE-19, PIPE-20 (§2.1); CMP-01 to CMP-06 (§2.2) |
| T-CAL-xx | Display calibration and per-display profiles | CAL-01 to CAL-10 (§2.3); PIPE-15, PIPE-16 |
| T-UI-xx | Dashboard, scopes, labels, presets and troubleshooting | DSH-01 to DSH-07 (§2.5); LBL-01 to LBL-07 (§2.4) |
| T-LOOK-xx | Vivid, defog and effect hosting | LOOK-01 to LOOK-05 (§2.5) |
| T-INP-xx | DualSense features, buses and reconnects | PAD-01 to PAD-14 (§3) |
| T-AGT-xx | Background control with the agent pad | BG-01 to BG-14 (§4.1) |
| T-RB-xx | Rollback, reproducibility and configuration | RB-01 to RB-07 (§5) |
| T-HYG-xx | Public-repo hygiene, privacy and licence checks | RB-06, PIPE-19 (no separate family in 04) |
| T-DV-xx | The Dolby Vision watching brief | PIPE-17, PIPE-18 |

**Sources.** ADR numbers and decision ids (D1-D10), research notes as `Rnn §x`, and prior local evidence as `[E]`.
Evidence tags follow AGENTS.md: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal. Every effort
figure is an estimate `[I]`.

---

## 1. Functional requirements

### 1.1 Performance and caps

**Measurement and profiling**

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| PERF-01 | Add a 512-entry per-frame telemetry ring recording guest present, guest vsync tick, host submit, `actualPresentTime` (0 = dropped), cap, panel refresh, present mode, D2 step and shader-cache state. Export it as CSV to the private workspace, and feed the dashboard from it. | MUST | P0 | T-PERF-xx (G-TEL) | ADR 0003 §3; ADR 0001 D1 seams; R09 implication 6 |
| PERF-02 | Base every performance claim on guest frame time and on-screen interval percentiles (p50, p90, p99, p99.9, max), jitter, cadence error rate, drops and game speed. Status-bar FPS (a window average) and the Metal HUD are secondary only. High GPU utilisation or counter FPS alone is never a success criterion. | MUST | P0 | T-PERF-xx (G-TEL) | ADR 0003 §6; R05 implication 1; [E] §4 |
| PERF-03 | Follow the measurement protocol: label cache state C0 (cold), C1 (Ryujinx warm, Metal cold) or C2 (all warm); make steady-state claims in C2 only; per scene, 60 s warm-up then 3 runs of 120 s; change one variable per run. | MUST | P0 | T-PERF-xx | ADR 0003 §6; R05 §4 |
| PERF-04 | Record warm and cold baselines (C0, C1, C2) in three representative demanding scenes: Great Sky Island (GPU-bound), Beneath Hyrule Castle (CPU) and the Room of Awakening (CPU). Report cold-cache cost separately: a new build starts cold, about 85-88 s and about 1,017 shaders [E]. | MUST | P0 | T-PERF-xx | ADR 0003 §6; ADR 0001 context; [E] §4 |
| PERF-05 | Profile CPU, GPU, synchronisation and shader-compile bottlenecks in at least three heavy scenes, attributing time to the guest CPU, the render thread, the translation layer and the GPU, so that G-METAL can be evaluated with evidence. | MUST | P0-P2 | T-PERF-xx (G-METAL inputs) | ADR 0001 D2, G-METAL; R05 §5 |
| PERF-06 | Validate hvfix A+B in game: Hypervisor On + A+B for at least 900 s in the Room and on the island, Poisson-tested against 0.012 flashes/s. Until it passes, the default CPU profile stays Hypervisor Off at 1.2x. | MUST | P0 | T-PERF-xx (G-AB) | ADR 0001 D2; R05 §3; [E] §2 rows 2-3, 5 |
| PERF-07 | Keep internal rendering at about 1080p: 1.2x is the default (3D targets about 1921x1076 [E]). A 1.0x scale is measured on the island as information only, and is adopted only by owner decision. | MUST | P2 | T-PERF-xx | ADR 0001 D2 item 2.3; [E] §3 |

**Backend choice**

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| PERF-08 | Use MoltenVK `1.4.2-ryujinx.5` as the baseline for v1 and for every measurement. Backend changes are made only on measured evidence weighed against maintenance cost. | MUST | P0 | T-PERF-xx | ADR 0001 D2 |
| PERF-09 | Apply the selective improvements in ADR order, each as a one-variable A/B: concurrent compilation (`MVK_CONFIG_SHOULD_MAXIMIZE_CONCURRENT_COMPILATION=1`), then FencePool !195. | SHOULD | P2 | T-PERF-xx | ADR 0001 D2; R05 §3 |
| PERF-10 | Run an A/B of MoltenVK `1.4.3-ryujinx.2` only after the direct-to-display check (G6-6), and only with owner approval. | COULD | P2 | T-PERF-xx (G6-6) | ADR 0001 D2; R05 verification |
| PERF-11 | Evaluate KosmicKrisp only as a flagged P5 variant. It becomes the default only through G-KK: warm C2, 0 new artefacts in 900 s, p95 at least 10% better in a GPU-bound scene, RGBA16F EDR verified on both displays, pacing parity, and a driver from source or an owner-approved binary. | COULD | P5 | T-PERF-xx (G-KK) | ADR 0001 D2, G-KK; R05 §5 |
| PERF-12 | Build no native Metal backend. It is reopened only if G-METAL passes: in 3 heavy scenes, under both backends, (a) more than 25% of the render-thread critical path or more than 20% of GPU time comes from translation, and (b) the CPU is not the limit. | MUST | All | T-PERF-xx (G-METAL) | ADR 0001 D2; R05 §1.1, §5 |
| PERF-13 | Start the write-tracking redesign, or `PAL_MachExceptionMode=4`, only if A+B fails G-AB. | COULD | P5 | T-PERF-xx (G-AB fail) | ADR 0001 D2; R05 §1.5, §3 |
| PERF-14 | Record the native Metal comparison inputs in every profiling session, not only on request: render-thread CPU time inside the translation layer and GPU time from translation artefacts (render-pass splits, compute-emulated geometry or transform feedback), per heavy scene. This keeps G-METAL decidable from measured evidence. | MUST | P0-P2 | T-PERF-xx (G-METAL inputs) | ADR 0001 D2 backend comparison; R05 §4, §5 |
| PERF-15 | Compare backend options on maintenance cost as well as speed: per option, record hours per upstream sync, the size of backend-specific Luma code, the count of MoltenVK-only workarounds and the upstream status of the layer. Review them with the speed results at every G-KK or G-METAL decision. | MUST | All | T-RB-xx, T-PERF-xx | ADR 0001 D2 backend comparison; R05 Options compared; R10 Options compared |

**Caps and pacing**

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| CAP-01 | Define a cap as a guest vsync rate (Switch 60, or Custom 48, 45, 40 or 30) combined with the D2 measured-time patch. Without D2, offer only "30 (native)". | MUST | P2 | T-CAP-xx | ADR 0003 §1; R06 implication 1 |
| CAP-02 | While D2 is active, refuse Unbounded, turbo and Custom above 60, and replace the cycling VSync hotkey with direct selection. | MUST | P2 | T-CAP-xx | ADR 0003 §1; R06 implication 2 |
| CAP-03 | Offer per-display cap menus as decided in ADR 0003 §2: built-in ProMotion fullscreen 30/40/48/60; built-in fixed 60 Hz 30/60; built-in fixed 48 Hz 48; A95L fixed 120 Hz 30/40/60; A95L fixed 60 Hz 30/60; A95L with verified HDMI VRR 30/45/60; windowed treated as the fixed panel rate. | MUST | P2 | T-CAP-xx, T-VRR-xx | ADR 0003 §2 |
| CAP-04 | Show 45 with its cadence fit ("even", "uneven" or "VRR") and suggest the evenly paced neighbour (40 or 48). Call it smooth only with verified VRR. Recommend 45 only where the measured scene cost is 22 ms per frame or less. | MUST | P2 | T-CAP-xx | ADR 0003 §2; R05 implication 3; R06 §4 |
| CAP-05 | Label 60 "experimental" until G-60 holds for that scene class **and** G-CAP passes at 60 on that display. | MUST | P2 | T-CAP-xx (G-60, G-CAP) | ADR 0003 §1, gates; R05 §5 |
| CAP-06 | Every offered cap on every display passes G-CAP: guest frame time p99 at most 1.25x the target interval, game speed 1.00 ± 0.01, cadence error rate published, no steady-state shader-compile spike. A failing cap shows a warning or is withdrawn. | MUST | P2 | T-CAP-xx (G-CAP) | ADR 0003 §6, gates |
| CAP-07 | Request timed presents through `VK_GOOGLE_display_timing` (MoltenVK maps them to `present(at:)`) and read back `actualPresentTime`. If unreliable on MoltenVK, record it under G-PRES-3. | MUST | P2 | T-CAP-xx (G-TEL, G-PRES-3) | ADR 0003 §3; R06 implication 4 |
| CAP-08 | Lock the guest vsync to the display (`CVDisplayLink` or `CAMetalDisplayLink` through C# interop), with a virtual 60 Hz tick at 120 Hz and the existing timer as fallback. Keep the patch only if it lowers the cadence error rate. | SHOULD | P2 | T-CAP-xx (G6-10) | ADR 0003 §3, kill criteria; R06 implication 3 |
| CAP-09 | Add host LFC (frame doubling) for 30 and 45 below the VRR floor, only after G6-1 passes. | SHOULD | P2 | T-VRR-xx (G6-1) | ADR 0003 §3; R06 implication 6 |
| CAP-10 | Switch to 30 automatically during pre-rendered movies once G6-3 shows the decode path. Until then, document that movies may play at 1.5-2x under D2. | SHOULD | P2 | T-CAP-xx (G6-3) | ADR 0003 §3, consequences; R06 implication 7 |
| CAP-11 | Keep the D2 patch only in the private title pack. The public repository describes its behaviour and a SHA-256 checksum field in `luma.json`, never offsets or patch bytes. D2 must not alter any shader keyed by guest hash. Any publication needs a licence review of its FPSLocker-derived facts. | MUST | P2 | T-HYG-xx, T-CAP-xx | ADR 0003 §4; ADR 0001 D1 item 5 |
| CAP-12 | Declare `LSSupportsGameMode` in the play bundle, and test fullscreen and windowed separately. | MUST | P2 | T-CAP-xx | ADR 0003 §5; R03 §2 |

**VRR and display modes**

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| VRR-01 | Establish real VRR support per display and connection with an attended test: does macOS offer HDMI VRR to the A95L (HDMI 3 or 4, Enhanced format), and does the TV show VRR active? Pass adds the VRR menu row; fail keeps the fixed-120 policy. | MUST | P1 | T-VRR-xx (G6-1) | ADR 0003 gates; R06 §3; R04 verification |
| VRR-02 | Read the A95L mode list read-only: 100 Hz, 4K120 with HDR, and the reported HiDPI framebuffer limit for HDR at high refresh. The result sets the A95L default mode. | MUST | P1 | T-VRR-xx (G6-2) | ADR 0003 gates |
| VRR-03 | Measure on-screen cadence of 40 and 45 on ProMotion against fixed 60, including the reported macOS 27 beta cadence issue. The result sets the ProMotion menu. | MUST | P2 | T-VRR-xx (G6-5, G6-7) | ADR 0003 gates; R06 §3 |
| VRR-04 | Check whether a fixed 120 Hz mode is selectable on the built-in display, and whether `CAMetalDisplayLink` honours a 40-45 Hz preferred range. | SHOULD | P2 | T-VRR-xx (G6-8, G6-10) | ADR 0003 gates |
| VRR-05 | Where VRR is absent or unverified, fall back to refresh-compatible caps (even divisors of the panel rate) as the suggested default. | MUST | P2 | T-VRR-xx | ADR 0003 §2; R04 implication 6 |
| VRR-06 | Optionally run a DisplayPort Adaptive-Sync control case to prove timed presents on known-good VRR. | COULD | P2 | T-VRR-xx (G6-9) | ADR 0003 gates |
| VRR-07 | Keep a VRR matrix per display **and connection** (TV port, signal format, cable, adapter in the path), with a refresh-compatible fallback for each row, and record the row in every pacing result and display profile. | MUST | P1-P2 | T-VRR-xx | 04 §1.3a; ADR 0003 §2; R06 §3-4; R04 §2 |

### 1.2 HDR pipeline

**Presentation and output stage (D4)**

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| HDR-01 | One owner per layer: in v1 the Vulkan swapchain owns the visible layer. A Luma output stage behind `IOutputStage`, inside Vulkan `Window.Present`, does in one pass: decode, profile EETF against live headroom, display-stage looks, UI composite at UI white, dashboard, scopes and patterns, then encode. | MUST | P1 | T-HDR-xx | ADR 0002 D4 |
| HDR-02 | Present one `R16G16B16A16_SFLOAT` + `EXTENDED_SRGB_LINEAR_EXT` drawable on both displays. Log the format and colour-space pair at startup. | MUST | P1 | T-HDR-xx (G-PRES-1) | ADR 0002 D3, D4; R03 §3.2, §4 |
| HDR-03 | Keep `EDRMetadata` nil and never call `vkSetHdrMetadataEXT`. Exclude the passthrough colour space from every HDR profile. | MUST | P1 | T-HDR-xx (G-PRES-1) | ADR 0002 D4 item 3; R03 §3.4 |
| HDR-04 | A C# display helper on the `CAMetalLayer` that `EmbeddedWindow` creates sets `toneMapMode = never`, the correct `contentsScale` (issue #461) and an evaluated `preferredDynamicRange`, and re-applies them after every swapchain create and recreate. | MUST | P1 | T-HDR-xx (G-PRES-1) | ADR 0002 D4 item 2; [E] §6 |
| HDR-05 | Read current, potential and reference headroom from the screen-change notification plus a per-frame read, and mark the value stale when it may be out of date. | MUST | P1 | T-CAL-xx (G-DISP) | ADR 0002 D4 item 2, D9 item 6; R03 §1.5 |
| HDR-06 | Pass the SDR identity test before any EDR work: in sRGB / no-EDR mode the output stage matches a stock capture within ±1 code value. | MUST | P1 | T-HDR-xx (G-HDR-0) | ADR 0002 gates |
| HDR-07 | Keep one opaque layer: no sibling layer and no extra window. Record the direct-to-display state in fullscreen with the overlay on and off. | MUST | P1 | T-HDR-xx (G-PRES-2, G6-6) | ADR 0002 D4, gates; R03 §2 |
| HDR-08 | Every Luma graphics component passes the review question "does it work unchanged on KosmicKrisp?". MoltenVK-only parts (PQ swapchain fallback, native presenter) stay off the critical path. | MUST | All | T-HDR-xx, T-RB-xx | ADR 0001 D1 item 7; ADR 0002 portability table |

**Scene HDR (D3)**

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| HDR-09 | Before P3, hold one attended capture session that records U1-U5, U8 and the identity of the post-tonemap pass. Dumps and traces stay private. P3 does not start without it. | MUST | P1 | T-HDR-xx (G-HDR-1) | ADR 0002 D3 order, gates; R02 unknowns |
| HDR-10 | Replace TOTK's tonemap by guest `Hash128` in `ShaderCache.TranslateShader`. The new shader keeps the vanilla `1 - e^-x` curve below a pivot and rolls off to the profile peak above it, instead of `saturate()`. Parameters travel in the support buffer. | MUST | P3 | T-HDR-xx (G-HDR-2) | ADR 0002 D3 item 1; R02 §4A |
| HDR-11 | Cover every host specialisation variant (no frame rendered vanilla) and re-key the disk cache. | MUST | P3 | T-HDR-xx (G-HDR-2) | ADR 0002 gates |
| HDR-12 | Run the post-tonemap sharpen/scale in an HDR-safe way (encode, filter, decode), never as a point fetch. CAS or EASU is decided by the capture session. | MUST | P3 | T-HDR-xx (G-HDR-1, G-HDR-3) | ADR 0002 D3 item 2; R01, R02 |
| HDR-13 | Upgrade to host-only RGBA16F only the exact allow-list: targets written by replaced passes plus the final and present buffers. Guest format and layout stay unchanged. Readbacks (photo mode, album) convert half-float to RGBA8. A kill switch returns to SDR. | MUST | P3 | T-HDR-xx (G-HDR-3) | ADR 0002 D3 item 3; R02 §4B |
| HDR-14 | Preserve precision and range end to end on the scene-HDR path: no 8-bit stage and no clamp at 1.0 between the replaced tonemap and the drawable. A source-clip counter shows recovered, not invented, highlight data. | MUST | P3 | T-HDR-xx (G-HDR-4) | ADR 0002 context table, gates; R02 §3 |
| HDR-15 | Keep UI at paper white with the boundary model: scene written scaled by `game_white / ui_white`, game UI kept in [0, 1], output multiplied by UI white; guest-hash exceptions for UI that should glow; pre-rendered video at paper white. Resolve the final-target blend encoding (U2) first. | MUST | P3 | T-HDR-xx | ADR 0002 D3 UI model; R02 §4 |
| HDR-16 | Pass the stability gate: a 900 s warm run with 0 new artefacts in each scene, plus an output-stage and RT-upgrade cost A/B on the island. | MUST | P3 | T-HDR-xx (G-HDR-3) | ADR 0002 gates |
| HDR-17 | Pass the owner's side-by-side on both displays: recovered highlight detail, clean gradients and correct colour against SDR, judged on detail, not brightness. Record latency and frame-time cost of each tier alongside. | MUST | P3 | T-HDR-xx (G-HDR-4), T-PERF-xx | ADR 0002 gates; owner requirement |
| HDR-18 | If the gates fail or the owner's P3 ceiling is reached, ship the "Expanded SDR" tier (inverse of the known curve, then the same EETF; 3-7 days). It is never labelled HDR, and scene HDR is recorded as "not achieved". | MUST | P3 | T-HDR-xx | ADR 0002 D3 fallback, kill criterion |
| HDR-19 | Always show the source mode while the dashboard is open: "Scene HDR", "Expanded SDR" or "SDR". | MUST | P1 | T-UI-xx | ADR 0002 D3 |
| HDR-20 | Take no dependency on ReShade or MacShade for HDR. Reimplement TOTK passes from documented equations; reuse only generic MIT RenoDX maths (Neutwo, hue/purity correction) with attribution; use no GPL code. TOTK shaders and hashes live in the title pack. | MUST | P3 | T-HYG-xx | ADR 0002 D3 licensing; R01 §1.2 |
| HDR-27 | Keep the review of existing implementations current before reusing anything: RenoDX mod 175, MacShade, Beast Roofer and Ryubing PR !31, with the reason each is unsuitable as shipped (ADR 0002 Context, D3 alternatives). Re-check them at P3 start, since the HDR route depends on that verdict. | MUST | P1, P3 | T-HYG-xx | R01 Summary; ADR 0002 Context |
| HDR-21 | Offer a PQ (`A2B10G10R10` + `HDR10_ST2084`) swapchain for the TV only as a MoltenVK-only fallback, if G-DISP shows it is more faithful. | COULD | P1+ | T-CAL-xx (G-DISP) | ADR 0002 portability table |
| HDR-22 | Build the native Swift presenter through `VK_EXT_metal_objects` only through G-NATIVE (a G-PRES-1..3 failure plus a passing 1-day export spike). Shelve it if KosmicKrisp becomes the default (G-PRES-4). | COULD | P5 | T-HDR-xx (G-NATIVE) | ADR 0002 D4 item 4, gates |

**Dolby Vision position (D7)**

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| HDR-23 | Keep HDR10 to the A95L and EDR on the built-in display independently viable, with no dependency on Dolby Vision anywhere in the design. Never set the Mac's HDMI input to a DV signal format; play in HDR10 Game mode. | MUST | P1 | T-CAL-xx, T-DV-xx | ADR 0005 items 1, 3 |
| HDR-24 | Flag any "Dolby Vision" mode reported by the TV as unexpected, and do not rely on MaxCLL or MaxFALL being honoured. | MUST | P1 | T-DV-xx | ADR 0005 items 4, 5 |
| HDR-25 | Keep the watching brief, research only: an SDK header grep per major macOS release (about 1 h) and one read-only A95L EDID VSVDB decode (about 0.5 h). No reverse engineering and no restricted SDK. | SHOULD | P1 | T-DV-xx (G-DV-EDID, G-DV-WATCH) | ADR 0005 item 6 |
| HDR-26 | Optionally add a "DV-like" scene-adaptive peak (temporal smoothing, scene-cut reset, per-profile trims, detected peak and knee shown in the dashboard) within about 0.3 ms GPU. It stays off if it causes visible pumping. | COULD | P5 | T-DV-xx (G-DV-PEAK) | ADR 0005 item 2, kill criterion |

### 1.3 Calibration and profiles

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| CAL-01 | Provide two profile kinds feeding one EETF: `macbook-xdr` in relative EDR with live headroom, and `a95l` in absolute nits converted through one measured constant N (panel nits at EDR 1.0). | MUST | P1 | T-CAL-xx | ADR 0002 D3 profiles; R04 implication 1 |
| CAL-02 | Write the EETF from the published BT.2390 / BT.2408 formula. Neutwo (MIT) is an alternative curve. No GPL implementation is used. | MUST | P1 | T-CAL-xx, T-HYG-xx | ADR 0002 D3 display mapping; R04 §4 |
| CAL-03 | MacBook profile: paper white EDR 1.0; peak = min(live headroom, owner MaxTML); system tone mapping off. At a headroom of 1.0 the image degrades gracefully to SDR without changing mid-tones. | MUST | P1 | T-CAL-xx | ADR 0002 D3 profiles; R04 implication 5 |
| CAL-04 | A95L profile: paper white 203 nits; MaxTML starts at 1,000 (labs report 1,150-1,375 at 10% [D]/[A]); MaxFFTML starts at 250 (labs 235-255 [A]); TV HDR Tone Mapping Off during calibration, then an A/B with Gradation preferred; HDMI 3 or 4 with Enhanced format. | MUST | P1 | T-CAL-xx | ADR 0002 D3 profiles, open question 7; R04 §4 |
| CAL-05 | Render calibration patterns in the output stage itself, through the real swapchain path: HGIG 10% and full-field checkers, a near-black PQ ramp, a paper-white match swatch, a blooming box and primary ramps. | MUST | P1 | T-CAL-xx | ADR 0002 D9 item 3; R04 implication 2 |
| CAL-06 | Find and store HGIG MaxTML and MinTML for the MacBook and the A95L, and MaxFFTML for the A95L (not applicable on the MacBook, 04 CAL-03), without an instrument. | MUST | P1 | T-CAL-xx (G-UI-2) | ADR 0001 phases (P1 exit); ADR 0002 gates |
| CAL-07 | Record per display the potential, current and reference headroom; on the A95L also N (estimated visually or measured), PQ ramp behaviour and the HDMI format at 4K120. Until recorded, the profile is labelled "assumed". | MUST | P1 | T-CAL-xx (G-DISP) | ADR 0002 gates |
| CAL-08 | Store with every profile its date, macOS build, TV firmware (for the A95L), connection, and how N was obtained. | MUST | P1 | T-CAL-xx | R04 implications 7, 8 |
| CAL-09 | Follow the session order: 30 min warm-up, HGIG tests, instrument spot reads only if an instrument is available, record N, save the profile. | SHOULD | P1 | T-CAL-xx | R04 implication 7 |
| CAL-10 | Keep scene diffuse levels (sky, cloud) near paper white on the A95L, to avoid full-field limiting and ABL pumping. | SHOULD | P3 | T-CAL-xx, T-HDR-xx | R04 implication 4 |
| CAL-11 | Gamut per profile: BT.709 game colour maps into the panel gamut with no clipping on the primary ramps (P3 on the MacBook; inside the BT.2020 container on the A95L with TV Live Color off). With vivid off, no output pixel leaves P3; vivid is capped at P3 by soft gamut compression. | MUST | P1 | T-CAL-xx | ADR 0002 D3; ADR 0006 item 1; R04 §4 |
| CAL-12 | Black level per profile: record MinTML and the first visible near-black step on the A95L (PQ ramp, 0-1 nit in 0.05-nit steps), and record MacBook mini-LED blooming severity with the HUD on black. Blooming is documented, not calibrated away. | MUST | P1 | T-CAL-xx | R04 §3.3; ADR 0002 D9 item 3 |

### 1.4 Dashboard and UX

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| UX-01 | Default to a clean fullscreen view. The dashboard is hidden by default and costs zero while hidden. | MUST | P1 | T-UI-xx (G-UI-1) | ADR 0002 D9 item 5 |
| UX-02 | One shortcut toggles the dashboard: the DualSense mute button (`MISC1`), removed from the guest mapping, plus one keyboard key verified unbound in every keyboard player profile. Touchpad click is optional. If `MISC1` does not reach SDL, use a Create + Options chord held 0.5 s, swallowed from the guest. The keyboard key arrives with the P1 dashboard core; the mute button, chord and guest-swallow logic land in P4 (03 §4.3). | MUST | P1 (key), P4 (pad) | T-UI-xx, T-INP-xx (G-INP-1) | ADR 0004 dashboard toggle |
| UX-03 | Draw the dashboard in the output stage, in the same drawable. Dear ImGui (MIT) supplies layout and widgets only; Luma renders its draw lists in its own Vulkan pass. Pin and hash the binding and native library; if G-UI-0 fails, use the custom immediate-mode renderer (4-8 days). | MUST | P1 | T-UI-xx (G-UI-0) | ADR 0002 D9 items 1-2 |
| UX-04 | Show, at minimum: guest, present and display frame-time graph; FPS; cap; present mode; panel refresh; cadence fit; direct-to-display ("unknown" unless verified); source mode; backend; shader-cache state (cold or warm); EDR headroom (current, potential, reference, stale). P1 delivers the frame-time, headroom, present-mode and cadence core. | MUST | P1 | T-UI-xx | ADR 0002 D9 item 6; ADR 0001 phases |
| UX-05 | Add a luminance histogram and waveform on a PQ axis, plus clipping and gamut counters. | MUST | P4 | T-UI-xx | ADR 0002 D9 item 6; R09 §3 |
| UX-06 | Label every number *signal* (computed from pixels sent), *profile* (target setting) or *measured* (owner-entered instrument reading with instrument, window size and date). Computed rendering nits are never shown as panel brightness; Mac nits appear only as "assumed N nits at EDR 1.0". Simulated values are labelled simulated. | MUST | P1-P4 | T-UI-xx | ADR 0002 D9 item 7; R04 §5; AGENTS.md rule 5 |
| UX-07 | Make the UI SDR-safe: `ui_white = paper_white × UI scale` (default 0.85, range 0.6-1.0), so EDR 1.0 or less on the Mac and 203 nits or less on the A95L; sRGB-to-linear vertex colours; game clamped to UI white under plates; plates at least 85% opaque; SDR graph colours, never full-intensity primaries. | MUST | P1 | T-UI-xx | ADR 0002 D9 item 4 |
| UX-08 | Measure dashboard and scope cost with GPU timestamps (estimated 0.05-0.2 ms). If timestamps do not work on MoltenVK, compare against an Instruments GPU trace. | MUST | P4 | T-UI-xx (G-UI-1, G-UI-3) | ADR 0002 gates |
| UX-09 | Make gamepad navigation the primary input path for the dashboard and calibration. | MUST | P1 | T-UI-xx | ADR 0002 D9 item 5 |
| UX-10 | Auto-dim the dashboard after a few seconds on the OLED to limit retention. | SHOULD | P4 | T-UI-xx | ADR 0002 D9 item 5 |
| UX-11 | Keep profile and preset selection in Ryubing's Avalonia menus. | MUST | P1 | T-UI-xx | ADR 0002 D9 item 8 |
| UX-12 | Provide named presets and a troubleshooting guide in plain language (for example "HDR looks flat: check headroom"), and pass an owner usability pass of the calibration flow on both displays. | MUST | P4 | T-UI-xx (G-UI-2) | ADR 0001 phases (P4); ADR 0002 gates; R04 implication 5 |
| UX-13 | Show which source owns Player 1 (physical or agent), and replace the controller-applet dialog with a toast. | MUST | P2 | T-UI-xx, T-AGT-xx | ADR 0004 composite driver, profiles |
| UX-14 | Show the input pump age, if G-INP-4 instruments it. | COULD | P2 | T-INP-xx (G-INP-4) | R07 implication 3 |

### 1.5 Visual presets and effects

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| LOOK-01 | Ship built-in looks in two fixed stages, neutral by default, each with three strengths. | MUST | P4 | T-LOOK-xx | ADR 0006 item 1 |
| LOOK-02 | Scene stage, inside the replaced tonemap: airlight defog, then exposure and white balance, then Oklab vivid. Display stage, in the output stage in nits: ICtCp highlight-aware chroma, then soft gamut compression to P3, then UI and overlay, then encode. | MUST | P3-P4 | T-LOOK-xx | ADR 0006 item 1 |
| LOOK-03 | Before P3, run only the display stage, on the linearised SDR frame, labelled "approximate". The dashboard always shows which stage is active. | MUST | P4 | T-LOOK-xx, T-UI-xx | ADR 0006 items 2-3 |
| LOOK-04 | Describe any P3 "vivid" result as a creative expansion, not recovered colour. | MUST | P4 | T-UI-xx | ADR 0006 context; R02 §3 |
| LOOK-05 | Defog in this priority: owner-installed Serfrost Base v2.4 (never bundled, checksum-verified, same-framing A/B), then scene-stage airlight subtraction, then display-stage luminance-weighted subtraction with blue-noise dithering. No depth-based defog. | SHOULD | P4 | T-LOOK-xx (G-LOOK-1) | ADR 0006 item 4 |
| LOOK-06 | Check banding on ramps at each strength and the temporal stability of the airlight estimate. A look that fails at every strength is removed. | MUST | P4 | T-LOOK-xx (G-LOOK-2) | ADR 0006 gates |
| LOOK-07 | Keep looks plus scopes within the measured output-stage budget. | MUST | P4 | T-LOOK-xx (G-UI-1) | ADR 0006 gates |
| LOOK-08 | Embed the reshadefx compiler (BSD-3, SPIR-V) on Ryubing's own Vulkan device at the output stage, only after P4 and only if the owner names effects the built-in looks cannot provide. The embedder defines `BUFFER_COLOR_SPACE`. No Windows add-on ABI compatibility. | COULD | P5 | T-LOOK-xx (G-FX) | ADR 0006 item 5; R09 verification |
| LOOK-09 | Do not adopt librashader. Allow MacShade only as an optional, owner-approved SDR experiment on a separate ad hoc copy, outside the default path. | MUST | All | T-HYG-xx | ADR 0006 items 6-7 |
| LOOK-10 | Take only ideas, never code or payloads, from GPL, ND or NC sources. | MUST | All | T-HYG-xx | ADR 0006 item 8 |
| LOOK-11 | Evaluate vivid on each display with a same-framing A/B against neutral: gamut counter, hue stability in skin, foliage and sky, and banding at each strength. | MUST | P4 | T-LOOK-xx (G-LOOK-2) | ADR 0006; R09 §1c |

### 1.6 DualSense and input

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| INP-01 | Support DualSense buttons, sticks, analog triggers, touchpad click, gyro aiming, accelerometer and rumble over USB and Bluetooth, through SDL3 HIDAPI as shipped (SDL `3.5.0-5403934`). | MUST | P0-P2 | T-INP-xx (G-INP-1) | ADR 0004 v1 path; R07 Summary |
| INP-02 | Carry the tested v1 patches: accept `CAP_RGB_LED` (lightbar per profile), set the player index, keep the gamepad property set, fix rumble left and right after a side probe, skip `NpadHdRumble` for non-Nintendo pads. | MUST | P2 | T-INP-xx (G-INP-2) | ADR 0004 patch table |
| INP-03 | Bind both the USB and the Bluetooth DualSense ids in each profile, so a reconnect on either bus restores the same player and profile. Set `ignore_applet`. | MUST | P2 | T-INP-xx (G-INP-5) | ADR 0004 profiles |
| INP-04 | Start gyro at deadzone 0.5 and sensitivity 100, motion on Player 1 only; confirm axis signs during Great Sky Island archery. | MUST | P0 | T-INP-xx (G-INP-2) | ADR 0004 profiles; R07 implication 5 |
| INP-05 | Make no TCC changes. Record whether an Input Monitoring prompt appears on USB and Bluetooth, and whether `MISC1` and PS reach SDL; the owner answers any prompt. | MUST | P0 | T-INP-xx (G-INP-1) | ADR 0004 gates; [E] §6 |
| INP-06 | Document PS button and Game Overlay behaviour with the emulator in the background, and Bluetooth dropout with `ignore_applet` off and on. | MUST | P2 | T-INP-xx (G-INP-5) | ADR 0004 gates |
| INP-07 | Move the input pump to 2-4 ms off the UI thread only if the pump-age histogram shows the current 0-10 ms age matters. | SHOULD | P2 | T-INP-xx (G-INP-4) | ADR 0004 patch table; R07 §5 |
| INP-08 | Use USB as the default bus for every measurement session; Bluetooth is allowed for play. | MUST | P0 | T-INP-xx, T-PERF-xx | ADR 0004 bus policy; R07 Summary |
| INP-09 | Touchpad two-finger coordinates are deferred beyond v1. | COULD | Later | T-INP-xx | ADR 0004 consequences |
| INP-10 | Run advanced haptics and adaptive triggers as a separate P5 track, each with its own go/no-go: GameController shim (reopened if G-INP-3 fails), USB voice-coil PCM haptics (1-2 w), adaptive triggers with private read-only TOTK hooks (2-4 w), Bluetooth haptics (2-4 w, uncertain). A failed item never affects v1, and trigger effects are cleared on exit. | COULD | P5 | T-INP-xx (G-INP-3) | ADR 0004 P5 track; R07 §4 |

### 1.7 Automation (agent pad)

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| AGT-01 | Preserve the dedicated virtual gamepad through a composite gamepad driver. With no socket configured, the stock SDL driver is used. | MUST | P2 | T-AGT-xx | ADR 0004 composite driver; ADR 0001 D1 seams |
| AGT-02 | Never touch the keyboard, the mouse or window focus, and inject no OS-level input events. | MUST | P2 | T-AGT-xx (G-INP-5, G-INP-6) | ADR 0004 composite driver |
| AGT-03 | Owner wins: any non-neutral physical input on the same player latches the agent ESTOP and neutralises the virtual pad until an explicit resume. | MUST | P2 | T-AGT-xx (G-INP-6) | ADR 0004 composite driver; R07 §1.7 |
| AGT-04 | Agent-exclusive mode is opt-in and masks the physical pad for that player; the mask drops on ESTOP or socket loss. | MUST | P2 | T-AGT-xx | ADR 0004 composite driver |
| AGT-05 | Never route rumble from the virtual pad to the physical pad. Use explicit player assignment, with no dynamic "last input wins" swap. | MUST | P2 | T-AGT-xx | ADR 0004 composite driver |
| AGT-06 | Keep the control channel local and bounded: a Unix socket in a 0700 folder with peer-uid checks, no TCP or UDP listener, commands bounded to 5 s, a neutral pad after 5 s idle and on disconnect, and ESTOP as both a command and a file (file ESTOP measured within 53 ms [E]). | MUST | P2 | T-AGT-xx | ADR 0004 context; [E] §2 row 7, §6 |
| AGT-07 | Replay owner-wins arbitration live, including the "user clicked" guard path, before any unattended agent session. If it cannot be made reliable, agent sessions run only with the physical pad disconnected. | MUST | P2 | T-AGT-xx (G-INP-6) | ADR 0004 gates, kill criteria; [E] §2 row 9 |
| AGT-08 | Agents never launch measured runs. Strict comparisons use the build without the agent patch; the agent uses its own `agent` bundle and `agent-background` profile. | MUST | P0 | T-AGT-xx, T-PERF-xx | ADR 0004 hygiene; ADR 0001 D10 |

### 1.8 Configuration and rollback

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| CFG-01 | Build Luma as an ordered patch queue on Ryubing `475615f`, one commit per concern, every runtime change behind an off-by-default flag. With all flags off, the build behaves as stock. | MUST | P0 | T-RB-xx | ADR 0001 D1 |
| CFG-02 | Expose each feature as a CLI option and a key in a separate `luma.json` per data root. Ryubing's `Config.json` is not edited. Ship profiles `macbook-xdr`, `a95l`, `measurement` and `agent-background`. | MUST | P0 | T-RB-xx | ADR 0001 D10 item 3 |
| CFG-03 | Give each variant (`reference`, `measure`, `agent`, `hdr`) its own bundle name, `CFBundleIdentifier` (`app.totkluma.ryubing.<variant>`) and `--root-data-dir`. | MUST | P0 | T-RB-xx | ADR 0001 D10 item 4; R10 §3.4 |
| CFG-04 | Copy saves into each data root from a manifest-checked backup; never share them live between variants. | MUST | P0 | T-RB-xx | ADR 0001 D10 item 4; R10 §3.5 |
| CFG-05 | Load the private title pack by path behind a flag, and verify its checksums. A missing or mismatched pack disables only the features that need it. | MUST | P0 | T-RB-xx, T-HYG-xx | ADR 0001 D1 item 5; ADR 0003 §4 |
| CFG-06 | Provide the rollback ladder: flag off, then the previous bundle, then a rebuild from the previous tag (about a minute warm), then delete the build folder. No step changes the system. Drill it once in P0. | MUST | P0 | T-RB-xx (rollback drill) | ADR 0001 D10 item 7, gates; [E] §6 |
| CFG-07 | Never replace, only add: a new build is a new bundle, and the previous known-good bundle and the reference app stay untouched. Retention (N-1 or N-2) is an owner decision. | MUST | P0 | T-RB-xx | R10 §3.5; ADR 0001 open question 8 |
| CFG-08 | Launch only executables whose SHA-256 is in `build-manifest.json`. | MUST | P0 | T-RB-xx (G-BUILD) | ADR 0001 D10 item 5 |
| CFG-09 | Give each high-risk feature its own kill switch: RT upgrade back to SDR, D2 off back to "30 (native)", display-locked vsync back to the timer. | MUST | P2-P3 | T-RB-xx | ADR 0002 gates; ADR 0003 kill criteria |

---

## 2. Non-functional requirements

### 2.1 Correctness of game speed, saves and audio

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| NFR-COR-01 | Game speed stays 1.00 ± 0.01 at every offered cap, checked by the walk test, the in-game clock against a stopwatch, and a timed animation from `presentedTime`-stamped frames. Measured so far: 0.995-1.005 at 30 and about 48 FPS [E]. | MUST | P2 | T-CAP-xx (G-CAP) | ADR 0003 §6; R06 §5 |
| NFR-COR-02 | Physics and animation stay correct over sessions of 30 minutes or more at 30, 40, 45 and 60. A cap that fails is withdrawn; if every cap above 30 fails, only "30 (native)" ships. | MUST | P2 | T-CAP-xx (G6-4) | ADR 0003 gates, kill criteria |
| NFR-COR-03 | Audio keeps pitch and tempo with no drift against baseline at each offered cap. Movies play at correct speed, or the 1.5-2x caveat is documented until automatic 30 exists. | MUST | P2 | T-CAP-xx (G6-4, G6-3) | ADR 0003 gates; R06 §5 |
| NFR-COR-04 | Saves stay compatible: a save written by any Luma variant loads in stock Ryubing at `475615f`, and the reverse. A save written under D2 already loads without D2 [M] (R06 verification). | MUST | P0-P3 | T-RB-xx, T-CAP-xx | R06 verification; ADR 0001 D10 item 4 |
| NFR-COR-05 | No Luma change introduces visual artefacts: 0 new artefacts in 900 s warm runs for HDR and backend changes, and Hypervisor On becomes default only after G-AB. | MUST | P0-P5 | T-HDR-xx (G-HDR-3), T-PERF-xx (G-AB, G-KK) | ADR 0001 gates; ADR 0002 gates |

### 2.2 Frame pacing

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| NFR-PACE-01 | Stable pacing comes before counter FPS: each display's suggested default is an evenly paced cap, and 30 is the guaranteed cap. | MUST | P2 | T-CAP-xx | ADR 0003 §2; R05 implication 3 |
| NFR-PACE-02 | Publish p50/p90/p99/p99.9/max, jitter, cadence error rate, drops and guest-present versus on-screen mismatch for every offered cap and display. | MUST | P2 | T-CAP-xx (G-CAP) | ADR 0003 §6; R06 §5 |
| NFR-PACE-03 | No shader-compile spike in steady state (C2); cold-cache hitches are reported separately. | MUST | P2 | T-CAP-xx (G-CAP) | ADR 0003 §6 |

### 2.3 Latency budgets

No end-to-end latency figure exists yet for this setup; the budgets below are relative to stock or come from the notes.

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| NFR-LAT-01 | The output stage and display helper add no extra queued frame against stock (FIFO, 3 images). Host submit to `actualPresentTime` is measured with the stage on and off, per display. | MUST | P1 | T-HDR-xx, T-PERF-xx | R06 §2 [D]; ADR 0002 consequences [I] |
| NFR-LAT-02 | Dashboard and scopes cost an estimated 0.05-0.2 ms when shown and zero when hidden; the optional adaptive peak about 0.3 ms or less. | MUST | P4-P5 | T-UI-xx (G-UI-1), T-DV-xx | ADR 0002 gates; ADR 0005 gates |
| NFR-LAT-03 | Keep the A95L in its HDR10 Game-mode latency class (about 16 ms at 4K60, about 8 ms at 120 Hz [D]/[A]); Dolby Vision Game mode (136-216 ms [M-third-party]) is excluded. | MUST | P1 | T-CAL-xx | ADR 0005 context; R04 §2 |
| NFR-LAT-04 | Preserve direct-to-display eligibility with one opaque layer. If the fullscreen path is composited, measure its latency cost before considering the native presenter. | MUST | P1 | T-HDR-xx (G-PRES-2) | ADR 0002 gates |
| NFR-LAT-05 | Measure input age (pump age) and keep USB at 250 Hz for measurement; reduce the 0-10 ms pump age only if it is material. | SHOULD | P2 | T-INP-xx (G-INP-4) | ADR 0004 context; R07 §5 |
| NFR-LAT-06 | Compare presentation latency per display: stock, SDR-identity output stage and EDR in P1, then per tier (SDR, Expanded SDR, Scene HDR) in P3, next to the frame-time cost. TV-internal latency is quoted from third-party data only, because measuring it would need equipment the project does not have. | MUST | P1, P3 | T-HDR-xx | Owner requirement; ADR 0005 context; R08 §2 |

### 2.4 Reproducibility

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| NFR-REP-01 | Pin the build: `global.json` at `10.0.303` with `rollForward: disable` and `paths`; `packages.lock.json` for `src/Ryujinx` and the test projects with `--locked-mode`; SHA-256 of MoltenVK and every dylib (including the ImGui native library); a `build-manifest.json` with upstream commit, queue tag, SDK, lock-file hash, OS and toolchain builds, and executable and dylib hashes. A rebuild reproduces the hashes. | MUST | P0 | T-RB-xx (G-BUILD) | ADR 0001 D10 item 5 |
| NFR-REP-02 | Tag every measurement with binary hash, config hash, save slot, cache state, display and mode, power and thermal state, Game Mode and pad bus. | MUST | P0 | T-PERF-xx | ADR 0004 hygiene; R07 §6 |
| NFR-REP-03 | Run performance samples on an uncontended host: no other GPU-heavy apps, no screen capture beyond the measuring tool, Metal HUD off, agent pad disconnected or idle, same build, config, save and warm cache. | MUST | P0 | T-PERF-xx | ADR 0004 hygiene |
| NFR-REP-04 | Run builds only when the owner agrees (they compete for CPU), and run no long benchmarks in the specification phase. | MUST | All | T-RB-xx | ADR 0001 D10 item 9; ADR 0003 §6 |

### 2.5 Privacy

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| NFR-PRIV-01 | No telemetry leaves the Mac. Telemetry CSVs, captures, shader dumps, GPU traces and profiles stay in the private workspace. Luma adds no network code, no analytics and no upload. | MUST | All | T-HYG-xx | ADR 0001 D10 item 1; ADR 0003 §3 |
| NFR-PRIV-02 | Log Ryubing's existing startup network activity (gamepad DB fetch, Discord integration) and keep it fixed per run; Luma profiles keep Discord integration off. | SHOULD | P0 | T-HYG-xx, T-PERF-xx | R07 §6 [D]/[I] |
| NFR-PRIV-03 | Make no TCC, Gatekeeper or SIP changes. Sign ad hoc with the same 8 entitlements, and test removal of the debug-only entitlements for play builds. | MUST | P0 | T-RB-xx | ADR 0001 D10 item 6; [E] §6 |

### 2.6 Maintainability

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| NFR-MNT-01 | Touch upstream only at the five named seams (telemetry ring, `IOutputStage`, display helper, guest-shader registry, composite gamepad driver), mostly as new files. Texture-format upgrades stay on the exact allow-list. | MUST | P0-P3 | T-RB-xx | ADR 0001 D1 item 4 |
| NFR-MNT-02 | Use one toolchain in v1 (the pinned .NET SDK). No Xcode or Swift step; Mac glue goes through C# Objective-C and C interop. | MUST | P0-P4 | T-RB-xx (G-BUILD) | ADR 0001 D1 item 3 |
| NFR-MNT-03 | Keep the queue order (build config, shmfix, hvfix A+B, telemetry, input composite, output stage, display helper, shader registry, RT allow-list mechanism). `rebase.sh` replays the `series` file and runs `Ryujinx.Tests.Memory` and `Ryujinx.Tests.Input`; tags follow `luma/475615f/qN`. | MUST | P0 | T-RB-xx | ADR 0001 D10 item 2 |
| NFR-MNT-04 | If one upstream sync costs more than the owner's per-sync budget twice in a row, re-evaluate the base (estimate 0.5-2 days now, 2-5 days after P3). | MUST | All | T-RB-xx | ADR 0001 kill criterion; R10 §2A |
| NFR-MNT-05 | Offer shmfix and the `contentsScale` fix upstream early, and A+B after G-AB, once the owner approves. Report FencePool results to its author rather than resubmitting it. | SHOULD | P0-P2 | T-RB-xx | ADR 0001 D10 item 8 |
| NFR-MNT-06 | Spend through evidence gates, not open-ended: the owner sets a person-week ceiling for P3, and no P5 track starts without owner approval and ends without a written go/no-go. | MUST | All | T-RB-xx | ADR 0001 phases; ADR 0002 kill criterion |
| NFR-MNT-07 | Keep MoltenVK-specific workarounds small, given the MoltenVK deprecation (commit `0aa76ad`, 2026-10-13 [D]). | SHOULD | All | T-RB-xx | ADR 0001 consequences; R05 Risks |

### 2.7 Public-repository hygiene

| ID | Requirement | Priority | Phase | Acceptance | Source |
|---|---|---|---|---|---|
| NFR-HYG-01 | The public repository holds specs and the simulated demo only: no absolute home paths, usernames, emails, serial numbers or credentials. | MUST | All | T-HYG-xx | AGENTS.md rules 2-3; ADR 0001 D10 |
| NFR-HYG-02 | No proprietary game content anywhere public: no game images, firmware, keys, saves, shader caches, screenshots, extracted data, patch offsets or bytes, guest hashes or TOTK shaders. | MUST | All | T-HYG-xx | AGENTS.md rule 1; ADR 0001 D1 item 5 |
| NFR-HYG-03 | The fork carries only generic mechanisms with no game identifiers; everything TOTK-specific stays in the title pack. | MUST | P0+ | T-HYG-xx | ADR 0001 D1 item 5 |
| NFR-HYG-04 | Tag every claim `[D]`, `[M]`, `[I]` or `[A]`, and label simulated values in the demo. | MUST | All | T-HYG-xx | AGENTS.md rules 5-6 |
| NFR-HYG-05 | Respect third-party licences: Serfrost never bundled; RenoDX maths with MIT attribution; Dear ImGui under MIT; no GPL code; no Dolby-confidential formats; no libplacebo code without LGPL compliance. | MUST | All | T-HYG-xx | ADR 0002 D3; ADR 0005 item 7; ADR 0006 item 8 |

---

## 3. Coverage of the owner's requirements

A finer mapping, line by line of the owner's brief and across every document, is in the
[documentation index](README.md#requirement-coverage).

| Owner requirement | Covered by |
|---|---|
| About 1080p, highest sustainable frame rate, correct gameplay, emulator-based | PERF-07, CAP-01 to CAP-06, NFR-COR-01 to NFR-COR-05 |
| Sustained 60 where feasible; 30/45/60 caps; pacing and correctness over counter FPS | CAP-01 to CAP-06, NFR-PACE-01 to NFR-PACE-03 |
| VRR per display and connection; refresh-compatible fallbacks | VRR-01 to VRR-07, CAP-03, CAP-09 |
| Profile CPU, GPU, sync and shader bottlenecks; compare backends by evidence and maintenance cost | PERF-05, PERF-08 to PERF-15 |
| Demanding scenes, warm and cold caches, true frame-time measures | PERF-01 to PERF-04 |
| Full precision path to the display; preserve scene HDR before clipping | HDR-09 to HDR-16 |
| Calibrated MacBook and A95L profiles | CAL-01 to CAL-12 |
| Compare detail, gradients, colour, latency and performance | HDR-17, NFR-LAT-01, NFR-LAT-06 |
| Existing implementations inspected first | HDR-20 (RenoDX maths reuse, no ReShade/MacShade dependency), HDR-27 |
| Vivid, defog, ReShade-style without the Windows ABI | LOOK-01 to LOOK-11 |
| Dolby Vision evaluated, research only; HDR10/EDR independent | HDR-23 to HDR-26, non-goals |
| Clean fullscreen; one-shortcut dashboard; nits labelling; easy calibration and troubleshooting | UX-01 to UX-14 |
| DualSense over USB and Bluetooth, reconnects; haptics and triggers as a separate track | INP-01 to INP-10 |
| Agent pad without stealing keyboard, mouse or focus; uncontended measurement | AGT-01 to AGT-08, NFR-REP-02, NFR-REP-03 |
| Narrow changes, reproducible builds, clean config, rollback, evidence gates | CFG-01 to CFG-09, NFR-REP-01, NFR-MNT-01 to NFR-MNT-07 |

---

## 4. Non-goals

- **Switch 2 Edition.** Only the Switch 1 release at game version 1.4.3 is in scope. HDR is a feature of the Switch 2
  Edition, which is not used [E] §5.
- **Native port claims.** TOTK Luma is emulator-based. It never claims to be, or presents itself as, a native port.
- **Distributing game content or mods.** No game files, keys, firmware, saves, shader caches, extracted data, patch
  bytes or offsets, guest hashes or TOTK shaders are distributed. Serfrost and other mods are never bundled.
- **Dolby Vision output.** No DV signalling, no restricted SDK, no reverse engineering of Dolby formats. DV is
  researched only through the watching brief (ADR 0005).
- **Windows add-on ABI compatibility.** No ReShade add-on, RenoDX DLL or other Windows binary is loaded. ReShade FX is
  considered only through an embedded compiler behind G-FX (ADR 0006).
- **Commercial compliance.** No certification or licensing programme is pursued. Only practical component-access and
  reuse constraints are recorded.
- **Production code in this phase.** No production emulator implementation, no merge, no deploy. Implementation starts
  only after the owner records decisions in `docs/`.
- **Purchases.** None are planned: no instrument, cable, capture device, licence or hardware.
- **Also out of scope:** a native Metal backend (unless G-METAL passes), MetalFX frame interpolation, depth-based
  defog, librashader, a native Swift shell (option B) or another base emulator (option D) unless their reopen gates
  fire, and long benchmark runs during specification.

---

## 5. Assumptions

| # | Assumption | Effect if wrong |
|---|---|---|
| A1 | The owner legally owns TOTK (Switch 1, 1.4.3) and supplies game files, keys and firmware locally; none enter any repository. | The project cannot proceed. |
| A2 | The target stays the 16-inch MacBook Pro (M4 Pro, 20-core GPU, 48 GB) on macOS 27.2 beta, the built-in XDR panel and a Sony A95L over HDMI. EDR behaviour may change between beta builds, so each profile stores the build [I]. | Profiles and pacing results must be re-validated. |
| A3 | Ryubing stays pinned at `475615f` with MoltenVK `1.4.2-ryujinx.5`; syncs happen on demand. | Rebase cost and baselines change (NFR-MNT-04). |
| A4 | Guest shader hashes are fixed for game version 1.4.3, and D2 does not alter the hashed shaders [I]. | Title-pack hashes need rework before P3. |
| A5 | No measuring instrument is available, so nits are computed and labelled as such until the owner enters a measured reading. | Only labels change; requirements stand. |
| A6 | The owner can attend the scheduled sessions (A+B flash validation, capture session, DualSense check, live arbitration replay, A95L sessions) on uncontended hardware. | The matching gates stay open and their phases cannot exit. |
| A7 | The A95L is connected on HDMI 3 or 4 with Enhanced format and a cable suitable for 4K120; if not, G6-1 and G6-2 are recorded as untestable rather than solved by a purchase [I]. | VRR and 4K120 rows stay unverified; fixed-rate menus apply. |
| A8 | No loopback audio capture device is installed (R06 §5), so the objective audio-drift check in G6-4 needs a method that needs no purchase. | The audio criterion of NFR-COR-03 may rest on an attended listening check, recorded as such. |
| A9 | The owner provides the D2 patch and, if wanted, Serfrost Base v2.4; Luma only verifies their checksums. | The capped modes fall back to "30 (native)"; defog uses the built-in stages. |
| A10 | All effort figures are estimates [I] from the research notes; P0-P4 total about 11.5-25 person-weeks. | Owner ceilings and gates decide what continues. |
