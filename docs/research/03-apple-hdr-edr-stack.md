# 03 - Apple HDR / EDR presentation stack, MoltenVK and KosmicKrisp colour spaces

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: how a Vulkan-based emulator on macOS 27.2 (Apple M4 Pro, built-in Liquid Retina XDR, Sony A95L over HDMI) can present genuine HDR through Apple's EDR (extended dynamic range) model. EDR is Apple's scheme in which pixel value 1.0 is the current SDR white and values above 1.0 use the display's spare brightness ("headroom").

Tags: [D] documented, [M] measured, [I] inference, [A] anecdote. Sources are numbered [n] at the end.

---

## Summary

- **EDR on a `CAMetalLayer` needs three things:** `wantsExtendedDynamicRangeContent = YES`, a pixel format that can carry the range, and a colour space that can carry it. The two Apple-documented recipes are `RGBA16Float` with an extended-linear space (for example `extendedLinearDisplayP3`), or `BGR10A2Unorm` with `itur_2100_PQ` [D][7][8][9].
- **Headroom is relative and changes with brightness.** On this MacBook a headless probe read `maximumPotentialExtendedDynamicRangeColorComponentValue = 16.0`, current headroom `2.67` and reference `0.0`. Both MSI monitors read `1.0` [M, new measurement for this note, 2026-11-01]. Headroom changes post `NSApplicationDidChangeScreenParametersNotification` [D][4].
- **macOS 15 and 26 added layer-level HDR controls.** These are `CALayer.toneMapMode` (macOS 15), plus `preferredDynamicRange` and `contentsHeadroom` (macOS 26). `CALayer.wantsExtendedDynamicRangeContent` (macOS 14) is deprecated in 26, but `CAMetalLayer`'s own property (macOS 10.11) is not. The macOS 27.2 SDK adds no new HDR *presentation* API to the headers checked; its one new HDR declaration is a CoreGraphics tone-mapping method, `kCGToneMappingHeadroomAdaptiveGainCurve` (macOS 27.0) [D][2][1][5].
- **Direct-to-display is documented for "full-screen + opaque `CAMetalLayer` + RGB content + Apple silicon".** Apple also says all RGB layer formats can go direct. Whether an EDR float layer actually goes direct on this machine is **not documented and not measured** [D][12][I].
- **System tone mapping costs time.** `EDRMetadata` "requires significant amounts of memory and GPU processing", and WWDC21 says it "increases latency and bandwidth". For arbitrary content, or when performance matters more than matching system tone mapping, Apple recommends disabling system tone mapping and doing your own [D][3][7][11].
- **MoltenVK (main `5189f8d`, version 1.4.3 unreleased; latest tag v1.4.2) maps colour spaces as follows.** `EXTENDED_SRGB_LINEAR`, `DISPLAY_P3_LINEAR`, `BT2020_LINEAR`, `HDR10_ST2084`, `HDR10_HLG` (and, oddly, `DISPLAY_P3_NONLINEAR` and `DCI_P3_NONLINEAR`) all set EDR = YES. `PASS_THROUGH` sets colourspace nil and EDR = NO. Any format can be combined with any colour space [D][18].
- **`vkSetHdrMetadataEXT` in MoltenVK has a pitfall.** It builds `CAEDRMetadata` with `opticalOutputScale: 1` and forces EDR on. On a float swapchain, 1.0 then means 1 nit, so an engine that does its own tone mapping must never call it [D][18][3][I].
- **The Ryujinx MoltenVK fork is public** (`Kenji-NX/MoltenVK`; package 1.4.2-ryujinx.5 = commit `89cdc5f`). None of its 9 extra commits touch `MVKSwapchain.mm`, so colour-space and EDR behaviour match upstream [D][19]. Its base `4b715bd` is 14 commits *behind* the upstream v1.4.2 tag, so the package lacks late 1.4.2 commits and all 1.4.3 fixes [D][19].
- **KosmicKrisp (Mesa) only enables EDR for float formats.** It is Vulkan 1.3- and 1.4-conformant, needs Metal 4 and macOS 26, and exposes `EXT_hdr_metadata`. But it sets EDR only when the format is float (`wants_edr && vk_format_is_float`), so a 10-bit `HDR10_ST2084` swapchain gets no EDR. It has no `VK_EXT_metal_objects`, and it exports memory only as an `MTLHeap` [D][20][21][22].
- **A hybrid presenter is feasible on MoltenVK.** Vulkan renders, `vkExportMetalObjectsEXT` hands over an `MTLTexture` plus an `MTLSharedEvent` (from a timeline semaphore), and a Swift/Metal presenter composes HDR and the overlay into one EDR layer. This is the recommended target architecture. The first step is a cheaper in-swapchain spike [D][18][I].
- **External HDR over HDMI:** the M4 Pro HDMI port supports up to 8K60 or 4K240 [D][15][16]. HDR10 is enabled per display with the "High Dynamic Range" setting [D][17]. Bit depth, chroma format, InfoFrame metadata and how headroom is derived for the A95L are **undocumented**. They must be measured with the TV connected [I].

---

## Findings

### 1. CAMetalLayer EDR on macOS

#### 1.1 Opt-in and formats

`CAMetalLayer.wantsExtendedDynamicRangeContent` (macOS 10.11). If any onscreen context sets it, content is clamped to the screen's current EDR maximum instead of 1.0 [D][1].

Pixel formats a `CAMetalLayer` accepts: `bgra8Unorm`, `bgra8Unorm_srgb`, `rgba16Float`, `rgb10a2Unorm`, `bgr10a2Unorm`, and the Apple-only `bgr10_xr`, `bgr10_xr_srgb`, `bgra10_xr` and `bgra10_xr_srgb` [D][1].

Apple's two documented EDR recipes:

| Recipe | Format | Colour space | Use |
|---|---|---|---|
| Own tone mapping | `RGBA16Float` | `kCGColorSpaceExtendedLinearSRGB` or `...ExtendedLinearDisplayP3` | Arbitrary or game content; "if performance is more important than matching the exact system tone mapping" [D][7][8] |
| Pre-encoded PQ | `BGR10A2Unorm` | `kCGColorSpaceITUR_2100_PQ` | Content already tone mapped and normalised [D][9] |
| System tone mapping | `RGBA16Float` + `EDRMetadata` | Extended-linear BT.2020 | Video that should match AVFoundation [D][10] |

