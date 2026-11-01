# 09 - Optional Effects, ReShade-Style Support, HDR Scopes and the Overlay

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: optional vivid colour and defog looks, ways to run ReShade-style effects on the Mac without the Windows addon ABI,
HDR analysis scopes, how and where to draw the dashboard overlay, and calibration UX references.
Evidence tags: [D] documented, [M] measured in the private local evidence workspace, [I] inference, [A] anecdote or user report.

---

## Summary

- **Grade before the tone map wherever possible.** Haze is additive in linear radiance (I = J·t + A·(1−t)), so defog is only
  physically meaningful on scene-linear values. A saturation boost before the tone map is compressed with everything else, while the
  same boost after it pushes clipped highlights out of gamut. On the SDR 8-bit frame that Ryubing presents today, any look is a
  display-referred approximation. [I, built on [4] and [5]]
- **The cleanest defog for 1.4.3 is the native data mod, installed by the owner.** Serfrost's Base Defogger v2.4 (CC BY-NC-ND 4.0)
  edits only EnvPalette and CavePalette and is listed for "All Game Update Versions". It boots on 1.4.3 with 0 flashes, but its visual
  effect has still not been shown in a same-framing A/B test. TOTK Luma must never bundle or redistribute it. [D] [1], [M] [2]
- **Depth-aware defog after the fact is high-risk.** Ryubing has no depth hand-off at present. The presented frame already contains
  the UI, the 3D targets change size with TOTK's dynamic resolution, and particles, clouds and water write no reliable depth.
  A depth-free display-stage approximation is the only safe post-process fallback. [I], [D] [12]
- **Use Oklab for relative (scene-stage) chroma and ICtCp for absolute (display-stage, nits) chroma.** Add highlight-aware
  desaturation near the profile peak, plus soft gamut compression into the panel gamut. [D] [5] [6], [I]
- **No off-the-shelf ReShade path gives HDR on this Mac.** MacShade (BSD-3, active as of 2026-11-01) runs the real ReShade 6.8 on
  MoltenVK apps through dyld interposing, but every Metal and screen-filter path goes through BGRA8 with `saturate()`. On the Vulkan
  path, Ryubing's swapchain is B8G8R8A8. vkBasalt needs a Vulkan loader, and Ryubing redirects `libvulkan.dylib` straight to
  `libMoltenVK.dylib`. [D] [11] [10] [12]
- **The best long-term fit for ReShade FX is the reshadefx compiler** (BSD-3-Clause, a static library with a SPIR-V back end),
  run on Ryubing's own Vulkan device at the presenter stage. librashader (MPL-2.0) is mature and float-capable, but it runs RetroArch
  slang presets, not ReShade FX. For the TOTK Luma look itself, a small built-in shader set is cheaper than either. [D] [8] [9], [I]
- **Draw the dashboard and scopes inside the presenter pass, on the same drawable.** A sibling CALayer or NSWindow forces
  Core Animation compositing. Apple documents direct-to-display as requiring full-screen mode, an opaque CAMetalLayer and RGB content.
  [D] [19], [I]
- **Scopes:** a luminance histogram, a waveform on a PQ axis, and clipping and gamut counters, accumulated with threadgroup atomics
  inside the final encode pass on sub-sampled pixels. Read back from a ring of 3 host-visible buffers with 1-2 frames of latency.
  The estimated cost is 0.05-0.2 ms on the M4 Pro; this must be measured with GPU timestamps. Prior art: Lilium (GPL-3.0) and
  Special K (GPL-3.0) for ideas only; do not copy their code. [D] [13] [14], [I]
- **Label every number by where it comes from:** *signal* (computed from the pixels sent), *profile* (target settings) and *measured*
  (a meter reading entered by the owner, with date and window size). Show EDR headroom as a ratio (current, potential, reference),
  and give nits only as "assumed". [D] [17] [18], [I]
- **Frame-time data exists in Ryubing but is averaged away.** SurfaceFlinger records each guest frame, but PerformanceStatistics
  folds the samples into a 750 ms window. Add a per-frame ring buffer, plus host-present and actual display times
  (MoltenVK lists `VK_GOOGLE_display_timing`). Never use the Metal HUD rate as game frame time. [D] [12] [27], [M] [2]

---

## Findings

### 1. Vivid colour and defog paths

#### 1a. User-installed game data mods (Serfrost)

| Item | Finding | Tag |
|---|---|---|
| Identity | "Serfrost's Defogger (Native)", GameBanana mod 446995; added 2023-05-31, page updated 2025-06-23 | [D] [1] |
| Licence | CC BY-NC-ND 4.0. Download and install: yes. Redistribute, modify and redistribute, or reuse parts: "ask". Commercial use: no | [D] [1] |
| Base file | `serfrosts_base_defogger_v2-4.zip`, 17,303 bytes, "Base Defogger, All Game Update Versions"; the MD5 matches the local manifest | [D] [1], [M] [2] |
| What it edits | `EnvPalette.pack.zs` and `CavePalette.pack.zs` (romfs) | [D] [1], [M] [2] |
| Author's stated scope | Higher visibility in all weather, shrines and caves. **No change** to the Depths, Thunderhead Isles, distant ranges and cliffs, bloom, dust, clouds, particles, or interiors (those need the add-on). "Not removing all fog is intentional." | [D] [1] |
| Interior add-on | Separate file, `interior_addon.zip` (2025-06-23). It edits `Bootup.Nin_NX_NVN.pack.zs`, is version-specific, and conflicts with any other mod that touches Bootup. The author: 1.2.1 and 1.4.0 or newer "might still work with the 1.2.0 Interior Add-on" | [D] [1] |
| Local status | Base boots on 1.4.3 with 0 flashes in 450 s. The F8 A/B test was inconclusive (different framing, a sky area). Currently disabled | [M] [2] |

Why a data mod is the best defog: it changes the game's own fog and palette parameters *before* lighting and tone mapping. It is
therefore correct with depth, works with transparency and costs nothing at runtime. [I]

What TOTK Luma may do with it: document it as an optional, owner-installed mod, with a checksum check and a same-framing A/B
procedure. The "ND" (no derivatives) and "ask before redistributing" terms rule out bundling it, patching it, or merging it with
other palette mods. [D] [1]

#### 1b. Post-process defog without depth, and the risks of depth-aware approaches

**Without depth (display-referred), the options are:**

- *Global airlight subtraction.* SweetFX Tonemap does `saturate(color - Defog * FogColor * 2.55)` on the gamma-encoded back buffer
  [D] [3]. This is cheap, but it applies one offset everywhere, crushes shadows and clips any channel that goes below zero. [I]
- *Dark-channel-prior dehaze.* He, Sun and Tang (CVPR 2009) estimate haze thickness per patch from the minimum channel, then refine
  it [D] [4]. It needs a min-filter and guided-filter pass (several full-screen passes) and is sensitive to sky and bright surfaces.
  Without temporal smoothing, it flickers frame to frame. [I]
