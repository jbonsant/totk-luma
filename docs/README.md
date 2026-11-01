# TOTK Luma documentation index

Status: Proposed, 2026-11-01. Everything here is specification only. Nothing authorises production emulator work
until the owner approves it ([APPROVAL.md](APPROVAL.md)).

Start with the [overview](00-overview.md), then the [approval list](APPROVAL.md).

---

## Specification

| Document | What it covers |
|---|---|
| [00-overview.md](00-overview.md) | Vision, key findings, chosen architecture with a pipeline diagram, phases at a glance, and what the demo is |
| [APPROVAL.md](APPROVAL.md) | Prioritised decisions the owner must make before implementation, with options and recommendations |
| [01-requirements.md](01-requirements.md) | Functional and non-functional requirements, coverage of the owner's brief, non-goals and assumptions |
| [02-unknowns-risks-and-gates.md](02-unknowns-risks-and-gates.md) | Unknowns register, risk register, and every approval, access, licence and evidence gate by phase |
| [03-plan-and-effort.md](03-plan-and-effort.md) | Phases P0-P5 in detail, effort ranges, minimum showcase versus full ambition, and owner-attended sessions |
| [04-test-acceptance-matrices.md](04-test-acceptance-matrices.md) | Test and acceptance matrices for performance, caps and VRR; HDR and calibration; DualSense; background control |
| [05-rollback-and-reproducibility.md](05-rollback-and-reproducibility.md) | Pinned toolchain, build provenance, side-by-side variants, save backups, flags and the rollback ladder |
| [06-ux-spec.md](06-ux-spec.md) | Fullscreen default, dashboard, calibration wizard, presets, caps, controller set-up and troubleshooting |

---

## Architecture decision records

| Record | What it decides |
|---|---|
| [adr/README.md](adr/README.md) | ADR index, how the presenter conflict was resolved, the phased plan and how proposals were judged |
| [adr/0001-architecture-and-delivery.md](adr/0001-architecture-and-delivery.md) | D1, D2, D10: flagged Ryubing patch queue, private title pack, MoltenVK baseline, KosmicKrisp gate, repository logistics |
| [adr/0002-hdr-pipeline-and-presenter.md](adr/0002-hdr-pipeline-and-presenter.md) | D3, D4, D9: scene HDR by tonemap replacement, the in-swapchain output stage, display profiles and the in-game dashboard |
| [adr/0003-frame-pacing-caps-and-vrr.md](adr/0003-frame-pacing-caps-and-vrr.md) | D5: caps as guest vsync rates plus D2, per-display cap menus, timed presents, VRR gates and the measurement protocol |
| [adr/0004-input-dualsense-and-automation.md](adr/0004-input-dualsense-and-automation.md) | D6: SDL3 DualSense patches, owner-wins arbitration with the agent pad, the dashboard toggle and the haptics track |
| [adr/0005-dolby-vision-position.md](adr/0005-dolby-vision-position.md) | D7: Dolby Vision not pursued; HDR10 and EDR only, with a light watching brief |
| [adr/0006-visual-effects-and-reshade-style-support.md](adr/0006-visual-effects-and-reshade-style-support.md) | D8: two-stage built-in looks, defog priority, and gated reshadefx support |

---

## Research notes

Each note ends with an "Independent verification" section. Where it corrects a claim, the correction wins.

| Note | Topic |
|---|---|
| [research/01-hdr-existing-implementations.md](research/01-hdr-existing-implementations.md) | RenoDX mod 175, MacShade and Beast Roofer: how they work and why none runs on this Mac |
| [research/02-hdr-render-pipeline.md](research/02-hdr-render-pipeline.md) | TOTK's tonemap and post passes, Ryubing's 8-bit path, the precision-loss map and scene HDR options |
| [research/03-apple-hdr-edr-stack.md](research/03-apple-hdr-edr-stack.md) | CAMetalLayer EDR, headroom, direct-to-display, MoltenVK and KosmicKrisp colour spaces, HDMI HDR |
| [research/04-displays-and-calibration.md](research/04-displays-and-calibration.md) | Built-in XDR and A95L capabilities, HGIG-style calibration without an instrument, profile parameters, labelling |
| [research/05-performance-and-backends.md](research/05-performance-and-backends.md) | CPU and GPU bottlenecks, hypervisor and write tracking, backend options and profiling methods |
| [research/06-frame-pacing-and-vrr.md](research/06-frame-pacing-and-vrr.md) | TOTK game timing, the D2 patch, Ryubing presentation, ProMotion cadence, HDMI VRR and frame-time measurement |
| [research/07-dualsense-and-input.md](research/07-dualsense-and-input.md) | Ryubing's SDL3 input stack, DualSense gaps, haptics and triggers, motion aiming, background control |
| [research/08-dolby-vision.md](research/08-dolby-vision.md) | Dolby Vision gaming, A95L behaviour, Mac limits, licensing barriers and DV-like alternatives |
| [research/09-effects-overlay-and-scopes.md](research/09-effects-overlay-and-scopes.md) | Vivid and defog looks, ReShade-style options on macOS, HDR scopes and overlay rendering |
| [research/10-architecture-options.md](research/10-architecture-options.md) | Fork, native shell and hybrid options, codebase seams, upstream health, reproducible builds and rollback |

