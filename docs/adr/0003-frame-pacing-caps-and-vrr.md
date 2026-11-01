# ADR 0003: Frame pacing, frame caps and VRR

- **Status:** Proposed, awaiting owner approval
- **Date:** 2026-11-01
- **Covers:** D5 (frame pacing and caps)
- **Related:** [0001](0001-architecture-and-delivery.md) (telemetry seam, title pack, baseline backend),
  [0002](0002-hdr-pipeline-and-presenter.md) (presenter gates G-PRES-2 and G-PRES-3), [0004](0004-input-dualsense-and-automation.md)
  (measurement hygiene)

Tags: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal; `[E]` prior local evidence; `Rnn §x`
research notes. All effort figures are estimates `[I]`.

---

## Context

**Game speed is tied to the frame interval in vanilla TOTK.** TOTK 1.4.3 picks present interval 2 (30 FPS) or 3
(20 FPS) and steps game time by whole 60 Hz vsyncs. An unlock that only lowers the interval keeps the 30 FPS step,
so the game runs faster in proportion to the frame rate (2x at 60) [D]/[I] (R06 Summary, verification).

**The D2 local timing patch steps game time from measured frame time**, clamped to 15-60 FPS, and requests present
interval 1 [M] (R06 §1). Measured with Hypervisor Off at 1.2x [E]:

| Scene | Vanilla | With D2 |
|---|---|---|
| Great Sky Island | 29.97-30.02 | 44.8-50.9 (mostly 45-48) |
| Beneath Hyrule Castle | 29.95-30.05 | 38.4-45.2 |
| Room of Awakening | 20.0 | 25.8-28.2 |

A walk test gave an alignment scale of 0.995-1.005 at 30 and about 48 FPS [E]. 60 was reached only in menus [E].
Audio, pre-rendered cutscenes, long-session physics, judder and frame-time percentiles are **not validated** [E].

**In Ryubing the cap is the guest vsync rate.** Switch mode emulates 60 Hz, Custom mode N Hz (shown as a percentage of
60), and Unbounded signals vsync with no wait [D] (R06 Summary). With D2, Custom 45 is a speed-correct 45 cap by
design; only 30 was tested [I] (R06 verification). Under D2, Unbounded, turbo or Custom above 60 would run ahead,
because frames shorter than 16.7 ms still step 1/60 s [I] (R06 verification). Ryubing's VSync hotkey cycles through
Unbounded [D] (R06 verification).

**Ryubing never asks for timed presentation.** It requests FIFO (MoltenVK offers only FIFO and IMMEDIATE), uses 3
images, does not enable `VK_GOOGLE_display_timing`, and drives the guest vsync from a free-running `Stopwatch`, not
the display [D] (R06 §2, verification). MoltenVK turns a desired present time into `present(at:)` and reports
`presentedTime` as `actualPresentTime` [D] (R06 Summary).

**Display behaviour** (R06 §3, §4; R04 §4):

| Display and mode | Facts | Tag |
|---|---|---|
| Built-in, ProMotion fullscreen | min 8.33 ms, max 41.67 ms, granularity 4.17 ms; shown rates 120, 80, 60, 48, 40, 34.3, 30, 26.7, 24 Hz | [M] probe; [D] Apple's rule |
| Built-in, fixed modes | 60, 59.94, 50, 48, 47.95 Hz; whether a fixed 120 Hz is selectable is unknown | [M]/[D] |
| A95L over HDMI | 4K120 on HDMI 3 or 4 with Enhanced format; VRR range reported as 48-120 Hz or below 20 Hz with LFC; G-SYNC Compatible; FreeSync conflicting | [A] |
| Mac to A95L HDMI VRR | Apple's documents conflict (Adaptive Sync excludes HDMI; another page mentions HDMI VRR for older models); no Sony report found | [D]/[A]; **unverified** |
| External HDR at 120 Hz | Reported HiDPI framebuffer limit of about 2432x1368 for HDR at high refresh (macOS 14, M1/M3 Max); untested here | [A] |

**Arithmetic of even pacing** (R06 §4, verified):