- *Luminance-weighted airlight removal in linear light.* Linearise the sRGB frame, estimate a slowly varying airlight colour from the
  upper percentile of low-chroma pixels, subtract it with a weight that falls to zero towards black, and protect UI-like pixels.
  This is the recommended fallback; it is an approximation and must be labelled as one. [I]

**Depth-aware defog on an emulator: risks** [I unless noted]

- Ryubing exposes no depth at present time. The effect chain receives only the final colour `TextureView`
  (`Window.cs:359-364`, `IPostProcessingEffect.Run`) [D] [12]. A depth buffer would have to be found by texture-cache heuristics,
  the way ReShade's generic depth add-on guesses.
- With TOTK's dynamic resolution, the 3D target size changes (1921x1076 at 1.2x was one sample) while the output stays fixed.
  A wrong or stale depth match causes shimmering edges and halos. [M] [2], [I]
- The UI is composited before present. Depth from the 3D pass knows nothing about the UI, so HUD elements over the sky (far depth)
  would be "defogged" too.
- The game already applies height and distance fog in its shaders. Removing it again by depth double-corrects, and clouds, particles
  and water, which have no depth, end up with hard silhouettes.
- Depth linearisation needs the projection parameters (near and far planes, reversed-Z or not). These are unknown, and reading them
  would mean decoding guest constant buffers, which drifts towards reverse engineering. This is outside the project's rules beyond
  documentation.

#### 1c. Grading in the HDR domain