---

## Evidence

| Document | What it covers |
|---|---|
| [evidence/prior-local-evidence.md](evidence/prior-local-evidence.md) | Bounded results from earlier hands-on runs on the target Mac, verified against private reports (cited as `[E]`) |

---

## Demo

The visual-scope demo lives outside `docs/`, in [`demo/`](../demo/README.md). It is simulated and exists only for
visual-scope approval.

---

## Requirement coverage

Each line of the owner's approved brief, and where the specification covers it. Short forms: `01 PERF-14` is a
requirement id in [01-requirements.md](01-requirements.md); `04 CAP-20` is a test id in
[04-test-acceptance-matrices.md](04-test-acceptance-matrices.md); `02` gates are in
[02-unknowns-risks-and-gates.md](02-unknowns-risks-and-gates.md); `Rnn` is a research note.

| Requirement | Where covered |
|---|---|
| **Vision** | |
| Personal-use, Mac-first, emulator-based, not a native port | [00](00-overview.md) §1; 01 §4 non-goals; [AGENTS.md](../AGENTS.md) |
| About 1080p internal rendering | ADR 0001 D2 item 2.3; 01 PERF-07; 04 PERF-09; [APPROVAL](APPROVAL.md) item 5 |
| Highest sustainable frame rate with correct gameplay | ADR 0003; 01 CAP-01 to CAP-06, NFR-COR-01 to NFR-COR-05; 04 §1.2, §1.5 |
| Vivid optional visuals | ADR 0006; 01 LOOK-01 to LOOK-11; 04 LOOK-01 to LOOK-05; [06](06-ux-spec.md) §8 |
| Excellent DualSense | ADR 0004; 01 INP-01 to INP-10; 04 §3 |
| **Performance** | |
| Sustained 60 FPS where feasible | ADR 0003 §1 (experimental until G-60); 01 CAP-05; 04 CAP-05, PERF-13 |
| Configurable 30 / 45 / 60 caps | ADR 0003 §1-2; 01 CAP-01 to CAP-04; 04 §1.2-1.3; 06 §9.1 |
| Pacing, game speed, physics, animation, audio and saves before counter FPS | 01 NFR-PACE-01 to NFR-PACE-03, NFR-COR-01 to NFR-COR-04; 04 SPD-01 to SPD-10 |
| Actual VRR support per display and connection | 04 §1.3a, CAP-10 to CAP-17, CAP-20; 01 VRR-01 to VRR-07; ADR 0003 §2 and gates G6-1 to G6-10; 06 §9.2 |
| Refresh-compatible fallbacks | ADR 0003 §2; 01 VRR-05; 04 table 1.3 and the fallback column of §1.3a |
| Profile CPU, GPU, synchronisation and shader bottlenecks | 01 PERF-05, PERF-14; 04 PERF-07, PERF-08, PERF-10 |
| Native Metal, Vulkan/MoltenVK and selective improvements compared by measured evidence and maintenance cost | ADR 0001 D2 "Backend comparison"; 01 PERF-08 to PERF-15; 04 PERF-07, PERF-10 to PERF-15 |
| Full GPU utilisation alone is not success | 01 PERF-02; 02 RISK-24 |
| Representative demanding scenes | 04 §0.5 (S1-S10, M1-M4); 01 PERF-04 |
| Warm and cold cache distinction | 04 §0.3 (C0, C1, C2); 01 PERF-03, PERF-04, NFR-PACE-03; ADR 0003 §6 |
| True frame-time measures | ADR 0003 §3; 01 PERF-01, PERF-02; 04 PERF-01 to PERF-03 and §0.3 metrics |
| **HDR** | |
| Full precision and range path; where precision, gamut and highlights are lost | ADR 0002 Context (loss table); R02 §3; 01 HDR-14; 04 PIPE-01 to PIPE-14 |
| Preserve genuine scene HDR before clipping; a brighter SDR image or an HDR swapchain alone is not enough | ADR 0002 D3; 01 HDR-09 to HDR-18; 04 PIPE-07, PIPE-14, CMP-06; 02 RISK-06 |
| Separate calibrated MacBook and A95L profiles | ADR 0002 D3 profiles; 01 CAL-01 to CAL-12; 04 §2.3; 06 §7 |
| Paper white | 01 CAL-03, CAL-04; 04 CAL-01 |
| Highlights and roll-off | 01 CAL-02 to CAL-06; 04 CAL-02, CAL-03, CAL-05 |
| Black levels | 01 CAL-12; 04 CAL-04 |
| Gamut | 01 CAL-11; 04 CAL-06, CMP-03 |
| SDR-safe UI | ADR 0002 D9 item 4; 01 UX-07, HDR-15; 04 CAL-07, PIPE-12 |
| Dynamic EDR headroom | ADR 0002 D4 item 2; 01 HDR-05, CAL-03; 04 PIPE-15, CAL-08; 06 §5.5 |
| Compare highlight detail, gradients, colour accuracy, latency and performance, not brightness | 04 §2.2 CMP-01 to CMP-05, PIPE-20; 01 HDR-17, NFR-LAT-01, NFR-LAT-06 |
| Inspect RenoDX mod 175, MacShade and Beast Roofer first | R01; ADR 0002 Context and D3 alternatives; 01 HDR-20, HDR-27; 04 PIPE-19 |
| Native HDR through Vulkan / MoltenVK / Apple EDR, or a better-justified architecture | ADR 0002 D4; 01 HDR-01 to HDR-08 |
| Evaluate optional vivid colour and defog | ADR 0006; 01 LOOK-01 to LOOK-07, LOOK-11; 04 LOOK-01 to LOOK-03, LOOK-05 |
| ReShade-style support without Windows add-on ABI compatibility | ADR 0006 items 5-7; 01 LOOK-08, LOOK-09, §4 non-goals; 04 LOOK-04 |
| **Dolby Vision** | |
| Gaming support and image-quality benefit against HDR10 / EDR on the real MacBook and A95L stack, metadata and latency | ADR 0005 Context (per-display table); R08 |
| Restricted SDK or reverse engineering documented as research only; decompilation not assumed necessary or sufficient | ADR 0005 Decision and reopen conditions; 01 HDR-25; 02 G-ACC-DOLBY |
| No commercial compliance; practical component-access and reuse constraints only | ADR 0005 item 7 and per-display table; 01 §4; 02 §4.5 |
| HDR10 / EDR independently viable | ADR 0005 item 1; 01 HDR-23, HDR-24 |
| **UX** | |
| Clean fullscreen default | 06 §3; 01 UX-01; 04 DSH-05 |
| One shortcut toggles the dashboard | ADR 0004 dashboard toggle; 06 §4; 01 UX-02; 04 PAD-09 |
| Histogram, waveform, clipping, headroom, frame-time graph, FPS and presentation mode | 06 §5; 01 UX-04, UX-05; 04 DSH-04 |
| Computed rendering nits labelled apart from measured panel brightness | 06 §6; 01 UX-06; 04 LBL-01 to LBL-05 |
| Calibration, presets and troubleshooting easy to understand | 06 §7, §8, §12; 01 UX-12; 04 DSH-06 (G-UI-2) |
| **Controls** | |
| Buttons, sticks, motion aiming, touchpad and rumble | 01 INP-01, INP-02, INP-04; 04 §3.1, PAD-02 to PAD-06 |
| USB and Bluetooth, with reconnects | 01 INP-03, INP-06; 04 PAD-07; 06 §10.4 |
| Advanced haptics and adaptive triggers on a separate feasibility track | ADR 0004 P5 track; 01 INP-10; 04 PAD-12, PAD-13 |
| Virtual-gamepad automation kept, without stealing keyboard, mouse or focus | ADR 0004 composite driver; 01 AGT-01 to AGT-08; 04 BG-01 to BG-14 |
| Uncontended hardware for measurements, even when inputs are isolated | ADR 0004 measurement hygiene; 01 NFR-REP-03, AGT-08; 04 §4.2-4.3 |
| **Architecture** | |
| Choose between a maintainable fork, a native macOS/Xcode shell and a hybrid; Xcode a candidate, not a constraint | ADR 0001 D1 and alternatives (with maintenance scores); R10; APPROVAL item 1 |
| Narrow, reusable changes and isolated components | ADR 0001 D1 item 4; 01 NFR-MNT-01 |
| Reproducible builds and clean config | [05](05-rollback-and-reproducibility.md) §3-5; 01 NFR-REP-01, CFG-02 |
| Rollback | 05 §7-8, §12; 01 CFG-06, CFG-09; 04 RB-01 to RB-07 |
| Evidence gates rather than unbounded spending | [03](03-plan-and-effort.md) §6; 02 §4; 01 NFR-MNT-06 |
| **Deliverables** | |
| (1) Concise overview and evidence-backed ADRs with alternatives | [00-overview.md](00-overview.md); [adr/](adr/README.md) 0001-0006 |
| (2) Requirements, non-goals, unknowns, risks, dependency and access gates, effort ranges, phased plan | 01; 02 §2-4; 03 |
| (3) Test and acceptance matrices: performance, caps and VRR; HDR pipeline and calibration; DualSense; background control; plus rollback and reproducibility | 04 §1-5; 05 |
| (4) Interactive visual-scope demo | [demo/](../demo/README.md) (simulated); 06 §1 |
| (5) Short summary of what needs the owner's approval | [APPROVAL.md](APPROVAL.md); 03 §7 |
| **Constraints** | |
| No production implementation, merge, deploy or purchase now | APPROVAL intro; 01 §4; AGENTS.md rule 4 |
| Prior local results are bounded experimental evidence | [evidence/prior-local-evidence.md](evidence/prior-local-evidence.md); 04 intro |
| No long benchmark runs now | 01 NFR-REP-04; ADR 0003 §6 |
