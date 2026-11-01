# ADR 0002: HDR pipeline, presenter ownership, and in-game UI in EDR

- **Status:** Proposed, awaiting owner approval
- **Date:** 2026-11-01
- **Covers:** D3 (HDR method), D4 (presenter and overlay ownership, including the R03/R09/R10 conflict), D9 (in-game
  UI technology and SDR-safe UI in EDR)
- **Related:** [0001](0001-architecture-and-delivery.md) (seams, title pack), [0003](0003-frame-pacing-caps-and-vrr.md)
  (timed presents), [0005](0005-dolby-vision-position.md) (DV), [0006](0006-visual-effects-and-reshade-style-support.md)
  (looks)

Tags: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal; `[E]` prior local evidence; `Rnn §x`
research notes. All effort figures are estimates `[I]`.

---

## Context

### Where TOTK's HDR is lost today

Research note 02 traced the path from game lighting to the panel (R02 §3). Under RenoDX's published
reconstruction of the tonemap pass [D] (R02 verification):

| Stage | Format | What is lost |
|---|---|---|
| 1-2. Lighting and bloom | Float render targets | Nothing material (glow clamped at 10,000) |
| **3. Tonemap** | Writes RGBA8 after `saturate()` | **All highlights above 1.0; first 8-bit quantisation** |
| 4. Post-tonemap sharpen/scale | RGBA8 | Re-quantised at 8 bits |
| 5. UI composite | RGBA8 final buffer | UI and scene share one 8-bit buffer |
| 6-8. Ryubing present path | `R8G8B8A8`, `rgba8` effects, `B8G8R8A8` sRGB swapchain | More 8-bit round trips |
| 9. MoltenVK layer | sRGB, EDR off (or unmanaged passthrough) | Gamut limited to sRGB; no values above SDR white |

Clipping happens **only at stage 3**; everything before it is float [D]/[I] (R02 §3). The 1.4.3 output today is SDR on a
`B8G8R8A8` sRGB swapchain, and the passthrough option is 8-bit and unmanaged, not HDR [E] §5.

### Existing implementations

- **RenoDX TOTK (mod 175)** is real scene HDR, but a Windows ReShade add-on that matches CRC32 hashes of host
  SPIR-V; Ryubing on macOS emits different SPIR-V (reduced precision omits `NoContraction`) and loads
  `libMoltenVK.dylib` with no Vulkan loader [D] (R01 Summary, verification). Its maths (vanilla `1 - e^-x` curve,
  game/UI white separation, scRGB output, Neutwo, hue/purity correction) is MIT and portable [D] (R01 §1.2).
- **MacShade** is a real ReShade 6.8 port but has no HDR or EDR code, uses BGRA8 with `saturate()`, is about two
  weeks old and untested with Ryubing [D] (R01 §2, R09 §2).
- **The Beast Roofer Edition** expands the final 8-bit SDR frame by inverse tone mapping; its own UI text says it is
  "not native/per-game HDR"; Windows-only releases [D] (R01 §3, R09 verification).
- **Ryubing PR !31** (RGBA16F swapchain, 33 files, +1068/-160) was closed by its author as "too unstable to ship".
  It kept `SRGB_NONLINEAR`, so it would not have enabled EDR under MoltenVK [D]/[I] (R02 §5).

### The Apple and Vulkan presentation facts that constrain the design

- Apple's own-tone-mapping recipe is `RGBA16Float` with an extended-linear colour space, `EDRMetadata` nil [D]
  (R03 §1.1, implication 1). `toneMapMode = never` (macOS 15) stops system tone mapping; `preferredDynamicRange`
  and `contentsHeadroom` arrived in macOS 26 [D] (R03 §1.4).
- MoltenVK maps `R16G16B16A16_SFLOAT` + `EXTENDED_SRGB_LINEAR_EXT` to `kCGColorSpaceExtendedLinearSRGB` with EDR on,
  and overwrites only the layer's colour space and EDR flag at swapchain creation [D] (R03 §3.2, R10 Summary). It
  accepts any format and colour-space pair, so a wrong pair silently clips [D] (R03 Risks).
- `vkSetHdrMetadataEXT` in MoltenVK builds `CAEDRMetadata` with `opticalOutputScale: 1` and forces EDR on, which turns
  on the costly system tone mapper on a float swapchain [D]/[I] (R03 §3.4).
