# 06 - Frame caps, game-speed correctness, presentation and VRR

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: the 30 / 45 / 60 FPS caps, how to keep game time correct, how Ryubing and MoltenVK put frames on screen,
and what each display and connection can show evenly.

Evidence tags: [D] documented, [M] measured (prior local evidence, or a read-only query made for this note),
[I] inference, [A] anecdote or user report. Bracketed numbers point to the Sources list.

No patch offsets are reproduced here. The game-specific patch is described only by what it does.

---

## Summary

- **Vanilla TOTK 1.4.3 ties game time to the present interval, not to the clock.** It picks interval 2 (30 FPS) or 3
  (20 FPS) on its own and steps game time by a whole number of 60 Hz vsyncs. [D] [4][5]
  An unlock that only lowers the interval keeps the 30 FPS step, so the game runs faster in proportion to the frame rate. [D] [2][4] [I]
- **The D2 patch steps game time from the measured frame time** (clamped to 15-60 FPS) and asks for present interval 1. [M] [3]
  Walk tests gave a scale of 0.995-0.998 at about 48 FPS and 0.995-1.005 when capped at 30 through Custom VSync. [M] [1]
  Audio, pre-rendered movies and long-session physics are still unvalidated. [M] [1]
- **In Ryubing, the cap is the guest vsync rate.** Switch mode emulates 60 Hz; Custom mode emulates N Hz (shown as a
  percentage of 60); Unbounded signals vsync with no wait. [D] [6][7][10]
  With D2, Custom 45 (75 %) is a speed-correct 45 FPS cap. Without D2, Custom changes game speed (75 % speed at 45 Hz). [I]
  Unbounded must never be used with D2: frames shorter than 16.7 ms still step 1/60 s, so the game runs ahead.
  [I] from the documented D2 clamp [3]; not measured. [2]
- **Ryubing never asks for timed presentation on macOS.** It requests FIFO in Switch and Custom modes. Mailbox is never
  offered by MoltenVK, and IMMEDIATE is used only for Unbounded. It uses 3 swapchain images and no `VK_GOOGLE_display_timing`.
  The guest vsync is a free-running host timer, not locked to the display. [D] [6][8][13]
- **MoltenVK maps FIFO to `displaySyncEnabled = YES` and IMMEDIATE to `NO`.** It presents with plain `present` unless
  the app passes a desired present time, which becomes `present(at:)`. It reads `presentedTime` in a presented handler. [D] [13]
  It never uses `present(afterMinimumDuration:)` or `CAMetalDisplayLink`. [D] [13]
- **The built-in display is variable-refresh capable, in steps.** A read-only query on the owner's Mac gave
  ProMotion min/max intervals of 8.33 / 41.67 ms (120-24 Hz) and an update granularity of 4.17 ms. [M] [35]
  Per Apple's definition (the display updates at the next granularity boundary after the minimum interval), the shown
  intervals are then 120, 80, 60, 48, 40, 34.3 and 30 Hz (and 26.7 and 24). [D] [20] 45 FPS cannot be held exactly and
  alternates 20.8 / 20.8 / 25.0 ms at best. [I] [20][35]
  Fixed modes 60, 59.94, 50, 48 and 47.95 Hz also exist. [M] [35] [D] [25]
- **Adaptive-Sync documentation conflicts for HDMI.** Apple's Adaptive Sync article says to use Thunderbolt or
  DisplayPort and "Do not use an HDMI cable or adapter". [D] [22]
  Apple's 8K/high-refresh article says HDMI-2.1-class Macs support "VRR" over a direct HDMI cable. [D] [23]
  Its model list predates M4; the newer HDMI article lists the M4 Pro MacBook Pro for the same 8K60 / 4K240 tier. [D] [24]
  No report was found of HDMI VRR with a Sony TV on macOS. User reports of VRR modes with LG OLEDs exist. [A] [32][34]
  **Status for MacBook Pro M4 Pro to A95L: unknown, gate required.**
- **The A95L supports HDMI 2.1 VRR at 4K up to 120 Hz on HDMI 3 and 4.** Reported ranges are 48-120 Hz (review) and below
  20 Hz with LFC (RTINGS). It is G-SYNC Compatible; RTINGS lists no FreeSync, though one retail spec sheet lists
  FreeSync, so FreeSync support is conflicting. [A] [28][29][30]
  The port numbers (HDMI 3 and 4) are not confirmed by a Sony A95L document; Sony states that layout for sibling
  models. [A]
  30 and 45 FPS fall below a 48 Hz floor, so they need frame doubling (LFC) from the source. [I]
- **Without VRR, choose the panel rate per cap.** At fixed 120 Hz, 30, 40 and 60 pace evenly and 45 does not
  (holds of 3, 3, 2 refreshes). At 60 Hz only 30 and 60 pace evenly. [I, arithmetic]
  At 100 Hz only 50 and 25 pace evenly. A 90 Hz mode would pace 45 and 30 evenly, but no such mode is documented for the
  A95L, and macOS has no built-in custom timings. [I]
- **There is no true frame-time source yet.** The status bar is a ~1 s average of guest posts; the Metal HUD cadence is
  not the game's. [M] [36]
  MoltenVK already records the on-screen time of every present (`presentedTime`); TOTK Luma should add telemetry on that path
  before any cadence claim is made. [D] [13] [I]

---

## Findings

### 1. TOTK timing

**Native cap and dynamic interval.** TOTK picks a present interval each frame: 2 gives 30 FPS, and 3 is used under load,
giving 20 FPS. It steps game time by 60 / fps, where the integer fps follows the interval. [D] [5]

The engine family (sead / ksys VFR, shared with BotW) scales its time step by the interval relative to a base of 2.
Game speed is therefore right as long as each frame is really held for the number of vsyncs it asked for. [D] [4]

The local Room of Awakening result fits this picture: with Hypervisor Off, the game falls to its 20 FPS level
(interval 3) and keeps correct speed. [M] [36] [I]

**Why a static unlock breaks speed.** If only the present interval is forced to 1, the integer fps that drives the step
still says 30. Every 60 FPS frame then advances 1/30 s of game time, so speed becomes FPS / 30 (2x at 60). [I] [2][4]

nxnative records the same class of failure on a TOTK build without its frame-step stubs: "double speed". [D] [4]
The local static-unlock probe (static60-TESTONLY) was written but has no recorded result. [M] [2]

**What dynamic FPS patches do.** There are two designs.

