# Unknowns, risks and gates

Status: Proposed, 2026-11-01

This page lists three things:

- what is **not yet known** (unknowns);
- what **could go wrong** (risks);
- what must be **approved, reached, installed, measured or cleared** before each phase can start or finish (gates).

It follows ADRs 0001-0006 in `docs/adr/`. Every ADR is Proposed and waiting for the owner's approval, and this page changes
no decision in them. Nothing here authorises production emulator work, a merge, a deploy or a purchase.

---

## How to read this page

**Evidence tags** follow AGENTS.md: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal.

**Citations.** `R05 §3` means research note 05, section 3. `[E]` means the prior local evidence summary
(`docs/evidence/prior-local-evidence.md`). `ADR 0002` means `docs/adr/0002-*.md`. Where a note's "Independent verification"
section corrected a claim, this page uses the corrected version.

**Identifiers.**

- `U-xx` are unknowns, `RISK-xx` are risks.
- Research note 02 has its own unknowns, U1 to U9. To avoid a clash, this page cites them as "R02 U1" and so on.
- Gates keep the names the ADRs already use (G-AB, G6-1, G-INP-2, G-HDR-1 and so on).
- New gates added here use these prefixes: G-OWN (owner approval), G-ACC (access), G-SW (software install),
  G-SEC (security or TCC) and G-LIC (licence).

**Likelihood and impact** are rated Low, Medium or High. These ratings are judgement `[I]`.

**Effort figures** are estimates `[I]` taken from the notes and ADRs, and a range is always an estimate.

**Phases** are P0 to P5, as defined in the ADR index (`docs/adr/README.md`). One person-week is written "pw".

**"Attended"** means the owner is present at the Mac. "Uncontended" means no other heavy work is running on it.
No long benchmark runs happen in the specification phase. Every measurement listed below is a plan, not a run.

---

## 1. At a glance

These five items limit the plan more than anything else:

1. **Owner approvals come before any code.** The architecture, the fork's location, the private title pack and the D2 patch
   all need a yes first (section 4.1).
2. **Most exit gates need an attended session**: the A+B flash validation, the GPU capture session, the DualSense check and
   the A95L display session. They should be scheduled in batches.
3. **Scene HDR (P3) carries the most uncertainty.** The render-target upgrade repeats the kind of change that sank Ryubing
   PR !31, so the owner sets a person-week ceiling, with a labelled fallback behind it (RISK-03, RISK-05).
4. **HDMI VRR from this Mac to the A95L is unverified.** Apple's own pages conflict (R06 verification). Until gate G6-1
   passes, a 45 FPS cap on the TV cannot be smooth.
5. **The graphics layer is in transition.** Khronos deprecated MoltenVK in commit `0aa76ad` (2026-10-13), and community
   maintenance is now best-effort [D]. The KosmicKrisp driver that replaces it comes as a prebuilt binary, which needs a
   separate owner decision (G-ACC-KK).

---

## 2. Unknowns register

The unknowns from all ten research notes, merged and de-duplicated. The "Needs" column says what resolving each one takes:
hardware, the owner's presence or decision, or access to something.

### 2.1 Build, backend and upstream