- KosmicKrisp enables EDR only when the format is float, gives a 10-bit PQ swapchain no EDR, maps
  `DISPLAY_P3_LINEAR` to a non-extended space, and has no `VK_EXT_metal_objects` [D] (R03 §4).
- Direct-to-display needs fullscreen, one opaque `CAMetalLayer` and RGB content on Apple silicon [D] (R03 §2). A
  sibling layer or window forces composition [I] (R09 §4). Whether Ryubing's Avalonia-hosted layer qualifies is
  **unmeasured** (R03 §2).
- Headroom on the built-in display was read as potential 16.0, current 2.67, reference 0.0 [M] (R03 §1.6). On a TV,
  about 5x SDR is typical, and macOS converts EDR to HDR10 over HDMI [D] (R03 §6).

### The D4 conflict

- **R10** recommends a Swift dylib that owns the visible `CAMetalLayer`, with MoltenVK rendering offscreen and sharing
  frames through `VK_EXT_metal_objects` (R10 §2C).
- **R03** calls that hybrid presenter the target, but recommends an in-swapchain FP16 spike first, and builds the
  hybrid only "if A shows composition, stability or pacing problems, or once the native dashboard is needed"
  (R03 Options compared).
- **R09** recommends drawing the dashboard and scopes inside Ryubing's Vulkan present pass, on the same drawable, to
  stay eligible for direct-to-display (R09 §4, implication 4).
- Since those notes were written, the orchestrator confirmed that Khronos deprecated MoltenVK on 2026-10-13 [D], and
  R03 shows KosmicKrisp lacks `VK_EXT_metal_objects` [D].

---

## Decision

### D4. Presenter and overlay ownership (decided first, because D3 and D9 sit on it)

**One owner per layer, and in v1 that owner is the Vulkan swapchain (MoltenVK today, KosmicKrisp later).**

1. **The Luma output stage is the product, not a spike.** It is a post-scale pass inside Vulkan `Window.Present`,
   behind the `IOutputStage` seam (ADR 0001). In one pass it:
   - decodes the game image (scene HDR, or the SDR frame in fallback tiers);
   - applies the display profile's EETF against live headroom;
   - runs display-stage looks (ADR 0006);
   - composites game UI at UI white (D3 boundary model) and draws the Luma dashboard, scopes and calibration
     patterns (D9);
   - encodes into one `R16G16B16A16_SFLOAT` + `EXTENDED_SRGB_LINEAR_EXT` drawable.