| Design | How game time is stepped | Where used | Notes |
|---|---|---|---|
| Measured-time step (D2, FPSLocker-style) | From the previous frame's measured duration in guest ticks; fps clamped to 15-60, written to both the integer and float fps fields | D2 on Ryubing [3] | Step follows real time at any rate between 15 and 60. One-frame lag. Below 15 FPS the game slows, as vanilla does below 20 |
| Host frame step in whole vsyncs (nxnative) | The host decides the hold (1, 2 or 3 vsyncs) and the game steps by exactly that hold; early frames use measured time with payback of run-ahead | nxnative native port [4][5] | Step equals on-screen time on fixed-rate displays. Needs a host that controls presentation |

D2 also presents at interval 1 with the double-buffer flag removed, and fixes the D-pad quick-menu fade.
That fade assumed whole-frame steps, which shows that per-frame assumptions exist in UI code. [M] [3]

**Prior D2 results.** On the Hypervisor Off profile at 1.2x: [M] [1]

| Area | Without D2 | With D2 | Limit |
|---|---|---|---|
| Great Sky Island | 30.0 | 44.8-50.9 (mostly 45-48) | GPU |
| Beneath Hyrule Castle | 30.0 | 38.4-45.2 | CPU |
| Room of Awakening | 20.0 | 25.8-28.2 | CPU |

The walk test gave a best-fit scale of 0.995-0.998 for the 30 FPS reference against D2 at about 48 FPS. Against D2 capped
at 30 with Custom VSync it gave 0.995-1.005. [M] [1]
A save written under D2 loads without D2. The pause menu ran at 60.0 FPS with a correct background. [M] [1]

**Risks.**

- **Pre-rendered movies.** nxnative found that the shared movie library takes one picture per game frame. It measured
  this on Breath of the Wild 1.9.0; TOTK ships the same `subsdk0` movie library. At 60 FPS a movie plays at about 2x,
  with audio lagging. [D] [4] The 1.5x figure at 45 FPS, and the same behaviour in TOTK under D2, are inferences. [I]
  The D2 protocol expects the same and proposes Custom 30 as the workaround. [M] [2]
  nxnative's fix holds 30 FPS while its host video decoder is active. [D] [4]
  In Ryubing it is unknown whether TOTK decodes movies through the emulated NVDEC (which the host could detect) or in software
  on the guest CPU. [I] Gate G6-3.
- **Real-time cutscenes and animation.** These run on game time, so they should follow D2's step. Lip-sync and
  event timing are unvalidated. [I] [1]
- **Physics.** The physics step and any per-frame counters may assume steps of 1/30 or 1/20 s. A variable step of
  1/60-1/15 s is outside what the Switch release ships, though the engine already handles 1/30 and 1/20. [I]
  The quick-menu fade bug is evidence that some per-frame code exists. [M] [3]
  Long-session checks are needed for jitter, tunnelling, ragdolls, vehicles built with Ultrahand, and water. [I]
- **Audio.** Ryubing's audio renderer runs on real time. Music should keep pitch and tempo; SFX timing follows game
  events. A speed error would show as drift against animation, not as pitch change. [I] Unmeasured. [1]
- **Run-ahead.** Under D2, any frame shorter than 16.7 ms still steps 1/60 s. Unbounded mode, Custom above 60, or
  turbo would make the game run fast. [I] from the D2 clamp [3] and Ryubing's tick scaling [7]; not measured. [2]
  Ryubing's VSync hotkey cycles Switch, Custom and Unbounded, so cycling passes through Unbounded. [D] [9]
  (`VSyncMode.Next`: Switch → Custom when custom is enabled, else Unbounded; Custom → Unbounded; Unbounded → Switch.)

**How a 45 cap works.** Under D2, game time follows measured frame time. A host limiter that holds frames to 22.2 ms
therefore gives 45 FPS at correct speed. [I] [3]

Ryubing already has that limiter: Custom VSync at 45 Hz. The UI stores it as a percentage of 60 (75 %), and
`custom_vsync_interval` holds the Hz value. [D] [7][10]
The protocol's row f is the same mechanism at 30, and its walk test passed. [M] [1][2]

Does game logic tolerate arbitrary rates? The walk test supports speed correctness at about 48 and 30 FPS. It is not
proof for physics, audio or movies. [M] [1] [I]

The cap only bounds frame rate. When a frame runs longer than 22.2 ms, D2 steps by the longer duration. Speed stays
right, but the cadence breaks. [I]

### 2. Ryubing presentation (local source, commit 9afba70)

**VSync modes.** `Switch.UpdateVSyncInterval` sets the target guest vsync rate: Switch = 60, Custom = the custom value,
Unbounded = 1. [D] [7]

**Guest vsync emulation.** `SurfaceFlinger.HandleComposition` runs a dedicated thread at above-normal priority. [D] [6]