- **Oklab** is scale-invariant by design ("If the scale/exposure of colors are changed, the perceptual coordinates should just be
  scaled by a factor"). It assumes "normal well lit viewing conditions", and its reference code is public domain or MIT [D] [5].
  It suits relative, exposure-normalised scene-linear data. Its lightness is not calibrated for absolute HDR luminance. [I]
- **ICtCp** (Dolby, BT.2100) is built on PQ. It was designed for HDR and wide colour gamut, with improved hue linearity and
  constant luminance (the I-to-luminance correlation is reported as 0.998, against 0.819 for Y′CbCr) [D] [6]; the full white paper
  was not retrieved. It suits display-referred values in absolute nits, which is where the highlight and gamut decisions are made. [I]
- **Highlight saturation:** scale the chroma gain down as intensity approaches the profile peak (a "path to white"). Otherwise
  boosted highlights leave the panel gamut and the panel or the OS clips them per channel, which shifts hue (yellow fire turning
  orange, for example). [I]
- **Gamut:** the MacBook panel and the A95L are both near P3. Compress softly into P3 inside the BT.2020 or extended-linear
  container instead of hard clipping. [I]

**Order: scene-linear before the tone map versus display-referred after it**

| Effect | Before the tone map (scene-linear) | After the tone map (display-referred) |
|---|---|---|
| Defog | Physically consistent subtraction in radiance; the tone map then restores contrast naturally | Approximate only; the risk of crushing shadows grows with gamma encoding and 8-bit quantisation |
| Vivid | Exaggerated chroma is compressed by the tone map along with luminance, which looks natural | Direct control over the final result, but it can exceed the gamut and peak; needs highlight roll-off and gamut compression |
| Banding | Float precision, little risk | On the 8-bit SDR source, saturation and contrast boosts amplify banding; dithering is required |
| Availability on 1.4.3 | Only if the game's internal HDR render targets are captured before its tone map pass (another note in this series) | Available now, on the presented SDR frame |
| Recommendation | The primary stage for both looks once scene capture exists | A fallback stage, labelled "approximate", always followed by our own output encode |

[I], based on [3]-[6] and the SDR swapchain facts in [2].

### 2. ReShade-style support without the Windows addon ABI

**Ryubing's built-in effects pipeline at 9afba70** [D] [12]

- `Window.Present` (`Window.cs:312`) runs one optional `IPostProcessingEffect` (FXAA or SMAA) on the guest colour view
  (`:359-364`). Then an optional `IScalingFilter` (FSR, Area) or a blit writes into the swapchain image (`:424-447`).
- The effects are compute shaders on an `rgba8` storage image (`Fxaa.glsl:176`, `FsrScaling.glsl:5`, `AreaScaling.glsl:5`).
  FXAA copies the guest texture's format and binds it through `ConvertRgba8SrgbToUnorm` (`FxaaPostProcessingEffect.cs:59, 77`).
- The GAL `IWindow`'s only effect controls are `SetAntiAliasing`, `SetScalingFilter` and `SetScalingFilterLevel` (`IWindow.cs:14-16`).
  Besides `Present`, `SetSize` and `ChangeVSyncMode`, it also has `SetColorSpacePassthrough` (`:17`). There is no effect-chain method.
- The swapchain is `B8G8R8A8Unorm` with SRGB_NONLINEAR or PASS_THROUGH_EXT (`Window.cs:229-260`).
- **Integration points:** (a) pre-scale, at guest resolution, as a new `IPostProcessingEffect`; (b) a new post-scale stage that
  writes the output image, where the overlay and scopes belong. Both need float formats (`rgba16f`) and a GAL method for a
  configurable chain.

**Candidates** [D unless noted]

- **reshadefx** (in crosire/reshade at 7bf9de8, BSD-3-Clause per the file headers). Built as the `ReShadeFX` static library
  (`CMakeLists.txt:348`), with `create_codegen_spirv(...)` (`effect_codegen.hpp:421`) and GLSL, HLSL, DXBC and DXIL back ends.
  ReShade passes `BUFFER_COLOR_SPACE` and `BUFFER_COLOR_BIT_DEPTH` to effects (`runtime.cpp:1663-1665`), and its colour spaces
  include scRGB and BT.2020 PQ (`reshade_api_format.hpp:185`). FX texture formats include `rgba16f` and `rgb10a2`. [8]
  Embedding means writing a runtime: the effect module, uniforms, render targets, passes and compute. vkBasalt did exactly this
  on Vulkan (`effect_reshade.cpp`, mapping `rgba16f` to `VK_FORMAT_R16G16B16A16_SFLOAT`). [10]
- **librashader** 0.12.1 (07ac790, MPL-2.0, with a GPLv3 option; the C API headers are more permissive). It has a C API
  (`librashader.h`, `librashader_ld.h`), Vulkan and Metal runtimes, and HDR output (SRGB, HDR10, scRGB or scRGB PQ chosen by the
  preset). It maps `R16G16B16A16_SFLOAT` to `MTLPixelFormatRGBA16Float` (`README.md:253-261`, `librashader-common/src/vk.rs:28`,
  `metal.rs:32`). Its input is RetroArch **slang** presets, not ReShade FX, and inverse tone mapping is left to the host. [9]
- **vkBasalt** (Zlib, last release v0.3.2.10 on 2023-07-03). A Vulkan layer that needs the Vulkan loader, with X11 build
  dependencies [10]. Ryubing's `MVKInitialization` resolver rewrites `libvulkan.dylib` to `libMoltenVK.dylib`
  (`MVKInitialization.cs:12, 36-44`), so no loader or layer chain exists. [12] Not viable without changing Ryubing's loading.
- **MacShade** (klotzbrocken/MacShade at 8f6fbef, BSD-3 for its own code, vendoring ReShade 6.8). It injects `libmacshade.dylib`
  through `DYLD_INSERT_LIBRARIES` into an *ad-hoc re-signed copy* of the app, emulates the Vulkan loader, and interposes about 140
  MoltenVK symbols (`NOTES.md:6-13`). Its input layer swizzles `-[NSApplication sendEvent:]` (`NOTES.md:14`). Metal-bridge frames are
  converted to BGRA8 with `saturate()` (`metal_bridge_mac.mm:61-66`), and the screen filter captures `kCVPixelFormatType_32BGRA`
  (`capture_filter_mac.mm:338`). The project measured about 3.4 ms of GPU time at 1080p for its Metal bridge on a Switch emulator
  ("Mush8", `NOTES.md:95-104`). The bridges "switch themselves off as soon as the app uses Vulkan directly" (`NOTES.md:17`), so for
  Ryubing the relevant path is ReShade on Ryubing's own B8G8R8A8 swapchain, not the BGRA8 Metal bridge. Its private bridge
  swapchain is also hard-coded to `VK_FORMAT_B8G8R8A8_UNORM` with sRGB non-linear (`mac/platform/vk_bridge_mac.cpp:172`).
  No HDR or EDR support was found in its source. It is untested on .NET or Ryubing, and re-signing
  must keep Ryubing's hypervisor entitlement. [11], [I]
- **Roofer HDR** (corrected on verification). It is "The Beast Roofer Edition", a Ryujinx fork hosted on its own forge
  (https://thebeastroofer-edition.com/rooferdev/the-beast-roofer-edition, v1.2.5 at a4fb32b, 2026-08-05; its README says
  MIT for the fork's own code). Its HDR option says it "Expands the SDR image to HDR via inverse tone mapping into an scRGB float
  swapchain … This is not native/per-game HDR: the game still renders in SDR … Vulkan only"
  (`src/Ryujinx/UI/Views/Settings/SettingsGraphicsView.axaml:99`). The swapchain choice prefers `A2B10G10R10` + HDR10/ST.2084,
  then `R16G16B16A16Sfloat` + `EXTENDED_SRGB_LINEAR` (`src/Ryujinx.Graphics.Vulkan/Window.cs:515-541`). So it is inverse tone
  mapping, not preserved scene HDR, and it has not been tested on macOS or MoltenVK. [D], [I]

### 3. HDR analysis and scopes

**Prior art**

- **Lilium, "ReShade_HDR_shaders"** (EndlesslyFlowering, b1ada21, GPL-3.0). `lilium__hdr_and_sdr_analysis.fx` shows max, average
  and min luminance and CLL, the value under the cursor, gamuts used with a gamut map, a CIE diagram with BT.709, P3, BT.2020 and
  Pointer outlines, a heatmap, and a waveform in four modes: luminance, max CLL, RGB combined and RGB individually (`:674-695`).
  The waveform axis is PQ-encoded, with ticks from 0.05 to 10,000 nits (`waveform.fxh:245-258`). It uses compute shaders with
  groupshared `atomicMax` (`luminance.fxh:612`). [13] The pattern to copy is a PQ axis with labelled nit ticks. Do not copy the
  code under a non-GPL licence.
- **Special K** (b8c355f, GPL-3.0). The HDR widget holds per-preset peak, paper-white and middle-grey values (`hdr.cpp:355-362`).
  Its luminance histogram compute shader does one `InterlockedAdd` per luminance bucket (`cs_luminance_analysis.hlsl`), and its
  ImGui histogram plot is commented out (`hdr.cpp:2733`). [14]
- **PresentMon** (MIT, Windows/ETW) keeps separate metrics: MsBetweenPresents, MsBetweenDisplayChange, MsUntilDisplayed,
  MsInPresentAPI, GPUBusy, CPUBusy, MsAnimationError, PresentMode and FrameType. [15]
- **MangoHud** (MIT, Linux Vulkan and OpenGL). `frame_timing` is on by default, an optional `histogram` replaces the FPS graph,
  `fps_sampling_period` defaults to 500 ms, `toggle_hud` is Shift_R+F12, `fps_limit` takes a list cycled by `toggle_fps_limit`,
  and `present_mode` is shown. Its `hdr` status works only in gamescope. [16]

**Efficient GPU design** [I, cost figures to be measured]

1. **Fuse the analysis into our final encode pass** (the pass that writes the swapchain) instead of downsampling separately.
   Sample one pixel per 2x2 or 4x4 block: at a 2304x1296 output that is about 747k or 187k samples.
2. **Histogram:** 128 bins in PQ code space (0-10,000 nits), accumulated in threadgroup memory, then one global atomic add per
   non-empty bin per threadgroup.
3. **Waveform:** 256 columns × 128 PQ bins of `uint32` in a 128 KiB buffer, using global atomics on sub-sampled pixels. Render it
   as a small texture in the overlay pass of the *next* frame.
4. **Counters:**
   - pixels above the profile peak (rolled off);
   - pixels at source code 254-255 in any channel (clipped by the game's SDR tone map: the "information already lost" indicator);
   - pixels below the black floor;
   - pixels outside P3 when the container is BT.2020;
   - max of max(R,G,B) in nits, the mean, and the 99th percentile from the histogram.
5. **Readback:** a ring of 3 host-visible, coherent buffers (on Apple Silicon these map to shared memory). Read slot N−2 only after
   its fence has signalled and never wait on the GPU; clear each slot with `vkCmdFillBuffer` before reuse. Update numbers at
   4-10 Hz so they are readable; graphs can update every frame.
6. **Cost envelope:** reading one 2304x1296 RGBA16F image is about 24 MB per frame, about 0.09 ms at Apple's published ~273 GB/s
   for M4 Pro (not re-checked here). Sub-sampled analysis inside an existing pass should stay well under 0.2 ms. Verify with Vulkan
   timestamp queries around the pass, and run nothing at all while the dashboard is hidden.

**What each scope should plot**

| Scope | Domain | Axis | Reference lines |
|---|---|---|---|
| Scene histogram | Scene-linear, before our tone map (only when scene capture exists) | log2 exposure relative to the game's mid-grey or white (EV), **no nits** | The game's tone-map white or clip point, if known; our tone-map knee |
| Output histogram | Display-referred signal | PQ code value labelled in nits (0.05, 1, 10, 100, 203, 400, 1000, 4000) | Paper white, profile peak, current EDR ceiling, black floor |
| Waveform | Display-referred signal; luminance or max(R,G,B) mode | PQ, as above | Same as above; peak-clip band shaded |
| Source clipping | Guest SDR frame (input) | % of pixels per frame, over time | None; it shows how much highlight data the game already discarded |
| Gamut | Display-referred | % outside the panel gamut, plus an optional CIE inset later | P3 and BT.709 outlines |

Scene-referred values have no absolute luminance, so never label them in nits. Display-referred values become nits only through the
active profile's paper-white mapping. [I], with BT.2408 giving 203 cd/m² as HDR reference and graphics white for PQ [D] [7].

**Labelling computed signal nits versus measured panel nits** [I]

- **Signal:** "what we sent", computed from the encoded pixel through the active output transform (PQ, or EDR with an assumed
  reference white).
- **Profile:** what the owner chose for paper white, peak, black floor and roll-off.
- **Measured:** only values the owner enters from a meter, stored with the date, instrument, pattern window size (for example 10%
  or full field) and display preset. Unmeasured fields show "not measured", never a default.
- On the MacBook, Apple defines 1.0 as SDR white at the current brightness, with values above it as headroom; absolute nits for
  1.0 depend on the brightness setting [D] [17]. Show nits on the MacBook only as "assumed: N nits at 1.0".

**Showing EDR headroom** [D] [17] [18], [A] [29]

- Show the current headroom (`maximumExtendedDynamicRangeColorComponentValue`, which changes with brightness), the potential
  headroom (`maximumPotential…`, fixed per NSScreen object) and the reference headroom (`maximumReference…`, which is 0 when
  reference rendering is unsupported).
- Draw a "ceiling" line on the PQ axis at current headroom × assumed reference white, and flag when the profile peak exceeds the
  ceiling (the system will clamp).
- Apple also documents that the current value "is 1.0" whenever no on-screen content provides EDR values, and that it can be 1.0
  at maximum brightness even on an EDR display [D] [17]. A reading of 1.0 while the game shows SDR is therefore expected, not stale.
- Refresh on `NSApplicationDidChangeScreenParametersNotification`. Developer reports say that after sleep or wake on third-party
  HDR displays the value can be stale, and that SDL falls back to the potential headroom when the current value reads 1.0. Show
  "stale?" when the headroom stays at 1.0 while EDR content is on screen.

### 4. Overlay rendering on the Mac

**Presenter pass versus a separate layer or window**

| Approach | Compositing and direct-to-display | EDR and HDR behaviour | Input and focus | Verdict |
|---|---|---|---|---|
| Draw in our presenter pass, into the same drawable | Keeps one opaque layer, so it remains eligible for direct-to-display [I], given Apple's conditions [D] [19] | Full control: UI at paper white, PQ- or EDR-correct | None added | **Recommended** |
| A sibling CALayer above the CAMetalLayer | Core Animation must composite the layers; likely loses direct-to-display [I] | The system can show the SDR layer at SDR white automatically; this is convenient | None | Debug fallback only |
| A separate borderless NSWindow (MacShade's screen-filter approach) | Composited; 1-2 frames of delay, per MacShade's own documentation [D] [11] | Its capture path is BGRA8 [D] [11] | Can steal focus; risky given the prior focus findings [M] [2] | Avoid |

Apple: "To enable direct-to-display, your app needs to run in full-screen mode, displaying an opaque CAMetalLayer layer and RGB
content, and run on a Mac with Apple silicon. There may be other edge case conditions… All of the RGB formats supported by Metal layers are capable of drawing direct-to-display content. You can enable the Metal
HUD or use instruments to verify." [D] [19] Whether the Avalonia-hosted MoltenVK view in Ryubing qualifies at all is unverified.

**SDR-safe UI in EDR and PQ** [I]

- Convert UI colours from sRGB to linear. Map UI white to `ui_white = paper_white × ui_brightness` (default 0.8), which is ≤ 1.0 in
  EDR and ≤ paper-white nits in PQ. Never exceed it.
- Composite in linear light, but first clamp the game image *under* each panel to ≤ UI white. Translucent plates over 1000-nit
  highlights are otherwise unreadable. Use plate opacity of 85% or more.
- Keep graph lines at or below UI white, and never use saturated pure primaries at full intensity. The waveform's own colours
  stay SDR.

**Toggle shortcut without leaking it to the game** [D] [12], [I]

- Ryubing's hotkeys are polled from the same keyboard state as emulated input (`AppHost.cs:1350`, `GetHotkeyState` at `:1460-1490`),
  and nothing is consumed. A key bound to both a hotkey and a player mapping fires both. Validate that the dashboard key is unbound
  in every keyboard player profile.
- **DualSense:** SDL3 `MISC1` is the "PS5 microphone button" [D] [28]. Ryubing maps `Misc1` as an ordinary bindable input
  (`SDL3Gamepad.cs:51`) [D] [12]. Use **mute (MISC1) as a dedicated dashboard toggle**, removed from the guest mapping. It has no
  Switch equivalent, so nothing can leak. Optional fallback chord: hold Create + Options for 0.5 s, swallowed from the guest
  while held. Avoid the PS button anyway: SDL `GUIDE` becomes Ryubing's `Guide` input (`:50`), and macOS can bind it to a system
  gesture. `preferredSystemGestureState` "isn't guaranteed" [D] [21].
  (Corrected on verification: at 9afba70, `Guide` is **not** Switch Home. `ControllerKeys` has no Home bit and
  `NpadController._hleButtonMapping` has no `Guide` entry, so the PS button reaches the guest only if the owner binds it to a
  Switch button. [D] [12])
- Whether SDL reads the DualSense through HIDAPI or GameController on this macOS is an evidence gate.

**Frame-time data sources and the presentation-mode readout** [D] [12] [20] [27] [30], [I]

| Series | Source | Status |
|---|---|---|
| Guest frame interval | `SurfaceFlinger.OnFrameAvailable` and `OnFrameReplaced` call `RecordGameFrameTime` (`SurfaceFlinger.cs:534-542`). This is the true game cadence under D2 | Exists, but averaged by a 750 ms timer (`PerformanceStatistics.cs:49`). Add a per-frame timestamp ring |
| Host present call | Timestamp around `vkQueuePresentKHR` in `Window.Present` | Easy to add |
| Actual display time | `VK_GOOGLE_display_timing` `actualPresentTime` (listed in MoltenVK's extension list at upstream main 5189f8d and at the upstream `v1.4.2` tag); Metal's equivalent is `MTLDrawable.presentedTime` (0.0 when dropped) | Unverified on the 1.4.2-ryujinx.5 fork build |
| GPU time of our passes | Vulkan timestamp queries | Unverified on MoltenVK; Apple GPUs sample counters at stage boundaries |
| Present mode | `ChooseSwapPresentMode`: IMMEDIATE only for Unbounded, otherwise **MAILBOX if offered**, else FIFO (`Window.cs:283-296`). Upstream MoltenVK (v1.4.2 tag and main) advertises only FIFO and, when Metal allows it, IMMEDIATE (`MVKDevice.mm`), so on the Mac the choice is in practice FIFO or IMMEDIATE unless the Ryujinx fork differs | Read the mode actually chosen, plus the refresh rate |

Show, as text: present mode, vsync mode, refresh rate, frame cap, cadence fit, and a direct-to-display state of "unknown" unless
verified. Cadence fit matters: 45 FPS does not divide 60 or 120 Hz, so without VRR or ProMotion pacing it will judder, in a
3-3-2 refresh pattern at 120 Hz and a 2-1-1 pattern at 60 Hz. [I]

### 5. Calibration and dashboard UX references

| Reference | Pattern | Copy | Avoid |
|---|---|---|---|
| Windows HDR Calibration [24] | Three "drag until the pattern disappears" tests (darkest detail, brightest detail, max full-frame), then a saturation slider; runs full screen; profile per display | The disappearing-pattern clip tests, the **separate full-frame test** (relevant to OLED ABL on the A95L), per-display profiles | A subjective saturation step inside calibration; Microsoft warns that too much "might look unnatural and over saturated" |
| PS5 Adjust HDR [25] | Three screens with a symbol that should be "barely visible"; guides disagree by ±1-2 steps | Few steps, a gamepad-only flow | The ambiguous end point; results depend on whether the TV's own tone mapping is off (HGIG) [A] |
| Xbox HDR Game Calibration [26] | Asks for game mode and no sharpening first, then visibility patterns | The pre-flight checklist for the TV state | Relying on unrecorded TV settings |
| HGIG principles [25] | Avoid double tone mapping; avoid complicated in-game calibration | Treat "TV tone mapping off" as a recorded profile precondition | Assuming every display behaves the same |
| Apple Fine-Tune Calibration [22] [23] | Enter measured and target white x, y and luminance (cd/m²) per preset on MacBook Pro | The **measured-value entry with a target**, per display preset | Implying a measurement exists when it does not |
| PresentMon [15] | Present, display-change and until-displayed intervals kept separate | The three-series split and an explicit present mode | Windows-only ETW assumptions |
| MangoHud [16] | Config file, one toggle key, cycling fps-limit list, CSV logs with percentiles | One toggle, a cap list (30/45/60), percentiles (1% and 0.1% low) | Overlay on by default; an FPS graph instead of frame time |
| Special K [14] | Dense ImGui panels with per-preset nits | Per-profile paper white and peak | Panel overload; GPL code reuse |

---

## Implications for TOTK Luma

1. **Two grading stages, in a fixed order:**
   - Scene stage (scene-linear, once capture exists): defog, then exposure and white balance, then Oklab vivid.
   - Our tone map.
   - Display stage (nits): ICtCp highlight-aware chroma, then gamut compression, then UI and overlay, then the output encode.
   - Until scene capture exists, only the display stage runs, on the linearised SDR frame, with "approximate" shown in the dashboard.
2. **Defog priority:** (a) the owner-installed Serfrost Base, validated by a same-framing A/B in a hazy surface area; (b) scene-stage
   airlight subtraction; (c) display-stage luminance-weighted subtraction with blue-noise dithering. No depth-based defog in v1.
3. **Built-in looks first, ReShade later.** Ship "Vivid" and "Defog" as two built-in compute shaders with three strengths and a
   neutral default. Keep a reshadefx embedding as a phase-later option behind a gate.
4. **Presenter-stage integration in Ryubing:** add a post-scale, output-resolution stage in `Window.Present` that writes the
   swapchain (in float, once the HDR swapchain lands). Add a GAL method for the chain. Fuse scopes and the overlay into it.
5. **Dashboard:**
   - Hidden by default, at zero cost while hidden. One key, plus DualSense mute.
   - Panels: frame time (guest, present, display), present mode and cadence, signal histogram and waveform on a PQ axis,
     clipping and gamut counters, EDR headroom, and the active profile with "signal / profile / measured" labels.
6. **Frame-time ring:** 512 entries of `{guest_ts, present_ts, display_ts}`. Compute 1% low and 0.1% low, plus the pacing error
   against the cap interval.

---

## Options compared

| Option | Fit for TOTK Luma | HDR float support | Licence | Maintenance (2026-11-01) | Effort |
|---|---|---|---|---|---|
| Built-in compute shaders in Ryubing's presenter | High; exact control of order and domain | Yes, if written for `rgba16f` | Ours | Ours | Low-medium |
| reshadefx embedded (SPIR-V) on Ryubing's device | Medium-high; runs the ReShade FX ecosystem | Yes (`rgba16f`, colour-space macros) | BSD-3 | Active (pushed 2026-09-24) | High |
| librashader (Vulkan runtime, C API) | Medium; wrong shader format for ReShade FX, good for CRT and retro looks | Yes (scRGB, HDR10) | MPL-2.0 or GPLv3 | Active (2026-10-11) | Medium |
| MacShade injection | Low; unsupported on .NET, re-signing, untested | No (BGRA8 with `saturate`) | BSD-3 plus ReShade BSD-3 | Very active (2026-11-01) | Low to try, high risk |
| vkBasalt | Very low; needs the Vulkan loader and X11 | Partly (`rgba16f` textures) | Zlib | Stale (2023) | High |
| Serfrost Base (data mod) | High for defog only; native | N/A (source change) | CC BY-NC-ND, owner install only | Updated 2025-06 | Very low |
| Depth-aware post defog | Low; heuristics and risk of artefacts | Possible | Ours | Ours | High |

---

## Unknowns and evidence gates

| Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|
| Does Serfrost Base visibly change 1.4.3 scenes? | Decides whether the native defog is real | Same save, time and weather, same framing; window capture A/B at Lookout Landing in rain | Looks phase, owner-attended |
| Does the 1.2.0 Interior add-on work on 1.4.3? | The author says "might still work"; prior notes call it incompatible | Boot plus a set of interiors and transitions; check for Bootup conflicts | Optional, later |
| Does the Ryubing fullscreen view go direct-to-display? | The overlay design assumes one opaque layer | Metal HUD or Instruments in fullscreen, overlay on and off | Before overlay sign-off |
| Is `VK_GOOGLE_display_timing` exposed by MoltenVK 1.4.2-ryujinx.5? | The display-time series depends on it | `vkEnumerateDeviceExtensionProperties` log at startup | Telemetry phase |
| Timestamp-query accuracy on MoltenVK | Verifying the <0.2 ms scope budget | Compare against Instruments GPU trace | Scopes phase |
| DualSense backend (SDL HIDAPI or GameController) | Whether mute (MISC1) and PS reach SDL, and whether macOS gestures intercept them | Log SDL joystick driver names and button events | Input phase |
| Absolute nits of EDR 1.0 on the MacBook in the default preset | The "assumed nits" label | Meter at 100% window against brightness steps, or use a reference mode | Calibration phase |
| Headroom staleness on the A95L over HDMI after sleep | A ceiling line shown wrongly | Log headroom over a sleep and wake cycle | Calibration phase |
| Does the game's SDR tone map clip highlights heavily? | Value of display-stage vivid versus scene capture | Source-clipping counter over a long session | Scopes phase |
| Does MacShade inject into Ryubing at all? | Only as a quick SDR look experiment | Optional owner trial on a copy; out of the default plan | Not planned |

---

## Risks

- **Licence contamination.** Lilium and Special K are GPL-3.0 and AstrayFX is CC BY-ND. Reuse ideas only. Serfrost is ND, NC and
  "ask", so it is never bundled. [D] [1] [11] [13] [14]
- **"Approximate" looks mistaken for HDR.** Display-stage grading on an 8-bit SDR source can look punchier without recovering any
  highlight data. The dashboard must say which stage is active. [I]
- **Overlay cost and side effects.** A separate layer or window could disable direct-to-display and add latency, and
  focus-stealing windows break the owner handoff. [I], [M] [2]
- **Measurement confusion.** Mixing computed signal nits with panel nits, or the Metal HUD's 120 Hz cadence with game frame time,
  repeats a known pitfall. [M] [2]
- **Input leaks.** A dashboard key that is also in a keyboard player mapping fires both, and the PS button or mute reaches the guest
  if the owner binds `Guide` or `Misc1` to a Switch button. (Ryubing has no Home mapping, so the PS button is not Home by
  default.) [D] [12]
- **Banding and flicker.** Strong vivid or defog on 8-bit sources, and per-frame airlight estimates without temporal smoothing. [I]
- **The ReShade FX runtime is large.** A partial runtime breaks many effects in subtle ways (unsupported intrinsics, compute,
  storage formats). [I]

---

## Effort notes

These assume one developer familiar with C# and Vulkan, working in Ryubing's existing Vulkan backend. Validation needs
owner-attended runs.

| Work item | Estimate | Assumptions |
|---|---|---|
| Presenter-stage chain plus GAL method | 3-5 days | The float swapchain and HDR output come from another work item |
| Overlay renderer (text atlas, plates, lines) | 4-8 days | No ImGui; a small immediate-mode renderer. ImGui.NET (MIT) is an alternative |
| Scopes (histogram, waveform, counters, readback ring) | 4-7 days, plus 2-3 days of validation | Fused into the encode pass |
| Frame-time ring plus present and display series | 3-5 days, plus up to 3 days if display timing needs MoltenVK work | |
| Built-in Vivid and Defog (display stage) | 3-6 days | The scene stage depends on the scene-capture note |
| Input: dashboard key plus DualSense mute and chord | 2-4 days | SDL3 path; includes the guest-swallow logic |
| reshadefx embedding | 3-6 weeks | Native C++ static library with P/Invoke, uniforms, textures, passes, compute |
| librashader integration | 1.5-3 weeks | Rust dylib, Vulkan runtime on Ryubing's device and queue |

---

## Sources

1. "Serfrost's Defogger (Native)", GameBanana mod 446995: https://gamebanana.com/mods/446995 and the API record
   https://gamebanana.com/apiv11/Mod/446995/ProfilePage (licence, files, description). Accessed 2026-11-01.
2. The private local evidence workspace: final report §6 (Serfrost, HDR), the prior task repository's turn-6 research report §4
   and turn-8 result §6, and the shared project context (measurements, swapchain facts, Metal HUD caveat). Read-only, accessed
   2026-11-01.
3. CeeJayDK/SweetFX, `Shaders/SweetFX/Tonemap.fx` line 41 at 93ddf39 (MIT). https://github.com/CeeJayDK/SweetFX Accessed 2026-11-01.
4. K. He, J. Sun, X. Tang, "Single Image Haze Removal Using Dark Channel Prior", CVPR 2009, DOI 10.1109/CVPR.2009.5206515.
   https://people.csail.mit.edu/kaiming/cvpr09/index.html Accessed 2026-11-01.
5. B. Ottosson, "A perceptual color space for image processing" (Oklab), 2020-12-23 (matrices updated 2021-01-25).
   https://bottosson.github.io/posts/oklab/ Accessed 2026-11-01.
6. Dolby, "ICtCp" white paper v7.1: https://professional.dolby.com/siteassets/pdfs/ictcp_dolbywhitepaper_v071.pdf
   (summarised from search excerpts; the full text was not retrieved). Accessed 2026-11-01.
7. ITU-R Report BT.2408-9 (03/2026), operational practices in HDR television production:
   https://www.itu.int/dms_pub/itu-r/opb/rep/R-REP-BT.2408-9-2026-TOC-HTM-E.htm (the 203 cd/m² figure via search summary).
   Accessed 2026-11-01.
8. crosire/reshade at 7bf9de8 (2026-09-24), BSD-3-Clause: `source/effect_codegen_spirv.cpp:1-4`, `source/effect_codegen.hpp:421`,
   `source/runtime.cpp:1663-1665`, `include/reshade_api_format.hpp:185`, `CMakeLists.txt:348,410`.
   https://github.com/crosire/reshade Accessed 2026-11-01.
9. SnowflakePowered/librashader at 07ac790 (0.12.1), MPL-2.0: `README.md:253-261,308-330`,
   `librashader-common/src/vk.rs:28`, `metal.rs:32`. https://github.com/SnowflakePowered/librashader Accessed 2026-11-01.
10. DadSchoorse/vkBasalt at 4f97f09, Zlib, release v0.3.2.10 (2023-07-03): `README.md`, `src/effect_reshade.cpp:1186-1187`.
    https://github.com/DadSchoorse/vkBasalt Accessed 2026-11-01.
11. klotzbrocken/MacShade at 8f6fbef (2026-11-01), BSD-3: `README.md`, `NOTES.md:6-14,95-104`,
    `mac/platform/metal_bridge_mac.mm:61-66`, `mac/platform/capture_filter_mac.mm:338`, `GAMES.md`.
    https://github.com/klotzbrocken/MacShade Accessed 2026-11-01.
12. Ryubing official source at 9afba70 (identical to upstream 475615f):
    `src/Ryujinx.Graphics.Vulkan/Window.cs` (lines 229-260, 283-296, 312, 359-364, 424-447),
    `Effects/IPostProcessingEffect.cs`, `Effects/FxaaPostProcessingEffect.cs:59,77`, `Effects/Shaders/Fxaa.glsl:176`,
    `src/Ryujinx.Graphics.GAL/IWindow.cs:14-16`, `src/Ryujinx.Graphics.Vulkan/MoltenVK/MVKInitialization.cs:12,36-44`,
    `src/Ryujinx.HLE/PerformanceStatistics.cs:49,101,164`, `src/Ryujinx.HLE/HOS/Services/SurfaceFlinger/SurfaceFlinger.cs:534-542`,
    `src/Ryujinx/Systems/AppHost.cs:1350-1390,1460-1490`, `src/Ryujinx.Input.SDL3/SDL3Gamepad.cs:50-56`. Accessed 2026-11-01.
13. EndlesslyFlowering/ReShade_HDR_shaders at b1ada21, GPL-3.0: `Shaders/lilium__hdr_and_sdr_analysis.fx:674-695`,
    `Shaders/lilium__include/hdr_and_sdr_analysis/waveform.fxh:245-258`, `luminance.fxh:612`.
    https://github.com/EndlesslyFlowering/ReShade_HDR_shaders Accessed 2026-11-01.
14. SpecialKO/SpecialK at b8c355f, GPL-3.0: `src/widgets/hdr.cpp:355-362,2733`,
    `resource/shaders/HDR/cs_luminance_analysis.hlsl`, `resource/shaders/cs_histogram.hlsl`.
    https://github.com/SpecialKO/SpecialK Accessed 2026-11-01.
15. GameTechDev/PresentMon, `README-CaptureApplication.md` (MIT).
    https://github.com/GameTechDev/PresentMon/blob/main/README-CaptureApplication.md Accessed 2026-11-01.
16. flightlessmango/MangoHud, `README.md` (MIT). https://github.com/flightlessmango/MangoHud Accessed 2026-11-01.
17. Apple, "Performing your own tone mapping".
    https://developer.apple.com/documentation/metal/performing-your-own-tone-mapping Accessed 2026-11-01.
18. Apple, `NSScreen.maximumReferenceExtendedDynamicRangeColorComponentValue` (macOS 10.15+).
    https://developer.apple.com/documentation/appkit/nsscreen/maximumreferenceextendeddynamicrangecolorcomponentvalue
    Accessed 2026-11-01.
19. Apple, "Managing your game window for Metal in macOS".
    https://developer.apple.com/documentation/metal/managing-your-game-window-for-metal-in-macos Accessed 2026-11-01.
20. Apple, `MTLDrawable.presentedTime`. https://developer.apple.com/documentation/metal/mtldrawable/presentedtime Accessed 2026-11-01.
21. Apple, `GCControllerElement.preferredSystemGestureState`.
    https://developer.apple.com/documentation/gamecontroller/gccontrollerelement/preferredsystemgesturestate Accessed 2026-11-01.
22. Apple, "Use Fine-Tune Calibration in the Pro Display Calibrator" (macOS 26 guide).
    https://support.apple.com/guide/mac-help/mchlee9c1884/26/mac/26 Accessed 2026-11-01.
23. Apple, "Use presets and reference modes with your Apple display". https://support.apple.com/en-us/108321 Accessed 2026-11-01.
24. Microsoft, "Calibrate your HDR display using the Windows HDR Calibration app".
    https://support.microsoft.com/en-gb/windows/hardware/display-graphics/calibrate-your-hdr-display-using-the-windows-hdr-calibration-app
    Accessed 2026-11-01.
25. What Hi-Fi, "HGiG explained" (third-party; covers PS5 and HGIG):
    https://www.whathifi.com/advice/hgig-explained-what-is-hgig-how-do-you-get-it-and-should-you-use-it ; Display Daily, HGIG
    guidelines: https://displaydaily.com/hdr-gaming-interest-group-to-propose-production-and-distribution-guidelines/
    Accessed 2026-11-01.
26. Pure Xbox, "New HDR calibration feature being rolled out to Xbox Insiders" (2020, third-party):
    https://purexbox.com/news/2020/08/new_hdr_calibration_feature_being_rolled_out_to_xbox_insiders Accessed 2026-11-01.
27. KhronosGroup/MoltenVK at 5189f8d, `Docs/MoltenVK_Runtime_UserGuide.md` extension list (`VK_GOOGLE_display_timing`,
    `VK_KHR_present_wait`, `VK_EXT_hdr_metadata`, `VK_EXT_swapchain_colorspace`). Upstream main, not the Ryujinx fork.
    https://github.com/KhronosGroup/MoltenVK Accessed 2026-11-01.
28. libsdl-org/SDL at 4158d1d, `include/SDL3/SDL_gamepad.h:161-176` (MISC1 is the "PS5 microphone button").
    https://github.com/libsdl-org/SDL Accessed 2026-11-01.
29. Apple Developer Forums thread 810008 (EDR headroom after sleep or wake, [A]), https://developer.apple.com/forums/thread/810008 ;
    SDL discourse, "Use the maximum potential headroom if EDR content isn't currently being displayed" ([A]),
    https://discourse.libsdl.org/t/sdl-use-the-maximum-potential-headroom-if-edr-content-isnt-currently-being-displayed/49434
    Accessed 2026-11-01.
30. Khronos, `vkGetPastPresentationTimingGOOGLE`.
    https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/vkGetPastPresentationTimingGOOGLE.html Accessed 2026-11-01.

### Access failures and limits

- https://developer.apple.com/documentation/metal/hdr-content returned only its title through WebFetch, with no body text.
- https://www.playstation.com/en-us/support/hardware/ps5-hdr-settings/ returned HTTP 404. No official Sony page was found, so the
  PS5 facts are third-party.
- No official support.xbox.com page for HDR Game Calibration was found, so the Xbox facts are third-party.
- No Special K wiki page for the HDR widget was found; source code only.
- The author's searches did not locate "Roofer HDR" on the web or GitHub. The independent check found it on its own forge
  (see section 2); it is an SDR-to-HDR inverse tone map, not scene HDR.
- Apple's documentation pages render only their title through WebFetch. The verifier read them through Apple's JSON documentation
  endpoint (`https://developer.apple.com/tutorials/data/documentation/<path>.json`).
- The Dolby ICtCp white paper and ITU-R BT.2408 were not fetched in full; their claims come from search excerpts.
- Nothing was built or run. The cost figures are estimates.

---

## Independent verification

Checked on 2026-11-01 by an independent reviewer. The reviewer re-read the official Ryubing source at 9afba70 with `git show`,
the open-source clones at the commits cited (MacShade 8f6fbef, reshade 7bf9de8, librashader 07ac790, vkBasalt 4f97f09,
ReShade_HDR_shaders b1ada21, MoltenVK v1.4.2 tag db66022 and main 5189f8d, SDL 5403934, The Beast Roofer Edition a4fb32b),
the live GameBanana API record, and Apple's documentation JSON. Nothing was built or run.

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| Serfrost Base v2.4 is CC BY-NC-ND 4.0; install yes, redistribute and modify "ask", commercial no; listed for all updates; edits EnvPalette and CavePalette only | Confirmed | GameBanana API `apiv11/Mod/446995/ProfilePage` (fetched 2026-11-01): `_aLicenseChecklist`, file `serfrosts_base_defogger_v2-4.zip`, 17,303 bytes, "Base Defogger, All Game Update Versions", MD5 `da6587991253155fb3bf18f48a718c2b`; description: "The Base Defogger works on all updates". The prior task repository's install manifest has the same MD5, and its handoff lists only the two palette packs | The private final report says 1.4.3 is "not in the author's announced compatibility". The live record says all updates, so the note's wording stands |
| The Ryubing effect chain runs in `Window.Present` on the final colour view; rgba8 storage images; no depth | Confirmed | `Window.cs:312` (Present), `:363` (`_effect.Run`), `:426` / `:439` (scaling filter or `BlitColor`); `Fxaa.glsl:176`, `FsrScaling.glsl:5`, `AreaScaling.glsl:5` are `layout(rgba8 …) image2D`; `FxaaPostProcessingEffect.cs:59,77` | `IWindow` also has `SetColorSpacePassthrough` (`:17`); the text was corrected |
| vkBasalt cannot load because Ryubing redirects `libvulkan.dylib` to `libMoltenVK.dylib` | Confirmed | `MVKInitialization.cs:12,36-44`; `InitializeResolver` is called at `Program.cs:242` and `HeadlessRyujinx.cs:82`. vkBasalt README: a "Vulkan post processing layer", with X11 dependencies; last release v0.3.2.10 (2023-07-03, GitHub API) | That "a layer needs the loader" is standard Vulkan design, kept as [D]+[I] |
| MacShade: BSD-3, ReShade 6.8, DYLD injection into a re-signed copy, MoltenVK apps supported, BGRA8 with `saturate()`, 32BGRA capture, no HDR | Confirmed, with nuance | `LICENSE` (BSD 3-Clause); `NOTES.md:6-14`; `metal_bridge_mac.mm:61-66` (`saturate`); `capture_filter_mac.mm:338`; no EDR or float-swapchain code found; HEAD 8f6fbef dated 2026-11-01 | The Metal bridge switches off for Vulkan apps (`NOTES.md:17`), so on Ryubing ReShade would see Ryubing's own B8G8R8A8 swapchain. Added to the text |
| reshadefx: BSD-3, static library, SPIR-V back end, `BUFFER_COLOR_SPACE` and bit-depth macros, `rgba16f` | Confirmed | `effect_codegen_spirv.cpp:1-4` (SPDX BSD-3-Clause), `CMakeLists.txt:348` (`add_library(ReShadeFX STATIC)`), `effect_codegen.hpp:421`, `runtime.cpp:1663-1665`, `effect_parser_stmt.cpp:1747,1751` (RGBA16F, RGB10A2) | The macros come from ReShade's runtime, not from the reshadefx library, so an embedder must define them itself. The 3-6 week effort is [I] and was not checked |
| librashader 0.12.1: MPL-2.0 or GPLv3, C API, HDR output, float formats, slang presets only | Confirmed | `librashader/Cargo.toml` version 0.12.1; `README.md:253-261` (SRGB, HDR10, scRGB, scRGB PQ; the host does inverse tone mapping); licence section `README.md:308-330`; `metal.rs:32`, `vk.rs:28` | — |
| Direct-to-display needs full screen, an opaque CAMetalLayer and RGB content | Confirmed, quote completed | Apple JSON for "Managing your game window for Metal in macOS": "…and RGB content, and run on a Mac with Apple silicon. There may be other edge case conditions…" | Apple does not say that a sibling layer breaks direct-to-display; that remains [I] |
| EDR 1.0 is SDR white at the current brightness; three headroom properties; `didChangeScreenParametersNotification` | Confirmed, with nuance | Apple JSON: "Performing your own tone mapping" (1.0 = "maximum standard dynamic range (SDR) brightness level"; 100- and 200-nit examples); `maximumExtendedDynamicRange…` "is 1.0" when no EDR content is on screen; `maximumPotential…` is fixed when the NSScreen object is created; `maximumReference…` is 0 without reference rendering | Added: a reading of 1.0 is expected while no EDR content is shown |
| Lilium waveform on a PQ axis (ticks 0.05 to 10,000 nits), atomics, GPL-3.0 | Confirmed | `waveform.fxh:245-258` (PQ ticks at 4000 … 0.05 nits, with the top edge at PQ 1.0 = 10,000 nits); `luminance.fxh:612` (`atomicMax`); `LICENSE` GPL v3 | — |
| Hotkeys are polled from the keyboard state and nothing is consumed; MISC1 is the PS5 microphone button; the PS button maps to Guide, "which is Switch Home" | **Corrected** | `AppHost.cs:1350,1460-1490` confirmed. SDL `SDL_gamepad.h:171` (MISC1 "PS5 microphone button", same at 4158d1d and 5403934). But `ControllerKeys.cs` has no Home bit and `NpadController.cs` `_hleButtonMapping` has no `Guide` entry | The PS button is not Switch Home in Ryubing; it reaches the guest only if the owner binds it. Text and Risks were corrected. Mute as the toggle still stands |
| Per-frame guest events exist but are averaged by a 750 ms timer; MoltenVK lists `VK_GOOGLE_display_timing` | Confirmed | `SurfaceFlinger.cs:534-542`, `PerformanceStatistics.cs:49` (`new(750)`); `MoltenVK_Runtime_UserGuide.md` lists it at main (line 423) and at the v1.4.2 tag (line 419) | The fork build 1.4.2-ryujinx.5 is still unverified |
| Ryubing picks MAILBOX whenever it is offered; 45 FPS judders | Confirmed, with nuance | `Window.cs:283-296`. Upstream MoltenVK `MVKDevice.mm:2151-2154` (v1.4.2) adds only FIFO and IMMEDIATE | On the Mac the MAILBOX branch is likely dead code, unless the Ryujinx fork adds it. The judder pattern is 3-3-2 at 120 Hz but 2-1-1 at 60 Hz; corrected |
| "Roofer HDR" could not be located | **Refuted** | The repository https://thebeastroofer-edition.com/rooferdev/the-beast-roofer-edition answered HTTP 200 on 2026-11-01; a4fb32b is "v1.2.5" (2026-08-05). `SettingsGraphicsView.axaml:99`: "inverse tone mapping into an scRGB float swapchain … not native/per-game HDR: the game still renders in SDR … Vulkan only" | Section 2 was updated. It does not meet the genuine-HDR goal, and it is untested on macOS |
| Scope cost of 0.05-0.2 ms, and the arithmetic | Unverifiable (cost); arithmetic confirmed | 2304×1296/4 = 746,496 and /16 = 186,624 samples; 256×128×4 B = 128 KiB; 2304×1296×8 B ≈ 23.9 MB, which is ≈ 0.09 ms at 273 GB/s | The cost is still an estimate; the GPU-timestamp gate stays |

**Residual doubts.** The Ryujinx MoltenVK fork (1.4.2-ryujinx.5) was not inspected, so its present modes and its
`VK_GOOGLE_display_timing` exposure are unknown. Whether MacShade's loader emulation hooks a `dlopen`-loaded MoltenVK inside a
.NET process is untested. Special K, PresentMon, MangoHud, the calibration UX references, Oklab and ICtCp were not re-checked.
