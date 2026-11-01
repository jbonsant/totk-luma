# TOTK Luma test and acceptance matrices

Status: Proposed, 2026-11-01

This page says how each owner requirement will be checked once implementation is approved. It covers four areas:
performance, caps and VRR; the HDR pipeline and display calibration; the DualSense; and background control with the
agent pad. A short final section links the rollback and reproducibility tests in
[05-rollback-and-reproducibility.md](05-rollback-and-reproducibility.md).

Every test follows the accepted decisions in the ADRs ([index](adr/README.md)). Where an ADR gate sets a pass
criterion, this page uses it unchanged. Where no gate sets one, the criterion here is a proposal and is tagged `[I]`.

**Nothing on this page runs now.** This is the specification phase: no emulator code, no long benchmark runs, no
purchases (ADR 0001, ADR 0003 §6). Prior local results are bounded experimental evidence `[E]`, not acceptance.

Tags follow AGENTS.md: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal. `[E]` cites
[the prior local evidence](evidence/prior-local-evidence.md). `R05 §4` cites research note 05, section 4.

---

## Contents

0. [How to read the matrices](#0-how-to-read-the-matrices)
1. [Performance, caps and VRR](#1-performance-caps-and-vrr)
2. [True HDR pipeline and display calibration](#2-true-hdr-pipeline-and-display-calibration)
3. [DualSense](#3-dualsense)
4. [Background control and the agent pad](#4-background-control-and-the-agent-pad)
5. [Rollback and reproducibility](#5-rollback-and-reproducibility)
6. [Gate-to-test index](#6-gate-to-test-index)
7. [Requirement coverage](#7-requirement-coverage)
8. [Inconsistencies noted](#8-inconsistencies-noted)

---

## 0. How to read the matrices

### 0.1 Columns

Every test row has the same six columns:

| Column | Meaning |
|---|---|
| Test id | Unique id. The prefix names the area (for example `CAP-04`). Gate names always start with `G-` and are never test ids |
| Req. | Requirement keys from section 0.2 |
| Procedure | What is done, on which scene, display and build |
| Pass criterion | What must hold. ADR gate criteria are quoted; proposals are tagged `[I]` |
| Equipment / owner | What is needed, and whether the owner must be present (key in section 0.4) |
| Phase | The phase whose exit depends on it (P0-P5, see the [phased plan](adr/README.md#phased-plan)) |

### 0.2 Requirement keys

The keys below restate the owner's approved requirements in short form so each test can point at them. They are
defined here for traceability. [01-requirements.md](01-requirements.md) numbers requirements differently (PERF-xx,
CAP-xx, HDR-xx and so on); its "How to read" table maps each of its test families to the test ids on this page, and
the [documentation index](README.md#requirement-coverage) maps each owner requirement to both sets of ids. The
wording of the requirements is unchanged.

| Key | Owner requirement (short form) | Main ADR |
|---|---|---|
| PF-1 | A sustained 60 FPS where feasible | 0003 |
| PF-2 | Configurable 30 / 45 / 60 caps | 0003 |
| PF-3 | Stable frame pacing comes before counter FPS | 0003 |
| PF-4 | Correct game speed, physics, animation, audio and save compatibility | 0003 |
| PF-5 | VRR investigated per display and connection, with refresh-compatible fallbacks | 0003 |
| PF-6 | CPU, GPU, synchronisation and shader bottlenecks profiled; full GPU utilisation alone is not success | 0001 (D2) |
| PF-7 | Native Metal, Vulkan/MoltenVK and selective backend improvements compared by measured evidence and maintenance cost | 0001 (D2) |
| PF-8 | Representative demanding scenes, warm and cold cache distinction, true frame-time measures | 0003 |
| PF-9 | About 1080p internal rendering | 0001 (D2) |
| HD-1 | The full precision and range path from game lighting to the display is traced; losses of precision, gamut and highlights are located | 0002 (D3) |
| HD-2 | Genuine scene HDR is preserved before clipping; a brighter SDR image or an HDR swapchain alone is not enough | 0002 (D3, D4) |
| HD-3 | Separate calibrated MacBook and A95L profiles: paper white, highlights and roll-off, black level, gamut, SDR-safe UI, dynamic EDR headroom | 0002 (D3, D9) |
| HD-4 | Tiers compared on highlight detail, gradients, colour accuracy, latency and performance, not on brightness | 0002 |
| HD-5 | Existing implementations inspected first; native HDR through Vulkan/MoltenVK/Apple EDR | 0002 |
| HD-6 | Optional vivid colour and defog; ReShade-style support without Windows add-on ABI compatibility | 0006 |
| DV-1 | Dolby Vision evaluated as research only; HDR10/EDR stays independently viable | 0005 |
| UX-1 | A clean fullscreen default | 0002 (D9) |
| UX-2 | One shortcut toggles an HDR and performance dashboard (histogram, waveform, clipping, headroom, frame-time graph, FPS, presentation mode) | 0002 (D9), 0004 |
| UX-3 | Computed rendering nits labelled separately from physically measured panel brightness | 0002 (D9) |
| UX-4 | Calibration, presets and troubleshooting are easy to understand | 0002 (D9) |
| IN-1 | DualSense buttons, sticks, motion aiming, touchpad and rumble | 0004 |
| IN-2 | USB and Bluetooth, with reconnects | 0004 |
| IN-3 | Advanced haptics and adaptive triggers on a separate feasibility track | 0004 |
| IN-4 | The virtual-gamepad automation is preserved without stealing keyboard, mouse or focus | 0004 |
| IN-5 | Performance measurements use uncontended hardware, even when inputs are isolated | 0004 |
| AR-1 | Narrow reusable changes, isolated components, reproducible builds, clean config and rollback | 0001 (D1, D10) |
| AR-2 | Evidence gates instead of unbounded spending | All |
| CN-1 | No production implementation, merge, deploy or purchase now; prior results are bounded; no long benchmark runs now | All |

### 0.3 Shared definitions

**Cache states** (ADR 0003 §6, R05 §4.3):

| State | Definition | Use |
|---|---|---|
| C0 | Ryujinx host cache removed in a copied profile, and Metal cold (new binary or first HUD run) | Worst-case boot and first-visit cost |
| C1 | Ryujinx caches warm, Metal cold | Isolates the Metal compiler |
| C2 | All warm: second identical run, same binary, same HUD setting | **All steady-state claims** |

A new build always starts cold: about 85-88 s and about 1,017 shaders [E]. The Metal HUD forces a Metal recompile, so
HUD runs are compared only with HUD runs [E].

**Standard run protocol (RP)** (ADR 0003 §6, R05 §4.3): boot, load the save, wait 60 s for JIT warm-up (there is no
PPTC on this setup [D]), measure 120 s on a fixed path or at a fixed point, repeat three times. One variable changes
per run. Every run carries a run record ([05 §4.3](05-rollback-and-reproducibility.md)) and follows the
uncontended-hardware protocol in section 4.3.

**Metrics** (ADR 0003 §6, R06 §5, R05 §4):

| Metric | Source | Definition |
|---|---|---|
| Guest frame interval | Telemetry ring: guest present timestamps (`SurfaceFlinger` frame callbacks) | p50, p90, p95, p99, p99.9 and maximum. p95 is included because G-TEL and G-KK use it |
| Guest vsync tick | Telemetry ring | Interval between guest vsync signals; shows timer drift against the panel |
| Host present interval | Telemetry ring: host submit before `vkQueuePresentKHR` | Same percentiles |
| Display interval | `actualPresentTime` through `VK_GOOGLE_display_timing` (MoltenVK `presentedTime`) | Same percentiles; `0` means dropped |
| Jitter | Display intervals | Standard deviation of intervals and of interval-to-interval change |
| Missed vsyncs and drops | Display intervals | Frames held longer than the planned hold; frames with `actualPresentTime = 0` |
| Cadence error rate | Display intervals against the expected hold pattern (table 1.3) | Share of frames whose on-screen hold differs from the pattern |
| Cadence index | Display intervals plus the D2 step | R06 §5's speed-weighted judder index: the mean of the absolute difference between the content step and the on-screen hold, per frame |
| Rate mismatch | Guest present count against on-screen count | Frames merged or repeated |
| Game speed | Section 1.4 tests | Ratio of game time to real time; target 1.00 ± 0.01 |
| Shader events | Ryujinx log, MoltenVK `mslCompile` / `pipelineCompile` | Compile spikes, counted separately for steady state |

The status-bar FPS (an average over a 750 ms window, R09 verification; [E] describes it as about 1 s) and the Metal
HUD cadence are **secondary** and never support a
cadence claim [E] (R05 implication 1).

**G-CAP thresholds per cap** (ADR 0003 gate G-CAP: p99 at most 1.25x the target interval; arithmetic [I]):

| Cap | Target interval | p99 guest frame interval limit |
|---|---|---|
| 30 | 33.3 ms | 41.7 ms |
| 40 | 25.0 ms | 31.3 ms |
| 45 | 22.2 ms | 27.8 ms |
| 48 | 20.8 ms | 26.0 ms |
| 60 | 16.7 ms | 20.8 ms |

### 0.4 Equipment and presence key

| Code | Meaning |
|---|---|
| **Off** | No emulator run: unit tests, offline harness, log or file review. Agents may do it |
| **O-start** | The owner starts the session on an uncontended host; agents only attach recorders by PID and post-process files (R05 §4) |
| **O** | The owner must be present: display settings, physical pad handling, visual judgement |
| **MBP** | Built-in Liquid Retina XDR panel |
| **A95L** | Sony A95L on HDMI 3 or 4, Enhanced signal format, an Ultra High Speed 48 Gbps cable (the owner confirms one is on hand; no purchase is planned) |
| **Pad-USB / Pad-BT** | DualSense on USB cable / on Bluetooth |
| **xctrace** | Command-line Instruments 27.2 (Metal System Trace, Time Profiler); first use may raise an authorisation prompt, so the owner is present once (R05 §4.1) |
| **Capture** | MoltenVK automatic GPU capture and debug dumps; outputs stay in the private local evidence workspace and are never committed (R02 §6) |
| **Instrument** | A colorimeter or spectroradiometer. **Not owned and not purchased.** Rows that need one are optional and fill "measured" fields only (R04 §3.8) |
| **Camera** | The owner's phone in 240 fps slow motion; a coarse optional cadence check (R06 §5) |

### 0.5 Scene and content list

Scenes are named by place only. Saves, captures and frame dumps stay in the private local evidence workspace.

| Id | Scene | Load type | Status | Used for |
|---|---|---|---|---|
| S1 | Great Sky Island fixed point | GPU | Measured [E]: vanilla 30, D2 44.8-50.9 | Pacing, scale A/B, HDR cost A/B, archery (gyro), bright sky and clouds |
| S2 | Beneath Hyrule Castle | CPU at 1.2x | Measured [E]: vanilla 30, D2 38.4-45.2 | Pacing, CPU bottleneck, dark interior HDR |
| S3 | Room of Awakening | CPU | Measured [E]: Off 20.0, On 29.4-30.8 with flashes, D2 25.8-28.2 | Pacing, G-AB flash test |
| S4 | Lookout Landing and Hateno Village | Mixed | Community: about 40 FPS on a desktop CPU [A] (R05 §4.4) | Survey, FencePool A/B, defog A/B (Lookout Landing in rain, R09) |
| S5 | Temple of Time steps, looking at the woods | Mixed | Community FencePool reference scene [A] | FencePool A/B |
| S6 | Kakariko and Korok Forest | Foliage, NPCs | Community [A, unverified] | Survey, gradients in foliage |
| S7 | The Depths, including a Lightroot reveal | Dark, bloom | Community [A, unverified] | Survey, near-black, blooming, highlight recovery |
| S8 | Large Zonai builds | Physics, CPU | Expected [I] | Long-session physics (G6-4) |
| S9 | Rain and storms | Particles, GPU | Expected [I] | Survey, banding, defog |
| S10 | Sky-dive streaming transition | Shader and JIT first visit | Expected [I] | Cold-cache and concurrent-compilation tests |
| M1 | A pre-rendered movie (for example the intro) | Video decode | Movie speed risk [D]/[I] (R06 §1) | G6-3, movie speed, video at paper white |
| M2 | A real-time cutscene | Game time | Unvalidated under D2 [E] | Lip-sync and event timing |
| M3 | Pause menu, inventory, map, D-pad quick menu | UI | Pause menu ran at 60.0 with D2 [M] (R06 §1) | UI white, translucent UI, quick-menu fade |
| M4 | Camera, photo mode and album | Readback | Unknown U8 (R02) | RT upgrade readback |

---

## 1. Performance, caps and VRR

### 1.1 Measurement foundation

These tests make every later number trustworthy. None of them is a performance claim on its own.

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| PERF-01 | PF-8, AR-2 | Telemetry ring (G-TEL): run S1 under RP with telemetry on; export the 512-entry ring to CSV | Every frame records guest present, guest vsync tick, host submit, `actualPresentTime` (or 0), cap, panel refresh, present mode, D2 step and cache state; p50/p95/p99 computable (ADR 0003 §3.1, G-TEL) | O-start, MBP | P0 |
| PERF-02 | PF-8 | Log `vkEnumerateDeviceExtensionProperties` at startup on MoltenVK `1.4.2-ryujinx.5` | `VK_GOOGLE_display_timing` is listed and `actualPresentTime` is non-zero for presented frames. If not: fall back to MoltenVK averages and make **no cadence claim** (G-TEL failure path, ADR 0001) | Off (log read after an O-start boot) | P0 |
| PERF-03 | PF-8 | Cross-check: compare ring-derived guest FPS with the status-bar average over the same windows on S1 and S3 | Agreement within the status bar's display precision; a disagreement is explained before any claim [I] | O-start, MBP | P0 |
| PERF-04 | PF-6 | Telemetry overhead: S1 C2 with the ring on and off, same build | No change in guest p50 or p99 beyond run-to-run spread of the three repeats [I] | O-start, MBP | P0 |
| PERF-05 | PF-8, PF-6 | Baselines: S1, S2, S3 in C0, C1 and C2, Hypervisor Off, 1.2x, vanilla 30 cap, RP | All three states recorded per scene, three repeats each; C0 boot time and shader count logged (expected about 85-88 s, about 1,017 shaders [E]) | O-start, MBP | P0 |
| PERF-06 | PF-6, PF-3 | G-AB flash test: Hypervisor On + A+B, at least 900 s in S3 and 900 s on S1, warm; count flashes and other new artefacts from window captures (`screencapture -l` works on a covered window [E]) | One-sided Poisson test against 0.012 flashes/s (ADR 0001 G-AB). At 900 s the expected count is 10.8, so 5 or fewer flashes per scene rejects the old rate at α = 0.05 [I, arithmetic]. **Proposed default rule:** A+B becomes the default CPU profile only with 0 flashes per scene, matching Hypervisor Off's 0 in 3,654 s [E]; the owner confirms the rule before the run [I]. Fail: Hypervisor Off at 1.2x stays default | O (attended 2-4 h, R05), MBP | P0 |
| PERF-07 | PF-6 | Bottleneck classification (R05 §4.2): attach Metal System Trace and Time Profiler by PID for 30 s in each of S1-S3, C2; read IORegistry GPU counters | Each scene is labelled guest CPU, GPU, synchronisation, shader compile, JIT warm-up or presentation, **with its confirming test** (Hypervisor On/Off changes FPS but scale does not → CPU; FPS follows scale → GPU). The same traces also record the **G-METAL inputs**: render-thread CPU time inside the translation layer, and GPU time from translation artefacts (render-pass splits from the IORegistry `SplitSceneCount` counter, compute-emulated geometry or transform feedback) [I] (R05 §4-5) | O-start, xctrace (owner present on first use), MBP | P0 |
| PERF-08 | PF-6 | GPU time with encoder timing (`MTL_HUD_ENCODER_TIMING_ENABLED=1`) on S1, compared only with other HUD runs | The island GPU cost (about 21 ms per frame, an upper bound [M]/[I]) is confirmed or revised; record "HUD run" in the run record | O-start, MBP | P2 |
| PERF-09 | PF-9, PF-1 | Scale A/B on S1, C2: 1.0x against 1.2x, D2 on, same cap; log the dynamic-resolution render size per frame (R05 unknowns) | Both results recorded with p50/p99 and the measured render size. **Informational**: 1.2x is the "about 1080p" setting, so 1.0x is an owner trade-off (ADR 0001 D2.2.3) | O-start, MBP | P2 |
| PERF-10 | PF-6, PF-7 | Concurrent compilation: `MVK_CONFIG_SHOULD_MAXIMIZE_CONCURRENT_COMPILATION=1` against the default, C0 and C1, on S10 and a first visit to S1 | Fewer or shorter shader-compile spikes in C0/C1, no new artefacts, and no C2 regression [I] | O-start, MBP | P2 |
| PERF-11 | PF-7 | FencePool !195 A/B in S5 and S4, C2 | Adopt only if p99 improves by more than run-to-run spread with 0 new artefacts; report results to the PR author either way (ADR 0001 D10.8). A small gain is expected [I] (R05 §1.4) | O-start, MBP | P2 |
| PERF-12 | PF-7 | Optional MoltenVK `1.4.3-ryujinx.2` A/B, only after CAP-15 (G6-6) | No loss of direct-to-display state and no p99 regression on S1-S3; otherwise stay on `1.4.2-ryujinx.5` (ADR 0001 D2.2.6) | O-start, MBP, A95L | P2 |
| PERF-13 | PF-8, PF-1 | Community heavy-scene survey: S4-S10 in C2 at 30 and at the best offered cap | Each scene gets p50/p99, a bottleneck class and a G-60 verdict (section 1.2); results set where 60 may lose "experimental" | O-start, MBP | P2 |
| PERF-14 | PF-7 | G-KK: KosmicKrisp variant (driver from source or owner-approved binary); warm C2 on S1-S3 | ADR 0001 G-KK: 0 new artefacts in 900 s; p95 at least 10% better in a GPU-bound scene; RGBA16F + `EXTENDED_SRGB_LINEAR` EDR verified on both displays (PIPE-04); pacing parity with MoltenVK | O-start, MBP, A95L | P5 |
| PERF-15 | PF-7 | G-METAL review, only if asked: R05 §5 condition check in at least three heavy scenes under both backends | Both conditions hold: (a) more than 25% of the render-thread critical path, or more than 20% of GPU time, from translation; (b) CPU not the limit. Otherwise native Metal stays rejected (ADR 0001) | O-start, xctrace | P5 |

### 1.2 Cap policy and per-cap health

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| CAP-01 | PF-2, PF-4 | Without the D2 title-pack entry, open the cap menu on every display | Only "30 (native)" is offered (ADR 0003 §1) | O-start | P2 |
| CAP-02 | PF-4 | With D2 loaded, try Unbounded, turbo and Custom above 60 through the menu, the config file and the old VSync hotkey | All are refused; the hotkey selects caps directly and never passes through Unbounded (ADR 0003 §1) | Off (unit test) + O-start | P2 |
| CAP-03 | PF-2, AR-1 | Load a D2 file with a wrong SHA-256 in `luma.json` | Refused; only "30 (native)" offered ([05 §12](05-rollback-and-reproducibility.md) drill step 8) | Off | P2 |
| CAP-04 | PF-1, PF-2, PF-3 | **G-CAP** per offered cap and display (table 1.3): RP in S1-S3, C2, D2 on | ADR 0003 G-CAP: p99 guest frame interval at most 1.25x target (table 0.3); game speed 1.00 ± 0.01; no shader-compile spike in steady state; cadence error rate **published**. Fail: the cap shows a warning or is withdrawn | O-start, per display | P2 |
| CAP-05 | PF-1 | **G-60** per scene class: guest frame time under D2 at the 60 cap | Guest frame time 20 ms or less with CPU and GPU headroom (R05 §5). Pass: 60 loses the "experimental" label for that scene class only | O-start, MBP | P2 |
| CAP-06 | PF-2 | 45 advice rule: guest frame cost per scene from PERF-13 | 45 is recommended only where measured cost is 22 ms per frame or less (R05 implication 3, kept as advice in ADR 0003 §2) | Off (analysis) | P2 |
| CAP-07 | PF-3, UX-2 | Cadence-fit label: for every row of table 1.3, read the dashboard label | Label is "even", "uneven" or "VRR" exactly as table 1.3 says; for 45 without verified VRR, a warning plus a suggested 40 or 48 (or 30 on 60 Hz) appears; 45 is called smooth only with verified VRR | O-start, each display | P2 |

### 1.3 Cap x display x expected cadence

Hold patterns are in panel refreshes, or in milliseconds on ProMotion (R06 §4, arithmetic verified). "Offered" follows
ADR 0003 §2. Every offered cell must pass CAP-04; the cadence error rate is measured against the pattern in this table.

| Display and mode | 30 | 40 | 45 | 48 | 60 | Gate for the row |
|---|---|---|---|---|---|---|
| MBP, ProMotion fullscreen | Offered; 33.3 ms even | Offered; 25.0 ms even | Selectable with warning; 20.8 / 20.8 / 25.0 ms at best; 40 or 48 suggested | Offered; 20.8 ms even | Offered, experimental; 16.7 ms even | G6-5, G6-7, G6-10 |
| MBP, fixed 60 Hz | Offered; 2 (even) | Not offered (2,1) | Selectable with warning; 2,1,1; 30 suggested | Not offered | Offered, experimental; 1 (even) | G6-5 |
| MBP, fixed 120 Hz (only if G6-8 shows it exists) | 4 (even) | 3 (even) | Warning; 3,3,2 | Not offered (3,2) | Experimental; 2 (even) | G6-8 adds the row; menu as A95L fixed 120 [I] |
| MBP, fixed 48 Hz | Not offered | Not offered | Not offered (uneven) | Offered; 1 (even) | Not offered | - |
| A95L, fixed 60 Hz | Offered; 2 (even) | Not offered | Selectable with warning; 2,1,1; 30 suggested | Not offered | Offered, experimental; 1 (even) | G6-2 |
| A95L, fixed 120 Hz | Offered; 4 (even) | Offered; 3 (even) | Selectable with warning; 3,3,2 (16.7 / 25 ms); 40 suggested | Not offered | Offered, experimental; 2 (even) | G6-2 |
| A95L, verified HDMI VRR | Offered; host LFC, each frame shown twice (60 Hz) | Not listed | Offered; host LFC, each frame shown twice (90 Hz); "VRR" | Not listed | Offered, experimental; native 60 Hz inside the reported VRR range (48-120 Hz in one source, below 20 Hz with LFC in another; sources conflict [A]). The LFC holds assume a 48 Hz floor and are re-derived from G6-1 | **G6-1** |
| Any display, windowed | As that panel's fixed rate | As fixed rate | As fixed rate | As fixed rate | As fixed rate | VRR needs fullscreen [D] (R06 §3) |

### 1.3a VRR support per display and connection

VRR depends on the link as much as on the display. Each row is one way the owner can connect. "Fallback" is the
refresh-compatible menu used when VRR is absent or unverified; its caps are the even divisors in table 1.3. No row
needs a purchase: untested rows stay untested.

| Display | Connection | Ceiling relevant here | VRR status today | Gate | Refresh-compatible fallback |
|---|---|---|---|---|---|
| Built-in XDR | Internal panel, fullscreen | ProMotion 8.33-41.67 ms in 4.17 ms steps [M] | Adaptive refresh is native [D]/[M]; cadence on the macOS 27 beta is in question [A] (R06 §3) | G6-5, G6-7, G6-10 | Fixed 60 Hz (30, 60) or fixed 48 Hz (48); fixed 120 Hz only if G6-8 finds it |
| Built-in XDR | Internal panel, windowed | The panel rate | Not available: VRR needs fullscreen [D] (R06 §3) | - | As that fixed rate |
| A95L | Mac HDMI port, direct cable, TV HDMI 3 or 4, "Enhanced Format (4K120)", 48 Gbps cable | 4K120 [D]/[A] (R03 §6, R04 §2) | **Unverified.** Apple's pages conflict; the TV's range is reported as 48-120 Hz or as below 20 Hz with LFC, and the sources conflict [A] (R04, R06 verification) | G6-1, G6-2 | Fixed 120 Hz (30, 40, 60; 45 with a warning) |
| A95L | Same port with plain "Enhanced" | HDMI 2.0 bandwidth [A] (R04 §2); 4K120 not expected [I] | Unverified; the TV reportedly still allows VRR in this format [A] | G6-1 (record the format), G6-2 | Fixed 60 Hz (30, 60) |
| A95L | TV HDMI 1 or 2 | HDMI 2.0 inputs; no 4K120 or VRR on them [D]/[A] (R04 §2) | Not available | - | Fixed 60 Hz (30, 60); not recommended for play |
| A95L | Through a USB-C or Thunderbolt to HDMI adapter or dock | Apple: "Adapters aren't supported for these resolutions and refresh rates" [D] (R03 §6) | Treated as not available; Apple's Adaptive Sync page also says not to use an HDMI cable or adapter [D] (R06 §3) | Not tested (no purchase) | The fixed rate of whatever mode the link gives |
| Owner's DisplayPort monitor | Thunderbolt or USB-C DisplayPort cable | Per monitor | Apple-documented Adaptive Sync path [D] (R06 §3); a control case, not a play target | G6-9 (optional) | n/a |

Every pacing result and every display profile records which row it ran on: display, port, signal format, cable, and
whether an adapter was in the path (CAP-20, CAL-10).

### 1.4 Pacing mechanisms and display facts

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| CAP-08 | PF-3 | Display-locked guest vsync against the free-running timer: S1, 40 and 60 caps, C2, MBP ProMotion and A95L fixed 120 | Cadence error rate lower with the display link. If not, keep the timer and drop the patch (ADR 0003 kill criterion) | O-start, MBP, A95L | P2 |
| CAP-09 | PF-3 | Timed presents: pass a desired present time through `VK_GOOGLE_display_timing`; compare desired against `actualPresentTime` | **G-PRES-3**: ADR 0003 pacing targets met (CAP-04 holds with fewer missed vsyncs than plain FIFO [I]). Fail is recorded under G-PRES-3; only then is the native presenter considered | O-start, MBP, A95L | P2 |
| CAP-10 | PF-5 | **G6-1** HDMI VRR: A95L on HDMI 3 or 4, Enhanced format, 48 Gbps cable; check macOS Displays settings for a variable option and the TV's signal information | macOS offers VRR and the TV shows VRR active. Pass: the VRR row of table 1.3 and host LFC are enabled. Fail: fixed-120 policy (ADR 0003). The macOS build is recorded | O, A95L | P1 |
| CAP-11 | PF-5 | Host LFC on VRR (only after CAP-10 passes): 30 and 45 caps on S1 | Display intervals show each frame presented twice (16.7 ms and 11.1 ms holds); TV stays in VRR without flicker or blanking; CAP-04 holds | O, A95L | P2 |
| CAP-12 | PF-5 | **G6-2** read-only mode list for the A95L (CGDisplayMode query): 100 Hz? 4K120 HDR? HiDPI HDR limit | Modes recorded. Sets the A95L default mode. Checks the reported limit of about 2432x1368 HiDPI for HDR at 120 Hz [A] (R06 §4) together with PIPE-16 | O, A95L | P1 |
| CAP-13 | PF-5, PF-3 | **G6-5 / G6-7** ProMotion cadence: 40 and 45 on ProMotion against fixed 60, same scene; compare jitter with the macOS 27 beta report (4.09 ms against 0.39 ms stdev) [A] | Cadence error rate and jitter recorded per mode on the owner's build. If the beta issue is present, the ProMotion menu is reduced to rows that pass CAP-04 | O-start, MBP | P2 |
| CAP-14 | PF-3 | **G6-10** `CAMetalDisplayLink` with a 40-45 Hz preferred range on the built-in panel | The range is honoured or not; the result chooses the vsync source for CAP-08 | O (the probe opens a window), MBP | P2 |
| CAP-15 | PF-3, UX-1 | **G6-6 / G-PRES-2** direct-to-display: Instruments display track in fullscreen with `1.4.2-ryujinx.5`, dashboard hidden and shown | State recorded for both. If composited, the latency cost is measured before any native presenter is considered (ADR 0002). Dashboard shows "unknown" until this passes | O-start, xctrace, MBP, A95L | P1 |
| CAP-16 | PF-5 | **G6-8** fixed 120 Hz on the built-in panel: owner reads Displays settings | Recorded; if present, the MBP fixed-120 row of table 1.3 is enabled | O, MBP | P2 |
| CAP-17 | PF-5 | **G6-9** (optional) DisplayPort Adaptive-Sync control case on an owner-owned DisplayPort monitor | Timed presents behave on known-good VRR (CAP-04 at 45 with "VRR" cadence). Optional; skipped without loss | O | P2 |
| CAP-18 | PF-3, UX-1 | Fullscreen and windowed tested separately; `LSSupportsGameMode` present in the play bundle; Game Mode state logged | Both modes have their own CAP-04 results; Game Mode state appears in every run record | O-start | P2 |
| CAP-19 | PF-8 | Optional camera cross-check: 240 fps slow-motion video of a moving reference at the 40 cap on fixed 120 | Repeated-frame pattern agrees with the telemetry hold pattern. Coarse; never overrides telemetry [I] | O, Camera | P2 |
| CAP-20 | PF-5 | Connection record: before each display session the owner notes the TV port, signal format, cable and any adapter; the Mac side reads the display mode read-only | Every run record and display profile names its row in table 1.3a; a run on an unlisted connection is excluded from VRR and cadence claims [I] | O, A95L | P1 |

### 1.5 Game speed and correctness

All rows run under D2 at every offered cap (30, 40, 45, 48, 60) unless stated, against a vanilla 30 reference on the
same save. Prior evidence: walk-test alignment 0.995-1.005 at 30 and about 48 FPS; audio, movies, long-session
physics, judder and percentiles not validated [E].

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| SPD-01 | PF-4 | Walk test: fixed real-time span, same start point, compare end position against the 30 FPS reference | Alignment scale 1.00 ± 0.01 (ADR 0003 G-CAP speed criterion) | O-start, MBP | P2 |
| SPD-02 | PF-4 | In-game clock against a stopwatch over several in-game hours (1 in-game minute ≈ 1 real second) | Ratio 1.00 ± 0.01 (R06 §5) | O-start | P2 |
| SPD-03 | PF-4 | Sprint to exhaustion: time from full stamina to empty | Within ± 1% of the 30 FPS reference [I] | O | P2 |
| SPD-04 | PF-4 | Timed animation from `actualPresentTime`-stamped frames: open a chest or door, or measure footstep spacing | Duration within ± 1% of the 30 FPS reference [I] | O-start | P2 |
| SPD-05 | PF-4 | Audio drift: record the output and compare beat-to-beat intervals of a looped track against the baseline | No cumulative drift against the baseline [I]. Needs an audio loopback route, which is not installed; it is free software and the owner decides on installing it. Without it, an owner listening check is recorded as [A] and audio stays "not objectively validated" | O, loopback (owner decision) | P2 |
| SPD-06 | PF-4 | **G6-3** movie path: log emulated NVDEC calls during M1 | Pass: automatic 30 during movies is built and M1 plays at 1.0x with audio in sync at every cap. Fail: the movie-speed caveat is documented in the troubleshooting guide (ADR 0003 G6-3) | O-start | P2 |
| SPD-07 | PF-4 | Real-time cutscenes (M2): lip-sync and event timing at each cap | Owner sees no desync against the 30 reference | O | P2 |
| SPD-08 | PF-4 | **G6-4** long session: at least 30 min per cap with Zonai vehicles, ragdolls, water and fast movement (S8) | No physics anomaly (tunnelling, jitter, vehicle or ragdoll fault) that the 30 reference does not show; audio as SPD-05. Caps that fail are withdrawn; if all caps above 30 fail, ship "30 (native)" only (ADR 0003 kill criteria) | O, ≥ 30 min per cap | P2 |
| SPD-09 | PF-4 | Save compatibility: write under D2 at each cap, load in the `reference` variant without D2, and the reverse | Both load with no visible loss. Prior: a D2 save loaded without D2 [M] (R06 §1). Saves always come from the manifest-checked backup | O-start | P2 |
| SPD-10 | PF-4 | D-pad quick-menu fade at each cap (M3), a known per-frame UI assumption that D2 fixes [M] (R06 §1) | Fade completes at its normal speed | O | P2 |

---

## 2. True HDR pipeline and display calibration

Order of work (ADR 0002): output stage in SDR identity (G-HDR-0), one attended capture session (G-HDR-1), then P3.
Profiles are `macbook-xdr` and `a95l` (ADR 0001 D10.3).

### 2.1 Stage-by-stage checks

The stage numbers follow R02 §3's precision-loss map: 1-2 lighting and bloom (float), 3 tonemap (clips and quantises
today), 4 post-tonemap sharpen/scale, 5 UI composite, 6-8 Ryubing present path, 9 MoltenVK layer, 10 compositor and
panel.

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| PIPE-01 | HD-1, HD-2 | Offline CPU reference of the maths: vanilla `1 - e^-x` curve, replacement curve with pivot and roll-off, inverse curve for Expanded SDR, and the BT.2390/2408 EETF, on synthetic ramps | Below the pivot the replacement equals the vanilla curve; above it the curve is monotonic and reaches the profile peak with no `saturate()`; at headroom 1.0 the EETF leaves mid-tones unchanged (R04 implication 5) | Off | P1 |
| PIPE-02 | HD-2 | Offscreen harness (no window): render colour patches through the output-stage shader into RGBA16F, read back, compare with expected EDR values | Every patch matches its expected value to half-float precision [I] (R02 §6) | Off | P1 |
| PIPE-03 | HD-2, HD-5 | Startup and swapchain log: format and colour-space pair, `vkSetHdrMetadataEXT` calls, `EDRMetadata` | `R16G16B16A16_SFLOAT` + `EXTENDED_SRGB_LINEAR_EXT` logged; `vkSetHdrMetadataEXT` never called; `EDRMetadata` nil; passthrough colour space refused in every HDR profile (ADR 0002 D4.3) | O-start (log read Off) | P1 |
| PIPE-04 | HD-2, HD-3 | **G-PRES-1** layer state after create and every recreate: resize, fullscreen toggle, move between MBP and A95L, sleep and wake | Layer reports `EXTENDED_SRGB_LINEAR`, EDR on, `toneMapMode = never`, correct `contentsScale`; a ramp card on the XDR panel shows no system tone mapping. Fail: candidate trigger for the native presenter (G-NATIVE) | O, MBP, A95L | P1 |
| PIPE-05 | HD-2, AR-1 | **G-HDR-0** SDR identity: output stage in sRGB / no-EDR mode against a stock capture of the same frame (window capture) | Within ± 1 code value per channel. Fail: do not proceed to EDR | O-start, MBP | P1 |
| PIPE-06 | HD-1 | **G-HDR-1** capture session: one scheduled run with MoltenVK GPU capture and a debug build logging guest hash, guest and host formats and sizes around the tonemap | Records U1 pre-tonemap formats, U2 sRGB view or shader gamma, U3 guest hashes (bloom, tonemap, post-tonemap), U4 target sizes at 1x and 1.2x, U5 exposure location, U8 cutscene and photo-mode paths, and the post-tonemap pass identity (CAS per R01, EASU per R02). All kept private. Without it P3 does not start | O, Capture | P1 |
| PIPE-07 | HD-1, HD-2 | Float captures before and after the replaced tonemap (raw half-float or EXR dumps, private) on S1 (sun, clouds) and S7 (Lightroot) | Pre-tonemap targets hold values above 1.0 where the scene is bright; the replaced output keeps them above paper white up to the profile peak; below the pivot it matches the vanilla result within ± 1 code value after SDR encode [I] | O, Capture | P3 |
| PIPE-08 | HD-2 | **G-HDR-2** coverage: debug hash log counts every host specialisation variant of each replaced guest shader over S1-S10 and M1-M4; toggle the scene-HDR flag and confirm the cache is re-keyed | 0 frames rendered by a vanilla variant; flag state is part of the cache key | O-start, Capture | P3 |
| PIPE-09 | HD-2 | RT upgrade verification: debug log of guest and host formats for every allow-listed target, and a scan for any other upgraded target | Allow-listed targets are host RGBA16F with guest format and layout unchanged; no target outside the exact allow-list is upgraded (ADR 0002 D3.3) | O-start, Capture | P3 |
| PIPE-10 | HD-2 | Readback of upgraded targets: take photos, open the album (M4) | Half-float converts back to RGBA8; saved photos look like the SDR reference | O | P3 |
| PIPE-11 | HD-2 | Post-tonemap HDR-safe sharpen/scale: compare against vanilla at 1.2x with dynamic resolution on S1 and S6 | Encode, filter, decode is used, never a point fetch; sharpness matches vanilla in the owner's view; no new ringing around highlights [I] | O | P3 |
| PIPE-12 | HD-3, HD-2 | UI boundary model, after U2 is resolved: HUD, menus (M3) and translucent plates over S1 sky | UI at UI white; translucent UI matches its SDR appearance; guest-hash exceptions glow as intended; M1 video at paper white | O, MBP, A95L | P3 |
| PIPE-13 | HD-2, AR-1 | **G-HDR-3** stability and cost: warm 900 s per scene (S1, S2, S3) with scene HDR on; island cost A/B with the output stage and RT upgrade each on and off | 0 new artefacts per scene; costs recorded. Fail: kill switch to SDR and narrow the allow-list | O-start, MBP | P3 |
| PIPE-14 | HD-2, UX-3 | Source-clip counter: count guest pixels at code 254-255 in the SDR path and in the scene-HDR path on S1 and S7 | In scene HDR, highlights the SDR path clipped now carry graded values above paper white; the counter confirms recovered, not invented, detail (part of G-HDR-4) | O-start | P3 |
| PIPE-15 | HD-3 | Headroom readings (G-DISP): current, potential and reference from the notification plus a per-frame read; brightness slider steps; HDR Video reference preset; on battery; sleep and wake | Values recorded per display. Reference values: potential 16.0, current 2.67, reference 0.0 on the built-in panel [M] (R03 §1.6). "stale?" appears when headroom stays at 1.0 with EDR content on screen | O, MBP, A95L | P1 |
| PIPE-16 | HD-3 | HDMI format at 4K120 HDR: IORegistry colour modes plus the TV's signal information | Encoding and bit depth recorded (RGB 10-bit or 4:2:2); the A95L default mode is chosen with CAP-12 | O, A95L | P1 |
| PIPE-17 | DV-1 | **G-DV-EDID** read-only EDID VSVDB decode with `edid-decode`; confirm the Mac input is never set to a DV signal format | VSVDB type and version recorded for documentation only; the TV reports HDR10 in Game mode; if the TV ever reports Dolby Vision, the dashboard flags it as unexpected (ADR 0005) | O, A95L (about 0.5 h) | P1 |
| PIPE-18 | DV-1 | **G-DV-WATCH**: grep the SDK headers for `DolbyVision`, `InfoFrame` or an HDMI HDR-mode API and re-read Dolby's eligibility wording | Result recorded; nothing changes unless all three reopening conditions of ADR 0005 hold | Off (about 1 h per major release) | Each major macOS release |
| PIPE-19 | HD-5 | Dependency check of the HDR path | No ReShade, MacShade or Windows add-on code is required for any tier; TOTK shaders and hashes load only from the title pack; no GPL code in the fork (ADR 0002) | Off (review) | P3 |
| PIPE-20 | HD-4, PF-3 | Presentation latency A/B per display, in P1: stock present path, output stage in SDR identity, output stage with EDR on; host submit to `actualPresentTime` median and p99, and images queued, on MBP and A95L, C2 on S1 | No extra queued frame against stock (NFR-LAT-01); median within one refresh of stock [I]; results kept per display. TV-internal processing latency needs equipment the project does not have, so it is quoted only from third-party data (HDR10 Game mode 8-17 ms class [M-third-party], R08 §2) and the TV stays in Game mode | O-start, MBP, A95L | P1 |

### 2.2 Tier comparisons

Three tiers are compared on each display: **SDR** (stock, all flags off), **Expanded SDR** (the inverse-tonemap
fallback, R02 §4D) and **Scene HDR** (P3). All comparisons use the **same paper white** for every tier, so mid-tones
match and a brighter image cannot win by brightness alone (HD-4). The dashboard source-mode label must read "SDR",
"Expanded SDR" or "Scene HDR" in each capture.

| Test id | Req. | Criterion | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|---|
| CMP-01 | HD-4, HD-2 | Highlight detail | Same save, time, weather and framing on S1 (sun, clouds) and S7 (Lightroot); A/B on both displays | **G-HDR-4**: the owner sees recovered highlight detail in Scene HDR against SDR, judged on detail, not brightness; PIPE-14 agrees. Expanded SDR is expected **not** to recover clipped detail and is labelled so | O, MBP, A95L | P3 |
| CMP-02 | HD-4 | Gradients and banding | Sky gradients on S1, fog on S9, near-black on S7; the stage's own near-black PQ ramp | No new banding against SDR in Scene HDR; Expanded SDR posterisation near white recorded (R02 §4D); G-LOOK-2 rules apply when looks are on | O | P3 |
| CMP-03 | HD-4 | Colour accuracy | Primary ramps and paper-white swatch from the output stage; skin, foliage (S6) and sky with vivid off | With vivid off, no out-of-P3 pixels on the gamut counter and no hue shift near peak in the owner's view; colours match SDR at and below paper white [I] | O | P3 |
| CMP-04 | HD-4, PF-3 | Latency | Host submit to `actualPresentTime`, median and p99, per tier and per display (MBP in EDR, A95L in HDR10), against the P1 figures from PIPE-20; direct-to-display state from CAP-15 | Scene HDR adds no more than one refresh of median latency over SDR [I]; any change of direct-to-display state is recorded | O-start, xctrace | P3 |
| CMP-05 | HD-4, PF-1 | Performance cost | GPU timestamps of the output stage and the RT upgrade; S1 C2 A/B per tier | Every cap that passed CAP-04 in SDR still passes in Scene HDR, or the cost is shown to the owner with the cap withdrawn in HDR [I] | O-start | P3 |
| CMP-06 | HD-2, UX-3 | Honest labelling | Read the source-mode label in every tier and after fallback | Expanded SDR is never labelled HDR; if P3 fails its gates, Scene HDR is recorded as "not achieved" (ADR 0002 kill criterion) | Off (review of captures) | P3 |

### 2.3 Calibration per profile

Calibration patterns are drawn by the output stage itself (HGIG 10% and full-field, near-black PQ ramp, paper-white
swatch, blooming box, primary ramps), so they exercise the real swapchain path (ADR 0002 D9.3). Every session starts
with about 30 minutes of warm-up and records date, macOS build, TV firmware and picture mode (R04 implications 7-8).
Results are stored in renderer units; no instrument is needed (R04 §3.2).

| Test id | Req. | What is calibrated | `macbook-xdr` procedure and pass | `a95l` procedure and pass | Equipment / owner | Phase |
|---|---|---|---|---|---|---|
| CAL-01 | HD-3 | Paper white | EDR 1.0 matched against a macOS UI white swatch at the recorded brightness. Pass: owner sees a match | 203 nits on the panel through N (EDR = 203 / N). N found by visual match against a 203-nit reference or, if an instrument is ever available, a spot read. Pass: N stored with its method | O, MBP, A95L (Instrument optional) | P1 |
| CAL-02 | HD-3 | Peak clip (MaxTML, 10% window) | HGIG 10% checker at the recorded brightness and headroom. Pass: clip point stored in EDR; peak target = min(live headroom, MaxTML) | TV HDR Tone Mapping Off. Start at 1,000 nits; labs report 1,150-1,375 [D]/[A]. Pass: clip point stored | O | P1 |
| CAL-03 | HD-3 | Full-field limit (MaxFFTML) | Not applicable | Full-field checker; start at 250 (labs 235-255). Pass: stored | O, A95L | P1 |
| CAL-04 | HD-3 | Black and near-black (MinTML) | Full-black field reads as black; blooming box and HUD-on-black viewed in a dark scene (S7). Pass: blooming severity recorded; it cannot be calibrated away (R04 §3.3) | Near-black PQ ramp in 0.05-nit steps, 0-1 nit. Pass: first visible step recorded; MinTML 0 expected | O | P1 |
| CAL-05 | HD-3 | Roll-off | EETF knee follows live headroom; no system tone mapping (PIPE-04). Pass: smooth ramp to the clip point, no hard edge | Renderer EETF with TV tone mapping Off; then A/B Off against Gradation preferred. Pass: one roll-off only; owner records the preferred setting | O | P1 |
| CAL-06 | HD-3, HD-6 | Gamut | Primary ramps with vivid off: BT.709 primaries map correctly into the P3 panel. Pass: no clipping on the ramps | Same, inside the BT.2020 container; TV Live Color off. Pass: no clipping; vivid capped at P3 | O | P1 |
| CAL-07 | HD-3, UX-1 | SDR-safe UI | `ui_white` = paper white × 0.85 (0.6-1.0), so EDR 1.0 or less; plates at least 85% opaque; game clamped to UI white under plates; graph colours SDR. Pass: UI readable over S1 sky and not brighter than macOS UI white | Same rules; UI at 203 nits or less. Pass: same; auto-dim after a few seconds on the OLED | O | P1 |
| CAL-08 | HD-3 | Headroom changes | Step the brightness slider during play; switch to the HDR Video reference preset; unplug power. Pass: peak target follows headroom, smoothed over about 0.5-1 s (R04 §3.7), no visible jump; at headroom 1.0 mid-tones are unchanged | Sleep and wake the TV and the Mac. Pass: headroom re-read; "stale?" flag shown when appropriate (R09 §3) | O | P1 |
| CAL-09 | HD-3 | Display move | Move the window from MBP to A95L and back. Pass: the matching profile loads, layer state survives (PIPE-04) | Same | O, MBP, A95L | P1 |
| CAL-10 | HD-3, UX-4 | Profile storage | Profile saved with brightness, headroom, macOS build and date. Pass: reloads identically | Saved with N, firmware, picture mode, HDMI port and format. Pass: reloads identically | Off | P1 |

### 2.4 Computed versus measured labelling

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| LBL-01 | UX-3 | Audit every dashboard number on both displays, in every tier | Each number is tagged **signal** (computed from pixels sent), **profile** (target setting) or **measured** (instrument entry). Signal and measured values never share a field (ADR 0002 D9.7) | Off (review of dashboard captures) | P4 |
| LBL-02 | UX-3 | Mac nits display | Mac nits appear only as "assumed N nits at EDR 1.0"; the SDR-white estimate (≈ 1600 / live headroom) is marked computed (R04 §3.7) | Off | P4 |
| LBL-03 | UX-3 | Measured fields with no instrument | Every measured field shows "not measured", never a default | Off | P4 |
| LBL-04 | UX-3 | Measured fields when the owner enters a reading | The reading is stored and shown with instrument, correction file, window size and date (R04 §5) | O, Instrument (optional) | P4 |
| LBL-05 | UX-3, HD-4 | Scene histogram axis | Scene-referred values are shown in EV, never in nits; output histogram and waveform use a PQ axis with nit ticks (R09 §3) | Off | P4 |
| LBL-06 | UX-3, HD-6 | Looks stage label | Before P3 the looks show "approximate"; the active looks stage is always visible (ADR 0006) | Off | P1, P4 |
| LBL-07 | UX-2 | Direct-to-display field | Shows "unknown" until CAP-15 verified it for the current display and mode | Off | P1 |

### 2.5 Dashboard and looks

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| DSH-01 | UX-2, AR-1 | **G-UI-0**: ImGui binding and native library pinned and hash-recorded; rebuild on osx-arm64 | Hashes reproduce; otherwise the custom immediate-mode renderer is chosen (4-8 days [I]) | Off | P1 |
| DSH-02 | UX-2, PF-3 | **G-UI-1**: GPU timestamps around the dashboard, scopes and looks, shown and hidden, on S1 | Cost measured (estimate 0.05-0.2 ms, R09); **zero when hidden**. Fail: simplify or sub-sample harder | O-start | P4 |
| DSH-03 | UX-2 | **G-UI-3**: timestamp queries on MoltenVK against an Instruments GPU trace | Timestamps agree with the trace; otherwise the trace is the reference | O-start, xctrace | P1 (proposed in 03; must pass before P4 entry) |
| DSH-04 | UX-2 | Content check with the dashboard open | Shows guest, present and display frame-time graph; FPS; cap; present mode; panel refresh; cadence fit; direct-to-display; PQ-axis histogram and waveform; clip and gamut counters; headroom (current, potential, reference, stale); source mode; backend; cache state; Player 1 owner (ADR 0002 D9.6, ADR 0004) | O-start | P1 (core), P4 (scopes) |
| DSH-05 | UX-1 | Clean fullscreen default: launch the play bundle on each display | Fullscreen with no dashboard, no extra window and no sibling layer | O-start | P1 |
| DSH-06 | UX-2, UX-4 | **G-UI-2** owner usability pass: run calibration on both displays using only the dashboard and its help text; pick a preset; follow the troubleshooting guide for "HDR looks flat" (low headroom) and "45 judders" | Owner finds the HGIG clip points without an instrument and resolves both troubleshooting cases without outside help | O, MBP, A95L | P4 |
| DSH-07 | UX-2 | Gamepad navigation and OLED auto-dim | All dashboard functions reachable by pad; dashboard dims after a few seconds on the A95L | O | P4 |
| LOOK-01 | HD-6 | Neutral default: looks at strength 0 against looks off | Identical output (PIPE-05 method) [I] | O-start | P4 |
| LOOK-02 | HD-6 | **G-LOOK-1** Serfrost Base v2.4, installed by the owner and checked by checksum; same save, time, weather and framing in a hazy area (S4 in rain); window-capture A/B | Visible defog without regression. Pass: recommended defog. Fail: built-in defog only. Never bundled | O | P4 |
| LOOK-03 | HD-6 | **G-LOOK-2** banding on ramps at each strength; temporal stability of the airlight estimate on S9 | No visible banding and no pumping at any offered strength. Fail: reduce strength or add dithering; a look failing at every strength is removed | O | P4 |
| LOOK-04 | HD-6 | **G-FX** check | reshadefx work starts only after P4 and only if the owner names effects the built-in looks cannot provide | Off (owner decision) | P5 |
| LOOK-05 | HD-6, HD-4 | Vivid evaluation: same save, time, weather and framing (S1 sky, S6 foliage, a character close-up), vivid off against each strength, on both displays | After soft gamut compression the gamut counter shows no output outside P3; no visible hue shift in skin, foliage or sky; no banding (G-LOOK-2); the result is labelled a creative expansion, and "approximate" before P3 (ADR 0006) [I] | O, MBP, A95L | P4 |

---

## 3. DualSense

The v1 path is SDL3 HIDAPI as shipped (SDL `3.5.0-5403934`) plus small tested patches (ADR 0004). USB is the default
bus for every measurement session; Bluetooth is allowed for play.

### 3.1 Feature x bus matrix

Each cell must pass on that bus. "Later" items belong to the P5 feasibility track and do not block v1.

| Feature | USB | Bluetooth | Pass criterion | Test |
|---|---|---|---|---|
| Buttons, sticks, d-pad | v1 | v1 | Every input reaches the mapped Switch input; no stuck or missing input | PAD-02 |
| Analog triggers to ZL/ZR | v1 | v1 | Threshold behaves as configured | PAD-02 |
| Touchpad click | v1 | v1 (enhanced mode) | Reaches its mapping, or the dashboard if chosen as the optional toggle | PAD-05 |
| Touchpad two-finger coordinates | Later | Later | Deferred (ADR 0004 Consequences) | - |
| Gyro and accelerometer (motion aiming) | v1 | v1 | Correct axis signs; aim feels stable at the starting values | PAD-03 |
| Rumble (two amplitudes) | v1 | v1 | Correct sides after the fix | PAD-04 |
| Lightbar and player LEDs | v1 (patch) | v1 (patch, after the connection animation) | Profile colour and player number shown | PAD-06 |
| Battery state | v1 (logged) | v1 (logged) | Shown in the dashboard and run record | PAD-06 |
| Mute (`MISC1`) as dashboard toggle | v1 | v1 | Toggles the dashboard and never reaches the guest | PAD-09 |
| PS button | Documented | Documented | Behaviour recorded; not bound to anything the game needs | PAD-10 |
| Reconnect and bus switch | v1 | v1 | Profile resumes without a dialog | PAD-07 |
| HD Rumble as voice-coil PCM | Later (CoreAudio) | Later (report `0x32`) | Own go/no-go | PAD-13 |
| Adaptive triggers | Later | Later | Own go/no-go | PAD-12 |

### 3.2 DualSense tests

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| PAD-01 | IN-1, IN-2 | **G-INP-1** attended check: launch with the pad on USB, then Bluetooth; compare System Settings > Privacy > Input Monitoring before and after; log SDL driver names and whether `MISC1` and PS reach SDL | No TCC edits made; any prompt is answered by the owner and recorded; driver names and button reachability logged; toggle fallback chosen if `MISC1` is missing | O, Pad-USB, Pad-BT | P0 |
| PAD-02 | IN-1, IN-2 | Input completeness on each bus: press every button, move sticks to the edges, pull triggers; compare the SDL event log with the Switch mapping | Every input maps correctly on both buses; the profile binds both the USB and the Bluetooth id explicitly | O, Pad-USB, Pad-BT | P2 |
| PAD-03 | IN-1 | **G-INP-2** gyro signs: archery on S1, yaw, pitch and roll, on both buses; deadzone 0.5, sensitivity 100, motion on Player 1 only | Aim moves in the expected direction on all axes; no visible drift at rest | O, Pad-USB, Pad-BT | P0 (signs), P2 (tuning) |
| PAD-04 | IN-1 | **G-INP-2** rumble side probe: drive `ApplyRumble` with left-only and right-only values, then play a rumble event in game; unit test that `NpadHdRumble` is skipped for non-Nintendo vendors | Left drives left and right drives right after the fix; no second raw HID handle opened for the DualSense | O (probe), Off (unit test) | P0 (probe), P2 (patch) |
| PAD-05 | IN-1 | Touchpad click on both buses, with the optional dashboard binding off and on | Off: reaches its guest mapping. On: toggles the dashboard and is swallowed from the guest | O | P2 |
| PAD-06 | IN-1 | Unit probes for `CAP_RGB_LED` and `SDL_SetGamepadPlayerIndex`; then visual check on both buses | Lightbar shows the profile colour; player LEDs match the Switch player; battery logged | Off + O | P2 |
| PAD-07 | IN-2 | Reconnects: USB unplug and replug; Bluetooth sleep and wake; switch Bluetooth to USB mid-session; with `ignore_applet` on | Input resumes on the same player with the same profile; no controller-applet dialog and no window activation; a dashboard toast appears instead (ADR 0004) | O, Pad-USB, Pad-BT | P2 |
| PAD-08 | IN-1, IN-2 | **G-INP-2** double-open probe: open the pad twice and query capabilities | Capabilities (rumble, LED, sensors) survive the second open once the property-set patch is in | Off (probe) | P0 |
| PAD-09 | UX-2, IN-1 | Dashboard toggle: `MISC1` removed from the guest mapping; one keyboard key checked as unbound in every keyboard player profile; fallback chord Create + Options for 0.5 s if `MISC1` fails PAD-01 | Toggle works from pad and keyboard; neither fires any guest input; the chord is swallowed while held | O + Off (profile scan) | P4 |
| PAD-10 | IN-4 | **G-INP-5** PS button with Ryubing in the foreground and in the background | Behaviour recorded (Game Overlay, Games or Spotlight may open [D]); the focus-hygiene guidance in the troubleshooting guide matches it | O | P2 |
| PAD-11 | IN-1, PF-3 | **G-INP-4** pump-age histogram: `SDL_GetTicks` at pump against `NpadManager.Update`, on both buses; optionally USB against Bluetooth SDL timestamp deltas | Histogram recorded. The 2-4 ms pump patch is built only if the age is material; the owner decides from the histogram (R07 estimates 0-10 ms added) | O-start, Pad-USB, Pad-BT | P2 |
| PAD-12 | IN-3 | **G-INP-3** (P5 track): can `SDL_SendGamepadEffect` drive adaptive triggers reliably? Effects reset on exit, on ESTOP and after a forced crash | Written go/no-go. Fail reopens the GameController shim (ADR 0001 G-REOPEN-C). TOTK state hooks stay read-only and private | O, owner approval first | P5 |
| PAD-13 | IN-3 | P5 haptics: USB 4-channel audio device visible in CoreAudio (`system_profiler SPAudioDataType`); then PCM from HD Rumble; Bluetooth report `0x32` separately | Each item ends in a written go/no-go with measured latency; a failure does not affect v1 | O, owner approval first | P5 |
| PAD-14 | IN-5 | Bus and pad state in measurement runs | Every measurement run record shows USB, battery, enhanced mode and rumble state (ADR 0004) | Off (run-record check) | P0 onward |

---

## 4. Background control and the agent pad

The agent pad is a virtual gamepad behind the composite driver, controlled through a local Unix socket. It must never
touch keyboard, mouse or focus (ADR 0004). Prior evidence: `Ryujinx.Tests.Input` 42/42, client-server 9/9 (hold
timing, release on SIGKILL, file ESTOP within 53 ms); two short covered-window trials with one window activation
112 ms after a physical owner click; dialogs, the crash reporter and the revised "user clicked" guard path not observed
or replayed [E].

### 4.1 Control and arbitration tests

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| BG-01 | IN-4 | No focus steal: `agent` variant, window fully covered, owner working in another app; agent drives menus, movement and camera for an owner-chosen duration longer than the 2-4 min prior trials | 0 activations of the emulator window that do not follow an owner action; any activation is logged with its timestamp and cause | O, MBP | P2 |
| BG-02 | IN-4 | No global input: list the agent's open sockets and the TCC lists (Accessibility, Input Monitoring) before and after a session | Only the Unix socket in its 0700 folder; no TCP or UDP listener; no new TCC entries; no synthetic keyboard or mouse events | Off (after an O-start session) | P2 |
| BG-03 | IN-4 | Socket safety: connect from another user id; send a command without a deadline; go idle for longer than 5 s; disconnect | Other uid refused; commands bounded to 5 s; pad neutral after 5 s idle and on disconnect [E] | Off (client-server tests) | P0 |
| BG-04 | IN-4 | ESTOP by command and by file while the agent holds inputs | Pad neutral no slower than the 53 ms recorded before [E]; game keeps running; release on SIGKILL of the client | Off (client-server) + O-start | P0 |
| BG-05 | IN-4 | **G-INP-6** owner-wins, live: during an agent session the owner presses a button, moves a stick past its deadzone, and pulls a trigger past threshold, on the same player | Each input latches ESTOP on the first poll that sees it; the virtual pad goes neutral; it stays latched until an explicit resume. Required before any unattended agent session | O, Pad-USB | P2 |
| BG-06 | IN-4 | Owner-wins boundaries: stick inside the deadzone, trigger below threshold, pad merely connected | No ESTOP latch (no false trips) [I] | O | P2 |
| BG-07 | IN-4 | Agent-exclusive mask (opt-in): enable, then trigger ESTOP; enable again, then kill the socket client | The mask drops automatically in both cases; physical input works again | O-start | P2 |
| BG-08 | IN-4 | Rumble isolation: the virtual pad on Player 1 triggers a rumble event while a physical pad is connected | No vibration on the physical pad | O | P2 |
| BG-09 | IN-4, UX-2 | Explicit player assignment: physical and virtual pads both connected; agent session then owner session | No dynamic swap; the dashboard shows which source owns Player 1 | O-start | P2 |
| BG-10 | IN-4 | Handoff: owner clicks the covered emulator window during an agent session (the revised guard path) | ESTOP latches and the game keeps running; the owner can take over by pad; resume only on explicit command | O | P2 |
| BG-11 | IN-4 | Dialogs: Bluetooth dropout with `ignore_applet` off, then on (G-INP-5); a forced recoverable error dialog in a test build | With `ignore_applet` on: toast, no dialog, no activation. Error dialog: behaviour recorded; if it activates the window, ESTOP latches and the `agent-background` profile must suppress or defer it before unattended sessions are approved [I] | O, Pad-BT | P2 |
| BG-12 | IN-4 | Crash reporter: force a crash of the `agent` variant through a test flag while covered | Pad released (SIGKILL path); whether the macOS crash report window takes focus is recorded; if it does, unattended sessions require the physical pad disconnected or a documented mitigation [I] | O | P2 |
| BG-13 | IN-4 | Observation without focus: window capture of the covered window | `screencapture -l` works while covered [E]; nothing depends on Computer Use capture | Off | P2 |
| BG-14 | IN-4, IN-5 | Kill path of ADR 0004: if BG-05 cannot be made reliable | Agent sessions run only with the physical pad disconnected | Owner decision | P2 |

### 4.2 Measurement isolation tests

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| MH-01 | IN-5, PF-8 | Strict comparisons use the `measure` bundle built without the agent patch; check the bundle manifest | No agent code in the measured binary, or the agent pad disconnected and idle and recorded | Off | P0 |
| MH-02 | IN-5 | Agents never launch measured runs: review the run records of a phase | Every measured run was started by the owner; agents only attached recorders by PID | Off | Every phase |
| MH-03 | IN-5, PF-8 | Run-record completeness check before any comparison (section 4.3) | A run missing any field is excluded from comparisons | Off | Every phase |

### 4.3 Uncontended-hardware protocol for measurements

Input isolation does not make a performance run clean (ADR 0004, R07 §6). Every measured run follows this checklist;
each item is written into the run record ([05 §4.3](05-rollback-and-reproducibility.md)).

| # | Before the run | Recorded |
|---|---|---|
| 1 | Launch by hash from the manifest; same build, same config hash, same save slot, same cache state as the comparison run | Manifest hash, `luma.json` and `Config.json` hashes, save backup id, C0/C1/C2 |
| 2 | Agent absent: `measure` bundle without the agent patch, or agent pad disconnected and idle | Agent present or not |
| 3 | DualSense on USB | Bus, battery, enhanced mode, rumble on or off |
| 4 | No other GPU-heavy app; no screen capture except the measuring tool; Metal HUD off (HUD runs are a separate class) | HUD on or off |
| 5 | No build or rebase running (builds compete for CPU, R10 §3.6) | - |
| 6 | Power and thermal: AC or battery, Low Power Mode, `pmset -g therm` before and after; `powermetrics` only with the owner's sudo approval | Power state, thermal state, ambient note |
| 7 | Display: which display, refresh rate, fullscreen or windowed, Game Mode state, HDMI format | Display fields |
| 8 | Network startup noise fixed per run (gamepad database download, Discord integration) | Setting |
| 9 | The owner starts the run; agents attach recorders by PID only and post-process files | Who started it |
| 10 | All traces, captures and telemetry stay in the private local evidence workspace | - |

---

## 5. Rollback and reproducibility

The strategy is in [05-rollback-and-reproducibility.md](05-rollback-and-reproducibility.md). These rows make its
checks part of the acceptance matrix.

| Test id | Req. | Procedure | Pass criterion | Equipment / owner | Phase |
|---|---|---|---|---|---|
| RB-01 | AR-1 | **G-BUILD**: clean rebuild from `build-manifest.json` ([05 §4.4](05-rollback-and-reproducibility.md)) | Executable and dylib hashes reproduce. Until then no measurement is trusted | Off (owner agrees to the build time) | P0 |
| RB-02 | AR-1 | `rebase.sh` replays the `series` file on the base and runs the tests | `Ryujinx.Tests.Memory` and `Ryujinx.Tests.Input` pass (prior: 83/83 and 42/42 [E]) | Off | P0, every sync |
| RB-03 | AR-1 | All flags off (`--luma-off` as proposed in 05 §7) against the `reference` variant | Same behaviour; output identical (PIPE-05 method); no Luma sockets or dashboard | O-start | P0 |
| RB-04 | AR-1 | Restore drill, steps 1-10 of [05 §12](05-rollback-and-reproducibility.md): flag off, master switch, previous bundle, rebuild previous tag, launch refusal, save restore, config damage, title pack checksum, agent stop, full undo | Every step passes once (ADR 0001 rollback drill). Fail: fix the ladder before P1 | O (about half a day [I]) | P0 |
| RB-05 | AR-1 | Variant isolation: launch `reference`, `measure`, `agent`, `hdr` in turn | Each uses its own bundle id and data root; no shared defaults, window state or TCC decisions; saves are copied from a manifest-checked backup, never shared | O-start | P0 |
| RB-06 | AR-1, CN-1 | Public-repository hygiene before each commit to this repository | No absolute home paths, usernames, serial numbers, offsets, patch bytes, guest hashes, dumps or game content ([05 §10](05-rollback-and-reproducibility.md)) | Off | Every phase |
| RB-07 | AR-1 | Play-build entitlements: remove the debug-only entitlements and `disable-executable-page-protection` in a test bundle | Result recorded per entitlement; play builds keep only what is needed (ADR 0001 D10.6) | O-start | P0 |

---

## 6. Gate-to-test index

| Gate | ADR | Tests | Phase |
|---|---|---|---|
| G-BUILD | 0001 | RB-01 | P0 |
| G-TEL | 0001, 0003 | PERF-01, PERF-02 | P0 |
| G-AB | 0001 | PERF-06 | P0 |
| G-KK | 0001 | PERF-14 | P5 |
| G-METAL | 0001 | PERF-15 | P5 |
| Rollback drill | 0001 | RB-04 | P0 |
| G-CAP | 0003 | CAP-04 | P2 |
| G-60 | 0003 | CAP-05 | P2 |
| G6-1 | 0003 | CAP-10, CAP-11 | P1 (session), P2 (LFC) |
| G6-2 | 0003 | CAP-12 | P1 |
| G6-3 | 0003 | SPD-06 | P2 |
| G6-4 | 0003 | SPD-05, SPD-08 | P2 |
| G6-5 / G6-7 | 0003 | CAP-13 | P2 |
| G6-6 | 0003 | CAP-15 | P1 |
| G6-8 | 0003 | CAP-16 | P2 |
| G6-9 | 0003 | CAP-17 (optional) | P2 |
| G6-10 | 0003 | CAP-14 | P2 |
| G-HDR-0 | 0002 | PIPE-05 | P1 |
| G-HDR-1 | 0002 | PIPE-06 | P1 |
| G-HDR-2 | 0002 | PIPE-08 | P3 |
| G-HDR-3 | 0002 | PIPE-13 | P3 |
| G-HDR-4 | 0002 | CMP-01, PIPE-14 | P3 |
| G-PRES-1 | 0002 | PIPE-04 | P1 |
| G-PRES-2 | 0002 | CAP-15 | P1 |
| G-PRES-3 | 0002 | CAP-09 | P2 |
| G-DISP | 0002 | PIPE-15, PIPE-16, CAL-01 | P1 |
| G-UI-0 / 1 / 2 / 3 | 0002 | DSH-01 / DSH-02 / DSH-06 / DSH-03 | P1, P4 |
| G-INP-1 / 2 | 0004 | PAD-01 / PAD-03, PAD-04, PAD-08 | P0 |
| G-INP-3 | 0004 | PAD-12 | P5 |
| G-INP-4 | 0004 | PAD-11 | P2 |
| G-INP-5 | 0004 | PAD-10, BG-11 | P2 |
| G-INP-6 | 0004 | BG-05, BG-10 | P2 |
| G-DV-EDID / G-DV-WATCH | 0005 | PIPE-17 / PIPE-18 | P1 / per release |
| G-LOOK-1 / 2 | 0006 | LOOK-02 / LOOK-03 | P4 |
| G-FX | 0006 | LOOK-04 | P5 |

---

## 7. Requirement coverage

| Key | Tests |
|---|---|
| PF-1 | PERF-09, PERF-13, CAP-04, CAP-05, CMP-05 |
| PF-2 | CAP-01 to CAP-07 |
| PF-3 | PERF-06, CAP-04, CAP-07 to CAP-09, CAP-13 to CAP-15, CMP-04, PIPE-20, DSH-02, PAD-11 |
| PF-4 | CAP-01, CAP-02, SPD-01 to SPD-10 |
| PF-5 | Table 1.3a, CAP-10 to CAP-12, CAP-16, CAP-17, CAP-20 |
| PF-6 | PERF-04 to PERF-08, PERF-10 |
| PF-7 | PERF-07 (G-METAL inputs), PERF-10 to PERF-12, PERF-14, PERF-15 |
| PF-8 | PERF-01 to PERF-03, PERF-05, PERF-13, CAP-19, MH-01, MH-03 |
| PF-9 | PERF-09 |
| HD-1 | PIPE-01, PIPE-06, PIPE-07 |
| HD-2 | PIPE-01 to PIPE-14, CMP-01, CMP-06 |
| HD-3 | PIPE-04, PIPE-12, PIPE-15, PIPE-16, CAL-01 to CAL-10 |
| HD-4 | CMP-01 to CMP-05, PIPE-20, LBL-05, LOOK-05 |
| HD-5 | PIPE-03, PIPE-19 |
| HD-6 | CAL-06, LBL-06, LOOK-01 to LOOK-05 |
| DV-1 | PIPE-17, PIPE-18 |
| UX-1 | CAP-15, CAP-18, CAL-07, DSH-05 |
| UX-2 | CAP-07, LBL-07, DSH-01 to DSH-07, PAD-09, BG-09 |
| UX-3 | PIPE-14, CMP-06, LBL-01 to LBL-06 |
| UX-4 | CAL-10, DSH-06 |
| IN-1 | PAD-01 to PAD-09, PAD-11 |
| IN-2 | PAD-01 to PAD-03, PAD-07, PAD-08 |
| IN-3 | PAD-12, PAD-13 |
| IN-4 | PAD-10, BG-01 to BG-14 |
| IN-5 | PAD-14, BG-14, MH-01 to MH-03, section 4.3 |
| AR-1 | CAP-03, PIPE-05, PIPE-13, DSH-01, RB-01 to RB-07 |
| AR-2 | PERF-01, PERF-06 and every gate in section 6 |
| CN-1 | This page runs nothing now; RB-06 |

---

## 8. Inconsistencies noted

These were found while writing this page. The ADRs were not edited.

1. **48 is offered but not validated by G6-4.** ADR 0003 offers a 48 cap (ProMotion and the fixed 48 Hz mode), but
   G6-4 lists D2 validation only at 30, 40, 45 and 60. This page runs SPD-01 to SPD-10 at 48 as well.
2. **"45 is selectable everywhere"** (ADR 0003 §2 text) conflicts with the same section's table, which does not offer
   45 in the built-in fixed 48 Hz mode. This page follows the table.
3. **Percentiles.** ADR 0003 §6 lists p50, p90, p99, p99.9 and maximum, but G-TEL asks for p50/p95/p99 and G-KK
   judges p95. This page records p95 as well.
4. **No menu for a built-in fixed 120 Hz mode.** G6-8 "adds a fixed-120 row", but ADR 0003 §2 does not define it. Table
   1.3 assumes the A95L fixed-120 menu [I].
5. **P2 exit lists differ.** The ADR index's P2 exit gate omits two items that the phased plan in
   [03-plan-and-effort.md](03-plan-and-effort.md) adds: the recorded status of 45 per display and the live G-INP-6
   replay. This page treats both as P2 exit conditions (CAP-07, BG-05).
6. **G-AB has no pass threshold for "default".** ADR 0001 names a Poisson test against 0.012 flashes/s but not the
   significance level, nor whether a statistically better but non-zero flash count is acceptable as the default.
   PERF-06 proposes α = 0.05 plus a 0-flash default rule for the owner to confirm.
7. **Requirement ids.** No requirements document with ids existed when this page was written, so section 0.2 defines
   keys. [01-requirements.md](01-requirements.md) now numbers requirements differently (PERF-xx, CAP-xx, HDR-xx and so
   on) and names test families (T-PERF-xx and so on); its "How to read" table maps those families to the ids on this
   page. The mapping from each owner requirement to both sets of ids is in the
   [documentation index](README.md#requirement-coverage). Some ids exist in both files with different meanings (for
   example CAP-01 is a requirement in 01 and a test here), so cross-references always name the file.