- It accumulates `Stopwatch` ticks. On each period of `Frequency / TargetVSyncInterval × 100 / TickScalar`, it composes
  (or counts down the game's swap interval) and signals the guest vsync event.
- The remainder is capped at 3 periods. The thread sleeps, then spin-waits the last ~2 ms.
- When the swap interval is 0 (Unbounded), it composes and signals immediately, waiting at most 17 ms for the next frame.
- The game's own `SwapInterval` from each queued buffer is honoured (`_swapIntervalDelay`).

So the guest's 60 Hz is a free-running host timer. It is not locked to the panel's refresh. [D] [6] [I]

**Host present path.** The render loop in `AppHost` calls `PresentFrame` for every frame that SurfaceFlinger posted.
There is no pacing of its own beyond the swapchain. [D] [11]

`RecordGameFrameTime` (the status-bar FPS) is called when the frame is posted, not when it is shown. [D] [6]

**Vulkan present modes requested.** `ChooseSwapPresentMode` picks IMMEDIATE only for Unbounded, otherwise MAILBOX if
offered, otherwise FIFO. [D] [8]
The image count is `MinImageCount + 1`, clamped to the maximum. [D] [8]
A VSync mode change marks the swapchain dirty, so it is recreated. [D] [8]
Ryubing does not use `VK_GOOGLE_display_timing`, `VK_KHR_present_wait` or any present ID. A source search found no
use. [D] [8]

**MoltenVK mapping (upstream 5189f8de; the bundled package is 1.4.2-ryujinx.5).**

| Item | Behaviour | Source |
|---|---|---|
| Present modes offered | FIFO always; IMMEDIATE when supported; **no MAILBOX** | [13] MVKDevice.mm:2188-2192 |
| Image count | min 2, max 3, so Ryubing gets 3 | [13] MVKDevice.h:84-85 |
| FIFO | `displaySyncEnabled = YES` | [13] MVKSwapchain.mm:506 |
| IMMEDIATE | `displaySyncEnabled = NO`; minImageCount raised to the max only in the per-present-mode capabilities query, which Ryubing does not use (it still gets 3) | [13] MVKSwapchain.mm:506, MVKDevice.mm:2052-2054 |
| `maximumDrawableCount` | = image count | [13] MVKSwapchain.mm:505 |
| Present call | `present` inside a command-buffer scheduled handler; `present(at:)` when a desired present time is given (VK_GOOGLE_display_timing) | [13] MVKImage.mm:1661-1670 |
| Present feedback | `addPresentedHandler` reads `presentedTime`; stored as `actualPresentTime` in the past-presentation history; frame interval tracked for performance stats | [13] MVKImage.mm:1721-1729, MVKSwapchain.mm:166-180, 260-276 |
| Timing extensions | `VK_GOOGLE_display_timing`, `VK_KHR_present_id(2)`, `VK_KHR_present_wait(2)`, swapchain maintenance | [13] MVKExtensions.def:91-94, 123, 199 |
| `present(afterMinimumDuration:)`, `CAMetalDisplayLink` | Not used | [13] (no match) |

So in Switch and Custom modes, Ryubing on macOS is FIFO with 3 drawables, vsync on, and untimed presents. [D] [8][13]

**Ryujinx patch set.** A public mirror of the Ryujinx MoltenVK patches lists eight patches. One is "Avoid
direct-to-display when using asynchronous queue submissions": it forces `opaque = false` when queue submits are
asynchronous. That keeps the game layer composited by WindowServer even in fullscreen. [D] [14]

**Correction (independent verification).** The NuGet metadata is readable. The 1.4.2-ryujinx.5 package names its
source as the `Kenji-NX/MoltenVK` fork at commit 89cdc5fa (2026-07-13). [D] [37]
At that commit, `MVKSwapchain.mm` has no `opaque = false` override, and the commit history lists the other Ryujinx
patches (residency sets, concurrent compilation, VkImage retain, encodeWait) but no "Avoid direct-to-display"
commit. [D] [38] So the bundled package most likely does **not** carry the 0007 patch; the mirror's commits are
1.4.3 previews. [I]

The same fork commit matches upstream on everything in the table above: FIFO and IMMEDIATE only, a maximum of 3
images, `displaySyncEnabled` from the present mode, `presentAtTime` for a desired present time, `presentedTime` as
`actualPresentTime`, and `VK_GOOGLE_display_timing` exposed. [D] [38]

Direct-to-display is therefore not ruled out by this patch in the current build. Fullscreen latency and how
ProMotion picks rates still need fullscreen telemetry. [I]

### 3. Apple presentation APIs

- **`present(afterMinimumDuration:)`** (macOS 10.15.4+): presents once the work is complete "and a previous drawable
  has been visible onscreen for the specified duration. Use this method to schedule drawables at a regular interval." [D] [15]
  WWDC21 shows it as the way to cap a game on Adaptive-Sync displays (an example at 78 Hz). [D] [21]
- **`present(at:)`** (macOS 10.11+): presents at a Mach host time, or as soon as possible if the work finishes late. [D] [16]
- **`presentedTime` / `addPresentedHandler`** (macOS 10.15.4+): the host time when the drawable was shown. The value
  is 0.0 if the frame was dropped. [D] [17]
- **`CAMetalDisplayLink`** (macOS 14+): callbacks per frame with a target timestamp, for "variable-rate displays when
  you need more control over the timing window". [D] [18]
  `preferredFrameRateRange` is best effort; the system "typically" chooses a factor of the maximum refresh. [D] [18]
  `preferredFrameLatency` accepts only 1.0 or 2.0 frames, and the final latency "may be bigger … for windowed modes on
  macOS". [D] [18]
  Apple's sample for it is tied to WWDC23 session 10123. [D] [27]
- **`displaySyncEnabled`**: YES synchronises presents to refresh; NO may tear. [D] [19]
- **Variable refresh needs fullscreen.** WWDC21: "your app needs to be running in full-screen mode". Detection uses
  `NSScreen.minimumRefreshInterval` < `maximumRefreshInterval`. [D] [21]
  `displayUpdateGranularity` describes stepped rates: 0 means any rate is supported. [D] [20]

**ProMotion on the MacBook Pro.** On the owner's Mac, the built-in display reports: [M] [35]

| Property | Value |
|---|---|
| minimumRefreshInterval | 8.333 ms (120 Hz) |
| maximumRefreshInterval | 41.667 ms (24 Hz) |
| displayUpdateGranularity | 4.167 ms |
| Mode refresh rates | 47.95, 48, 50, 59.94, 60, 120 |

Reading the granularity per Apple's definition, the frame durations ProMotion can show are 8.33 + k × 4.17 ms:
120, 80, 60, 48, 40, 34.3, 30, 26.7 and 24 Hz. [D] [20]
Apple's header says the display "will update at the next boundary defined by the granularity, after the minimum refresh
interval has been reached", and its own example (30-120 Hz with 5 ms steps giving about 75, 55, 43 and 35 Hz) uses
the same min + k × granularity rule. [D] [20] The query was repeated read-only during verification with the same
values. [M] [35]

- **Can a game get true variable refresh on the built-in display?** Partly. The panel is variable (min < max) but
  quantised. A fullscreen game presenting at 40 or 48 FPS can be shown evenly. [I] [20][21][35]
  45 FPS has no exact duration: the best sequence is 20.8 / 20.8 / 25.0 ms, a ±2.8 ms error, against 16.7 / 25 ms
  steps at a fixed 120 Hz. [I]
- **Field evidence is mixed.** nxnative found that on an M4 Pro, TOTK in ProMotion fullscreen with a display link at
  latency 1 showed 68-1,640 of about 9,600 presents one refresh late per 180 s. Latency 2 reduced this to 17-18. [A] [4]
  A macOS 27 beta report on an M4 Pro MacBook Pro describes ProMotion cadence switching between 120 and 60 Hz. It
  measured a vsync-interval standard deviation of 4.09 ms, against 0.39 ms at fixed 60 Hz. It was open in beta 6. [A] [26]
  The owner runs a macOS 27 beta, so this may apply. [I]
- **Fixed rates available:** 60, 59.94, 50, 48 and 47.95 Hz. Apple lists 120 among the rates, and the mode list
  includes 120, but it is not confirmed whether a fixed (non-adaptive) 120 Hz can be selected separately from
  "ProMotion". [M] [35] [D] [25] Unknown.

**External Adaptive-Sync (macOS 12+).** Any Apple silicon Mac. The display must be connected "to the Thunderbolt or
USB-C image port … using a Thunderbolt, USB-C, or other DisplayPort-enabled cable. Do not use an HDMI cable or adapter."
On macOS 13+ it is enabled with "Variable or Adaptive" in the Refresh Rate menu. [D] [22]

The two MSI 274UPF E2 monitors currently report fixed 120 Hz (min = max interval), so variable refresh is not active
now. [M] [35]
One lists 144 and 160 Hz modes and the other does not, which suggests different links or cables. [M] [35] [I]
They remain the best DisplayPort Adaptive-Sync control case, once the owner enables "Variable" on a DP or Thunderbolt link. [I]

### 4. MacBook Pro M4 Pro to Sony A95L over HDMI 2.1

**Does macOS support HDMI Forum VRR?** The Apple documentation conflicts. [D] [22][23][24]

- Apple's Adaptive Sync article excludes HDMI. [D] [22]
- Apple's "Use an 8K display with your Mac" (2025-03-18) says certain Macs support 8K, 4K up to 240 Hz "and expanded
  support for variable refresh rate (VRR)". It tells users to connect HDMI directly and to enable VRR in the display's
  menus ("game mode" on some TVs). Its list covers M2/M3 Pro and Max MacBook Pros, not M4. [D] [23]
- "Connect to HDMI from your Mac" (2026-09-21) lists the M4 Pro MacBook Pro for 8K60 and 4K240, "Adapters aren't
  supported for these resolutions and refresh rates". It does not mention VRR. [D] [24]

User reports (LG OLEDs only):

- BetterDisplay's maintainer documents "120Hz VRR" low-level modes on an LG C5 via a hidden menu. [A] [32]
- A Mac mini M4 user reports that VRR modes disappeared at some resolutions after macOS 15.1. [A] [34]
- An M4 MacBook Pro to LG C4 thread has no confirmed VRR. [A] [33]
- No report was found for any Sony TV. [I]

Conclusion: HDMI VRR from this Mac to the A95L is **plausible but unverified**. [I]

**A95L VRR implementation.**

- HDMI 2.1 features (4K120, VRR, ALLM) are on two 48 Gbps inputs, HDMI 3 and 4; one of them is the eARC port. [A] [29][30]
- The input needs the "Enhanced" HDMI signal format; Sony warns that Enhanced may misbehave with some devices. [D] [31]
- The VRR range is 48-120 Hz per one lab review. RTINGS-derived data gives a 4K VRR maximum of 120 Hz and a minimum under
  20 Hz, which implies LFC from the tested source. [A] [28][29]
- G-SYNC Compatible: yes; FreeSync: no (RTINGS). [A] [28] A Clubic spec sheet lists FreeSync; other reviews mark it
  absent. Treat FreeSync as unsupported until shown otherwise. [A] [39]
- Input lag is about 17 ms at 60 Hz and 8-9 ms at 120 Hz. [A] [29]

These values come from third-party reviews and from search-engine extracts of RTINGS pages. The RTINGS pages render
client-side and could not be read directly. [I] Access failure.

Because the A95L most likely has no FreeSync, VRR from a Mac would have to be HDMI Forum VRR. [I]

**If VRR is unavailable: refresh-compatible fallbacks.** Holds are in panel refreshes, with frames presented on the
first refresh after their ideal time. [I, arithmetic]

| Panel rate | 30 FPS | 40 FPS | 45 FPS | 48 FPS | 50 FPS | 60 FPS |
|---|---|---|---|---|---|---|
| 120 Hz | 4 (even) | 3 (even) | 3,3,2 (16.7/25 ms) | 3,2 | uneven | 2 (even) |
| 100 Hz | 4,3,3 | 3,2 | 3,2,2,2 | uneven | 2 (even) | 2,2,1 |
| 90 Hz (custom) | 3 (even) | uneven | 2 (even) | uneven | uneven | 2,1 |
| 60 Hz | 2 (even) | 2,1 | 2,1,1 | 2,1,1,1 | uneven | 1 (even) |
| 48 Hz (built-in only) | uneven | uneven | uneven | 1 (even) | - | - |
| ProMotion (4.17 ms steps) | 33.3 ms (even) | 25.0 ms (even) | 20.8/20.8/25.0 | 20.8 ms (even) | uneven | 16.7 ms (even) |

- The A95L accepts 4K at 120 Hz on its HDMI 2.1 inputs. [A] [29] Sony's help guide names 4K 100/120 Hz formats but
  says support "depends on your model/region/country", so 100 Hz for the A95L is not confirmed there. [D] [31]
  Whether macOS offers 100 Hz for it is unknown until the TV is connected. [I]
- A 90 Hz mode is not a standard TV timing. macOS has no built-in custom-resolution editor, and third-party EDID
  overrides are untested here. Treat 90 Hz as unlikely. [I]
- **HDR and 120 Hz may exclude each other on external displays.** BetterDisplay's maintainer reports a DCP framebuffer and
  pixel-clock limit that blocks HDR at high refresh above a size. 120 Hz HDR works up to 2432x1368 HiDPI; a hidden-mode
  bypass risks a "green screen" on some models. [A] [32]
  The limit is on the scaled (HiDPI) framebuffer size, with a 4K output signal, not on 4K120 output itself. It was
  reported in January 2024 (macOS 14, M1 Max and M3 Max) and is untested on an M4 Pro with macOS 27. [A] [32]
  This must be checked together with the HDR note before choosing 4K120 as the TV default. [I]

### 5. True frame-time measurement

**Timestamps available.**

| Stage | Source | Status |
|---|---|---|
| Guest present (buffer queued) | SurfaceFlinger `QueueBuffer` / `Compose` acquire time, plus the item's `SwapInterval` | Needs a small Ryubing patch [6] [I] |
| Guest vsync tick | `HandleComposition` loop, each `SignalVsync` | Needs a patch [6] [I] |
| Host submit | `Window.Present` before `vkQueuePresentKHR` | Needs a patch [8] [I] |
| On-screen time | `presentedTime` via `addPresentedHandler`; exposed by MoltenVK as `actualPresentTime` in `vkGetPastPresentationTimingGOOGLE` | Available; Ryubing must enable the extension and pass present IDs [13][17] |
| Frame dropped | `presentedTime == 0.0` | Available [17] |
| Averages only, no code | `MVK_CONFIG_PERFORMANCE_TRACKING=1` logs the frame interval from presented callbacks (average / min / max) | Available [13] |

The Metal HUD is not a substitute. It reports ~117 presents a second at the 120 Hz cadence, possibly from another layer,
and it forces shader recompilation. [M] [36]

**Display-side capture.** No purchases are planned, so these are options only:

- The phone camera's slow motion (240 fps) can show repeated frames. Scenes need a moving reference, and the method is coarse. [I]
- An HDMI 2.1 capture device that supports 4K120 or 1080p120 would record exact cadence. That is equipment the project does not have. [I]
- A photodiode latency tester (LDAT / OSRTT class) would add latency measurement. Also not available. [I]
- The A95L's own signal-info overlay may show the incoming refresh or VRR state. The menu is not documented for VRR state. [I] Gate.

**Metrics** for every run, from `presentedTime` deltas:

- Frame-interval p50, p90, p99 and p99.9, plus the maximum.
- Standard deviation of intervals and of interval-to-interval change (jitter).
- **Cadence error rate**: the share of frames whose on-screen hold differs from the expected pattern for the cap and panel
  rate (for 45 at 120 Hz, the pattern 3,3,2).
- **Missed vsyncs**: frames held longer than planned, and drops (`presentedTime = 0`).
- **Speed-weighted judder index**: the mean of |content step − on-screen hold| per frame. It needs the game's step,
  which D2 writes to a known float field. [I]
- Mismatch between guest-present rate and on-screen rate (frames merged or repeated).

**Game-speed verification.**

- The walk test, already established. [M] [1]
- The in-game clock against a stopwatch: 1 in-game minute ≈ 1 real second, target 1.00 ± 0.01. [M] [2]
- A sprint-to-exhaustion test. [M] [2]
- A fixed animation timed from `presentedTime`-stamped frames, such as opening a chest or a door, or the time between
  footstep sounds. [I]
- Audio drift: record the output and compare beat-to-beat intervals of a looped track against baseline. That needs a
  loopback capture device on macOS, which is not installed. [I]

---

## Implications for TOTK Luma

1. **Caps are speed-correct only with a measured-time or host-step patch.** Without D2, ship only "30 (native)". Vanilla
   TOTK steps by interval, so any non-60 guest vsync changes game speed. [I]
2. **Implement caps as guest vsync rates, never as Unbounded.** 30 = Custom 30, 45 = Custom 45, 60 = Switch 60. [D] [7] [I]
   Replace Ryubing's cycling hotkey with direct selection. Refuse Unbounded and turbo while D2 is active. [D] [9] [I]
3. **Lock the guest vsync to the display.** The SurfaceFlinger timer should take its ticks from a display link
   (`CAMetalDisplayLink` on macOS 14+, or `CVDisplayLink`), with a 60 Hz virtual tick when the panel runs at 120 Hz.
   This follows nxnative's "vsync event follows the display link" pattern. [D] [4] [I]
   This removes the slow beat between a free-running 60.000 Hz timer and the real panel rate. [I]
4. **Timed presents for non-divisor caps on variable displays.** Enable `VK_GOOGLE_display_timing` in Ryubing's Vulkan
   window. Pass a desired present time (MoltenVK turns it into `present(at:)`), and read back `actualPresentTime` for
   telemetry. [D] [13] [I]
5. **Per-display cap policy (defaults, subject to the gates).**
   - Built-in, fixed 60 Hz: offer 30 and 60.
   - Built-in, ProMotion fullscreen: offer 30, 40, 48 and 60. Present "45" as **40 or 48**, unless a measured run shows that
     45's 20.8 / 25.0 ms alternation looks acceptable.
   - Built-in 48 Hz mode: a clean 48 cap (D2 already reaches 45-48 on the island). [M] [1] [I]
   - A95L fixed 120 Hz: 30, 40 and 60.
   - A95L with verified VRR: 30, 45 and 60, with host frame doubling below the 48 Hz floor.
6. **Do our own LFC.** If VRR works but the source does not double frames, present each frame twice for 30 and 45
   (60 / 90 Hz). [I]
7. **Movies at 30.** Detect movie playback, such as emulated NVDEC activity if TOTK uses it, and drop the cap to 30 for
   its duration. This follows nxnative. [D] [4] [I]
8. **Telemetry first.** A per-frame ring buffer with guest present, host submit, `presentedTime`, cap, panel rate and the
   D2 step, feeding the dashboard toggle. No cadence claim should be made without it. [I]
9. **Keep fullscreen behaviour explicit.** Variable refresh requires fullscreen. [D] [21]
   The opaque=false patch would keep the layer composited, but the bundled 1.4.2-ryujinx.5 build most likely lacks it. [D] [14][38] [I]
   nxnative needed latency 2 on M4 Pro ProMotion fullscreen. [A] [4]
   Test fullscreen and windowed separately.

---

## Options compared

| Option | Speed correct | Even cadence | Effort | Risk |
|---|---|---|---|---|
| A. Vanilla 30 (Switch mode) | Yes | Yes at 60/120 Hz (20 FPS dips in CPU-bound areas) | None | Low |
| B. D2 + Switch mode (uncapped to 60) | Yes [M] | No: 38-51 FPS varies, judder at fixed rates | Done | Physics, movies, audio unvalidated |
| C. D2 + Custom 45 / 40 cap | Yes (by design; tested at 30) | 40: even at 120 Hz and ProMotion; 45: only on VRR | Low | Same as B, plus the run-ahead hotkey |
| D. C + display-locked vsync + timed presents | Yes | Even wherever the cap divides the panel; best possible on ProMotion | Medium | Ryubing patch, upstream drift |
| E. D + host LFC on A95L VRR | Yes | Even at 30/45/60 if HDMI VRR works | Medium | VRR support on macOS unknown |
| F. nxnative-style step in whole vsyncs | Yes; step = on-screen hold | Even motion even with uneven holds | High | Needs host-to-guest state; diverges from D2 |

Recommended path: A as the safe default; C as the first opt-in mode with 30 and 40 caps; D before calling any mode
"smooth"; E only after gate G6-1.

---

## Unknowns and evidence gates

| Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|
| G6-1: does macOS offer HDMI VRR to the A95L (a "Variable" refresh option, and the TV showing VRR active)? | Decides whether 45 can be smooth on the TV | Owner-attended: connect to HDMI 3 or 4 with a 48 Gbps cable and Enhanced format; check Displays settings and the TV signal info. Note the macOS 27 build | Display gate, owner present |
| G6-2: which modes macOS lists for the A95L (100 Hz? 1440p120? HDR at 4K120?) | Fallback table and the HDR trade-off | Same session: list modes read-only (a CGDisplayMode query like [35]) | Display gate |
| G6-3: does TOTK use emulated NVDEC for movies? | Automatic 30 FPS for movies | Log NVDEC calls during an intro movie (log only) | Phase: D2 validation |
| G6-4: D2 audio, physics and long sessions | Correctness at any cap | Protocol rows d, e and g at 30, 40, 45 and 60; 30+ minute session | Phase: D2 validation |
| G6-5: actual on-screen cadence of Custom 40 / 45 on ProMotion and at fixed 60 Hz | All smoothness claims | Telemetry patch: `presentedTime` percentiles, cadence error rate | Telemetry gate |
| G6-6: does the fullscreen layer go direct-to-display with 1.4.2-ryujinx.5 (source commit 89cdc5fa has no 0007 opaque=false patch), and would adding 0007 change ProMotion behaviour? | Fullscreen latency and VRR | Compare fullscreen telemetry with and without the patch | Build gate |
| G6-7: macOS 27 beta ProMotion cadence bug | Could break the ProMotion path regardless of our code | Compare ProMotion and fixed 60 Hz telemetry on the same scene | Telemetry gate |
| G6-8: is a fixed 120 Hz selectable on the built-in display? | 40-cap fallback without ProMotion | Owner looks at Displays settings (read-only) | Display gate |
| G6-9: DP Adaptive-Sync control on an MSI monitor | Proves our timed presents behave on known-good VRR | Owner enables "Variable" on a DP link; run the telemetry test | Optional control |
| G6-10: does `CAMetalDisplayLink` honour a 40-45 Hz preferred range on this panel? | Choice of vsync source | Small probe in the TOTK Luma host, owner-attended (it opens a window) | Prototype phase |

---

## Risks

- **False smoothness.** Status-bar FPS can read 45 while the panel shows 16.7 / 25 ms alternation. No cadence claims
  should be made without `presentedTime` data. [M] [36] [I]
- **Run-ahead under D2** through Unbounded, turbo or a Custom value above 60. Save corruption is not expected, but
  physics and time-of-day would advance too fast. [D] [3] [I]
- **Movies at 1.5-2x** with audio desync until auto-30 exists. [D] [4] (2x measured on BotW) [I] (1.5x, and TOTK under D2)
- **Beta OS.** ProMotion cadence instability is reported on macOS 27 beta. [A] [26]
- **HDMI 2.1 on TVs is fragile on macOS.** There are reports of modes disappearing per version and of HDR versus
  refresh limits. [A] [32][34]
- **Upstream drift.** Presentation patches touch Ryubing's Vulkan window and SurfaceFlinger, which change between canaries.
  KosmicKrisp (PR !131) would replace MoltenVK's presentation behaviour entirely. [I]
- **Licensing.** D2 draws facts from FPSLocker (no licence file) and code ideas from MIT projects. Shipping the patch
  publicly needs its own review; this note reproduces no offsets. [M] [3]

---

## Effort notes

| Work item | Estimate | Assumptions |
|---|---|---|
| Telemetry (guest present, host submit, `presentedTime` via VK_GOOGLE_display_timing, CSV ring buffer) | 2-4 days | MoltenVK history works as read; small Ryubing patch |
| Cap UI (30 / 40 / 45 / 60), no Unbounded with D2, hotkey replacement | 1-2 days | Reuses Custom VSync |
| Display-locked guest vsync (display link ticks, virtual 60 at 120 Hz) | 4-8 days | Main-thread display-link plumbing in Avalonia; fallback timer kept |
| Timed presents and host LFC | 3-6 days | VK_GOOGLE_display_timing path in MoltenVK is reliable |
| Movie auto-30 | 2-5 days, or blocked | Only if movies go through NVDEC |
| Per-display validation sessions | 0.5 day each × 4-6 configurations | Owner present for display changes |
| nxnative-style whole-vsync step (option F) | 2-4 weeks | New game patch, plus host-to-guest shared state |

---

## Sources

1. Private local evidence workspace, `PHASE1-RESULT.md` §2 and §5 (D2 FPS, walk test, save test), 2026-11-01. Accessed 2026-11-01.
2. Private local evidence workspace, phase 1 dynfps agent `test-protocol.md` (D2 test protocol, decisions, expected results). Accessed 2026-11-01.
3. Private local evidence workspace, D2 candidate patch header comments (design, clamp 15-60, present interval 1; offsets deliberately omitted). Accessed 2026-11-01.
4. seedds/nxnative (MIT), `docs/reference/frame-rate.md`; upstream last change to the path c4b0618c34 (2026-11-01). Read from a copy in the private local evidence workspace. https://github.com/seedds/nxnative/blob/main/docs/reference/frame-rate.md. Accessed 2026-11-01.
5. seedds/nxnative, `dm/games/0100F2C0115B6000/README.md`, "Frame rate" section (same copy). Accessed 2026-11-01.
6. Ryubing 9afba70, `src/Ryujinx.HLE/HOS/Services/SurfaceFlinger/SurfaceFlinger.cs` lines 80-95, 298-400, 536-541.
7. Ryubing 9afba70, `src/Ryujinx.HLE/Switch.cs` lines 100-151; `src/Ryujinx.Cpu/ITickSource.cs` line 11.
8. Ryubing 9afba70, `src/Ryujinx.Graphics.Vulkan/Window.cs` lines 114-143, 229-297, 642-647.
9. Ryubing 9afba70, `src/Ryujinx.Common/Configuration/VSyncMode.cs` lines 15-18; `src/Ryujinx/Systems/AppHost.cs` lines 308-328.
10. Ryubing 9afba70, `src/Ryujinx/UI/ViewModels/MainWindowViewModel.cs` lines 569-583; `src/Ryujinx/Systems/Configuration/ConfigurationState.cs` lines 204-206.
11. Ryubing 9afba70, `src/Ryujinx/Systems/AppHost.cs` lines 1127-1166.
12. Ryubing 9afba70, `Directory.Packages.props` line 77 (Ryujinx.Graphics.Vulkan.MoltenVK 1.4.2-ryujinx.5).
13. KhronosGroup/MoltenVK at 5189f8de (2026-10-13): `MVKDevice.mm`, `MVKDevice.h`, `MVKSwapchain.mm`, `MVKImage.mm`, `MVKQueue.mm`, `Layers/MVKExtensions.def`, `Docs/MoltenVK_Configuration_Parameters.md`. https://github.com/KhronosGroup/MoltenVK. Accessed 2026-11-01.
14. V380-Ori/Ryujinx.MoltenVK at 45f9b641 (2026-08-28), `0007-Avoid-direct-to-display-when-using-asynchronous-queu.patch` (2026-07-05). https://github.com/V380-Ori/Ryujinx.MoltenVK. Accessed 2026-11-01.
15. Apple, MTLDrawable `present(afterMinimumDuration:)`. https://developer.apple.com/documentation/metal/mtldrawable/present(afterminimumduration:). Accessed 2026-11-01.
16. Apple, MTLDrawable `present(at:)`. https://developer.apple.com/documentation/metal/mtldrawable/present(at:). Accessed 2026-11-01.
17. Apple, MTLDrawable `presentedTime` and `addPresentedHandler(_:)`. https://developer.apple.com/documentation/metal/mtldrawable/presentedtime. Accessed 2026-11-01.
18. Apple, `CAMetalDisplayLink`, `preferredFrameRateRange`, `preferredFrameLatency`. https://developer.apple.com/documentation/quartzcore/cametaldisplaylink. Accessed 2026-11-01.
19. Apple, CAMetalLayer `displaySyncEnabled`. https://developer.apple.com/documentation/quartzcore/cametallayer/displaysyncenabled. Accessed 2026-11-01.
20. Apple, NSScreen `minimumRefreshInterval` and `displayUpdateGranularity`. https://developer.apple.com/documentation/appkit/nsscreen/displayupdategranularity. Accessed 2026-11-01.
21. Apple WWDC21 session 10147, "Optimize for variable refresh rate displays". https://developer.apple.com/videos/play/wwdc2021/10147/. Accessed 2026-11-01.
22. Apple Support 102144, "Use an Adaptive Sync external display with your Mac" (published 2026-07-16). https://support.apple.com/en-us/102144. Accessed 2026-11-01.
23. Apple Support HT213513, "Use an 8K display with your Mac" (published 2025-03-18). https://support.apple.com/en-us/HT213513. Accessed 2026-11-01.
24. Apple Support 108928, "Connect to HDMI from your Mac" (published 2026-09-21). https://support.apple.com/en-us/108928. Accessed 2026-11-01.
25. Apple Support HT210742, "Change the refresh rate on your MacBook Pro or Apple display" (published 2026-03-10). https://support.apple.com/en-us/HT210742. Accessed 2026-11-01.
26. Apple Developer Forums thread 840214, "macOS 27 beta: ProMotion refresh cadence is unstable" (July-September 2026, FB24091347). https://developer.apple.com/forums/thread/840214. Accessed 2026-11-01.
27. Apple sample code, "Achieving smooth frame rates with a Metal display link" (WWDC23 10123). https://developer.apple.com/documentation/metal/achieving-smooth-frame-rates-with-a-metal-display-link. Accessed 2026-11-01.
28. RTINGS, Sony A95L review and comparison pages (VRR max 120 Hz, min under 20 Hz, G-SYNC yes, FreeSync no). Values taken from search-engine extracts; the page body is rendered client-side. https://www.rtings.com/tv/reviews/sony/a95l-oled. Accessed 2026-11-01.
29. Choose.tv (Wybierz.tv), "Sony A95L QD-OLED Review" (VRR 48-120 Hz, 2× HDMI 2.1, input lag). https://www.choose.tv/us/tv/reviews/sony/sony-a95l_ADO. Accessed 2026-11-01.
30. AVForums, "Sony A95L (XR-65A95L) review" (two HDMI 2.1 inputs with VRR, ALLM, 4K120; search extract). https://www.avforums.com/reviews/sony-a95l-xr-65a95l-bravia-4k-qd-oled-tv-review.21228/. Accessed 2026-11-01.
31. Sony Help Guide (BRAVIA 9/8/7/5, A95L…), "HDMI signal format". https://helpguide.sony.net/tv/musltn1/v1/en-003/contents/TP1001675611.html. Accessed 2026-11-01.
32. waydabber/BetterDisplay discussion #2567, "Bypass Apple HDR restriction at high refresh rates" (2024-01 to 2026-01). https://github.com/waydabber/BetterDisplay/discussions/2567. Accessed 2026-11-01.
33. MacRumors forums, "M4 MacBook Pro HDMI" (April 2025). https://forums.macrumors.com/threads/m4-macbook-pro-hdmi.2455678/. Accessed 2026-11-01.
34. MacRumors forums, "For LG OLED users: Mac mini M4 does not support HiDPI 4k over HDMI 2.1" (late 2024; search extract). https://forums.macrumors.com/threads/for-lg-oled-users-mac-mini-m4-does-not-support-hidpi-4k-over-hdmi-2-1.2442797/page-2. Accessed 2026-11-01.
35. Read-only NSScreen / CGDisplayMode query run for this note on the owner's Mac (no window, no setting changed), 2026-11-01.
36. Private local evidence workspace, `TOTK-1.4.3-FINAL-REPORT.md` (measurement caveats, Room of Awakening 20 FPS, Metal HUD cadence). Accessed 2026-11-01.
37. NuGet, `Ryujinx.Graphics.Vulkan.MoltenVK` 1.4.2-ryujinx.5 nuspec (authors V380-Ori, KeatonTheBot; repository Kenji-NX/MoltenVK, commit 89cdc5faab8deb61001e5e3ca2507721c7b8190f). https://api.nuget.org/v3-flatcontainer/ryujinx.graphics.vulkan.moltenvk/1.4.2-ryujinx.5/ryujinx.graphics.vulkan.moltenvk.nuspec. Accessed 2026-11-01.
38. Kenji-NX/MoltenVK at 89cdc5fa (2026-07-13, fork of KhronosGroup/MoltenVK, branch `ryujinx`): `MVKSwapchain.mm`, `MVKDevice.mm`, `MVKImage.mm`, `Layers/MVKExtensions.def` and the commit list. https://github.com/Kenji-NX/MoltenVK/commit/89cdc5faab8deb61001e5e3ca2507721c7b8190f. Accessed 2026-11-01.
39. Clubic, Sony Bravia XR-65A95L spec page (lists VRR, FreeSync and G-Sync; search extract). https://www.clubic.com/507238-sony-bravia-xr-65a95l.html. Accessed 2026-11-01.

**Access failures.**

- plugable.com blog "HDMI 2.1 on Mac": HTTP 429 twice.
- kb.plugable.com macOS 26 guides: redirected to a login page.
- sony-asia.com and sony.ca support article 00246472: HTTP 403.
- sony.com.hk A95L spec page: HTTP 403.
- rtings.com review and macOS-compatibility pages: HTTP 200, but the data is client-rendered and was not readable.
- git.ryujinx.app issue API: v4 returned HTTP 405 and v1 returned no JSON.
- NuGet registration for Ryujinx.Graphics.Vulkan.MoltenVK: not readable by the author; the flat-container nuspec [37] was readable during verification.
- Apple documentation pages render client-side; during verification their text was read from the documentation JSON
  (developer.apple.com/tutorials/data/documentation/…) and the macOS SDK header `NSScreen.h`.

---

## Independent verification

Done on 2026-11-01 by a separate reviewer. Each claim was re-checked against the source code, the vendor text or the
private local evidence, and the reviewer tried to refute it. Nothing was built or run except one read-only screen
query (no window, no setting changed).

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| Vanilla TOTK 1.4.3 picks interval 2 (30) or 3 (20) and steps game time by 60 / fps | Confirmed | nxnative TOTK README "Frame rate": "2 = 30 fps, 3 under load ... steps its game time by 60 / fps (int fps ...)" [5]; upstream path last changed at c4b0618c34, same as the copy read | The "base interval 2" VFR detail is documented for BotW 1.9.0 [4]; for TOTK it is the same engine family [I] |
| D2 steps from measured time, clamp 15-60, present interval 1; walk scale 0.995-0.998 (~48 FPS) and 0.995-1.005 (Custom 30); save written under D2 loads | Confirmed | D2 header: "fps = 19,200,000 / last-frame ticks, clamped to [15, 60]", "Present interval requested = 1" [3]; `PHASE1-RESULT.md` §2 table and §5 save test [1] | §2 alone says no save was written; the §5 addendum adds the write test, so [1] must keep citing §5 |
| Ryubing guest vsync is a free-running `Stopwatch` timer at `TargetVSyncInterval` (Switch 60, Custom N, Unbounded 1) | Confirmed | 9afba70 `SurfaceFlinger.cs` `UpdateSwapInterval` and `HandleComposition` (3-period cap, spin under 2 ms, 17 ms wait at interval 0); `Switch.cs` `UpdateVSyncInterval` [6][7] | No display-link input anywhere in the loop |
| Custom 45 = UI 75 %; with D2 a speed-correct 45 cap | Partly confirmed | `MainWindowViewModel.cs`: `(int)((value / 100f) * 60)` gives 45 at 75 % [10]; the game's swap interval is still honoured (`_swapIntervalDelay`) [6] | Speed correctness at 45 stays [I]; only 30 was tested [1]. Without D2, interval 2 at 45 Hz gives 22.5 FPS at 0.75x speed, as stated |
| Under D2, Unbounded / turbo / Custom > 60 run ahead; the hotkey cycles through Unbounded | Hotkey confirmed; run-ahead corrected to [I] | `VSyncMode.Next` [9]; turbo changes `TickScalar`, which shortens `_ticksPerFrame` [6][7]; the 60 FPS clamp is in the D2 header [3] | Run-ahead follows from the design but was never measured, so its tag changed from [D] to [I] |
| Ryubing: IMMEDIATE only for Unbounded, else MAILBOX if offered, else FIFO; `MinImageCount + 1`; no `VK_GOOGLE_display_timing` | Confirmed | 9afba70 `Window.cs` `ChooseSwapPresentMode` and image count [8]; `git grep` for display_timing / PresentWait / PresentId in `src` found nothing | |
| MoltenVK offers FIFO and IMMEDIATE only, max 3 images, `displaySyncEnabled` = not IMMEDIATE; `present(at:)` only with a desired time; `presentedTime` as `actualPresentTime`; no `present(afterMinimumDuration:)` or `CAMetalDisplayLink` | Confirmed, and extended to the bundled build | Upstream 5189f8de (2026-10-13) and tag v1.4.2 read directly; the package's own source commit Kenji-NX 89cdc5fa shows the same code and the same extensions [13][37][38] | The IMMEDIATE min-count raise applies only to the per-present-mode capabilities query; table row clarified |
| 0007 opaque=false patch: unverified whether 1.4.2-ryujinx.5 carries it | Corrected | The nuspec is readable and names Kenji-NX/MoltenVK 89cdc5fa [37]; that commit has no `opaque = false` override and no "Avoid direct-to-display" commit [38] | The bundled package most likely does not carry 0007; section 2, implication 9 and G6-6 updated |
| Built-in display: min 8.333 ms, max 41.667 ms, granularity 4.167 ms, modes 47.95-120; durations min + k × granularity | Confirmed; granularity reading upgraded to [D] | Repeated read-only query gave the same values; external MSI screens min = max = 8.333 ms [35]; `NSScreen.h`: "update at the next boundary defined by the granularity, after the minimum refresh interval" [20] | The 45 FPS alternation (20.8 / 20.8 / 25.0 ms) remains [I] |
| Apple: Adaptive Sync excludes HDMI; HT213513 mentions VRR over direct HDMI for M2/M3 Pro/Max; 108928 lists the M4 Pro for 8K60/4K240 without VRR | Confirmed | 102144 (2026-07-16): "Do not use an HDMI cable or adapter"; HT213513 (2025-03-18): "expanded support for variable refresh rate (VRR)", list stops at M3; 108928 (2026-09-21): M4 Pro listed, no VRR mention [22][23][24] | HDMI VRR for this Mac stays unverified (gate G6-1) |
| A95L: HDMI 2.1 VRR on HDMI 3/4, 48-120 Hz, G-SYNC yes, FreeSync no | Partly confirmed, [A] kept | Choose.tv: "VRR range: 48 - 120Hz", two 48 Gbps HDMI 2.1 ports, one eARC, "G-Sync: Yes", 8 ms at 120 Hz, 17 ms at 4K60 [29] | Port numbers come from Sony answers for sibling models; Clubic lists FreeSync [39]; Sony's guide does not confirm 100 Hz for this model [31]. Text adjusted |
| HDR at 120 Hz limited to about 2432x1368 HiDPI (BetterDisplay maintainer) | Confirmed, with scope | Discussion #2567, maintainer reply 2024-01-25: "120Hz HDR should work up to 2432x1368 HiDPI (with 4K output)"; 2025-12-20 note on a hidden-mode bypass and "green screen of death" [32] | The limit is on the scaled framebuffer, reported on macOS 14 with M1 Max/M3 Max; untested on M4 Pro / macOS 27 |
| macOS 27 beta ProMotion cadence report (stdev 4.09 vs 0.39 ms); nxnative M4 Pro latency-1 misses | Confirmed | Forum thread 840214: M4 Pro, 27.0 beta 26A5388g, 4.093 ms vs 0.391 ms, FB24091347, still open at beta 6 [26]; nxnative frame-rate.md: "68 to 1,640 of about 9,600 presents a refresh late per 180 s", latency 2 "17 and 18" [4] | The owner's build (27.2, 26B5091g) is later than the reported one; whether it is fixed is unknown |
| Movies run at about game-FPS / 30 speed because one picture is taken per game frame | Partly confirmed | nxnative "Movies hold 30 fps": "takes one picture from the decoder per game frame", measured on BotW 1.9.0; TOTK has "the same `subsdk0` movie library" [4] | 2x at 60 is documented for BotW; 1.5x at 45, and TOTK under D2, are [I]; nxnative's own fix is not yet game-validated |

**Arithmetic check.** The refresh-hold table was recomputed: 45 FPS at 120 Hz is 3, 3, 2 (8 refreshes per 3
frames), 30 at 100 Hz is 4, 3, 3, 60 at 100 Hz is 2, 2, 1, and the ProMotion durations 33.3 / 25.0 / 20.8 / 16.7 ms
all lie on 8.33 + k × 4.17 ms. No error was found.

**Not re-checked.** The WWDC21 full-screen quote, the AppHost render-loop description, `RecordGameFrameTime`
placement and the effort estimates were not independently re-verified.