2. **The Mac-specific part is a thin display helper** in C# over the `CAMetalLayer` Ryubing already creates. It sets
   only properties MoltenVK does not own: `toneMapMode = never`, the correct `contentsScale` (issue #461), and an
   evaluated `preferredDynamicRange`. It re-applies them after every swapchain creation and recreation. It reads
   `NSScreen` current, potential and reference headroom from the change notification plus a per-frame read
   (R03 §1.5).
3. **Rules that make it safe:** `EDRMetadata` stays nil; Luma never calls `vkSetHdrMetadataEXT`; the chosen format
   and colour-space pair is logged at startup; the passthrough colour space is excluded from every HDR profile
   (R03 implication 2, R02 implication 6).
4. **The Swift presenter fed by `VK_EXT_metal_objects`** (R10 and R03's target) becomes a gated P5 option, MoltenVK-only,
   plugged into the same `IOutputStage` seam so that the output-stage shader, profiles and dashboard move with it.

**Why this resolves the conflict.**

| Argument | Effect on the decision |
|---|---|
| Both the R10 and R03 targets depend on `VK_EXT_metal_objects`, which only the deprecated MoltenVK provides | Building Luma's main path on it would bind HDR to a layer Khronos no longer maintains [D] |
| MoltenVK and KosmicKrisp both map RGBA16F + `EXTENDED_SRGB_LINEAR` to extended-linear sRGB with EDR on | The in-swapchain path is the only presentation that is portable across both backends [D] (R03 §3.2, §4) |
| R03's own trigger for the hybrid was "once the native dashboard is needed" | Drawing the dashboard in Vulkan (R09) removes that trigger; the remaining triggers become gates |
| R09's same-drawable overlay keeps one opaque layer | Preserves direct-to-display eligibility on both backends [D]/[I] |
| R10's "one owner per layer" rule | Honoured for the colour space and EDR flag (Vulkan owns them). Luma adds only properties MoltenVK never writes; persistence is verified by G-PRES-1 rather than assumed [I] |
| The hybrid's costs: second toolchain on a beta Xcode, Avalonia run-loop conflicts, export fixes missing from the pinned package | Avoided until a measured need exists [M]/[D] (R10 §3.3, R03 §5) |

**What is portable, what is Mac-only, and what is phased.**

| Component | Portability | Phase |
|---|---|---|
| Output-stage shader (GLSL to SPIR-V), EETF, looks, UI compositing | Portable across MoltenVK and KosmicKrisp | P1 |
| Profile and calibration model, test patterns, telemetry schema, dashboard layout | Portable | P1, P4 |
| Display helper (`toneMapMode`, `contentsScale`, headroom) | Mac-only, backend-independent | P1 |
| PQ (`A2B10G10R10` + `HDR10_ST2084`) swapchain for the TV | MoltenVK-only (KosmicKrisp: no EDR) | Fallback, only if G-DISP shows PQ is more faithful |
| Native Swift presenter through `VK_EXT_metal_objects` | MoltenVK-only | P5, gated |

### D3. HDR method: guest-hash tonemap replacement, an allow-listed RGBA16F upgrade, and EDR output

**Genuine scene HDR has three parts** (R02 options A + B + C):

1. **Tonemap replacement keyed by guest shader hash.** In `ShaderCache.TranslateShader`, hash the guest code with the
   host-independent `Hash128` the disk cache already uses [D] (R02 §4A, R01 verification). On a match, substitute a
   project-written shader that keeps Ryujinx's resource layout and `ShaderProgramInfo`. The new tonemap rebuilds
   the vanilla `1 - e^-x` curve below a pivot and rolls off to the profile peak above it, instead of `saturate()`.
   Parameters (paper white, peak, mode) travel in new fields of the emulator-owned support buffer [I] (R02 §4A).
   The bloom composite may be replaced too, but only to expose its strength (optional).
2. **An HDR-safe post-tonemap sharpen/scale pass.** Encode (PQ or log), run the filter, decode. Never a point fetch,
   which visibly softens dynamic-resolution frames [I] (R01 implication 5, R02 Risks).
3. **Render-target upgrade by exact allow-list.** Host-only RGBA16F storage, with guest format and layout unchanged,
   only for targets written by the replaced passes and the downstream final and present buffers. Not every
   presented framebuffer, which is what made PR !31 unstable [D]/[I] (R02 §4B, implication 4). Readbacks of upgraded
   targets (photo mode, album) convert half-float back to RGBA8.

**Output.** Through the D4 output stage as RGBA16F + `EXTENDED_SRGB_LINEAR` EDR. Extended-linear sRGB is chosen over
linear Display P3 because KosmicKrisp maps `DISPLAY_P3_LINEAR` to a non-extended space [D] (R03 §4); P3 colours
from the vivid look are carried as out-of-range sRGB values [I].

**Order of work.**

1. Output stage in SDR identity mode (G-HDR-0).
2. One attended capture session (G-HDR-1) settles R02's unknowns U1-U5 and U8 before the expensive texture work.
3. Tonemap replacement, post-tonemap pass, RT allow-list, UI model (P3).

**Fallback tier: "Expanded SDR".** A model-based inverse of the known TOTK curve on the 8-bit output, then the same
EETF (R02 §4D). Built only if the scene-HDR gates fail or the owner's person-week ceiling is reached. It is never
labelled HDR (R03 Risks, R04 implication 9).

**Nothing depends on ReShade or MacShade.**

**Display mapping.** One EETF in the renderer: BT.2390 / BT.2408 Annex 5, written from the published formula [D]
(R04 §4). Neutwo (MIT, from RenoDX) is an alternative curve. No GPL Lilium code is used.

**Display profiles** (R04 §4):

| Parameter | MacBook XDR | Sony A95L |
|---|---|---|
| Units | Relative EDR, live headroom | Absolute nits, converted through one measured constant N (panel nits at EDR 1.0) |
| Paper white | EDR 1.0 | 203 nits on the panel (EDR = 203 / N) |
| UI white | EDR 1.0 × UI scale 0.85 (range 0.6-1.0) | 203 nits or less × UI scale |
| Peak target | min(live headroom, owner MaxTML) | Owner MaxTML; start at 1,000, labs report 1,150-1,375 at 10% [D]/[A] |
| Full-field limit | n/a | Owner MaxFFTML; start at 250 (labs 235-255) |
| System and TV tone mapping | `EDRMetadata` nil, `toneMapMode = never` | TV HDR Tone Mapping Off during calibration, then A/B with Gradation preferred |

At a headroom of 1.0 the EETF degrades gracefully to SDR without changing mid-tones (R04 implication 5).

**UI at paper white: the boundary model** (R02 §4 UI handling, R01 §1.2):

- The replaced tonemap writes the scene scaled by `game_white / ui_white`. Game UI drawn after the replaced
  post-tonemap pass keeps its [0, 1] range, so it lands exactly at 1.0 = UI white.
- The output stage multiplies by UI white (EDR or nits per the table above).
- An exception list by guest hash covers UI that should glow. Pre-rendered video stays at paper white.
- The blend encoding of the final target (sRGB view or shader gamma, gate U2) must be resolved first, or
  translucent UI changes appearance.

**Licensing.** Reimplement the TOTK passes from the documented equations; do not copy RenoDX's reconstructed TOTK
shader files, which derive from game code (R02 implication 2). Reuse generic MIT RenoDX maths (Neutwo, hue/purity
correction) with attribution. The TOTK replacement shaders and the guest hash table live in the owner-local title
pack (ADR 0001).

**Dashboard source-mode label:** "Scene HDR", "Expanded SDR" or "SDR", always visible when the dashboard is open.

### D9. In-game UI technology and SDR-safe UI in EDR

1. **Drawn in the output stage, into the same drawable.** No Avalonia overlay, no sibling layer, no extra window.
2. **Dear ImGui (MIT) for layout and widgets only.** Luma renders ImGui's draw lists with its own Vulkan pass inside
   the output stage, so colour handling is ours. The .NET binding and its native library (ImGui.NET is the binding
   R09 names) are pinned and hash-recorded like MoltenVK; whether a prebuilt osx-arm64 native library is available
   and reproducible is gate G-UI-0 [I]. If it fails, fall back to the small custom immediate-mode renderer R09
   describes (text atlas, plates, lines; 4-8 days) [I].
3. **Calibration patterns are rendered by the output stage itself, not by ImGui:** HGIG 10% and full-field
   checkers, a near-black PQ ramp, a paper-white match swatch, a blooming box, and primary ramps (R04 implication 2).
   This makes calibration exercise the real swapchain path.
4. **SDR-safe UI rules** (R09 §4, R04 §4):
   - `ui_white = paper_white × UI scale`, default 0.85, range 0.6-1.0; EDR 1.0 or less on the Mac, 203 nits or less
     on the A95L.
   - UI vertex colours are converted from sRGB to linear and scaled to UI white in the shader.
   - The game image under each plate is clamped to UI white; plates are at least 85% opaque; graph colours stay SDR
     and never use full-intensity primaries.
5. **Behaviour.** Hidden by default and zero cost while hidden. Auto-dims after a few seconds on the OLED to limit
   retention. Gamepad navigation is the primary path (keyboard focus inside the Avalonia-hosted view is a risk).
6. **Content.** Guest, present and display frame-time graph; FPS; cap; present mode; panel refresh; cadence fit;
   direct-to-display (shown as "unknown" unless verified); output histogram and waveform on a PQ axis; clipping and
   gamut counters; EDR headroom (current, potential, reference, and "stale?"); source mode; backend; shader-cache
   state (cold or warm).
7. **Labelling.** Every number is labelled *signal* (computed from pixels sent), *profile* (target settings) or
   *measured* (an owner-entered instrument reading with instrument, window size and date). Mac nits appear only as
   "assumed N nits at EDR 1.0" (R04 §5, R09 Summary).
8. **Avalonia keeps** profile and preset selection menus.
9. The toggle bindings (DualSense mute plus one keyboard key) are decided in ADR 0004.

---

## Alternatives considered

### D3

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **Guest-hash tonemap replacement + allow-listed RT upgrade + EDR output (chosen)** | Recovers real highlights at the one point they are lost; host-independent key | Texture-cache work is the highest-risk item | R02 §3, §4; R01 implication 2 |
| RenoDX TOTK add-on as shipped | Proven scene HDR on Windows | Windows ReShade add-on; host-SPIR-V hashes do not match macOS output; no Vulkan loader | R01 §1.3, §1.4, verification |
| Port RenoDX into a MacShade add-on | Reuses an existing framework | 3-8 weeks, very high risk [I]; MacShade has no HDR and is untested with Ryubing; injected code sees every keyboard event | R01 §2, effort notes |
| Inverse tonemap as the main path (Beast Roofer method) | Cheap, low risk | Cannot recover clipped highlights; posterises near white; UI shares the buffer; meets "HDR swapchain" wording only | R02 §4D; R03 Risks |
| Revive PR !31 wholesale | Existing code | Closed as "too unstable"; upgraded every presented framebuffer; kept SRGB_NONLINEAR (no EDR) | R02 §5 |
| 10-bit PQ swapchain as the main format | System maps PQ; half the bandwidth | KosmicKrisp gives it no EDR [D]; kept as a MoltenVK-only TV fallback | R03 §4, Options B |
| Depend on ReShade or MacShade for HDR | No emulator changes | No HDR path exists on this Mac | R09 Summary |

### D4

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **In-swapchain output stage plus display helper (chosen)** | Portable across both backends; one opaque layer; one toolchain | Direct-to-display for the Avalonia child view unmeasured; layer-property persistence assumed until G-PRES-1 | R03 §3.2, §4, Options A; R09 §4 |
| Swift dylib owns the visible layer; MoltenVK renders offscreen (R10, R03 target) | Full layer control; native display-link pacing; best chance of direct-to-display | MoltenVK-only; deprecated dependency; 1.5-3 weeks extra [I]; export fixes absent from the pinned package; run-loop risk | R03 §5; R10 §2C; MoltenVK `0aa76ad` |
| Sibling `CALayer` or separate `NSWindow` for the overlay | System shows SDR layer at SDR white automatically | Forces compositing, probably loses direct-to-display [I]; a window can steal focus [M] | R09 §4; [E] §2 rows 8-9 |
| Separate-process presenter (IOSurface plus shared event over XPC) | Crash isolation | Highest latency and lifetime complexity [I] | R03 Options D; R10 §2B |

### D9

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **Dear ImGui draw lists rendered by the output stage (chosen)** | Sliders, plots and gamepad navigation for free; EDR-correct by construction | Adds a pinned native dependency | R09 effort notes |
| Small custom immediate-mode renderer (R09 default) | No dependency | Calibration widgets must be built by hand; 4-8 days for the basics [I]. Kept as fallback | R09 effort notes |
| Native AppKit or SwiftUI windows or layers | Native polish | Composited; focus-theft risk; needs the Swift toolchain ADR 0001 defers | R09 §4; [E] |
| Avalonia overlay | Same toolkit as the menus | SDR control over the native view: no EDR-correct UI white, an extra layer, and it runs on the UI thread that also pumps input | R07 §1.1; R09 §4 |

---

## Consequences

**Positive**

- One presentation path gives visible EDR on both displays early (P1), and every later tier reuses it.
- No tier is throwaway: SDR identity, Expanded SDR and Scene HDR share the output stage, profiles and dashboard.
- Calibration, scopes and the dashboard are EDR-correct and portable across backends.
- The capture session prevents spending weeks on texture-cache work against wrong assumptions.

**Negative**

- The RT upgrade repeats the class of change that sank PR !31; it needs strict allow-lists and a kill switch.
- Guest hashes are fixed for 1.4.3 only; any exefs patch (including D2) must not alter these shaders [I] (R02 Risks).
- If the Avalonia child view cannot go direct-to-display, fullscreen latency may be higher than a native presenter's.
- RGBA16F doubles bandwidth against 8-bit; at 4K about 66 MB per frame, small against unified memory bandwidth, so the
  risk is latency and composition rather than throughput [I] (R03 §2).

---

## Evidence gates and kill criteria

| Gate | Pass condition | If it fails |
|---|---|---|
| G-HDR-0 | Output stage in sRGB / no-EDR mode matches a stock capture within ±1 code value (R10 implication 3) | Do not proceed to EDR; fix the stage |
| G-PRES-1 | After create and recreate, the layer reports `EXTENDED_SRGB_LINEAR`, EDR on, `toneMapMode = never`, correct `contentsScale`; a ramp card shows no system tone mapping on the XDR panel | Re-apply strategy fails: candidate trigger for the native presenter |
| G-PRES-2 | Instruments display track in fullscreen, overlay on and off; direct-to-display state recorded | If composited, measure the latency cost before considering the native presenter |
| G-PRES-3 | Pacing targets in ADR 0003 met with `present(at:)` | If not, and `CAMetalDisplayLink` could meet them, that justifies the native presenter |
| G-PRES-4 | If KosmicKrisp becomes the default backend | Shelve the native presenter (it would need an `MTLHeap` path) |
| G-NATIVE (native presenter go) | G-PRES-1, 2 or 3 failed, **and** a 1-day `VK_EXT_metal_objects` export spike passes an SDR identity check (R10 unknowns) | Stay in-swapchain |
| G-HDR-1 (capture session) | Owner-scheduled, dumps kept privately; records U1 pre-tonemap formats, U2 sRGB view versus shader gamma, U3 guest hashes of bloom, tonemap and post-tonemap shaders, U4 target sizes at 1x and 1.2x, U5 exposure location, U8 cutscene and photo-mode paths; also the post-tonemap pass identity (CAS per R01's verification, EASU per R02's) | Without it, P3 does not start |
| G-HDR-2 | The replacement covers every host specialisation variant (no frames rendered vanilla); the disk cache is re-keyed | Fix coverage before any visual judgement |
| G-HDR-3 | Warm 900 s run with 0 new artefacts in each scene; output-stage and RT-upgrade cost measured by A/B on the GPU-bound island | Kill switch to SDR; narrow the allow-list |
| G-HDR-4 | Owner side-by-side on both displays shows recovered highlight detail, clean gradients and correct colour against SDR, judged on detail not brightness; the source-clip counter confirms recovered, not invented, data | Iterate within the ceiling, else fallback |
| G-UI-0 | The ImGui binding and native library are pinned, hash-recorded and reproducible on osx-arm64 | Use the custom renderer |
| G-UI-1 | Overlay and scope cost measured with GPU timestamps (estimate 0.05-0.2 ms, R09); zero when hidden | Simplify scopes or sub-sample harder |
| G-UI-2 | Owner usability pass of calibration on both displays (HGIG clip points found without an instrument) | Redesign the flow |
| G-UI-3 | Timestamp queries work on MoltenVK | Compare against an Instruments GPU trace |
| G-DISP | Per display: potential, current and reference headroom recorded; on the A95L, N estimated visually or measured, PQ ramp behaviour, HDMI format at 4K120 (R03, R04 unknowns) | Profile stays "assumed" |

**Kill criterion for scene HDR:** if P3 exceeds the owner's person-week ceiling or cannot pass G-HDR-3, ship the
"Expanded SDR" tier (3-7 days after the output stage, R02) clearly labelled, and record scene HDR as "not achieved"
rather than relabelling the fallback.

---

## Effort range

All [I], from R01, R02, R03, R04 and R09.

| Item | Range |
|---|---|
| Output stage, EDR swapchain, headroom plumbing (includes the in-swapchain validation of 1-3 days) | 1-2 weeks (R02 C; R03 option A) |
| Presenter-stage chain and GAL method | 3-5 days (R09) |
| Pattern generator and profile storage; calibration UI; headroom readouts | 2-4 days; 2-3 days; 1-2 days (R04) |
| Overlay renderer (ImGui draw lists or custom) | within 4-8 days (R09) |
| Validation tooling (CPU reference, offscreen harness, debug hash logging) | about 1 week (R02) |
| Tonemap replacement (A) | 1-3 weeks after hashes are known (R02) |
| RT allow-list upgrade (B) | 2-5 weeks, largest uncertainty (R02) |
| UI paper-white model | 3-5 days after U2 (R02) |
| Post-tonemap HDR-safe pass | 2-6 days (R01) |
| Scene HDR total (A + B + UI + post-tonemap) | about 4-10 person-weeks (R10 phase 3; consistent with R02's 6-12 weeks including C and tooling) |
| Expanded SDR fallback | 3-7 days after the output stage (R02) |
| Native presenter, if gated in | 1.5-3 weeks (R03) |

---

## Open questions for the owner

1. Approve the in-swapchain output stage as the v1 presenter, with the native Swift presenter only behind G-NATIVE?
2. Approve the attended capture session (G-HDR-1): one scheduled emulator run; dumps and traces stay in the private
   workspace.
3. Set the person-week ceiling for P3 before falling back to the labelled Expanded SDR tier.
4. Approve Dear ImGui (MIT) as a pinned dependency, subject to G-UI-0?
5. Accept computed-nits-only labelling until an instrument is available (no purchases planned)?
6. Default UI scale 0.85: acceptable, or another default within 0.6-1.0?
7. A95L sessions: connection on HDMI 3 or 4 with Enhanced format, TV HDR Tone Mapping Off during calibration.