| Panel rate | 30 | 40 | 45 | 48 | 60 |
|---|---|---|---|---|---|
| 120 Hz | even (4) | even (3) | 3,3,2 (16.7/25 ms) | 3,2 | even (2) |
| 60 Hz | even (2) | 2,1 | 2,1,1 | 2,1,1,1 | even (1) |
| ProMotion | 33.3 ms even | 25.0 ms even | 20.8/20.8/25.0 at best | 20.8 ms even | 16.7 ms even |

**Field reports.** On an M4 Pro, nxnative saw 68-1,640 of about 9,600 presents one refresh late per 180 s at display-link
latency 1, and 17-18 at latency 2 [A] (R06 §3). A macOS 27 beta report describes ProMotion cadence switching between
120 and 60 Hz [A] (R06 §3). The owner runs a later beta; whether that is fixed is unknown.

**There is no true frame-time source yet.** The status-bar FPS is an average over a 750 ms window; the Metal HUD
reports host cadence and forces a shader recompile [E] (R09 Summary, R10 §1.4).

**Owner requirement.** Sustained 60 where feasible; configurable 30/45/60 caps; stable pacing and correct speed,
physics, animation, audio and saves before counter FPS.

---

## Decision

### 1. What a cap is

- A cap is a **guest vsync rate**: Switch 60, or Custom 48, 45, 40 or 30 Hz, **combined with the D2 measured-time patch**.
- **Without D2, only "30 (native)" is offered.**
- While D2 is active, Unbounded, turbo and Custom above 60 are refused, and the VSync cycling hotkey is replaced by
  direct selection (R06 implication 2).
- 60 is labelled **experimental** until G-60 passes.

### 2. Per-display cap menus (defaults, subject to the gates)

| Display and mode | Offered | 45 behaviour |
|---|---|---|
| Built-in, ProMotion fullscreen | 30, 40, 48, 60 (experimental) | Selectable with a cadence warning (20.8/20.8/25.0 ms); 40 or 48 suggested |
| Built-in, fixed 60 Hz | 30, 60 (experimental) | Selectable with a warning (2,1,1); 30 suggested |
| Built-in, fixed 48 Hz | 48 | Not offered (uneven) |
| A95L, fixed 120 Hz | 30, 40, 60 (experimental) | Selectable with a warning (3,3,2); 40 suggested |
| A95L, fixed 60 Hz | 30, 60 (experimental) | Selectable with a warning; 30 suggested |
| A95L with verified HDMI VRR (G6-1) | 30, 45, 60 (experimental) | Smooth; host frame doubling below the VRR floor |
| Any display, windowed | As the fixed panel rate | VRR needs fullscreen [D] (R06 §3) |

45 stays selectable everywhere because the owner asked for it, but the dashboard shows its cadence fit ("even",
"uneven", or "VRR") and suggests the evenly paced neighbour. It is called smooth only with verified VRR.
R05's condition is kept as advice: 45 is recommended only in scenes whose measured cost is 22 ms per frame or less
(R05 implication 3).