WWDC21 adds a warning: colour management clips EDR values above 1.0 unless the colour space is extended-range [D][11].

#### 1.2 Colour-space constants (CoreGraphics, SDK 27.2 headers)

| Name | Availability |
|---|---|
| `kCGColorSpaceExtendedLinearSRGB`, `kCGColorSpaceExtendedSRGB` | macOS 10.12 |
| `kCGColorSpaceExtendedLinearDisplayP3`, `kCGColorSpaceExtendedLinearITUR_2020` | macOS 10.14.3 |
| `kCGColorSpaceDisplayP3_PQ` | macOS 10.15.4 |
| `kCGColorSpaceITUR_2100_PQ`, `kCGColorSpaceITUR_2100_HLG`, `CGColorSpaceUsesITUR_2100TF` | macOS 11.0 |
| `kCGColorSpaceITUR_2020_PQ` and the older `*_PQ_EOTF` names | deprecated, "No longer supported" |

Source: [D][5].

#### 1.3 CAEDRMetadata

- `CAMetalLayer.EDRMetadata` (macOS 10.15) must be set before `nextDrawable`. With nil, the system "doesn't perform any tone mapping" and values above the current maximum "may be clipped" [D][1][3].
- With metadata set, the docs require an above-1.0 format such as `rgba16Float` and "a color space that supports a linear transfer function". They also warn: "The tone mapping process requires significant amounts of memory and GPU processing" [D][3].
- Constructors [D][3]:
  - `HDR10MetadataWithMinLuminance:maxLuminance:opticalOutputScale:` (macOS 10.15).
  - `HDR10MetadataWithDisplayInfo:contentInfo:opticalOutputScale:`, taking the 24-byte MDCV and 4-byte CLLI SEI structures, big-endian (macOS 10.15).
  - `HLGMetadata` (macOS 10.15), and `HLGMetadataWithAmbientViewingEnvironment:` (macOS 14.0).
  - `isAvailable` (macOS 13.0).
- What `opticalOutputScale` means: buffer value y corresponds to C1·y cd/m², so C1 = 100 makes 1.0 equal 100 nits. For normalised formats (PQ), the scale is assumed to be 10,000 [D][3].
- For HLG into a linear layer, the app must apply the inverse OETF itself (nominal range 0-12) [D][3].

#### 1.4 Layer-level dynamic-range controls (new in macOS 15 and 26)

| API | macOS | Behaviour (header text, SDK 27.2) |
|---|---|---|
| `CALayer.toneMapMode` (`automatic`, `never`, `ifSupported`) | 15.0 | Controls when CALayer contents and **CAMetalLayer drawables** are tone mapped. `ifSupported` covers "PQ, HLG and extended-range contents" [D][2] |
| `CALayer.wantsExtendedDynamicRangeContent` | 14.0, deprecated 26.0 | Use `preferredDynamicRange` instead. `CAMetalLayer`'s own property (10.11) is not deprecated [D][2][1] |
| `CALayer.preferredDynamicRange` (`automatic`, `standard`, `constrainedHigh`, `high`) | 26.0 | `high` is "reserved for situations where the user is expected to be focused on the media". `constrainedHigh` modulates brightness to coexist with other content. The default is `standard` [D][2] |
| `CALayer.contentsHeadroom` | 26.0 | "CAMetalLayers can use this value to define how much headroom is needed by their MTLDrawables". Its stated purpose is to reduce power use [D][2] |
| `kIOSurfaceContentHeadroom` | 15.0 | Headroom tag (peak white / diffuse white) for IOSurface contents [D][6] |
| `CGColorCreateWithContentHeadroom`, `CGColorGetContentHeadroom` | 26.0 | HDR-tagged CGColors (relevant to an overlay drawn with CoreGraphics) [D][5] |

**macOS 27:** I diffed the macOS 26.5 Command Line Tools SDK against the Xcode 27.2 SDK for QuartzCore, AppKit `NSScreen.h`, CoreGraphics, IOSurface, CoreVideo, MetalKit and GameController headers. I found no new HDR presentation, EDR or headroom declarations. `NSScreen` gains only `touchCapabilities` (27.0). CoreGraphics is **not** documentation-only: `CGToneMapping.h` adds `kCGToneMappingHeadroomAdaptiveGainCurve` (value 6, `API_AVAILABLE(macos(27.0))`, "as per ICC and SMPTE ST 2094-50:2026") for `CGColorConversionInfoCreateForToneMapping`, plus a comment that headroom 0.0 means "unknown". It is an image or colour-conversion method, not a layer presentation control [D][1][2][4][5] (corrected by independent verification).

Not verified: how `preferredDynamicRange` interacts with a `CAMetalLayer` that also sets `wantsExtendedDynamicRangeContent`. The CALayer header says that a non-`standard` value stops tone mapping to SDR "even if wantsExtendedDynamicRangeContent is set to NO" [D][2]. Whether `contentsHeadroom` on a Metal layer changes the screen's reported headroom is also untested [I].

#### 1.5 NSScreen headroom properties

| Property | macOS | Meaning |
|---|---|---|
| `maximumExtendedDynamicRangeColorComponentValue` | 10.11 | Current maximum. The header says it is "typically" 1.0 unless some rendering context requested EDR, and its change posts `NSApplicationDidChangeScreenParametersNotification` [D][4]. Note: the windowless probe read 2.67 on the built-in display, so another onscreen app may already hold EDR, or the OS reports headroom regardless; do not assume 1.0 means "not requested" [M][I] |
| `maximumPotentialExtendedDynamicRangeColorComponentValue` | 10.15 | Fixed when the `NSScreen` object is created. A value above 1.0 means the display is EDR-capable [D][4] |
| `maximumReferenceExtendedDynamicRangeColorComponentValue` | 10.15 | Values from 0 up to this one get no extra tone mapping on reference displays. It is 0 when the display does not support reference rendering [D][4] |

WWDC21 recommends notifications rather than per-frame polling, while Apple's tone-mapping article reads the value each frame. Both are cheap; use the notification plus a per-frame read [D][8][11].

#### 1.6 How headroom behaves on the built-in XDR display