| ID | Unknown | Why it matters | How to resolve | Needs | Phase |
|---|---|---|---|---|---|
| U-01 | Does a clean rebuild from `build-manifest.json` reproduce the executable and dylib hashes? | Every measurement must name an exact binary (ADR 0001) | Two clean rebuilds from the same queue tag; compare SHA-256 values (G-BUILD) | The Mac; the owner's agreement to build, because builds compete for CPU (R10 §3.6) | P0 |
| U-02 | At run time, does MoltenVK `1.4.2-ryujinx.5` expose `VK_GOOGLE_display_timing`, and map colour spaces as upstream does? | Telemetry and timed presents (G-TEL); the EDR output format | Partly resolved: the package names Kenji-NX `89cdc5f`, whose `MVKSwapchain.mm` is untouched and whose extensions match upstream [D] (R03, R06 verification). Still to do: log the device extensions and the chosen format pair at startup | A dev build | P0 |
| U-03 | Does Ryubing enable `VK_EXT_swapchain_colorspace` (through its external `VulkanHelper`)? | Needed for correct use of `EXTENDED_SRGB_LINEAR`. KosmicKrisp only offers extra colour spaces when this extension is enabled [D] (R03 verification) | Read the dependency source; check the validation-layer log (R02 U6) | None | P1 |
| U-04 | Does A+B remove the flashes seen with the hypervisor On? | Sets the default CPU profile. The Room of Awakening runs at 20.0 FPS with the hypervisor Off and 29.4-30.8 with it On [E] | At least 900 s per scene in the Room and on the island, tested against 0.012 flashes/s with a Poisson test (G-AB) | Attended; uncontended Mac; warm cache | P0 |
| U-05 | Is `PAL_MachExceptionMode=4` safe, and does it help? | It could recover part of the write-tracking cost (about 27% of the guest main thread) [E], but it may turn managed null references into crashes [D]/[I] (R05 §1.5) | A private boot plus 10 minutes of play | Owner approval; only if G-AB fails | P5 |
| U-06 | How does KosmicKrisp do on TOTK, and what does the PR !131 package support (geometry shaders, transform feedback, subgroup stages)? | The strategic backend choice (G-KK). The Mesa 26.2 base has no geometry shaders and no transform feedback [D] (R05 verification) | Run `vulkaninfo` against the package; scan for artefacts in a warm 900 s C2 run | A driver, through G-ACC-KK | P5 |
| U-07 | Can `VK_EXT_metal_objects` export Ryubing's final present image, with `MTLSharedEvent` sync, on `1.4.2-ryujinx.5`? | The only route to the native Swift presenter | A 1-day spike with an SDR identity check (G-NATIVE) | Only if G-PRES-1, 2 or 3 fails; needs the Xcode toolchain | P5 |
| U-08 | Can the Avalonia-hosted view give clean fullscreen on the A95L (Spaces, EDR, no flicker)? | One of the triggers in G-REOPEN-C | Observe it during the A95L session | The A95L session (G-ACC-A95L) | P1 |
| U-09 | Will upstream accept shmfix, the Retina `contentsScale` fix (issue #461) and, later, A+B? | Lowers the rebase cost (R10 §2A) | An issue, then a PR, following CONTRIBUTING, after the owner approves | Forge account (G-ACC-FORGE) | P0-P2 |

### 2.2 Performance and measurement

| ID | Unknown | Why it matters | How to resolve | Needs | Phase |
|---|---|---|---|---|---|
| U-10 | The true per-frame guest frame time | Every FPS and pacing claim depends on it. The status bar averages over a 750 ms window (R09 verification; [E] describes it as about 1 s) | Telemetry ring at the SurfaceFlinger frame callbacks (G-TEL) | A dev build | P0 |
| U-11 | Room of Awakening critical path: is the limit latency or throughput? | Decides which CPU fix to pursue | Time Profiler plus a thread-state trace, with D2 and timestamps (R05 §4.2) | Attended; xctrace (G-SEC-XCTRACE) | P0-P2 |
| U-12 | Real GPU time per frame on Great Sky Island at 1.2x | The figure of about 21 ms is an upper bound from summed Metal HUD times [M]/[I], and idle gaps can inflate it (R05 verification) | `MTL_HUD_ENCODER_TIMING_ENABLED=1` and a Metal System Trace; compare HUD runs only with other HUD runs | Attended | P0 |
| U-13 | Can guest frame time reach 20 ms or less with headroom (G-60)? If so, at 1.2x, or only at 1.0x? | Decides whether 60 loses its "experimental" label, and tests the "about 1080p" goal | 1.0x versus 1.2x A/B on the island under the C2 protocol (ADR 0003 §6) | Owner decision on 1.0x (G-OWN-7) | P2 |
| U-14 | The rendered size of each frame under dynamic resolution, and the fullscreen drawable size in scaled display modes | Defines "about 1080p" honestly; affects sharpness (R05, R04) | Log viewport and drawable sizes | A dev build | P1-P2 |
| U-15 | Does FencePool PR !195 help on macOS? | A cheap win or noise. A small gain is expected because MoltenVK fences are user-space objects [I] (R05 §1.4) | C2 A/B at Lookout Landing and the Temple of Time | Attended | P2 |
| U-16 | Does `MVK_CONFIG_SHOULD_MAXIMIZE_CONCURRENT_COMPILATION=1` shorten cold-cache hitches? | A cold cache takes about 85-88 s for about 1,017 shaders on every new build [E] | C0 A/B runs | Attended | P2 |
| U-17 | What does `Thread.Yield` on each SVC cost on the hypervisor path? | A possible hidden CPU tax (R05) | Time Profiler with the hypervisor On | Attended | P2 |
| U-18 | What do the output stage, the RT upgrade, the overlay and the scopes cost on the GPU-bound island? | The island has little GPU slack at 45-48 FPS under D2 [E] | GPU timestamps; flag on/off A/B (G-HDR-3, G-UI-1). The overlay is estimated at 0.05-0.2 ms [I] (R09) | A dev build | P1, P3, P4 |
| U-19 | Do timestamp queries work on MoltenVK, and do they agree with an Instruments GPU trace? | Needed to check the overlay budget (G-UI-3) | Compare the two on the same frames | Attended | P1-P4 |
| U-20 | Does xctrace in attach mode show a window or an authorisation prompt? | Could disturb the owner (R05 Risks) | One run with the owner present | Owner present | P0 |

### 2.3 Frame pacing, caps and VRR

| ID | Unknown | Why it matters | How to resolve | Needs | Phase |
|---|---|---|---|---|---|
| U-21 | Does macOS offer HDMI VRR (and ALLM) to the A95L? | Without it, 45 cannot be smooth on the TV and host LFC is not possible. Apple's pages conflict [D] (R06 verification) | G6-1: HDMI 3 or 4, Enhanced format, a 48 Gbps cable; check Displays settings and the TV's signal info | The A95L session; a suitable cable already owned (no purchase) | P1 (session), P2 (menus) |
| U-22 | Which modes does macOS list for the A95L (100 Hz, 4K120 HDR), and does the reported HiDPI limit for HDR at 120 Hz (about 2432x1368, seen on macOS 14) apply here? [A] | Default TV mode; whether HDR and 120 Hz exclude each other | G6-2: a read-only mode query | The A95L session | P1 |
| U-23 | What HDMI signal format is used for 4K120 HDR (RGB 10-bit or 4:2:2), and what range? | Banding, text clarity | IORegistry colour element plus the TV's signal info (G-DISP) | The A95L session | P1 |
| U-24 | How does TOTK decode movies (emulated NVDEC?), and how fast do they play under D2? | A 1.5-2x speed risk until automatic 30 exists (R06 Risks) | G6-3: log NVDEC calls during an intro movie | Attended run | P2 |
| U-25 | Are audio, physics and long sessions correct under D2 at 30, 40, 45 and 60? | Correct speed is a requirement. None of these is validated [E] | G6-4: 30+ minute sessions per cap | Attended | P2 |
| U-26 | What on-screen cadence do 40 and 45 get on ProMotion compared with fixed 60? Does the macOS 27 beta ProMotion bug [A] still affect the owner's 27.2 build? | Sets the ProMotion menu | G6-5 and G6-7, using telemetry | Attended | P2 |
| U-27 | Does the fullscreen layer go direct-to-display with RGBA16F EDR, with the overlay on and off? | Latency and VRR; a trigger for the native presenter. The bundled package probably lacks the "opaque = false" patch [D] (R06 verification) | G6-6 and G-PRES-2: Instruments display track | Attended fullscreen run | P1 |
| U-28 | Can a fixed 120 Hz be selected on the built-in display? | Would add a fixed-120 menu row | G6-8: owner checks Displays settings (read-only) | Owner | P2 |
| U-29 | Does `CAMetalDisplayLink` honour a preferred range of 40-45 Hz on this panel? | Choice of vsync source | G6-10: a small probe (it opens a window) | Attended | P2 |
| U-30 | Does the play bundle trigger macOS Game Mode once `LSSupportsGameMode` is declared? | Game Mode doubles the Bluetooth sampling rate in fullscreen [D]; whether Ryubing triggers it is [I] (R07 verification) | Check the Game Mode indicator in fullscreen | Attended | P2 |

### 2.4 Scene HDR (most are settled by the capture session, G-HDR-1)

| ID | Unknown | Why it matters | How to resolve | Needs | Phase |
|---|---|---|---|---|---|
| U-31 | Pre-tonemap render-target formats (R11G11B10F or RGBA16F) and their real range (R02 U1) | Banding budget; how much highlight headroom exists | GPU capture | G-HDR-1: attended; dumps stay private | P1 |
| U-32 | Do the tonemap and final targets use an sRGB view or shader gamma? (R02 U2) | Needed for decoding and for UI blending | Capture the view formats | G-HDR-1 | P1 |
| U-33 | The guest hashes of the bloom, tonemap and post-tonemap shaders on 1.4.3, and whether they match the shaders RenoDX reconstructs (R02 U3, R01) | Keys for the tonemap replacement; whether RenoDX's maths transfers | A hash log in a debug build | G-HDR-1. The hashes go in the title pack only | P1 |
| U-34 | Is the post-tonemap pass AMD CAS (R01 verification) or FSR1 EASU (R02 verification)? Does it upscale, or only sharpen? | Decides which HDR-safe filter to build. The two verifications disagree | Compare the dumped guest shader with the reference CAS and EASU code | G-HDR-1 | P1 |
| U-35 | Render-target sizes at 1x and 1.2x, and which targets the final-buffer stage binds (R02 U4) | The allow-list rule for the RGBA16F upgrade | Capture | G-HDR-1 | P1 |
| U-36 | Where the exposure or eye-adaptation pass runs (R02 U5) | Whether the replaced tonemap needs an exposure input | Capture the luminance-reduction passes | G-HDR-1 | P1 |
| U-37 | How pre-rendered cutscenes and photo-mode readbacks travel through the pipeline (R02 U8) | Video should stay at paper white; readbacks of upgraded targets need conversion | Capture plus a code trace of the video decoder | G-HDR-1 | P1 |
| U-38 | Which UI passes draw after the tonemap (map, inventory, cutscenes)? (R01) | SDR-safe UI and the guest-hash exception list | List the draws after the tonemap in a frame capture | G-HDR-1 | P1 |
| U-39 | How many host specialisation variants does each replaced shader have? | All must be covered, or some frames render vanilla (G-HDR-2) | Log the variants; re-key the cache | A dev build | P3 |
| U-40 | How much highlight data does the SDR tonemap clip in normal play? | The value of scene HDR compared with display-stage looks | Source-clip counter over a long session (R09) | A dev build | P3 |
| U-41 | D2's provenance and shader independence: what exactly is it derived from, and does it leave unchanged every shader the registry keys on? | Hash stability (R02 Risks); licence review (R06 Risks) | Compare the guest-hash log with D2 on and off; record its sources (G-LIC-D2) | The title pack; the owner | P2 |

### 2.5 Apple EDR presentation

| ID | Unknown | Why it matters | How to resolve | Needs | Phase |
|---|---|---|---|---|---|
| U-42 | Does `toneMapMode = never` fully stop system tone mapping on a Metal EDR layer? How does `preferredDynamicRange` interact with it? Do these properties and `contentsScale` survive a swapchain recreation? | Calibration is only correct if they do (G-PRES-1) | A ramp test card on the XDR panel, before and after a swapchain recreation | Attended | P1 |
| U-43 | How does headroom change with the brightness slider and in reference modes? Why did current headroom read 2.67 with no EDR window open? [M] (R03 verification) | The Mac peak is min(live headroom, MaxTML) | Probe at slider steps and presets (G-DISP) | The owner changes the settings | P1 |
| U-44 | How does EDR behave on battery (the "optimise video streaming" option)? | Unplugged play | Probe on battery | Owner | P1 |
| U-45 | Does A95L headroom go stale after sleep and wake? | The dashboard ceiling line would be wrong | Log headroom across a sleep cycle | The A95L session | P1, P4 |
| U-46 | What static HDR10 metadata (MDCV, MaxCLL, MaxFALL) does macOS send over HDMI, and does the app's `EDRMetadata` change it? | Affects the TV's own tone mapping. Luma does not rely on it (ADR 0005) | Check the TV's signal-info overlay. If that shows nothing, record "not controllable" (an HDMI analyser would be a purchase) | The A95L session | P1 |

### 2.6 Displays and calibration

| ID | Unknown | Why it matters | How to resolve | Needs | Phase |
|---|---|---|---|---|---|
| U-47 | N: how many A95L panel nits EDR 1.0 produces over HDMI | Sets TV paper white, as EDR = 203 / N | Match visually against a 203-nit reference, or take an instrument spot reading | The A95L session; an instrument is optional (G-ACC-CAL) | P1 |
| U-48 | Does macOS pass PQ code values straight to the TV, or remap them? (R04; R02 U9) | Decides whether the TV profile values are absolute | Show the PQ ramp steps; check near-black visually; use an instrument if one is available | The A95L session | P1 |
| U-49 | On the owner's firmware, is "HDR Tone Mapping: Off" a hard clip (HGIG-like)? How does "Gradation preferred" behave, what are the exact menu names, and how do Game-mode and Professional-mode peaks compare? | The A95L profile recipe (R04, R08) | HGIG 10% checker; the owner notes the menus | The A95L session | P1 |
| U-50 | Is 4K120 limited to HDMI 3 and 4 with Enhanced format? Which port is which? | The connection plan. R03 verification calls this unverifiable, and R04 tags the HDMI 4 claim [A] | The owner checks the TV's input info | The A95L session | P1 |
| U-51 | How many nits does EDR 1.0 produce on the MacBook in the default preset? | The "assumed N nits at EDR 1.0" label (ADR 0002 D9) | An instrument, or the HDR Video (P3-ST 2084) reference mode | An instrument is optional | P1-P4 |
| U-52 | How bad is mini-LED blooming in dark scenes, and is the panel nano-texture or glossy? | HUD design; recommended room light (R04) | The owner views the blooming pattern and checks the configuration | Owner | P1 |
| U-53 | Lab values for the A95L (labs disagree by about 15% at a 10% window; RTINGS is paywalled) | Starting MaxTML only | The owner's HGIG results take precedence | G-ACC-RTINGS (denied) | Optional |

### 2.7 DualSense, input and background control

| ID | Unknown | Why it matters | How to resolve | Needs | Phase |
|---|---|---|---|---|---|
| U-54 | Does macOS 27.2 beta show an Input Monitoring prompt when the DualSense opens, on USB and then on Bluetooth? | Any TCC change needs a separate decision. SDL's design avoids the prompt [D], but this is unverified on 27.2 (R07 verification) | G-INP-1: attended; check System Settings before and after; no TCC edits | Owner; DualSense | P0 |
| U-55 | Do the mute button (`MISC1`) and the PS button reach SDL, or do system gestures take them? | Choice of dashboard toggle (ADR 0004) | G-INP-1: log SDL driver names and button events | Owner; DualSense | P0 |
| U-56 | Are rumble sides swapped? Does a second open of the pad lose caps? What are the gyro axis signs in island archery? | Gates the v1 SDL patches | G-INP-2 probes | Owner; DualSense | P0 |
| U-57 | How old is input after the 10 ms UI-thread pump? | Whether the pump patch is worth doing | G-INP-4: pump-age histogram | A dev build | P2 |
| U-58 | Does the PS button open Game Overlay while Ryubing is in the background? Does a Bluetooth dropout show the controller applet? | Risk of focus theft | G-INP-5 | Owner | P2 |
| U-59 | Does the revised owner-wins guard ("the user clicked, so set ESTOP and keep running") work live? Can dialogs or the crash reporter steal focus? | Neither path has been replayed live [E] | G-INP-6: live replay | Owner | P2 |
| U-60 | What latency and jitter do USB and Bluetooth have on macOS? (Third-party data come from Windows.) | The bus recommendation | SDL timestamp deltas (a camera rig would be a purchase) | None | P2, low priority |
| U-61 | Is the outbound port-443 connection seen in the control trials the SDL gamepad-database fetch at launch? [I] (R07 Risks) | Network hygiene and reproducibility of measured runs | Log network activity at launch | A dev build | P0 |
| U-62 | Can `SDL_SendGamepadEffect` drive the adaptive triggers reliably? | If not, the GameController shim is reopened (G-INP-3) | A probe | P5 approval | P5 |
| U-63 | Which haptic localities does GameController expose for the DualSense on macOS 27? Is the pad's USB audio device visible with 4 channels? | Feasibility of PCM haptics | A read-only probe; `system_profiler SPAudioDataType` | P5 approval | P5 |
| U-64 | Does TOTK 1.4.3 have content that needs motion controls? | Whether gyro is mandatory | Play test and community lists | Owner | P2, low priority |

### 2.8 Effects, overlay and dashboard

| ID | Unknown | Why it matters | How to resolve | Needs | Phase |
|---|---|---|---|---|---|
| U-65 | Does Serfrost Base v2.4 visibly change 1.4.3 scenes? It boots without regression, but its effect was never shown [E] | Sets the defog priority (ADR 0006) | G-LOOK-1: same save, time, weather and framing; window-capture A/B | The owner installs it (G-SW-SERFROST) | P4 |
| U-66 | Is a prebuilt, reproducible osx-arm64 native library available for the ImGui binding? | Decides between ImGui and the custom renderer (G-UI-0) | Pin and hash it; rebuild twice | None | P1 |
| U-67 | How much banding and temporal instability does each look strength cause? | G-LOOK-2 | Ramps at each strength; airlight stability over time | A dev build | P4 |

### 2.9 Dolby Vision (research only)

| ID | Unknown | Why it matters | How to resolve | Needs | Phase |
|---|---|---|---|---|---|
| U-68 | Does the A95L's EDID advertise DV Standard, Low-Latency or both, and which version? | Documentation only (ADR 0005) | G-DV-EDID: a read-only EDID dump decoded with `edid-decode` | The A95L session; G-SW-EDID | P1 |
| U-69 | Will a future macOS add a Dolby Vision or HDMI InfoFrame API? | The condition for reopening DV | G-DV-WATCH: grep the headers once per major SDK | None | Ongoing |

### 2.10 Parked unknowns (not needed under the current ADRs)

These are recorded so they are not researched again by accident:

| Unknown | Why parked | Source |
|---|---|---|
| A95L DV Game-mode lag on current firmware; the DV mode Xbox uses; Dolby SIDK fees; DV raised blacks | DV is not pursued (ADR 0005) | R08 |
| What Ritsu's custom ReShade changes | Informational; RenoDX is not used as shipped | R01 |
| Whether MacShade can attach to Ryubing | Only for an optional SDR trial the owner may decline | R01, R09 |
| Whether the 1.2.0 Interior add-on works on 1.4.3 | It replaces the whole Bootup pack and is considered incompatible [E] | R09 |
| NativeAOT viability for the full core; whether a `LibRyujinx` exists | Option B is deferred | R10 |
| MeloNX licence (README says GPLv3, licence file says MIT) | No reuse is planned; must be settled before any reuse | R10 |

---

## 3. Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Trigger or kill criterion |
|---|---|---|---|---|---|
| RISK-01 | **MoltenVK deprecation.** Khronos deprecated MoltenVK on 2026-10-13 (`0aa76ad`), and community maintenance is best-effort [D]. Its fixes may land only in KosmicKrisp, which would strand MoltenVK-specific work (R05 Risks) | High (it has happened) | Medium | All Luma graphics code is Vulkan-only. Every component must pass the "works unchanged on KosmicKrisp?" review. Output uses RGBA16F + `EXTENDED_SRGB_LINEAR`, which both backends map to EDR (ADR 0001, 0002). MoltenVK-only workarounds stay small | A blocking MoltenVK bug with no fix, or G-KK passing: evaluate the KosmicKrisp variant. G-PRES-4 shelves the native presenter if KosmicKrisp becomes the default |
| RISK-02 | **KosmicKrisp supply chain.** PR !131 ships a prebuilt forked-Mesa NuGet binary (`26.2.5-ryu.1`) that has not been inspected [D] (R05 verification) | Medium | Medium | Build from Mesa source, or take a binary only with owner approval, with recorded hashes. It stays a separate flagged variant (G-ACC-KK) | No approval means no evaluation; the variant stays unbuilt |
| RISK-03 | **Texture-cache instability** from the RGBA16F render-target upgrade. PR !31 was closed as "too unstable to ship", and PR !181 was merged and then reverted within days [D] (R02 §5, R10 Risks) | High | High | Exact allow-list only, host-only storage, guest format unchanged, a kill switch to SDR, and the capture session before any texture work (ADR 0002) | Any new artefact in a warm 900 s run (G-HDR-3): narrow the allow-list. Reaching the owner's ceiling: ship the labelled Expanded SDR fallback |
| RISK-04 | **Hash drift and coverage gaps.** A game update, an exefs patch such as D2, or missed specialisation variants could leave frames vanilla or change the guest hashes [I] (R02 Risks) | Medium | High | Pin to 1.4.3. D2 must not alter the hashed shaders. G-HDR-2 coverage check; hashes and checksums kept in the title pack | Any frame rendered vanilla during G-HDR-2: fix coverage before any visual judgement |
| RISK-05 | **Scene HDR runs over budget.** P3 is estimated at 4-10 pw, the highest-uncertainty phase [I] | Medium | High | The capture session settles U-31 to U-38 first, and the owner sets a ceiling before P3 starts (G-OWN-6) | Ceiling reached, or G-HDR-3 failing: ship Expanded SDR (3-7 days [I]), labelled as such, and record scene HDR as "not achieved" |
| RISK-06 | **False HDR.** A brighter SDR image, or an inverse-tonemapped fallback, gets presented as HDR (R03 Risks, R09 Risks) | Medium | High | The dashboard always shows the source mode (Scene HDR / Expanded SDR / SDR) and labels looks as "approximate" before P3. The source-clip counter in G-HDR-4 shows the data was recovered, not invented | Any screen or document calling Expanded SDR "HDR" is a defect |
| RISK-07 | **Silent misconfiguration.** MoltenVK accepts any format and colour-space pair, and a wrong pair clips with no error [D] (R03 Risks) | Medium | High | Log the format pair at startup; bar passthrough from every HDR profile; ramp card in G-PRES-1 | A ramp card showing clipping or system tone mapping: fix before EDR work continues |
| RISK-08 | **Double tone mapping**, from the TV's tone mapping plus Luma's EETF, or from the system tone mapper (non-nil `EDRMetadata`, `vkSetHdrMetadataEXT`) (R03 §3.4, R04 Risks, R08 Risks) | Medium | Medium | `EDRMetadata` stays nil; Luma never calls `vkSetHdrMetadataEXT`; TV HDR Tone Mapping is Off during calibration; the Mac's input is never set to a DV signal format | The TV reporting "Dolby Vision", or a profile clipping off target: the dashboard flags it (ADR 0005) |
| RISK-09 | **A+B fails**, which keeps the Room of Awakening CPU-bound at 20 FPS with the hypervisor Off [E] | Medium | High | Hypervisor Off at 1.2x stays the default; G-AB uses a Poisson test | G-AB fails: a write-tracking redesign (2-6 weeks [I]) or the PAL mode, only with owner approval (P5) |
| RISK-10 | **A sustained 60 is not reachable.** The island needs about 21 ms of GPU time per frame at 1.2x (upper bound), and the Room and Castle are CPU-bound [E]/[I] | High | Medium | 60 stays "experimental" until G-60. 40 and 48 are offered as evenly paced caps. 1.0x scale is the owner's trade-off (G-OWN-7) | G-60 fails for a scene class: 60 keeps its label there |
| RISK-11 | **D2 correctness.** Audio, long-session physics and movies (1.5-2x speed risk) are unvalidated. Unbounded, turbo or Custom above 60 would run ahead [E]/[I] (R06 Risks) | Medium | High | Unbounded, turbo and Custom above 60 are refused under D2. G6-4 per cap; automatic 30 for movies after G6-3 | A cap failing G6-4 is withdrawn. If every cap above 30 fails, only "30 (native)" ships |
| RISK-12 | **D2 provenance and licence.** D2 is a locally prepared exefs patch that uses facts from FPSLocker, which has no licence file, and code ideas from MIT projects [M] (R06 Risks). It contains game offsets | Medium | Medium (blocks publication, not private use) | Owner-local title pack only. The public repository records only its behaviour and a checksum field. Licence review before any publication (G-LIC-D2) | Licence review fails: D2 is never published in any form, and private use is the owner's decision |
| RISK-13 | **No HDMI VRR on this Mac.** Apple's documents conflict, and no Sony report exists [D]/[A] (R06 verification) | High | Medium | Per-display menus: 45 is shown with a cadence warning, and 40 is suggested on the TV; host LFC only after G6-1 | G6-1 fails: the fixed-120 policy stays on the A95L |
| RISK-14 | **Fragile HDMI 2.1 on macOS.** Modes reportedly disappear between versions; the HiDPI limit may force a choice between HDR and 4K120; limited range and chroma subsampling are reported [A] (R03 Risks, R06 Risks) | Medium | Medium | G6-2 and G-DISP record modes and signal format; the TV default mode is chosen from them; every result records the OS build | A missing mode after an OS update: re-run G6-2 |
| RISK-15 | **Beta OS changes.** macOS 27.2 beta may change EDR, HDMI, VRR or ProMotion behaviour. A ProMotion cadence bug is reported on a 27 beta [A] (R06 §3) | Medium | Medium | The OS build goes in `build-manifest.json`; a fixed-60 fallback exists; G6-7 compares ProMotion with fixed 60 | Any OS update: re-run G-PRES-1, G6-5 and G6-7 before trusting older results |
| RISK-16 | **Beta Xcode reproducibility** for any Swift component (R10 §3.3) | Low (no Swift in v1) | Medium | v1 uses only the pinned .NET SDK (ADR 0001) | G-NATIVE firing: record the Xcode build in the manifest first |
| RISK-17 | **Upstream bursts and rebase cost.** A sync costs 0.5-2 days now, and 2-5 days once P3 patches touch `Window.cs` and `Gpu/Image` [I] (R10 §2A). An Avalonia 12 migration could cost more | Medium | Medium | Pinned base, on-demand syncs, seams as new files, `rebase.sh` with tests | Two syncs in a row over the owner's budget: re-evaluate the base (ADR 0001 kill criterion; budget set in G-OWN-15) |
| RISK-18 | **Legal pressure and source availability.** Nintendo's DMCA notice of 2026-02-12 names Ryubing, Eden, Citron, Kenji-NX and MeloNX, and some repositories are blocked [D] (R05 Risks) | Medium | High | Keep a pinned, archived copy of every build input, and optionally mirror the restored NuGet packages with hashes into a private local feed (R10 §3.3) | Forge or feed loss: build from the archive and freeze the base |
| RISK-19 | **A leak into the public repository**: game data, offsets, guest hashes, dumps, captures, home paths, usernames, emails or serial numbers | Medium | High | AGENTS.md rules; `.gitignore`; title pack, captures and dumps kept in the private workspace; a review before every commit (G-LIC-PUBLIC) | Any leak found: remove it at once. Rewriting history is the owner's decision |
| RISK-20 | **Licence contamination.** Lilium and Special K are GPL-3, AstrayFX is CC BY-ND, Serfrost is CC BY-NC-ND, libplacebo is LGPL-2.1, and RenoDX's TOTK shader files are reconstructions of game code (R01, R02, R08, R09 Risks) | Medium | High | Ideas only from GPL, ND and NC sources. The EETF is written from the BT.2390 formula. Only generic MIT RenoDX maths is reused, with attribution. Serfrost is never bundled (G-LIC gates) | Any copied code or payload found: remove it before publication |
| RISK-21 | **Focus theft** through the PS button, the controller applet, the crash reporter or window activation [D]/[A] (R07 Risks). One activation came 112 ms after an owner click [E] | Medium | Medium | Owner-wins ESTOP, `ignore_applet` with a toast, G-INP-5 guidance; the agent never touches keyboard, mouse or focus | Unreliable result in G-INP-6: agent sessions only run with the physical pad disconnected |
| RISK-22 | **The agent overrides the owner**, or two writers fight over one pad (SDL plus a GameController shim plus Bluetooth haptics) [I] | Low (v1), Medium (P5) | Medium | Explicit player assignment, owner-wins latching, no virtual-to-physical rumble, a mask that drops on ESTOP or socket loss | A failed G-INP-6 replay; a P5 track whose go/no-go shows conflicts is dropped |
| RISK-23 | **Measurement contamination.** The Metal HUD forces a cold shader cache; GPU captures perturb pacing; there is no PPTC, so the JIT starts cold; other apps, agents, Bluetooth radio, rumble and thermal state all shift results [E]/[M] (R05, R07 §6) | High | High (on the validity of claims) | Hygiene from ADR 0004: uncontended host, C0/C1/C2 cache states, the owner starts measured runs, a no-agent build, pad, power and thermal state logged, USB for measurement | Any run missing its hygiene record is excluded from claims |
| RISK-24 | **False smoothness.** The status bar can read 45 while the panel alternates between 16.7 and 25 ms; GPU utilisation alone says nothing about pacing (R05, R06 Risks) | High | Medium | Every cadence claim must cite telemetry `actualPresentTime` (G-TEL) | A claim without telemetry is not accepted |
| RISK-25 | **The capture path is composited**, not direct-to-display, which adds latency [I] (R03 §2) | Medium | Medium | One opaque layer, with the overlay drawn in the same drawable (ADR 0002 D4, D9) | G-PRES-2 shows composition: measure its latency cost before considering G-NATIVE (1.5-3 weeks [I]) |
| RISK-26 | **The post-tonemap sharpen/scale pass regresses**, for example if it is replaced by a point fetch as RenoDX does, which softens dynamic-resolution frames [I] (R01, R02 Risks) | Medium | Medium | HDR-safe encode, filter, decode; never a point fetch | Visible softening in G-HDR-4: fix before sign-off |
| RISK-27 | **OLED retention, ABL pumping and mini-LED blooming** from a static dashboard or bright large areas [I] (R04 Risks) | Medium | Low | Dashboard hidden by default; auto-dim on OLED; MaxFFTML in the A95L profile | Visible retention: shorten the auto-dim timer |
| RISK-28 | **Computed nits mistaken for measured nits**; colorimeter error on QD-OLED and mini-LED without spectral correction [D] (R04 Risks) | Medium | Medium | Every number is labelled signal, profile or measured; Mac nits appear only as "assumed"; a measured value always carries its instrument, correction, window size and date | Any unlabelled number on the dashboard fails the P4 labelling audit |
| RISK-29 | **Security surface.** Broad entitlements (`disable-library-validation`, DYLD variables, `get-task-allow`), new local sockets, MacShade injection that sees keyboard events, and auto-updating third-party binaries (R01, R10 Risks) | Medium | Medium | Sockets in a 0700 folder with peer-uid checks [E]; removal of debug entitlements tested for play builds; MacShade only on a separate copy if approved; Beast Roofer binaries never installed | An unexpected listener or entitlement in a play build: block that build |
| RISK-30 | **Save damage.** Variants sharing data roots, or the shared-memory race, which crashed a session during a save load [E] | Low (with mitigations) | High | Per-variant data roots; saves copied from a manifest-checked backup, never shared live; shmfix first in the queue | Any save mismatch against the manifest: stop and restore the backup |
| RISK-31 | **Owner time.** Most exit gates need attended sessions, and builds or runs disturb the owner's use of the Mac | Medium | Medium | Batch sessions (A95L, capture, DualSense); builds only when the owner agrees; agents never launch measured runs | A session slipping: the dependent phase exit waits; nothing proceeds on assumption |
| RISK-32 | **TCC re-prompts.** New bundle identifiers and ad hoc signatures may be treated as new apps by privacy controls [I] | Low | Low | The owner answers any prompt; no TCC edits; G-INP-1 records the behaviour | A prompt appearing on every rebuild: record it, and propose options for the owner to decide |
| RISK-33 | **Dependency reproducibility for ImGui.** A prebuilt native library may not be reproducible on osx-arm64 [I] | Medium | Low | Pinned and hashed; custom immediate-mode renderer as a fallback (4-8 days [I]) | G-UI-0 fails: use the custom renderer |
| RISK-34 | **Scope creep toward Dolby Vision** (R08 Risks) | Low | Low | ADR 0005: not pursued; only a light watching brief | Any DV work beyond the watching brief needs a new ADR |

---

## 4. Gates register

Status values: **pending** (not yet met), **denied** (access or reuse refused, or not possible), **done** (met, with evidence).

### 4.1 Owner approval

| ID | Gate type | What is needed | Blocking | Status |
|---|---|---|---|---|
| G-OWN-1 | Owner approval | Approve architecture A-first: a flagged Ryubing patch queue at `475615f` with one .NET toolchain; the hybrid only behind G-REOPEN-C or G-NATIVE; options B and D deferred (ADR 0001) | All implementation (P0 onwards) | pending |
| G-OWN-2 | Owner approval | Fork location and visibility (local-only by default, or hosted); whether binaries are ever published; local builds or free public CI | P0 | pending |
| G-OWN-3 | Owner approval | The private, owner-local title pack for all TOTK-specific material (D2 patch, guest hashes, TOTK shaders, RT allow-list, state hooks), kept out of every public repository | P2 (D2), P3 | pending |
| G-OWN-4 | Owner approval | D2 as an owner-supplied file in the title pack, together with G-LIC-D2 | P2 caps above 30 | pending |
| G-OWN-5 | Owner approval | Schedule the attended sessions on an uncontended Mac: A+B flash validation (at least 900 s per scene), the capture and shader-hash session, the DualSense check and live arbitration replay, and the A95L display session | P0 exit, P1 exit, P2 exit | pending |
| G-OWN-6 | Owner approval | Set the person-week ceiling for P3 before the Expanded SDR fallback | P1 exit, P3 start | pending |
| G-OWN-7 | Owner approval | Default CPU profile until G-AB (Hypervisor Off at 1.2x); whether 1.0x is acceptable if it is the only route to 60 | P0, P2 | pending |
| G-OWN-8 | Owner approval | Cap policy: 30 guaranteed; 60 experimental until G-60; 45 shown with a cadence warning, and 40 or 48 suggested unless HDMI VRR is verified | P2 | pending |
| G-OWN-9 | Owner approval | Stay on MoltenVK `1.4.2-ryujinx.5`; whether to A/B `1.4.3-ryujinx.2` (gated on G6-6) | P2 (optional A/B) | pending |
| G-OWN-10 | Owner approval | Dear ImGui (MIT) as a pinned dependency, subject to G-UI-0; dashboard toggle (DualSense mute plus one keyboard key, touchpad click optional); UI scale default 0.85 | P1 | pending |
| G-OWN-11 | Owner approval | Upstream policy: submit shmfix and the `contentsScale` fix now, and A+B after G-AB | P0-P2 (not blocking) | pending |
| G-OWN-12 | Owner approval | Dolby Vision "not pursued", with the watching brief and the read-only EDID decode; whether the DV-like adaptive peak is wanted in P5 | P1 (EDID step), P5 | pending |
| G-OWN-13 | Owner approval | Whether to install Serfrost Base for the defog A/B; which ReShade FX effects, if any, are wanted (decides G-FX); whether the MacShade SDR experiment is wanted at all | P4, P5 | pending |
| G-OWN-14 | Owner approval | Go/no-go for the haptics and adaptive-trigger track, including read-only TOTK state hooks kept private | P5 | pending |
| G-OWN-15 | Owner approval | Variant set and retention (reference, measure, agent, hdr; keep N-1 or N-2), the bundle identifier scheme, and the per-sync budget used as the fork kill criterion | P0 | pending |
| G-OWN-16 | Owner approval | Accept computed-nits-only labelling until an instrument is available; no purchases | P1 | pending |
| G-OWN-17 | Owner approval | A separate start approval for each P5 track | Each P5 track | pending |

### 4.2 Access

| ID | Gate type | What is needed | Blocking | Status |
|---|---|---|---|---|
| G-ACC-A95L | Access (owner-attended session) | **The TV connection session.** Connect the Mac directly to A95L HDMI 3 or 4 with Enhanced format, using a 48 Gbps cable the owner already has (no purchase). The TV uses HDR10 Game mode, and TV HDR Tone Mapping is Off during calibration. In one sitting, this covers G6-1, G6-2, G-DISP (headroom, N, PQ ramp, HDMI format), G-DV-EDID and U-08, U-21 to U-23, U-45 to U-50. All system queries are read-only. Expect 0.5 day for each display configuration [I] (ADR 0003) | P1 exit (A95L profile); P2 (A95L menu rows) | pending |
| G-ACC-CAL | Access (hardware) | **Colorimeter availability.** No instrument is assumed, and none will be bought. Calibration uses HGIG-style visual tests, which need no instrument [D]/[I] (R04 Summary). A colorimeter rated for HDR luminance, with a spectral correction for QD-OLED and mini-LED, is used only if the owner already has or can borrow one. Without one, every nit value stays "signal", "profile" or "assumed" | Nothing blocks. Only the "measured" label waits for it | pending (no instrument known) |
| G-ACC-KK | Access (binary or source) | **The KosmicKrisp package.** There are three routes: (a) build Mesa from source; (b) the LunarG SDK; (c) the PR !131 prebuilt NuGet binary (`26.2.5-ryu.1`, an uninspected forked-Mesa build). Route (c) is a prebuilt binary and needs its own owner decision, separate from approving the evaluation. KosmicKrisp needs macOS 26 / Metal 4 [D] | P5 KosmicKrisp track (G-KK) | pending |
| G-ACC-MVK143 | Access (binary) | The MoltenVK `1.4.3-ryujinx.2` package for an optional A/B. It is a fork build that "avoids direct-to-display with asynchronous submits" [D] (R05 verification) | P2 (optional; gated on G6-6) | pending |
| G-ACC-GAME | Access (owner data) | A legally owned TOTK 1.4.3, with firmware, keys and saves, available in the private workspace only and never in any repository | Every run | done [E] (private workspace) |
| G-ACC-FORGE | Access (account) | A forge account to offer the upstream fixes, if G-OWN-11 says yes | Upstreaming only | pending |
| G-ACC-DP | Access (hardware) | The optional DisplayPort Adaptive-Sync control case (G6-9) on an MSI monitor. The monitors are present [M] (R03 verification) | None (optional control) | pending |
| G-ACC-RTINGS | Access (paywalled data) | RTINGS A95L lab results are paywalled. No subscription will be bought; the owner's own HGIG results replace them | None | denied |
| G-ACC-ITU | Access (standard) | The BT.2408-9 PDF download was rejected on 2026-11-01 (R04 verification). The EETF is written from BT.2390-12, which was confirmed, and cross-checked against libplacebo's knee formula | None | denied (retry is optional) |
| G-ACC-DOLBY | Access (licence) | The Dolby Vision SIDK is open only to officially incorporated entities [D] (R08 §1) | None, because DV is not pursued | denied |

### 4.3 Software install

| ID | Gate type | What is needed | Blocking | Status |
|---|---|---|---|---|
| G-SW-SDK | Software install | An isolated official .NET 10 SDK (10.0.303 resolves locally), to be pinned with `rollForward: disable` and lock files | P0 | done for the install [E] (R10 §3.3); pinning is pending in G-BUILD |
| G-SW-XCTRACE | Software install | Instruments / xctrace 27.2 for profiling and the direct-to-display check. It is installed [M] (R05 verification), on a beta toolchain | P0 profiling, G-PRES-2 | done (installed); first-use prompt in G-SEC-XCTRACE |
| G-SW-EDID | Software install | `edid-decode` (open source, read-only) for G-DV-EDID. It is not installed on the target Mac (checked 2026-11-01 [M]). Installing or building it needs the owner's agreement | G-DV-EDID only | pending |
| G-SW-IMGUI | Software install | The ImGui .NET binding and its native osx-arm64 library, pinned and hashed (this is G-UI-0) | P1 exit | pending |
| G-SW-SERFROST | Software install (owner) | The owner installs Serfrost Base Defogger v2.4 in the relevant data root, checked against its published checksum. It is never bundled | P4 (G-LOOK-1) | pending (it ran before in the private workspace [E]) |
| G-SW-KK | Software install | A Mesa build toolchain, if route (a) of G-ACC-KK is chosen | P5 | pending |
| G-SW-XCODE | Software install | An Xcode/Swift toolchain. Not needed in v1; required only if G-NATIVE fires | P5 only | pending (not required now) |

### 4.4 Security or TCC

| ID | Gate type | What is needed | Blocking | Status |
|---|---|---|---|---|
| G-TCC-INPUT | Security or TCC | **Input Monitoring.** Run the attended check in G-INP-1. The owner answers any prompt personally; no TCC settings are edited or reset, and any TCC change needs its own decision (R07 Summary) | P0 exit | pending |
| G-SEC-SIGN | Security or signing | **Hypervisor entitlement and signing.** Builds are signed ad hoc with the same 8 entitlements, including `com.apple.security.hypervisor` and `allow-jit`. Ad hoc builds already ran with the hypervisor On [E]. Still pending: new per-variant bundle ids must keep the hypervisor entitlement, and play builds must test the removal of `allow-dyld-environment-variables`, `debugger`, `get-task-allow` and `disable-executable-page-protection` (ADR 0001 D10). A paid Developer ID is not needed [D] (R10 §3.2) | P0 (bundles), P2 (play builds) | pending (baseline done [E]) |
| G-SEC-XCTRACE | Security or prompt | The first xctrace attach may ask for developer-tools authorisation. The owner is present and answers it (R05 Risks) | P0 profiling | pending |
| G-SEC-NOSYS | Security policy | No Gatekeeper, SIP or TCC changes at any step, including rollback [E] | Every phase | done (none made [E]); applies throughout |
| G-SEC-SOCK | Security | The agent control socket keeps its design: a Unix socket in a 0700 folder with peer-uid checks, no TCP or UDP listener, bounded commands, a neutral pad when idle [E] | P2 (composite driver) | done in the prior branch [E]; re-verify in the fork |
| G-SEC-NET | Security or privacy | Confirm and record the launch-time network fetch (U-61). Any change to it is an owner decision | P0 (measurement hygiene) | pending |

### 4.5 Licence

| ID | Gate type | What is needed | Blocking | Status |
|---|---|---|---|---|
| G-LIC-PUBLIC | Licence and publication | **The GitHub repository is public.** Before every commit: no absolute home paths, usernames, emails or serial numbers; no game content, firmware, keys, saves, shader caches, screenshots or video; no patch offsets, guest hashes, dumps or captures (AGENTS.md). Private evidence is referred to only as "private local evidence workspace" | Every phase | pending (ongoing check) |
| G-LIC-D2 | Licence | **D2 provenance.** D2 is a locally prepared exefs patch that uses facts from FPSLocker (no licence file) and code ideas from MIT projects [M] (R06 Risks). Record its sources and checksum in the private workspace. Review the licence before any publication. It must not alter the hashed shaders | Any publication of D2; P2 use is governed by G-OWN-4 | pending |
| G-LIC-RENODX | Licence | **RenoDX (MIT):** reuse only generic maths (Neutwo, hue and purity correction), with attribution. Do not copy RenoDX's reconstructed TOTK shader files, because they derive from game code (R02 implication 2) | P3, P4 code reuse | pending |
| G-LIC-SERFROST | Licence | **Serfrost Base Defogger (CC BY-NC-ND 4.0):** owner-installed only. It is never bundled, modified or redistributed; only its checksum appears in config (ADR 0006) | P4 | denied (redistribution); the owner may install it |
| G-LIC-GPL | Licence | **Lilium and Special K (GPL-3):** ideas only. The same rule covers AstrayFX (CC BY-ND) and libplacebo (LGPL-2.1, so no copied code without LGPL compliance). Dolby-confidential formats are never described or shipped, even where GPL drivers expose them (R08 Risks) | P1-P5 code reuse | denied (code reuse); ideas only |
| G-LIC-IMGUI | Licence | Dear ImGui (MIT) and the binding: record the licences and attributions when pinning (with G-UI-0) | P1 | pending |
| G-LIC-RESHADEFX | Licence | reshadefx (BSD-3): attribution, only if G-FX opens | P5 | pending |
| G-LIC-FORK | Licence | Ryubing is MIT [D] (R05 §2). If the fork is ever hosted or binaries are published (G-OWN-2), keep its notices, and make sure the fork contains no title-pack material | Publication only | pending |
| G-LIC-MELONX | Licence | MeloNX's licence conflicts (README says GPLv3, licence file says MIT). Reuse nothing until it is clarified (R10 verification) | None (no reuse planned) | pending |

### 4.6 Hardware or measurement (the evidence gates in the ADRs)

All of these are **pending**, except G-DV-WATCH. Full pass conditions are in the ADRs cited.

| ID | Gate type | What is needed | Blocking | Status |
|---|---|---|---|---|
| G-BUILD | Measurement | A clean rebuild from `build-manifest.json` reproduces the executable and dylib hashes (ADR 0001) | P0 exit; every later measurement | pending |
| G-TEL | Measurement | Per-frame p50/p95/p99, and `VK_GOOGLE_display_timing` confirmed on `1.4.2-ryujinx.5` (ADR 0001, 0003) | P0 exit; all cadence claims | pending |
| G-AB | Hardware, attended | Hypervisor On + A+B for at least 900 s in the Room and on the island, against 0.012 flashes/s (Poisson test) | P0 exit | pending |
| G-BASE | Measurement, attended | C0, C1 and C2 baselines for Great Sky Island, Beneath Hyrule Castle and the Room of Awakening (ADR README, P0 exit) | P0 exit | pending |
| Rollback drill | Measurement | Each step drilled once: flag off, previous bundle, rebuild from the previous tag, delete the build folder | P0 exit / P1 start | pending |
| G-HDR-0 | Measurement | The output stage in SDR identity mode matches stock within ±1 code value | P1 exit | pending |
| G-HDR-1 | Hardware, attended | The capture session: U-31 to U-38 (R02 U1-U5 and U8) plus the post-tonemap pass identity; dumps kept private | P1 exit; P3 start | pending |
| G-PRES-1 / 2 / 3 / 4 | Measurement | 1: layer state survives recreation, and the ramp card shows no system tone mapping. 2: direct-to-display recorded, overlay on and off. 3: `present(at:)` meets the pacing targets. 4: shelve the native presenter if KosmicKrisp becomes the default (ADR 0002) | P1 exit (1, 2); P2 (3) | pending |
| G-NATIVE | Measurement | Any of G-PRES-1 to 3 fails, AND a 1-day export spike passes SDR identity | P5 native presenter | pending |
| G-UI-0 / 1 / 2 / 3 | Measurement, owner | 0: ImGui pinned and reproducible. 1: overlay cost 0.05-0.2 ms (estimated), measured, and zero when hidden. 2: owner usability pass. 3: timestamps work on MoltenVK | P1 exit (0); P4 exit (1, 2) | pending |
| G-DISP | Hardware, attended | Per display: headroom (current, potential, reference), N, PQ ramp behaviour, HDMI format; HGIG MaxTML and MinTML stored for both displays, MaxFFTML for the A95L | P1 exit | pending |
| G6-1 to G6-10 | Hardware, attended | HDMI VRR; mode list and HiDPI limit; NVDEC movies; D2 audio, physics and long sessions; ProMotion cadence and the beta issue; direct-to-display; fixed 120 Hz on the built-in panel; DisplayPort control; `CAMetalDisplayLink` range (ADR 0003) | P1 (G6-1, G6-2, G6-6); P2 exit (G6-3, G6-4, the rest) | pending |
| G-60 | Measurement | Guest frame time 20 ms or less, with headroom, under D2 | Removing the "experimental" label from 60 | pending |
| G-CAP | Measurement | p99 at most 1.25x the target interval, speed 1.00 ± 0.01, cadence error rate published, no steady-state shader spike, per cap and per display | P2 exit | pending |
| G-INP-1 to G-INP-6 | Hardware, attended | TCC and button reachability; rumble, double-open and gyro probes; adaptive triggers through SDL; pump age; PS button and applet; live owner-wins replay (ADR 0004) | P0 exit (1, 2); P2 exit (6); P2 (4, 5); P5 (3) | pending |
| G-HDR-2 / 3 / 4 | Measurement, owner | All specialisation variants covered and the cache re-keyed; a warm 900 s run with 0 new artefacts per scene plus an island cost A/B; the owner's side-by-side on both displays, with the source-clip counter | P3 exit | pending |
| G-LOOK-1 / 2 | Hardware, owner | Serfrost same-framing A/B; banding and temporal stability | P4 exit | pending |
| G-FX | Owner | The owner names effects that the built-in looks cannot provide; only after P4 | P5 reshadefx | pending |
| G-KK | Measurement | Warm C2 with 0 new artefacts in 900 s; p95 at least 10% better in a GPU-bound scene; RGBA16F EDR verified on both displays; pacing parity; driver approved (G-ACC-KK) | P5 KosmicKrisp | pending |
| G-METAL | Measurement | R05 §5 (a) and (b), under both backends, in 3 heavy scenes | Reopening native Metal | pending |
| G-REOPEN-B / C / D | Measurement or event | C: G-PRES-1 to 3 fails, G-INP-3 fails, or Avalonia blocks clean A95L fullscreen. B: C fails a UX goal. D: Ryubing silent for more than 6 months, or KosmicKrisp support lands elsewhere first | Reopening the deferred options | pending |
| G-DV-EDID | Hardware, attended | A read-only decode of the A95L's DV VSVDB (about 0.5 h) | None (documentation) | pending |
| G-DV-WATCH | Research | Grep the SDK headers for a DV or InfoFrame API, and re-read Dolby's eligibility wording, once per major macOS release (about 1 h) | None | done for the macOS 27.2 SDK (R08 verification); repeats at the next major release |
| G-DV-PEAK | Measurement | The scene-adaptive peak runs only after P3, within about 0.3 ms of GPU time [I], with no visible pumping | P5 | pending |

---

## 5. What blocks each phase

| Phase | Before it can start | Before it can exit |
|---|---|---|
| P0 Foundation and truthful measurement | G-OWN-1, G-OWN-2, G-OWN-15, G-OWN-5 (scheduling), G-OWN-7; G-SEC-SIGN for the new bundles; G-LIC-PUBLIC throughout | G-BUILD, G-TEL, G-AB, G-INP-1 (with G-TCC-INPUT), G-INP-2, G-BASE, rollback drill |
| P1 Visible EDR and calibration | P0 seams in place; G-OWN-10, G-OWN-16; G-ACC-A95L scheduled; G-SW-EDID if the EDID step is wanted | G-HDR-0, G-PRES-1, G-PRES-2 recorded, G-UI-0, G-DISP for both displays, G-HDR-1 findings stored privately, G-OWN-6 |
| P2 Correctly paced higher frame rate | G-OWN-3, G-OWN-4 with G-LIC-D2, G-OWN-8, G-OWN-9 (optional A/B) | G-CAP for every offered cap and display, G6-4, G6-3 (or automatic 30), the status of 45 per display, G-60 where 60 is unlabelled, G-INP-6 |
| P3 Genuine scene HDR | G-HDR-1 done, G-OWN-6 ceiling set, G-OWN-3, G-LIC-RENODX | G-HDR-2, G-HDR-3, G-HDR-4; otherwise the labelled Expanded SDR fallback |
| P4 Scopes, looks and polish | G-OWN-13; G-SW-SERFROST if the owner chooses | G-UI-1, G-UI-2, G-LOOK-1, G-LOOK-2, the labelling audit |
| P5 Gated tracks | G-OWN-17 for each track, plus the track's own gate: G-ACC-KK and G-KK; G-NATIVE; G-INP-3; G-OWN-14; G-FX with G-LIC-RESHADEFX; G-DV-PEAK; G-AB failure for write tracking | A written go/no-go with measured evidence for each track |

P1 and P2 can run in parallel. Estimated totals for P0-P4 are about 11.5-25 pw [I] (ADR index).

---

## 6. Sources

- ADRs 0001-0006 and the ADR index in `docs/adr/`.
- Research notes R01-R10 in `docs/research/`, including each note's "Unknowns and evidence gates", "Risks" and
  "Independent verification" sections.
- Prior local evidence: `docs/evidence/prior-local-evidence.md` [E].
- KhronosGroup/MoltenVK commit `0aa76ad` (2026-10-13): README deprecation notice recommending KosmicKrisp on Apple Silicon
  [D], fact-checked by the orchestrator and confirmed in R05 and R10 verification.
- A local check on 2026-11-01 that `edid-decode` is not installed on the target Mac [M].