VRR support is judged per display **and per connection**: the TV port, its signal format, the cable, and whether an
adapter sits in the path. The matrix of connections, their VRR status and the refresh-compatible fallback for each
is in [04 §1.3a](../04-test-acceptance-matrices.md#13a-vrr-support-per-display-and-connection). A connection that
cannot carry VRR, or whose VRR is unverified, always uses the fixed-rate menu of its refresh rate from the table
above.

### 3. Build order for pacing

1. **Telemetry ring** (G-TEL). A 512-entry per-frame ring (R09 implication 6) recording: guest present, guest vsync tick,
   host submit, `actualPresentTime` (0 means dropped), cap, panel refresh, present mode, the D2 step, and shader-cache
   state. Exported as CSV to the private workspace, and read by the dashboard.
2. **Timed presents** through `VK_GOOGLE_display_timing`: pass a desired present time (MoltenVK turns it into
   `present(at:)`) and read back `actualPresentTime` (R06 implication 4).
3. **Display-locked guest vsync.** SurfaceFlinger ticks come from a display link (`CVDisplayLink`, or
   `CAMetalDisplayLink` on macOS 14+, both through interop from C#), with a virtual 60 Hz tick when the panel runs at
   120 Hz; the existing timer stays as fallback (R06 implication 3).
4. **Host LFC** (frame doubling) for 30 and 45 on VRR, only after G6-1 (R06 implication 6).
5. **Automatic 30 during movies**, only after G6-3 shows how TOTK decodes them (R06 implication 7).

All of this lives in Ryubing's own presentation path, which is backend-portable (ADR 0001). If `present(at:)` cannot
meet the targets, G-PRES-3 in ADR 0002 decides whether a native display-link presenter is justified.

### 4. Where the D2 patch lives

- The D2 patch is game-specific and contains offsets, so it lives **only in the owner-local title pack**, as an
  owner-supplied exefs patch (ADR 0001).
- The public repository documents its behaviour, the test protocol and a SHA-256 checksum field in `luma.json`, never
  offsets or patch bytes.
- Publishing it in any form needs its own licence review, because D2 draws facts from FPSLocker (no licence file)
  [M] (R06 Risks).
- D2 must not alter the shaders that ADR 0002 keys by guest hash [I] (R02 Risks).

### 5. Platform settings

- The play bundle declares `LSSupportsGameMode` (absent from Ryubing's plist today) [D] (R03 §2).
- Fullscreen and windowed are tested separately.

### 6. Measurement protocol for every pacing claim (R05 §4, R06 §5)

- **Cache states:** C0 cold, C1 Ryujinx warm and Metal cold, C2 all warm. Steady-state claims use C2 only. A new
  build always starts cold (about 85-88 s, about 1,017 shaders) [E].
- **Per scene:** boot, load the save, wait 60 s for JIT warm-up (there is no PPTC on this setup [D] R05 Summary),
  measure 120 s, repeat three times; change one variable per run.
- **Scenes:** Great Sky Island fixed point (GPU-bound), Beneath Hyrule Castle (CPU), Room of Awakening (CPU), and later
  the community scenes in R05 §4.4.
- **Metrics:** frame interval p50, p90, p99, p99.9 and maximum; jitter; cadence error rate against the expected hold
  pattern; missed vsyncs and drops; guest-present versus on-screen rate mismatch; game speed.
- **Health criteria per cap and display:** guest frame time p99 at most 1.25x the target interval; game speed 1.00 ±
  0.01; no shader-compile spike in steady state (R05 §4.2).
- **Game-speed checks:** walk test, in-game clock against a stopwatch, a timed animation from `presentedTime`-stamped
  frames (R06 §5).
- Hygiene from ADR 0004 applies (uncontended host, pad state logged, Metal HUD off).
- No long benchmark runs happen in the specification phase.

---

## Alternatives considered

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **Guest vsync caps + D2 + display-locked vsync + timed presents (chosen)** | Speed-correct by measurement; reuses Custom VSync; portable | Needs patches in hot files; D2 audio, movies and physics unvalidated | [E]; R06 options C, D |
| Static unlock or Unbounded | Highest counter FPS | Game speed becomes FPS/30 (2x at 60) [D]/[I]; run-ahead under D2 | R06 §1 |
| nxnative-style host frame step in whole vsyncs (R06 option F) | Even motion even with uneven holds | 2-4 weeks, a new game patch plus host-to-guest shared state; diverges from the measured D2 design | R06 options F |
| MetalFX frame interpolation | Higher displayed FPS | Needs depth, motion vectors and matrices the emulator lacks; adds latency; no game-logic FPS | R05 §3 rank 14 |
| Call 45 smooth without VRR | Simple menu | 3,3,2 at 120 Hz; 20.8/20.8/25.0 at best on ProMotion [I, arithmetic verified] | R06 §3, §4 |
| Vanilla 30 only (R06 option A) | Safest | Ignores the owner's frame-rate goal. Kept as the default and as the no-D2 mode | R06 options A |

---

## Consequences

**Positive**

- Higher frame rate the owner can feel, with correct game speed already measured at 30 and about 48 FPS [E].
- Cadence claims become checkable: every claim cites telemetry, not status-bar FPS.
- The menu is honest per display, so judder is never sold as smooth.

**Negative**

- Until automatic 30 exists, movies may run at 1.5-2x with D2 [D]/[I] (R06 Risks).
- The macOS 27 beta ProMotion cadence issue may break the ProMotion path regardless of Luma's code [A].
- HDR and 4K120 may exclude each other on the A95L above a HiDPI framebuffer size [A]; the TV default must be chosen
  with ADR 0002's display gate.
- Presentation patches touch `Window.cs` and SurfaceFlinger, which change between canaries; KosmicKrisp would replace
  MoltenVK's presentation behaviour [I] (R06 Risks).

---

## Evidence gates and kill criteria

| Gate | What it checks | Outcome |
|---|---|---|
| G-TEL | Ring records all fields; `VK_GOOGLE_display_timing` exposed by `1.4.2-ryujinx.5` | Prerequisite for every cadence claim |
| G6-1 | macOS offers HDMI VRR to the A95L (HDMI 3 or 4, Enhanced format, 48 Gbps cable) and the TV shows VRR active; owner attended | Pass: VRR menu row and host LFC. Fail: fixed-120 policy |
| G6-2 | Mode list read-only: 100 Hz? 4K120 HDR? the HiDPI HDR limit | Sets the A95L default mode |
| G6-3 | Movie decode path (NVDEC logging) | Pass: automatic 30. Fail: document the movie-speed caveat |
| G6-4 | D2 audio, physics and 30+ minute sessions at 30, 40, 45 and 60 | Caps that fail are removed from the menu |
| G6-5 / G6-7 | On-screen cadence of 40 and 45 on ProMotion versus fixed 60; macOS 27 beta cadence report | Sets the ProMotion menu |
| G6-6 | Does the fullscreen layer go direct-to-display with `1.4.2-ryujinx.5`? | Feeds ADR 0002 G-PRES-2 and the `1.4.3-ryujinx.2` A/B |
| G6-8 | Fixed 120 Hz selectable on the built-in display? | Adds a fixed-120 row |
| G6-9 (optional) | DisplayPort Adaptive-Sync control case on an MSI monitor | Proves timed presents on known-good VRR |
| G6-10 | Does `CAMetalDisplayLink` honour a 40-45 Hz preferred range on this panel? | Chooses the vsync source |
| G-60 | Guest frame time under D2 already 20 ms or less with CPU and GPU headroom (R05 §5) | Pass: 60 loses the "experimental" label for that scene class |
| G-CAP (per cap, per display) | p99 at most 1.25x target, speed 1.00 ± 0.01, cadence error rate published | Fail: the cap shows a warning or is withdrawn |

**Kill criteria**

- If display-locked vsync does not reduce the cadence error rate against the free-running timer, keep the timer and drop
  the patch.
- If timed presents prove unreliable on MoltenVK, record it under G-PRES-3; only then consider the native presenter.
- If D2 fails G6-4 for audio or physics at a cap, that cap is withdrawn; if it fails at every cap above 30, ship
  "30 (native)" only.

---

## Effort range

All [I], from R06 and R05.

| Item | Range |
|---|---|
| Telemetry (guest present, host submit, `presentedTime`, CSV ring) | 2-4 days (R06); the guest-frame hook alone 0.5-2 days (R05) |
| Cap UI, no Unbounded under D2, hotkey replacement | 1-2 days |
| Display-locked guest vsync | 4-8 days |
| Timed presents and host LFC | 3-6 days |
| Movie automatic 30 | 2-5 days, or blocked |
| Per-display validation | 0.5 day each × 4-6 configurations, owner present |

---

## Open questions for the owner

1. Approve D2 as an owner-supplied file in the private title pack, kept out of every public repository, plus the licence
   review of its FPSLocker-derived facts?
2. Accept 30 as the guaranteed cap and 60 as experimental until G-60?
3. Accept that 45 is shown with a cadence warning and 40 or 48 suggested where VRR is absent or unverified?
4. Schedule the attended A95L display session (G6-1, G6-2) and the D2 validation sessions (G6-4).
5. Is a 30-minute D2 validation session per cap acceptable, once implementation is approved?