- EDR is display-referred. 1.0 is the current SDR white, which follows the brightness slider. Lowering brightness raises the headroom because the panel's peak stays the same [D][7][8].
- Panel limits for the M4 Pro MacBook Pro 16: SDR up to 1000 nits (outdoor), and XDR 1000 nits sustained full-screen, 1600 nits peak (HDR only) [D][15]. WWDC21 cites "up to 16x SDR" for the *iPad Pro's* Liquid Retina XDR (the session predates the 2021 MacBook Pro XDR); the probe's potential value of 16.0 matches that ratio on this MacBook [D][11][M].
- New measurement (headless AppKit probe, no window, 2026-11-01): built-in display potential = **16.0**, current = **2.67**, reference = **0.0**. Both MAG 274UPF E2 monitors read potential 1.0 (HDR is off or unsupported for them in macOS), and all three run at 120 Hz [M]. The current 2.67 implies an SDR white of about 600 nits *if* the peak is 1600 nits, but the brightness level was not recorded [I].
- **Reference modes** (System Settings > Displays > Preset), for example "HDR Video (P3-ST 2084)": 1000 nits full-screen sustained, ST 2084 EOTF. In these modes the brightness slider, True Tone and Auto-Brightness "might not be available" [D][14]. Expected behaviour is fixed headroom and a non-zero reference value, but this is **unverified on this machine** [I]. Reference-mode switching is the only documented way to make built-in paper white a known absolute value.
- **External HDR10 displays:** WWDC21 says "roughly 5x SDR" for typical HDR10 displays driven by a Mac [D][11]. How macOS derives that number (for example from the EDID static-metadata block) is not documented [I].

### 2. Compositing, direct-to-display and latency

- **Direct-to-display.** Apple's game-window guide says it needs full-screen mode (via `toggleFullScreen:`), an opaque `CAMetalLayer`, RGB content and Apple silicon. "All of the RGB formats supported by Metal layers are capable of drawing direct-to-display content". There are also undisclosed "edge case conditions". Drawable size need not match the display, because the hardware scaler handles it [D][12].
- **Why it matters.** "The direct path has the least buffering and the fewest number of refresh intervals". When composited, "there may be some additional buffering and display latency due to system UI elements or your own additional layers overlapping the screen" [D][13]. You can check the path with the Metal HUD or Instruments [D][12][13].
- **EDR versus SDR cost.** Float16 buffers double bandwidth compared with 8-bit or 10-bit. Brighter pixels cost power. `CAEDRMetadata` tone mapping "involves an extra processing pass. This, in turn, increases latency and bandwidth" [D][11]. No latency figures are published.
- Bandwidth arithmetic: a 3840x2160 `RGBA16Float` drawable is about 66 MB per frame, or about 4 GB/s written at 60 Hz. That is small next to M4 Pro memory bandwidth, so the risk is latency and composition rather than throughput [I].
- **Does PQ bypass OS tone mapping?** No, not by default. A PQ-tagged layer is decoded into the EDR space. WWDC21 gives the example that 100 nits PQ maps to EDR 1.0 and 10,000 nits maps to EDR 100 [D][11]. Values beyond the current headroom then clip or are tone mapped according to `toneMapMode` and `EDRMetadata` [D][2][3]. `toneMapMode = never` (macOS 15+) is the documented way to stop system tone mapping, and the app is then responsible for staying inside the headroom [D][2][I].
- **Game Mode** needs `LSApplicationCategoryType` set to games (Ryubing already sets `public.app-category.games` [D][25]) and full screen. `LSSupportsGameMode` (macOS 26) or `GCSupportsGameMode` makes the app eligible, but "the OS decides" [D][26][A]. Ryubing's plist has no `LSSupportsGameMode` key [D][25].
- **Ryubing's current layer** is a `CAMetalLayer` on a child `NSView` inside the Avalonia window (`EmbeddedWindow.cs:231-258`) [D][25]. Whether that hierarchy can go direct in Avalonia full screen is unmeasured. A dedicated presenter window is the cleaner path [I].

### 3. MoltenVK

#### 3.1 Version and fork

- **Upstream:** latest release tag v1.4.2 (GitHub release dated 2026-07-24). `main` at `5189f8d` (2026-10-13) reports 1.4.3, "Released TBD" [D][18].
- **Ryubing 9afba70** pins `Ryujinx.Graphics.Vulkan.MoltenVK` `1.4.2-ryujinx.5` (`Directory.Packages.props:77`) [D][25].
  - Its nuspec points to `github.com/Kenji-NX/MoltenVK` commit `89cdc5f` (2026-07-13, Apache-2.0) [D][19].
  - That commit is 9 commits ahead of upstream merge base `4b715bd` (2026-07-12). The commits disable residency sets, enable maximised concurrent shader compilation by default, fix `VK_KHR_present_wait` semantics, stop retaining `VkImage` from views, plus build and CI changes. **`MVKSwapchain.mm` is untouched**, and its last upstream change (2026-05-04) predates the merge base [D][19].
  - Newer packages exist: `1.4.2-ryujinx.6` and `1.4.3-ryujinx.1`/`.2` (the last on 2026-10-29) [D][19].

#### 3.2 Colour space to CAMetalLayer mapping (`MVKSwapchain.mm:520-571` @5189f8d)

| VkColorSpaceKHR | Layer colorspace | EDR |
|---|---|---|
| `SRGB_NONLINEAR_KHR` | `kCGColorSpaceSRGB` | NO |
| `DISPLAY_P3_NONLINEAR_EXT` | `kCGColorSpaceDisplayP3` | **YES** (Mesa: NO) |
| `EXTENDED_SRGB_LINEAR_EXT` | `kCGColorSpaceExtendedLinearSRGB` | YES |
| `EXTENDED_SRGB_NONLINEAR_EXT` | `kCGColorSpaceExtendedSRGB` | YES |
| `DISPLAY_P3_LINEAR_EXT` | `kCGColorSpaceExtendedLinearDisplayP3` | YES |
| `DCI_P3_NONLINEAR_EXT` | `kCGColorSpaceDCIP3` | **YES** (Mesa: NO) |
| `BT709_NONLINEAR_EXT` | `kCGColorSpaceITUR_709` | NO |
| `BT2020_LINEAR_EXT` | `kCGColorSpaceExtendedLinearITUR_2020` | YES |
| `HDR10_ST2084_EXT` | `kCGColorSpaceITUR_2100_PQ` | YES |
| `HDR10_HLG_EXT` | `kCGColorSpaceITUR_2100_HLG` | YES |
| `ADOBERGB_NONLINEAR_EXT` | `kCGColorSpaceAdobeRGB1998` | NO |
| `PASS_THROUGH_EXT` | `nil` (unmanaged) | NO |

The `EDR` setter is a macOS-only wrapper (`CAMetalLayer+MoltenVK.mm:53-63`). On iOS EDR is never set (open issue #2759) [D][18][28].

#### 3.3 Format requirements

- `getSurfaceFormats` (`MVKDevice.mm:2096-2140`) advertises the **full cross product** of BGRA8 and BGRA8_sRGB, `RGBA16Float`, `RGB10A2Unorm` and `BGR10A2Unorm`, times all colour spaces above [D][18].
  - MoltenVK does not enforce sensible pairings. `R16G16B16A16_SFLOAT` + `EXTENDED_SRGB_LINEAR` and `A2B10G10R10_UNORM_PACK32` (maps to `RGB10A2Unorm`) + `HDR10_ST2084` are the two meaningful HDR pairs [D][18][I].
  - The XR formats are registered, but no `VkFormat` maps to them, so they are not exposed [D][18].
- Ryubing's `ChooseSwapSurfaceFormat` (`Window.cs:229-263`) only ever picks `B8G8R8A8_UNORM` with `SRGB_NONLINEAR` or `PASS_THROUGH` [D][25]. This confirms the prior evidence.

#### 3.4 VK_EXT_hdr_metadata to CAEDRMetadata (`MVKSwapchain.mm:338-388`)

- MoltenVK packs `VkHdrMetadataEXT` into the H.265 MDCV and CLLI SEI byte layouts. Primaries go in G, B, R order in 0.00002 units, and luminance in 0.0001 cd/m², big-endian [D][18].
- It then calls `HDR10MetadataWithDisplayInfo:contentInfo:opticalOutputScale:1` and sets `wantsExtendedDynamicRangeContent = YES` [D][18].
- `opticalOutputScale:1` is correct for PQ, where normalised values assume 10,000 [D][3]. For a float linear swapchain, the header's C = C1·y formula makes 1.0 equal 1 nit and turns on the costly system tone mapper [I from D][3]. The same header also says HDR10 data "is treated as display referred with 1.0 mapping to diffuse white of 100 nits", so the real on-screen effect is ambiguous until tested; either way, avoid it on a float swapchain [I]. HLG metadata is never produced.

### 4. KosmicKrisp (Mesa)

- **Status:** Vulkan 1.3 conformant (LunarG, 2025-10-30) and Vulkan 1.4 conformant (Khronos news, fetched as 2026-10-01; a LunarG sidebar dates it 2026-09-25) [D][21][22].
  - SDK 1.4.357.0 (2026-07-28): "Metal4 is now mandated; requires macOS 26 or later", up to about 2.35x faster than the previous SDK [D][23].
  - Mesa docs: "Vulkan conformant implementation for macOS on Apple Silicon ... on top of Metal 4" [D][20].
  - `conformanceVersion` reports 1.4.6.2 (`kk_physical_device.c:703`) [D][20].
- **WSI colour spaces** (`wsi_common_metal.c:203-224`, `wsi_common_metal_layer.m:46-177` @Mesa `1558388`):
  - Formats: BGRA8 (unorm or sRGB), `R16G16B16A16_SFLOAT`, `A2R10G10B10`, `A2B10G10R10`.
  - The same 12 colour spaces as MoltenVK, but only when the instance enables `EXT_swapchain_colorspace` [D][20].
- **Differences from MoltenVK** [D][20]:
  - `DISPLAY_P3_NONLINEAR` and `DCI_P3_NONLINEAR` give no EDR.
  - `DISPLAY_P3_LINEAR` maps to the non-extended `kCGColorSpaceLinearDisplayP3`.
  - `BT2020_LINEAR` maps to the non-extended `kCGColorSpaceLinearITUR_2020` with no EDR.
  - Line 177 sets `wantsExtendedDynamicRangeContent = wants_edr && vk_format_is_float(format)`. **A 10-bit PQ swapchain therefore gets no EDR**, unlike Apple's documented PQ recipe [9].
- **HDR metadata:** the same MDCV/CLLI to `CAEDRMetadata` conversion with `opticalOutputScale:1`, without forcing EDR (`wsi_common_metal_layer.m:238-267`) [D][20].
- **Interop:** `EXT_external_memory_metal` exposes the `MTLHEAP` handle type only, and there is no `VK_EXT_metal_objects`. `KHR_present_wait`/`present_id` (and the 2 versions) are present [D][20].
- **For Ryubing:** the KosmicKrisp backend work (MR !131) is still in progress (prior evidence). HDR on KosmicKrisp means `RGBA16F` + `EXTENDED_SRGB_LINEAR` [I].

### 5. Hybrid presenter (Vulkan render, Swift/Metal present)

**Mechanism, MoltenVK only** [D][18]:

- `vkExportMetalObjectsEXT` returns:
  - the `MTLDevice` and per-queue `MTLCommandQueue`;
  - an `MTLTexture` for a `VkImage` or `VkImageView` (per plane);
  - an `IOSurface`;
  - an `MTLSharedEvent` for a semaphore or event (`MVKDevice.mm:5087-5139`).
- Timeline semaphores are always backed by `MTLSharedEvent` (`MVKDevice.mm:4301-4302`). This holds even though Ryubing configures `SINGLE_QUEUE` binary semaphores (`MVKInitialization.cs:28`) [D][18][25].

**Frame protocol** [I]:

1. Ryubing's final pass, which today blits or upscales into the swapchain, writes instead into a ring of 2-3 exportable `VkImage`s. The format is `R16G16B16A16_SFLOAT` for HDR, plus optionally a separate SDR UI image.
2. On submit, it signals timeline value N.
3. The presenter, on its own `MTLCommandQueue` on the same `MTLDevice`, calls `encodeWaitForEvent(event, N)`, samples the texture, and composes HDR tone mapping, SDR UI and the dashboard into one `RGBA16Float` drawable.
4. It signals a "slot free" value that Vulkan waits on before reusing the image.
5. It presents with `presentAfterMinimumDuration` (10.15.4) or `CAMetalDisplayLink` (14.0) pacing [D][1].

**Why the hybrid is attractive** [I]:

- One opaque layer with no sublayers, so the direct-to-display path stays open.
- Direct control of `toneMapMode`, `contentsScale` (Ryubing issue #461) and EDR on/off.
- The dashboard is drawn into the same drawable.
- MoltenVK swapchain recreation is removed from the critical path.

**Risks** [I]:

- The exported `MTLTexture` must stay the image's real backing. MoltenVK 1.4.3 notes fix import-path bugs [D][18], so bind memory before exporting. Those fixes are not in the pinned `1.4.2-ryujinx.5` package (base predates v1.4.2) [D][19].
- Ryubing's present path (FSR, SMAA, scaling) assumes an 8-bit swapchain. PR !31 failed as "too unstable" (prior evidence), and the cause is unknown.
- Cross-process presentation (IOSurface plus a shared event handle) is possible but adds latency and complexity. Prefer in-process (a Swift dylib called from C#).
- KosmicKrisp would need an `MTLHeap` placement-heap path. Treat it as unsupported for now.

### 6. External HDR: M4 Pro HDMI to Sony A95L

- **Modes:** the MacBook Pro 16 (2024, M4 Pro) supports one HDMI display at up to 8K60 or 4K240 [D][15]. Apple's HDMI page lists the same models for 8K60/4K240, needs an Ultra High Speed 48 Gbps cable for 8K, says "Adapters aren't supported for these resolutions and refresh rates", and lists "HDR on compatible Mac models" [D][16]. Apple does not call the port "HDMI 2.1" by name [D][16].
- **A95L:** 4K120 only on HDMI 3 and 4 with "Enhanced Format (4K120)", and it displays 4:4:4 correctly [D][29]. So 4K120 is the ceiling. The port's 4K240 capability is irrelevant here [I].
- **Bit depth and chroma at 4K120 HDR:** not documented by Apple. Forum reports conflict (RGB 10-bit versus 4:2:2, depending on adapter, EDID and model) [A][30].
  - 4K120 10-bit RGB needs about 32 Gbit/s of FRL, so it is plausible on a 48 Gbps link [I].
  - The local IORegistry exposes per-mode `ColorModes` entries with `PixelEncoding`, `Depth`-like element data, `EOTF` and `HDRStaticMetadataTypes = ("CEA-861:Type1")` keys. These keys are undocumented but readable without a GUI [M]. Together with the TV's signal-info screen they are the practical way to confirm the format.
- **HDR toggle:** "High Dynamic Range" appears in Displays settings only for third-party HDR10 displays [D][17]. Dolby Vision and HLG are converted to HDR10 on external displays [D][17]. On battery, HDR *video* may play as SDR unless "Optimize video streaming while on battery" is off [D][17]. Whether that also limits an EDR game layer is unknown.
- **Headroom on a TV:** about 5x SDR is typical [D][11]. The derivation (EDID desired max luminance, an SDR white assumption, the TV's response) and the absolute nits of EDR 1.0 are undocumented [I]. Measure: potential, current and reference values with the probe, plus a PQ grey ramp checked with the TV's own HDR info or a meter.
- **Static metadata in the HDMI InfoFrame:** no Apple documentation. Whether an app's `EDRMetadata` (MaxCLL/MaxFALL) reaches the TV, or macOS sends fixed desktop values, is **unknown** [I]. Gate: an HDMI analyser or TV diagnostics. Consumer TVs, including Sony, generally do not display MaxCLL.
- **Known issues (anecdotal):**
  - SDR desktop dim or washed out in HDR mode, with no SDR-brightness slider like Windows has.
  - HDMI sometimes negotiated as limited range.
  - An LG C3 showing an SDR signal despite HDR being enabled.
  - 4K120 4:4:4 limits on earlier Macs and adapters.

  No Sony-specific report was found [A][30]. These argue for an in-app SDR-white control and an explicit test card [I].

---

## Implications for TOTK Luma

1. **Present genuine HDR through `RGBA16Float` + `kCGColorSpaceExtendedLinearDisplayP3`** (or extended-linear sRGB to keep Rec.709 primaries), with `wantsExtendedDynamicRangeContent = YES`, `EDRMetadata = nil` and `toneMapMode = never`. Do the tone mapping yourself against live headroom, so the roll-off, paper white and SDR-safe UI are TOTK Luma's own, not the system's [D][2][7][8][I].
2. **Never call `vkSetHdrMetadataEXT`** on a float swapchain through MoltenVK. If HDR10 metadata is wanted for the TV, pass it through a native `CAEDRMetadata` only after the InfoFrame gate shows it has any effect [D][18][I].
3. **Build each display profile from three inputs:** (a) the static `potential` and `reference` values, (b) the live `current` value refreshed on `didChangeScreenParameters` and read each frame, and (c) the owner's calibration (paper-white scale in EDR units, highlight knee, black lift). On the built-in display, offer a "Reference (HDR Video P3-ST 2084)" profile as the absolute-nits mode [D][4][14][I].
4. **Draw the dashboard into the same drawable,** not as a sublayer. Use an opaque layer, full screen via `toggleFullScreen:`, and add `LSSupportsGameMode`. Verify "direct" with Instruments rather than the Metal HUD, which disturbs the shader cache [D][12][13][26][I].
5. **Turn EDR off when HDR is off or headroom is 1.0** (Apple's best practice for power) [D][11].
6. **Pace frames with a display-link presenter.** Note that 45 FPS does not divide 120 Hz. Measure judder before promising a 45 FPS cap on the built-in or TV path without VRR [I].
7. **Treat KosmicKrisp as float-only HDR** and keep the presenter interface backend-neutral [D][20][I].

---

## Options compared

| Option | What changes | HDR quality | Overlay | Direct-to-display | Backend | Effort | Main risk |
|---|---|---|---|---|---|---|---|
| A. In-swapchain FP16 (Ryubing `Window.cs` + MoltenVK `EXTENDED_SRGB_LINEAR`, extra layer properties set on Ryubing's own `CAMetalLayer`) | Format choice, final pass, layer properties | Full (own tone map) | Vulkan pass | Unclear (Avalonia child view) | MoltenVK and KK | Low-Med | Same path as closed PR !31 |
| B. In-swapchain 10-bit PQ (`A2B10G10R10` + `HDR10_ST2084`) | Same, PQ encode in final pass | Good; system maps PQ to EDR | Vulkan pass | Same as A | MoltenVK only (KK: no EDR) | Low-Med | Fixed 100-nit PQ mapping; behaviour on TV unmeasured |
| C. Hybrid presenter (export `MTLTexture` + `MTLSharedEvent`) | Replace swapchain with exported ring; Swift presenter window | Full | Native, same drawable | Best chance | MoltenVK | Med-High | Interop bugs, sync, window and focus handling |
| D. Separate-process presenter (IOSurface) | As C, cross-process | Full | Native | As C | MoltenVK | High | Latency, lifetime, security |
| E. Stay SDR (current) | None | None | n/a | n/a | Any | 0 | Does not meet the HDR goal |

Recommendation [I]: run **A as a 1-3 day spike** to validate EDR, toneMapMode and headroom behaviour on both displays. Then build **C as the target** if A shows composition, stability or pacing problems, or once the native dashboard is needed. Keep B as the fallback for the TV if PQ proves more faithful there.

---

## Unknowns and evidence gates

| Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|
| Does an `RGBA16Float` EDR layer go direct-to-display in full screen? | Latency and pacing | Instruments display track; test window with and without EDR | Presenter spike |
| Does `toneMapMode = never` fully disable system mapping for a Metal EDR layer, and how does `preferredDynamicRange` interact? | Calibration correctness | Ramp test card, built-in display, compare modes | Presenter spike |
| Headroom versus brightness curve on built-in XDR, and values in reference modes | Profile design | Probe at slider steps and in each preset (owner changes settings) | Calibration phase |
| A95L: potential and current EDR, absolute nits of EDR 1.0, clipping point | TV profile | Probe plus PQ ramp plus TV HDR info or meter | TV phase |
| HDMI format at 4K120 HDR (RGB 10-bit or 4:2:2) | Banding, text clarity | IORegistry colour element plus TV signal info | TV phase |
| Does app `EDRMetadata` reach the HDMI InfoFrame? | TV tone mapping | HDMI analyser or TV service menu | TV phase (optional) |
| Why PR !31 was "too unstable" | Avoid repeating it | Read the MR thread (access failed) | Before option A |
| MoltenVK texture-export stability under Ryubing's allocator | Option C viability | Minimal export test in the dev build | Before option C |
| Battery "optimise video" effect on EDR game layers | Unplugged behaviour | Probe on battery | Calibration phase |

---

## Risks

- **Beta OS.** Results on macOS 27.2 beta may change. API availability comes from the 27.2 SDK headers, not from release notes [D][I].
- **System policy.** `preferredDynamicRange` defaults and headroom management may cap headroom for "non-focused" content, and full-screen game behaviour is not documented [D][2][I].
- **False HDR.** Inverse tone mapping of the 8-bit SDR output would satisfy "HDR swapchain" without meeting the project goal. The presenter must take the scene-referred buffer defined in note 02 [I].
- **Silent misconfiguration.** MoltenVK accepts any format and colour-space pair. A wrong pair (for example `BGRA8` + `EXTENDED_SRGB_LINEAR`) produces a valid swapchain with clipped output [D][18][I].
- **HDMI fragility.** Limited range, chroma subsampling and dim SDR are reported on Mac-to-TV links [A][30].

---

## Effort notes

These assume one engineer familiar with Metal and Ryubing's Vulkan backend, and no emulator-core changes.

| Work item | Estimate | Assumptions |
|---|---|---|
| Headroom probe and test-card app (headless plus one window) | 0.5-1 day | Swift CLI already prototyped for the probe |
| Option A spike | 1-3 days | `Window.cs` format selection, final-pass tone map, layer properties via ObjC messaging |
| Option C presenter | 1.5-3 weeks | Includes the ring buffer, sync, full-screen window, dashboard, display-link pacing and failure fallback to SDR |
| TV calibration pass | 1-2 days | TV connected, owner present for the settings changes |
| KosmicKrisp parity | Unknown | Blocked on Ryubing MR !131 |

---

## Sources

All accessed 2026-11-01 unless stated otherwise.

1. Apple, `CAMetalLayer` documentation and `QuartzCore/CAMetalLayer.h` (macOS SDK 27.2): https://developer.apple.com/documentation/quartzcore/cametallayer
2. Apple, `QuartzCore/CALayer.h` (SDK 27.2: `CAToneMapMode`, `CADynamicRange`, `preferredDynamicRange`, `contentsHeadroom`) and https://developer.apple.com/documentation/quartzcore/calayer
3. Apple, `CAEDRMetadata` documentation and `QuartzCore/CAEDRMetadata.h` (SDK 27.2): https://developer.apple.com/documentation/quartzcore/caedrmetadata ; `CAMetalLayer.edrMetadata` page
4. Apple, `NSScreen` EDR properties and `AppKit/NSScreen.h` (SDK 27.2): https://developer.apple.com/documentation/appkit/nsscreen/maximumextendeddynamicrangecolorcomponentvalue (plus the `...potential...` and `...reference...` pages)
5. Apple, `CoreGraphics/CGColorSpace.h`, `CGColor.h` and `CGToneMapping.h` (SDK 27.2, diffed against Command Line Tools SDK 26.5)
6. Apple, `IOSurface/IOSurfaceRef.h` (SDK 27.2), `kIOSurfaceContentHeadroom`
7. Apple, "Displaying HDR content in a Metal layer": https://developer.apple.com/documentation/metal/displaying-hdr-content-in-a-metal-layer
8. Apple, "Performing your own tone mapping": https://developer.apple.com/documentation/metal/performing-your-own-tone-mapping
9. Apple, "Using color spaces to display HDR content": https://developer.apple.com/documentation/metal/using-color-spaces-to-display-hdr-content
10. Apple, "Using system tone mapping on video content": https://developer.apple.com/documentation/metal/using-system-tone-mapping-on-video-content
11. Apple WWDC21 session 10161, "Explore HDR rendering with EDR": https://developer.apple.com/videos/play/wwdc2021/10161/
12. Apple, "Managing your game window for Metal in macOS": https://developer.apple.com/documentation/metal/managing-your-game-window-for-metal-in-macos
13. Apple Tech Talk 110339, "Discover Metal Performance HUD": https://developer.apple.com/videos/play/tech-talks/110339/
14. Apple Support 108321, "Use presets and reference modes with your Apple display": https://support.apple.com/en-us/108321
15. Apple Support 121554, MacBook Pro (16-inch, 2024) technical specifications: https://support.apple.com/en-us/121554
16. Apple Support 108928, "Connect to HDMI from your Mac": https://support.apple.com/en-us/108928
17. Apple Support 102205, "Play HDR video on Mac": https://support.apple.com/en-us/102205
18. KhronosGroup/MoltenVK at `5189f8de86ec` (main, 2026-10-13): `MoltenVK/MoltenVK/GPUObjects/MVKSwapchain.mm`, `MVKDevice.mm`, `MVKPixelFormats.mm`, `OS/CAMetalLayer+MoltenVK.mm`, `API/mvk_private_api.h`, `Docs/Whats_New.md`, `Docs/MoltenVK_Runtime_UserGuide.md`. https://github.com/KhronosGroup/MoltenVK
19. Kenji-NX/MoltenVK, branch `ryujinx`, commit `89cdc5faab8d` (compared with upstream `4b715bdcb1f1`): https://github.com/Kenji-NX/MoltenVK ; NuGet `Ryujinx.Graphics.Vulkan.MoltenVK` nuspec and version list: https://www.nuget.org/packages/Ryujinx.Graphics.Vulkan.MoltenVK
20. Mesa at `1558388535b1` (2026-11-01): `src/vulkan/wsi/wsi_common_metal.c`, `wsi_common_metal_layer.m`, `src/kosmickrisp/vulkan/kk_physical_device.c`, `kk_instance.c`, `kk_device_memory.c`, `docs/drivers/kosmickrisp.rst`. https://gitlab.freedesktop.org/mesa/mesa
21. LunarG, "LunarG Achieves Vulkan 1.3 Conformance with KosmicKrisp on Apple Silicon" (2025-10-30): https://www.lunarg.com/lunarg-achieves-vulkan-1-3-conformance-with-kosmickrisp-on-apple-silicon/
22. Khronos, "KosmicKrisp achieves Vulkan 1.4 conformance on Apple Silicon": https://www.khronos.org/news/permalink/kosmickrisp-achieves-vulkan-1.4-conformance-on-apple-silicon
23. LunarG, "LunarG Releases Vulkan SDK 1.4.357.0" (2026-07-28): https://lunarg.com/lunarg-releases-vulkan-sdk-1-4-357-0/
24. LunarG, "LunarG at XDC 2025: KosmicKrisp Overview" (2025-10-16): https://www.lunarg.com/lunarg-at-xdc-2025-kosmickrisp-overview/
25. Ryubing source at official commit `9afba70` (identical to upstream `475615f`): `src/Ryujinx.Graphics.Vulkan/Window.cs`, `src/Ryujinx.Graphics.Vulkan/MoltenVK/MVKInitialization.cs`, `src/Ryujinx/UI/Renderer/EmbeddedWindow.cs`, `Directory.Packages.props`, `distribution/macos/Info.plist`
26. Apple, `LSSupportsGameMode` (macOS 26.0): https://developer.apple.com/documentation/bundleresources/information-property-list/lssupportsgamemode ; Apple Developer Forums "What triggers Game Mode?": https://developer.apple.com/forums/thread/764575
27. SDL Discourse, "Displaying HDR on macOS and iOS from Vulkan and OpenGL rendering" (2026-05/06): https://discourse.libsdl.org/t/displaying-hdr-on-macos-and-ios-from-vulkan-and-opengl-rendering/68260
28. MoltenVK issue #2759, "MVK does not set wantsExtendedDynamicRangeContent on iOS for HDR swapchain" (2026-06-16): https://github.com/KhronosGroup/MoltenVK/issues/2759
29. RTINGS, Sony A95L calibration settings: https://www.rtings.com/tv/reviews/sony/a95l-oled/settings
30. Anecdotal reports: MacRumors "Do new MacBook Pros support HDMI 2.1 and 4K 120Hz with YCbCr 4:4:4" https://forums.macrumors.com/threads/do-new-macbook-pros-support-hdmi-2-1-and-4k-120hz-with-ycbcr-4-4-4.2317566 ; MacRumors "Washed out colours in the macOS interface when enabling HDR" https://forums.macrumors.com/threads/washed-out-colours-in-the-macos-interface-when-enabling-hdr.2278676/page-3 ; Apple Community "no HDR Brightness Balance" https://discussions.apple.com/thread/254456946 (reached through search summaries; threads not read in full)
31. New local measurement for this note (2026-11-01): a headless Swift/AppKit probe reading `NSScreen` EDR properties (no window shown), `system_profiler SPDisplaysDataType`, and IORegistry display colour-mode keys. Serial numbers are excluded.

---

## Independent verification

Independent skeptic check, 2026-11-01. Each claim was re-checked against primary sources: the macOS 27.2 SDK headers (Xcode SDK, diffed against the Command Line Tools 26.5 SDK), Apple documentation JSON and support pages, source code at the cited commits, the GitHub compare API, the NuGet registry, and a fresh run of a windowless `NSScreen` probe. No window or app was shown.

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| EDR recipes: `RGBA16Float` + extended-linear space for own tone mapping; `bgr10a2Unorm` + `itur_2100_PQ` for pre-encoded PQ | Confirmed | "Using color spaces to display HDR content" code listing (`.bgr10a2Unorm`, `CGColorSpace.itur_2100_PQ`, `wantsExtendedDynamicRangeContent = true`); "Performing your own tone mapping"; `CAMetalLayer.h:128` (macOS 10.11) [7][8][9][1] | |
| `EDRMetadata` nil = no tone mapping, values above current max may be clamped; non-nil needs >1.0 format and linear colour space, "significant amounts of memory and GPU processing" | Confirmed | `CAMetalLayer.h:131-138`; `CAMetalLayer.edrMetadata` doc page [1][3] | WWDC21 also says it "increases latency and bandwidth" [11] |
| Apple recommends own tone mapping for games | Corrected | Apple's wording is "arbitrary content, ... reference display, or if performance is more important than matching the exact system tone mapping"; games are named only as a reason to render HDR [7]. WWDC21 has no explicit game recommendation [11] | Summary reworded |
| `toneMapMode` (macOS 15, applies to CAMetalLayer drawables), `preferredDynamicRange` and `contentsHeadroom` (macOS 26), `CALayer.wantsEDR` deprecated 14.0-26.0, `CAMetalLayer` property not deprecated | Confirmed | `CALayer.h:39-56, 455-481`; `CAMetalLayer.h:128-129` (SDK 27.2) [1][2] | |
| No new HDR APIs in the 27.2 SDK; CoreGraphics tone-mapping changes are documentation only | Corrected | `CGToneMapping.h` (27.2) adds `kCGToneMappingHeadroomAdaptiveGainCurve API_AVAILABLE(macos(27.0)) = 6` (SMPTE ST 2094-50:2026). No new declarations in QuartzCore, IOSurface, CoreVideo or NSScreen EDR properties [5] | Not a presentation API, so the architecture is unaffected |
| Built-in potential 16.0, current 2.67, reference 0.0; MSI monitors 1.0; all 120 Hz | Confirmed (re-measured) | Fresh windowless probe: built-in potential 16.0, current 2.6666667, reference 0.0, 120 FPS; both MAG 274UPF E2 potential 1.0, current 1.0, 120 FPS [M] | Current > 1.0 with no EDR window from the probe; see 1.5 |
| WWDC21 "up to 16x SDR" for Liquid Retina XDR | Corrected | Transcript: "The new iPad Pro's Liquid Retina XDR display has up to an incredible 16x SDR" [11] | Not a MacBook statement; matches the measured 16.0 |
| PQ 100 nits maps to EDR 1.0, 10,000 nits to EDR 100; external HDR10 "roughly 5x SDR" | Confirmed | WWDC21 transcript quotes [11] | `toneMapMode = never` as opt-out is header text only ("Never tone map contents"); its effect on a PQ layer is untested [I] |
| Direct-to-display needs full screen, opaque `CAMetalLayer`, RGB content, Apple silicon; all RGB layer formats can go direct; size mismatch is scaled | Confirmed | "Managing your game window for Metal in macOS" doc text [12] | Whether FP16 EDR goes direct here stays unmeasured |
| MoltenVK colour-space mapping and EDR flags (`MVKSwapchain.mm:520-571`), full format x colour-space cross product (`MVKDevice.mm:2096-2140`) | Confirmed, one omission | Source at `5189f8d` (main, 2026-10-13): `case` lines 521-569; formats added at 2097-2101 plus Apple-GPU XR formats; no `VkFormat` maps to XR formats in `MVKPixelFormats.mm` [18] | `DCI_P3_NONLINEAR` also sets EDR = YES; summary updated. On macOS `DCI_P3_LINEAR` is not advertised |
| `vkSetHdrMetadataEXT` builds HDR10 `CAEDRMetadata` with `opticalOutputScale: 1` and forces EDR on | Confirmed | `MVKSwapchain.mm:338-388`, line 379 [18] | The "1.0 = 1 nit" consequence stays [I]: the header also says HDR10 data treats 1.0 as 100-nit diffuse white [3] |
| Ryujinx package 1.4.2-ryujinx.5 = `Kenji-NX/MoltenVK` `89cdc5f`, 9 commits ahead of `4b715bd`, `MVKSwapchain.mm` untouched; 1.4.3-ryujinx.2 on 2026-10-29 | Confirmed, with addition | NuGet nuspec `repository commit="89cdc5f..."`, Apache-2.0; NuGet registration published 2026-10-29T05:20Z; GitHub compare: ahead 9, behind 0, files CI.yml, pbxproj, MVKCmdPipeline.mm, MVKDevice.mm (residency sets off), MVKImage.mm, MVKEnvironment.h. Last `MVKSwapchain.mm` commit 2026-05-04 [19] | Base `4b715bd` is 14 commits behind tag v1.4.2 (compare API), so 1.4.3 import fixes are absent |
| Upstream latest tag v1.4.2, GitHub release 2026-07-24 | Confirmed | `gh api releases/latest`: published 2026-07-24T14:00Z; `Whats_New.md` says "Released 2026-07-20" [18] | Date differs by source |
| KosmicKrisp: EDR only for float formats (`wsi_common_metal_layer.m:177`), `BT2020_LINEAR` to non-extended `LinearITUR_2020` without EDR, colour spaces gated on `EXT_swapchain_colorspace`, no `VK_EXT_metal_objects`, memory export `MTLHEAP` only, `EXT_hdr_metadata` exposed | Confirmed | Mesa `1558388`: `wsi_common_metal_layer.m:177`, colour-space switch lines 77-123; `wsi_common_metal.c:203-224, 255, 284`; `kk_physical_device.c:154-185, 703`; `kk_device_memory.c:30-31`; no `metal_objects` in `src/kosmickrisp` [20] | `DCI_P3_NONLINEAR` also gives no EDR in Mesa |
| KosmicKrisp Vulkan 1.4 conformant, needs Metal 4 and macOS 26 | Confirmed | Khronos news post dated 2026-10-01; `docs/drivers/kosmickrisp.rst:4-5` "implemented on top of Metal 4, which requires macOS 26 and up" [20][22] | The Khronos post itself does not mention Metal |
| Hybrid presenter: `vkExportMetalObjectsEXT` returns `MTLDevice`, `MTLCommandQueue`, `MTLTexture`, `IOSurface`, `MTLSharedEvent`; timeline semaphores always `MTLSharedEvent`-backed even with `SINGLE_QUEUE` | Confirmed | `MVKDevice.mm:5087-5139` and `4300-4301` (timeline branch before the style switch); `MVKSync.h:321-343`; `MVKExtensions.def:162`; Ryubing `9afba70` `MVKInitialization.cs:28` [18][25] | Feasibility of the full frame protocol stays [I] |
| Ryubing picks only `B8G8R8A8_UNORM` with `SRGB_NONLINEAR` or `PASS_THROUGH`; pins 1.4.2-ryujinx.5 | Confirmed | `9afba70` `Window.cs:229-263`, `Directory.Packages.props:77`, `Info.plist:57` (`public.app-category.games`) [25] | Falls back to the first advertised format, which on MoltenVK is BGRA8 + sRGB |
| M4 Pro HDMI up to 8K60 / 4K240, 48 Gbps cable for 8K, adapters unsupported, "HDMI 2.1" not named | Confirmed | Apple Support 108928 lists "MacBook Pro with ... M4 Pro ... introduced in 2023 or later" [16] | |
| Reference mode HDR Video (P3-ST 2084): 1000 nits full-screen sustained, ST 2084; brightness controls "might not be available" | Confirmed | Apple Support 108321 [14] | "Only documented way to get absolute paper white" stays an inference |
| A95L 4K120 only on HDMI 3/4 with Enhanced Format | Unverifiable | RTINGS settings page body did not render for the fetch tool (only navigation returned) [29] | Left as the author's [D]; re-check before the TV phase |

Residual doubts: whether `toneMapMode = never` and `preferredDynamicRange` behave as the headers suggest for a Metal EDR layer; whether an FP16 EDR layer goes direct-to-display; and why the current headroom already reads 2.67 from a windowless probe. All three need the presenter spike.
