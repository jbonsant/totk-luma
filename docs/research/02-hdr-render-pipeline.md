# 02 - End-to-end HDR pipeline: TOTK rendering through Ryubing to the swapchain

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: *The Legend of Zelda: Tears of the Kingdom* (Switch 1, game version 1.4.3) running in Ryubing at
upstream commit 475615f, Vulkan through MoltenVK, on macOS. Only public sources and open-source code
were used. No game shader dumps were made or requested.

Evidence tags: `[D]` documented (URL or file:line), `[M]` measured (prior local evidence), `[I]` inference,
`[A]` anecdote or user report.

---

## Summary

- **The game's scene HDR exists and is destroyed in one identifiable pass.** RenoDX's published
  reconstruction of the TOTK tonemap pass shows it reading two float inputs (a bloom or "glow" texture,
  clamped to 10,000, plus the raw scene), adding them, and applying an analytic `1 - exp(-x)` curve. The
  curve is blended between a luma-preserving form and a per-channel form, followed by `saturate()` and a
  saturation grade [D][1]. That `saturate()` is the point where all highlight information above 1.0 is
  clipped.
- **There is no colour-grading LUT in the tonemap pass.** It samples only the glow and scene textures. Grading
  is a parametric saturation term driven by a constant buffer [D][1]. Exposure is not visible in this
  pass, so it is applied upstream [I].
- **The pass after the tonemap is FSR1 EASU upscaling of the already-clipped LDR image.** The commented
  original in RenoDX uses AMD FSR1's reciprocal-approximation constants `0x7EF07EBB` and `0x7EF19FFF`
  (shared by all FidelityFX `ffx_a.h` code, so not unique to EASU) together with EASU's 12-tap
  neighbourhood, and Digital Foundry reported FSR1 upscaling of a dynamic image of about 900p to 1080p [D][1][9]. RenoDX
  replaces this pass with a single point fetch [D][1].
- **After the game, Ryubing is 8-bit end to end.** The guest framebuffer is mapped to `R8G8B8A8Unorm`
  (`SurfaceFlinger.cs:515`). The FXAA, SMAA, FSR and Area effects write `rgba8` storage images
  (`Fxaa.glsl:176`, `FsrScaling.glsl:5` and others). The swapchain selection only searches for
  `B8G8R8A8Unorm` + `SRGB_NONLINEAR` (or `PASS_THROUGH_EXT`), falling back to the surface's first format,
  which on MoltenVK is also `B8G8R8A8Unorm` + `SRGB_NONLINEAR` (`Window.cs:229-265`; `MVKDevice.mm:2097-2124`) [D][2][3].
- **MoltenVK can already do EDR.** It advertises `RGBA16Float` and the extended colour spaces on every
  surface. It maps `EXTENDED_SRGB_LINEAR_EXT` to `kCGColorSpaceExtendedLinearSRGB` with
  `wantsExtendedDynamicRangeContent = YES`, and `PASS_THROUGH_EXT` to `colorspace = nil` with no EDR
  (`MVKSwapchain.mm:520-567`, `MVKDevice.mm:2082-2150`) [D][3]. The gap is in Ryubing, not in the API.
- **Ryubing has no shader-replacement or graphics-mod mechanism.** `ModLoader` handles romfs, exefs, cheats
  and NSO/NRO/KIP patches. `ShaderDumper` only writes guest binaries to disk [D][2]. A replacement hook
  would go in `ShaderCache.TranslateShader` (`ShaderCache.cs:778-795`), which already has the guest code
  bytes [D][2].
- **The genuine-HDR path has been published for Windows Ryujinx.** RenoDX (MIT) replaces Ryujinx-generated
  SPIR-V shaders by host hash (bloom, tonemap and post-tonemap, with a separate hash set per Ryujinx build
  and for Intel Arc). Separately, it promotes `r8g8b8a8_typeless` render targets (height at least 899) to
  `RGBA16F` when they are bound with one of three *other* shader hashes labelled "final buffer"
  (values not reproduced in this repository), and it upgrades the swapchain to `RGBA16F` through a proxy
  pass [D][1]. TOTK Luma would port this idea *into* the emulator, keyed by guest shader hash. This
  corresponds to options A + B + C below [I].
- **Ryubing PR !31 was an RGBA16F swapchain and present-chain enabler for ReShade HDR add-ons, not HDR
  itself.** It also forced the presented guest framebuffer to an RGBA16F host format. It changed 33 files
  (+1068/-160), its author called it "too unstable to ship", and it was closed unmerged on 2026-05-03
  [D][4]. It kept `SRGB_NONLINEAR`, so even merged it would not have turned on EDR under MoltenVK [I from D][3][4].
- **Inverse tonemapping (option D) is feasible but limited.** The game curve is known analytically, so an
  inverse is model-based rather than generic. Even so, 8-bit quantisation near white, FSR and the UI
  composited into the same buffer limit it to a fallback tier [I].

---

## Findings

### 1. TOTK (Switch 1, 1.4.3) rendering from public sources

**Resolution and dynamic resolution.** Digital Foundry (May 2023, via a summary article) found a docked
target of 900p, upscaled to 1080p with FSR1, and a 720p maximum in handheld mode. Resolution drops as the
camera moves, and some cutscenes are pre-rendered low-bitrate video [D][9]. This matches local evidence: at
Ryubing's 1.2x scale, the 3D targets of about 1600x896 are allocated at 1921x1076 and the output is
2304x1296 (that is, 1920x1080 x 1.2) [M].

The reconstructed FSR pass reads its source size from a constant buffer (`c3[4]`), which is consistent
with a fixed allocation and a dynamic sub-rectangle [D][1][I].

**HDR intermediate formats.** The tonemap inputs carry values above 1.0, and glow is explicitly clamped to
10,000 [D][1]. Both inputs must therefore be float targets. Whether they are `R11G11B10F` or `RGBA16F`
**could not be verified** from public sources [I]. RenoDX upgrades only `r8g8b8a8_typeless` resources
[D][1], which implies the pre-tonemap chain is already float and needs no upgrade [I].

Ryubing maps guest `R11G11B10Float` (render-target code `0xe0`) to `VK_FORMAT_B10G11R11_UFLOAT_PACK32`, and
guest `RGBA16F` to `R16G16B16A16_SFLOAT` (`ColorFormat.cs:41,89,109`, `FormatTable.cs (Vulkan):59,82`)
[D][2]. Either way, the scene HDR survives on the host until the tonemap pass.

**Bloom.** The final bloom-composite shader multiplies a sampled texture by a per-channel constant
(`c3[6].xyz`), and RenoDX scales the result with a user "Bloom" slider [D][1]. The glow is then added to the
scene *before* the tonemap curve [D][1].

**Exposure and auto-exposure.** No exposure term appears in the tonemap pass. Its constants are the luma
weights (`c1[0]`) and the grade bias and scale (`c3[0]`) [D][1]. Exposure or eye adaptation is therefore
applied upstream, in lighting or in a separate pass. Whether TOTK uses adaptive exposure is **unverified** [I].

**Colour grading.** There is no LUT in the tonemap pass. Grading is a "triangle" saturation grade around the
peak channel, with bias and scale from constants [D][1]. Environment colour comes from palette data
upstream. Serfrost's Defogger edits `EnvPalette` and `CavePalette` [D, prior research].

**Tone-curve details** [D][1]:

- Luma uses BT.601 red (`0.2989`), with the green and blue weights taken from a constant buffer.
- The curve is `1 - exp2(-x / ln 2)`, which equals `1 - exp(-x)`.
- The blend weight between the luma-scaled and per-channel results is `saturate(curve)^2`. Bright pixels
  therefore desaturate toward per-channel clipping.

**sRGB or gamma output.** The present buffer reaches Ryubing as `A8B8G8R8` and is mapped to
`R8G8B8A8Unorm`, not sRGB (`SurfaceFlinger.cs:511-522`) [D][2]. Its bytes are therefore already
display-encoded. Two questions remain open: whether the game encodes through an sRGB render-target view
or with shader gamma, and the exact transfer function. RenoDX has a commented-out
`view_format = r8g8b8a8_unorm_srgb` option, and PR !31 ships both Unorm-to-half and sRGB-to-half
tables, which hints that both paths occur [D][1][4][I]. Validating this is an evidence gate.

**UI placement.** RenoDX exposes separate "Game" and "UI" brightness settings and an intermediate scaling
of `diffuse / graphics` nits. Its swapchain proxy then encodes the whole final buffer [D][1]. This is the
standard RenoDX pattern for UI that is drawn into the upgraded final buffer *after* the tonemap and the
upscale. TOTK UI therefore appears to be composited after both [I, medium-high].

**Order inferred from public code** [D][1][I]:

```
lighting (float) -> bloom chain (float) -> TONEMAP (glow + scene, 1-exp(-x), saturate, grade) -> RGBA8 target
  -> FSR1 EASU (dynamic ~900p -> 1080p, LDR) -> RGBA8 final buffer -> UI composited -> present (A8B8G8R8)
```

A further published RenoDX replacement file in `ryu-new/` has the structure of a console FXAA pass: local luma
contrast, an early exit and directional taps. This suggests an in-game post-AA pass that also runs on
LDR data [I, low]. None of the hashes, formats or resolutions here were confirmed on macOS.

### 2. Ryubing 475615f (source read at local commit 9afba70, identical to upstream)

#### 2a. Guest shader translation and caches

- **Translation.**
  - `ShaderCache.GetGraphicsShader` (`ShaderCache.cs:306`) looks up `_gpPrograms` and the in-memory hash
    table. If neither has the program, it decodes each stage and calls `TranslateShader`.
  - `TranslateShader` (`ShaderCache.cs:778-795`) reads the guest code (`code ??= memoryManager.GetSpan(...)`)
    and constant buffer 1, optionally dumps the code (`ShaderDumper`), and calls `context.Translate()`.
  - `TranslatorContext` emits GLSL or SPIR-V (`TranslatorContext.cs:375-376`). The host program is created
    by `_context.Renderer.CreateProgram` (`ShaderCache.cs:464`) [D][2].
- **Pipeline attachment formats.** These are taken from the guest render-target state through
  `colorState.Format.Convert().Format` (`ShaderCache.cs:280`). Any render-target format upgrade must
  change this line too, and PR !31 did [D][2][4].
- **Disk cache.**
  - Location: `<games>/<titleid>/cache/shader` (`ShaderCache.cs:120-121`).
  - Contents: guest code plus the host binary, versioned by `CodeGenVersion = 7354`
    (`DiskCacheHostStorage.cs:25,325`).
  - Guest data hash: `Hash128.ComputeHash(data).Low` (`DiskCacheGuestStorage.cs:456`).
  - Programs converted to compute are not cached (`ShaderCache.cs:470`) [D][2].
- **Second cache layer.** MoltenVK converts SPIR-V to MSL with SPIRV-Cross when the pipeline is created,
  and Metal compiles the result. That is a second cache layer outside Ryubing [I]. Local evidence shows the
  Metal HUD forcing Metal recompilation (a cold cache) [M].
- **Shader dump.** `GraphicsConfig.ShadersDumpPath` (`GraphicsConfig.cs:22`) makes `ShaderDumper.Dump`
  write the raw guest code (`ShaderDumper.cs:33-73`). Those files are proprietary game code. See section 6.
- **Shader replacement or graphics mods.** **There are none.** `ModLoader.cs:31-43` covers only romfs,
  exefs, cheats and AMS patch directories. The graphics projects contain no replacement, texture-pack or
  override code (searched with git grep) [D][2]. The upstream issue and PR tracker has no HDR or
  shader-replacement work except !31 (Forgejo search, 2026-11-01) [D][4].

#### 2b. Texture and render-target format mapping

| Guest format | GAL format | Vulkan host format | Bytes per pixel | Source |
|---|---|---|---|---|
| RT `R11G11B10Float` (0xe0), texture `Bf10Gf11Rf11Float` | `R11G11B10Float` | `B10G11R11_UFLOAT_PACK32` | 4 | `ColorFormat.cs:41,109`; `Image/FormatTable.cs:423`; `Vulkan/FormatTable.cs:82` |
| RT `R16G16B16A16Float` (0xca) | `R16G16B16A16Float` | `R16G16B16A16_SFLOAT` | 8 | `ColorFormat.cs:21,89`; `Vulkan/FormatTable.cs:59` |
| RT `R8G8B8A8Unorm` / `Srgb` | `R8G8B8A8Unorm` / `Srgb` | `R8G8B8A8_UNORM` / `_SRGB` | 4 | `ColorFormat.cs:98-99`; `Vulkan/FormatTable.cs:55,74` |
| RT `R10G10B10A2Unorm` | `R10G10B10A2Unorm` | `A2B10G10R10_UNORM_PACK32` | 4 | `ColorFormat.cs:96`; `Vulkan/FormatTable.cs:80` |
| Present buffer `A8B8G8R8` / `X8B8G8R8` | `R8G8B8A8Unorm` | `R8G8B8A8_UNORM` | 4 | `SurfaceFlinger.cs:515-516` |

**View and alias compatibility depend on bytes per pixel.**

- Formats with equal bytes per pixel are view-compatible (`TextureViewCompatibility.Full`).
- Unequal sizes are incompatible, except for three hard-coded copy-only pairs
  (`TextureCompatibility.cs:685-745`).
- Host images are created with `MUTABLE_FORMAT | EXTENDED_USAGE` (`TextureStorage.cs:101`).

So `R11G11B10F`, `RGBA8` and `RGB10A2` can alias one another. `RGBA16F` aliases none of them [D][2].
Flushing to guest memory goes through `FlushTextureDataToGuest` and `ConvertFromHostCompatibleFormat`
(`Texture.cs:1078-1123`) [D][2].

Upstream's most recent commit is itself a revert, "revert 'Add raw copy dependencies for incompatible
textures' (#181)" (475615f, 2026-08-26). This shows how fragile cross-format aliasing is [D][4].

#### 2c. Presentation in Ryujinx.Graphics.Vulkan

- **Swapchain.** `CreateSwapchain` (`Window.cs:88-200`) calls `ChooseSwapSurfaceFormat`
  (`Window.cs:229-265`), which only searches for `B8G8R8A8Unorm`. If no matching pair exists it returns
  `availableFormats[0]`; on MoltenVK that entry is `B8G8R8A8Unorm` + `SRGB_NONLINEAR`, so the result is
  the same in practice [D][2][3].
  - Default case: `SRGB_NONLINEAR`.
  - With `EnableColorSpacePassthrough` (`GraphicsConfig.cs:73`, which sets `_swapchainIsDirty` through
    `Window.cs:513-517`): it prefers `PASS_THROUGH_EXT` and falls back to `SRGB_NONLINEAR`.
  - Image usage is colour attachment + transfer destination + storage (`Window.cs:138`).
  - No HDR metadata is sent, and no `VK_EXT_hdr_metadata` or `VK_EXT_swapchain_colorspace` handling exists
    in-tree [D][2]. Instance extensions come from an external `VulkanHelper`
    (`AppHost.cs:985`), which was **not verified**. MoltenVK accepts the colour space either way [I].
- **Present.** `Present` (`Window.cs:343-487`) runs these steps in order:
  1. The anti-aliasing effect, if any (`Window.cs:359-364`).
  2. An optional 8-bit screenshot (`CaptureFrame`, `Window.cs:404,629`).
  3. The scaling filter, if one is set (`Window.cs:424-436`), which writes directly into the swapchain
     image view. Otherwise a `HelperShader.BlitColor` with a linear or nearest filter
     (`Window.cs:439-447`, `HelperShader.cs:347`).
  4. `QueuePresent`.
- **Guest side.** `Gpu/Window.cs:146-162` builds the presentation `TextureInfo` from the SurfaceFlinger
  format. `Gpu/Window.cs:204` finds the upscaled texture (`TextureSearchFlags.WithUpscale`) and hands it to
  the host window (`Gpu/Window.cs:241`) [D][2].

#### 2d. Scaling filters and anti-aliasing

| Effect | Where it runs | Intermediate format | Notes | Source |
|---|---|---|---|---|
| FXAA | Before scaling, on the guest present texture | `rgba8` storage image | Uses `ConvertRgba8SrgbToUnorm` views | `FxaaPostProcessingEffect.cs:77`; `Fxaa.glsl:176` |
| SMAA (Low to Ultra) | Before scaling | Edge `R8G8Unorm`, blend `R8Unorm`, output `rgba8` | | `SmaaPostProcessingEffect.cs:151,167,220-239`; `Smaa*.glsl:1376` |
| FSR1 (EASU + RCAS) | Scaling to the window | Intermediate in the source format; `rgba8` storage output | Sharpening = `1.5 - level x 0.015` | `FsrScalingFilter.cs:97-165`; `FsrScaling.glsl:5`; `FsrSharpening.glsl:4` |
| Area | Scaling (downscale) | `rgba8` storage output | | `AreaScalingFilter.cs`; `AreaScaling.glsl:5` |
| Bilinear / Nearest | `BlitColor` | None (direct blit) | | `Window.cs:560-565,439-447` |

All host effects assume LDR, display-encoded input, and they all re-quantise to 8 bits [D][2][I].

### 3. Precision-loss map (game lighting to display)

| # | Stage | Format | Range | What is lost | Evidence |
|---|---|---|---|---|---|
| 1 | Lighting, scene colour | Float RT (`R11G11B10F` or `RGBA16F`, unverified) | 0 to about 65,000, linear | `R11G11B10F`: 6/6/5-bit mantissas, no sign, no alpha, so slight banding in dark gradients. `RGBA16F`: 10-bit mantissa | [I]; host mapping [D][2] |
| 2 | Bloom chain, glow composite | Float | Glow clamped to 10,000 | Nothing material for HDR | [D][1] |
| 3 | **Tonemap** | Writes to `r8g8b8a8` | **[0, 1]** after `saturate()` | **All scene highlights above the curve's asymptote; per-channel desaturation near white; first 8-bit quantisation (256 levels after the curve)** | [D][1] |
| 4 | In-game FSR1 EASU (plus possible in-game FXAA) | `RGBA8` | [0, 1] | Re-quantised at 8 bits; EASU assumes LDR (clamps) | [D][1][9]; FXAA [I] |
| 5 | UI composite | `RGBA8` final buffer | [0, 1] | UI and scene share one 8-bit buffer, so they cannot be separated afterwards | [I] |
| 6 | SurfaceFlinger to GPU window | `R8G8B8A8Unorm` | [0, 1], display-encoded | No new loss (bit copy); the colour space is implicit | `SurfaceFlinger.cs:515` [D][2] |
| 7 | Ryubing FXAA/SMAA/FSR/Area | `rgba8` storage | [0, 1] | Another 8-bit round trip; filters assume gamma-encoded LDR | Section 2d [D][2] |
| 8 | Swapchain | `B8G8R8A8Unorm` + `SRGB_NONLINEAR` | [0, 1] | 8 bits per channel; no values above 1 | `Window.cs:229-265` [D][2] |
| 9 | MoltenVK `CAMetalLayer` | sRGB colour space, EDR off; or nil (passthrough) | SDR | Gamut limited to sRGB. Passthrough is unmanaged: sRGB values are likely shown on the panel's native P3 primaries (over-saturated), not genuine wide gamut | `MVKSwapchain.mm:520-523,565-567` [D][3] for the layer settings; the visual effect is [I] |
| 10 | macOS compositor to panel or TV | Display pipeline | SDR at the user's brightness | Without EDR the layer never exceeds SDR white | [D][5] |

**Where 8-bit quantisation happens:** first at stage 3, then repeated at stages 4, 7 and 8.

**Where clipping happens:** only at stage 3. Everything after it is already in [0, 1].

**Where the gamut is limited:** stage 3 (`saturate`, BT.709 content) and stage 9 (sRGB layer). No
wide-gamut source data exists anywhere. Any P3 "vivid" mode is a creative expansion, not recovered
information [I].

### 4. Design options for genuine scene HDR

#### (A) Guest tonemap shader replacement at translation time

**Mechanism.**

1. In `ShaderCache.TranslateShader` (`ShaderCache.cs:778-795`), hash the guest `code`, using the same
   `Hash128` as the disk cache.
2. Look the hash up in a replacement table. On a match, substitute the `ShaderProgram` code with SPIR-V
   built by the project from clean GLSL.
3. The replacement must keep Ryujinx's resource layout. RenoDX's sources show that layout: support buffer
   at set 0 binding 0, `fp_c1` at binding 20, `fp_c3` at binding 22, textures at set 2 bindings 128+ [D][1].
4. It must also declare the same `ShaderProgramInfo`, so descriptor layouts still match.
5. User parameters (paper white, peak, mode) need a channel. The cleanest is new fields in the
   emulator-owned support buffer (`SupportBuffer.cs`; `render_scale[73]` is visible in RenoDX's shaders)
   [D][1][2][I].

**What it replaces.**

- **Tonemap.** Output scene-linear values relative to paper white, or an HDR-preserving curve that targets
  the display peak (for example, keep the vanilla `1 - exp(-x)` shape below a pivot and roll off to the
  peak above it, as RenoDX's `VanillaToneCurveExtended` does) [D][1].
- **Post-tonemap FSR.** Swap in an HDR-safe EASU: encode to PQ or log, run EASU, then decode. Do not drop
  to a point fetch [I].
- **Bloom.** Optionally expose its strength [D][1].

**Key details.**

- Key on the *guest* hash, not the host SPIR-V hash. RenoDX needed separate hash sets for "new Ryujinx"
  and Intel Arc because the host SPIR-V changes with codegen and vendor [D][1].
- The guest hash is fixed for game 1.4.3 [I].
- Bypass or re-key the host disk cache for replaced programs, for example by mixing a replacement-set
  version into the cache key [I].
- One guest shader can produce several specialised host variants. The replacement must be valid for all
  of them [I].

**Assessment.** Feasibility is high. Risk is medium: identifying the hashes needs one attended capture
session, and specialisation edge cases remain. A alone is useless because its output still lands in RGBA8.

#### (B) Render-target format upgrades along the post-tonemap chain

**Mechanism.** Add a host-only format override: the guest `FormatInfo` and memory layout stay unchanged,
and only the host storage becomes RGBA16F. PR !31 did this with a `ForceRenderTargetFloatHost` flag and a
`GetHostFormatInfo` that maps RGBA8 and BGRA8 (Unorm or sRGB) to `R16G16B16A16Float` [D][4].

Targeting can borrow RenoDX's shader-keyed idea. Note that RenoDX does not key on the replaced shaders: it
promotes `r8g8b8a8_typeless` render targets that are bound while one of three "final buffer" shader
hashes is active (up to three passes per hash), with a minimum height of 899 and a 16:9 aspect check, and
it upgrades the swapchain separately (`addon.cpp:255-318`) [D][1]. Which targets those are in TOTK is not
documented [I]. In Ryubing, the proposed set is the tonemap output, the FSR output and final buffer, the
UI target, and the present texture [I].

**Risks.**

- *Aliasing and views.* RGBA16F has 8 bytes per pixel, so every RGBA8 or `R32` alias becomes
  `Incompatible` (`TextureCompatibility.cs:685-696`). PR !31 had to filter overlaps and disable view reuse
  for float targets [D][2][4].
- *Copies.* DMA (`DmaClass`) and `InlineToMemory` writes to an upgraded range must invalidate it or
  recreate the texture; PR !31 patched both [D][4].
- *CPU readbacks.* `FlushTextureDataToGuest` must convert half floats back to RGBA8 (PR !31 added about
  200 lines to `PixelConverter`). Any game readback of the final image, such as photo-mode or album
  screenshots, would otherwise be corrupt [D][4][I].
- *Format-compatibility classes.* Vulkan views of a `MUTABLE_FORMAT` image must stay within compatible
  classes. Sampling an upgraded target through an sRGB RGBA8 view is impossible, so shaders that sample it
  must be specialised to the float view [I].
- *Semantics.* UNORM targets clamp writes to [0, 1]; float targets do not. Non-replaced shaders that
  rely on that clamp, or that write negatives, change behaviour [I].
- *Pipelines.* Attachment formats at `ShaderCache.cs:280` must report the host format, or pipelines will
  not match the render pass [D][2][4].
- *Performance.* The extra cost is small: a 2304x1296 RGBA16F target is about 24 MB, written by a few
  full-screen passes, likely well under 1 ms on an M4 Pro. This is unmeasured [I].

**Assessment.** Feasibility is medium. Risk is high, since this is the part that made PR !31 "too
unstable". The effort is the largest of the four options.

#### (C) HDR swapchain and output transform

**Mechanism.**

- Extend `ChooseSwapSurfaceFormat` to request `R16G16B16A16_SFLOAT` + `EXTENDED_SRGB_LINEAR_EXT`. MoltenVK
  then sets `kCGColorSpaceExtendedLinearSRGB` and EDR on (`MVKSwapchain.mm:529-531`) [D][3].
- Add float variants of the post effects and blits. PR !31 did this for FSR, FXAA, SMAA and Area [D][4].
- Add a final output-transform pass that does the following:
  - decodes the game buffer (sRGB or gamma, per a gate);
  - scales the scene so paper white maps to an EDR value of 1.0, and maps UI to 1.0;
  - rolls highlights off to the live headroom, `NSScreen.maximumExtendedDynamicRangeColorComponentValue`,
    which changes with brightness [D][5];
  - optionally gamut-expands into P3 for the vivid mode.
- For the A95L, choose between two approaches:
  1. Keep EDR and let macOS map it to HDR10 when the TV is in HDR mode.
  2. Use `A2B10G10R10` + `HDR10_ST2084_EXT` with `vkSetHdrMetadataEXT`. MoltenVK converts that to
     `CAEDRMetadata.HDR10` (`MVKSwapchain.mm:338-383`) [D][3].

**Assessment.** Feasibility is high, and risk is low to medium. On its own, C only puts SDR content in an
HDR container, but it is the base that A, B and D all need.

#### (D) Inverse tonemapping of the SDR output (fallback tier)

**Mechanism.** At present time, linearise the 8-bit buffer and invert the *known* TOTK curve on luma
(`x = -ln(1 - y)`), clamped near y = 1. Then re-tonemap to the display peak.

**Limitations.**

- The 8-bit steps near white map to very large scene ranges, so highlights posterise.
- Detail destroyed by `saturate` is gone.
- FSR and in-game AA ran in between, which breaks the inverse slightly.
- UI is in the same buffer, so it needs a mask (for example, low-saturation pixels with high local
  contrast) or a conservative cap.

**Assessment.** Feasibility is high and risk is low. Quality is clearly below A + B + C, and it must be
labelled "expanded SDR", not genuine HDR [I].

#### UI handling (keep UI at paper white)

- **Primary: boundary-based.** In the A + B design, anything drawn into the upgraded final buffer after
  the replaced FSR pass is UI or overlay. The scene is written already scaled so that 1.0 means paper
  white, and UI keeps its [0, 1] range, which also lands on paper white. RenoDX uses the same model, with
  separate game and UI white levels and an intermediate scaling of `diffuse / ui` [D][1].
- **Secondary.** Use a guest-hash list of UI shaders for exceptions, such as UI that should glow.
- **Video.** Pre-rendered cutscenes are SDR video [D][9]. Check whether they go through the tonemap or the
  UI path. They should stay at paper white.
- **Blending.** If the game blends UI in gamma space (a UNORM view) but the upgraded buffer is linear,
  translucent UI changes appearance. Resolve the RT view encoding first (an evidence gate).

### 5. Ryubing PR !31

- **Accessible** through the Forgejo API. The old path `api/v1/repos/ryubing/ryujinx/...` redirects to
  `projects/Ryubing` [D][4].
- **Title:** "WIP: Add R16G16B16A16_float swap chain and blit option to Vulkan for HDR output".
- **Dates:** opened 2026-04-23, closed unmerged 2026-05-03 15:25 UTC. 33 files, +1068/-160. Head commit
  `d56e106c`.
- **What it did:**
  - An RGBA16F swapchain, chosen with the colour space still `SRGB_NONLINEAR` (or passthrough).
  - A float pre-scaling texture and float variants of the FSR, FXAA, SMAA and Area effects.
  - An `EffectShaderHelper`.
  - Present targets forced to RGBA16F host storage by address match from `Gpu/Window.cs`, using new
    `TextureSearchFlags.RenderTargetFloatHost` and `NoViewReuse` flags.
  - Overlap filtering in `TextureCache`.
  - Invalidation in DMA and `InlineToMemory`.
  - Unorm8 and sRGB8 to half-float converters.
  - Pipeline attachment formats overridden in `ShaderCache`.
- **Why it was closed.**
  - The author had fixed "games such as BOTW with Ultracam not working/games stuttering when the option is
    enabled", then wrote: "In hindsight, this solution is too unstable to ship, and I think I can work out
    ways to get HDR addons working without it, albeit with more work."
  - The same author is credited for the RenoDX TOTK mod, whose initial commit landed on 2026-05-03, the
    day the PR closed. That mod upgrades resources from inside ReShade instead [D][1][4].
- **Purpose.** The PR's goal was a float container for Windows ReShade add-ons, not EDR on macOS [I].

### 6. Validating each stage without disturbing the owner's desktop

| Stage | Method | Desktop impact | Gate |
|---|---|---|---|
| Tonemap math (A, D) | CPU reference in Python: reproduce the reconstructed curve and grade [1], plot SDR versus HDR curves, and unit-test the inverse curve (D) and roll-off on synthetic ramps | None | Spec phase |
| Output transform (C) | Offscreen Metal or Vulkan test harness written in-project, with no window. Render colour patches to an RGBA16F texture, read back, compare to expected EDR or PQ values | None | Before integration |
| Guest hashes, RT formats, sRGB view question, UI order | One attended run with MoltenVK automatic GPU capture to a file: `MTL_CAPTURE_ENABLED=1`, `MVK_CONFIG_AUTO_GPU_CAPTURE_SCOPE=3` (named-pipe trigger), `MVK_CONFIG_AUTO_GPU_CAPTURE_OUTPUT_FILE=<private path>`. No Xcode GUI needed while running [D][6]. Ryubing's `vkSetMoltenVKConfigurationMVK` call starts from `vkGetMoltenVKConfigurationMVK`, so environment settings should survive (`MVKInitialization.cs:24-33`) [I] | One emulator session that the owner schedules. Opening the `.gputrace` in Xcode later is a GUI step, done by the owner | Owner decision; the trace stays in the private workspace |
| Same, emulator-side | A debug build logs, per frame, the guest shader hash, render-target guest and host formats, and sizes for draws around the tonemap. Optionally it dumps the pre-tonemap and post-tonemap targets as raw half-float or EXR to the private workspace | Same session | Owner decision; never committed |
| Swapchain and EDR state | MoltenVK debug log level plus a log line after `CreateSwapchain` (format, colour space). A tiny CLI with no window queries `NSScreen` EDR headroom | None (CLI) | Any time |
| Display output | Colorimeter or calibrated camera on the panel or A95L | Attended | Calibration phase |

Guest shader dumps (`ShadersDumpPath`) and GPU traces contain proprietary game code or data. Keep them in
the private local evidence workspace only, behind an explicit owner decision. Never commit them to this
repository.

---

## Implications for TOTK Luma

1. **Target architecture: A + B + C in one emulator fork, with D as a fallback tier.**
   - Replace three guest shaders (bloom composite, tonemap, post-tonemap EASU), keyed by guest hash for
     1.4.3.
   - Upgrade only the render targets those shaders write, plus the downstream final and present buffers.
   - Present through an RGBA16F + extended-linear-sRGB EDR swapchain.
2. **Write clean shaders from the documented math.** Do not vendor RenoDX's decompiled shader files: they
   are derived from game code even though the repository is MIT. Cite them as reference only.
3. **Build C first, behind a flag, with no visual change** (SDR mapped to paper white). It de-risks the
   MoltenVK and EDR path and gives the dashboard a headroom readout before the texture-cache work starts.
4. **Use PR !31 as a map of the texture-cache touch points, not as code to merge.** Scope B more narrowly
   than PR !31: upgrade only targets bound by replaced shaders, rather than every presented framebuffer.
5. **Keep Ryubing's FXAA, SMAA and FSR off in HDR mode** at first, or run them in a PQ-encoded domain. Use
   the game's own (replaced) EASU for upscaling.
6. **Keep the passthrough option out of every HDR profile.** It is unmanaged 8-bit and gives a false
   impression of vividness.
7. **The "vivid" and "defog" visuals belong in the output transform** (gamut expansion and saturation),
   so they are reversible and separate from scene HDR.

---

## Options compared

| Option | Genuine HDR? | Feasibility | Risk | Effort (focused) | Depends on |
|---|---|---|---|---|---|
| A. Guest-hash shader replacement | Yes (with B + C) | High | Medium | 1-3 weeks | Hash capture session; C |
| B. Post-tonemap RT upgrade to RGBA16F | Enables A | Medium | **High** (texture cache, aliasing, readbacks) | 2-5 weeks | A for targeting |
| C. EDR swapchain + output transform | Container only | High | Low-medium | 1-2 weeks | None |
| D. Inverse tonemap of SDR output | No (expanded SDR) | High | Low | 3-7 days after C | C |
| UI at paper white (boundary-based) | Required for A + B | High | Medium (blend encoding) | 3-5 days | A, B, gate U2 |

---

## Unknowns and evidence gates

| ID | Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|---|
| U1 | Exact pre-tonemap formats (`R11G11B10F` or `RGBA16F`) | Banding budget; whether any pre-tonemap upgrade is needed | GPU capture or debug log of render-target formats | Capture session (attended) |
| U2 | sRGB render-target view or shader gamma on the tonemap and final targets; exact transfer | Decode in C; UI blending semantics after B | Capture: view formats of the tonemap and UI draws | Capture session |
| U3 | Guest hashes of the bloom, tonemap and EASU shaders on 1.4.3 | Keys for A | Debug-build hash log around the draws that bind those textures and constants | Capture session |
| U4 | Height of the tonemap output target (about 896 or 900 or more): the prior measurement says 1600x896, but RenoDX filters at a height of at least 899. RenoDX sees host sizes (after Ryujinx resolution scaling), and its filter applies to the "final buffer" targets, not necessarily to the tonemap output | Targeting rule for B | Capture: render-target sizes at 1x and 1.2x scale | Capture session |
| U5 | Exposure or eye-adaptation pass location | Whether the replaced tonemap needs exposure input | Capture: luminance-reduction passes before the tonemap | Capture session |
| U6 | Whether Ryubing enables `VK_EXT_swapchain_colorspace` (through the external `VulkanHelper`) | Spec-correct use of extended colour spaces | Read the dependency source; check MoltenVK validation | Spec phase |
| U7 | Whether the local MoltenVK fork 1.4.2-ryujinx.5 matches upstream colour-space code and supports capture scope 3 | Validity of C and of the validation plan | Read the fork source at its tag | Spec phase |
| U8 | Path of pre-rendered cutscene video and of photo-mode readback | UI and video paper white; B readback risk | Capture plus code trace of the video decoder output | Capture session |
| U9 | Behaviour of macOS EDR to HDR10 on the A95L over HDMI | Choice between EDR and an explicit HDR10 swapchain | Covered by the display research note; colorimeter | Calibration phase |

---

## Risks

- **Texture-cache instability.** This is B's main risk, and the documented reason PR !31 was closed.
  Mitigations: an allow-list per guest hash, host-only overrides, and a kill switch that falls back to
  SDR [D][4].
- **Hash drift.** Any game update changes guest hashes. Version 1.4.3 is fixed, but the dynamic-FPS patch
  (D2) or other exefs patches must not alter these shaders [I].
- **Specialisation variants.** One guest shader can have several host variants. The replacement must
  cover all of them, or some frames render vanilla [I].
- **Licensing and IP.** RenoDX shader files are decompiled game shaders. Reimplement the math; do not copy
  the files. Never commit dumps or traces [I].
- **Measurement.** The Metal HUD and GPU capture perturb the Metal shader cache and frame pacing.
  Validation captures are not performance runs [M].
- **Upscaler quality.** Replacing EASU with a point fetch, as RenoDX does, would visibly worsen dynamic-res
  frames at 1.2x. An HDR-safe EASU is needed [I].

---

## Effort notes

Assumptions: one developer who knows C# and graphics, using Ryubing 475615f, PR !31 and RenoDX as
references. Each figure excludes calibration and covers focused working time.

- **C:** 1-2 weeks (swapchain, float effects, output pass, headroom plumbing from the macOS window layer).
- **A:** 1-3 weeks once the hashes (U3) are known. It includes clean GLSL for three shaders, a
  replacement table, a cache re-key and support-buffer parameters.
- **B:** 2-5 weeks, depending on how many alias or copy paths TOTK exercises. This is the largest
  uncertainty.
- **UI and paper white:** 3-5 days after U2 is resolved.
- **D:** 3-7 days after C.
- **Validation tooling** (CPU reference, offscreen harness, debug hash logging): about 1 week.
- **Total for genuine HDR (A + B + C + UI):** about 6-12 weeks. **Fallback tier (C + D):** about 2-3 weeks.

---

## Sources

1. RenoDX, `src/games/totk/`: `addon.cpp` (lines 255-318), `tonemap.slang`, `post-tonemap.slang`,
   `bloom.slang`, `shared.h`, `ryu-new/`, `intel/`, `utils/shader_hotswap.hpp`. MIT, at commit 43c067b.
   Folder history from 2026-05-03 (initial commit) to 2026-08-17 (UTC). https://github.com/clshortfuse/renodx/tree/main/src/games/totk ,
   accessed 2026-11-01.
2. Ryubing source at upstream commit 475615f (read from an identical local commit):
   - `src/Ryujinx.Graphics.Vulkan/Window.cs`, `FormatTable.cs`, `TextureStorage.cs`, `HelperShader.cs`,
     `Effects/*.cs`, `Effects/Shaders/*.glsl`, `MoltenVK/MVKInitialization.cs`
   - `src/Ryujinx.Graphics.Gpu/Window.cs`, `Engine/Types/ColorFormat.cs`, `Image/FormatTable.cs`,
     `Image/TextureCompatibility.cs`, `Image/TextureCache.cs`, `Image/Texture.cs`, `Shader/ShaderCache.cs`,
     `Shader/ShaderDumper.cs`, `Shader/DiskCache/*.cs`, `GraphicsConfig.cs`
   - `src/Ryujinx.Graphics.Shader/SupportBuffer.cs`, `Translation/TranslatorContext.cs`
   - `src/Ryujinx.HLE/HOS/Services/SurfaceFlinger/SurfaceFlinger.cs`, `src/Ryujinx.HLE/HOS/ModLoader.cs`

   Upstream: https://git.ryujinx.app/projects/Ryubing , accessed 2026-11-01.
3. MoltenVK: `MoltenVK/MoltenVK/GPUObjects/MVKSwapchain.mm` (lines 338-383 and 505-570) and
   `MVKDevice.mm` (lines 2082-2150), at main 5189f8d. Latest release v1.4.2 (2026-07-24).
   https://github.com/KhronosGroup/MoltenVK , accessed 2026-11-01.
4. Ryubing PR !31: metadata, comments, file list and `.diff`. https://git.ryujinx.app/projects/Ryubing/pulls/31
   (API: `https://git.ryujinx.app/api/v1/repos/projects/Ryubing/pulls/31`). Upstream commit list (475615f,
   2026-08-26). Forgejo issue and PR search for "HDR", "RGBA16", "EDR", "colorspace" and "shader
   replacement". All accessed 2026-11-01.
5. Apple, "Displaying HDR content in a Metal layer" (read through the documentation JSON endpoint).
   https://developer.apple.com/documentation/metal/displaying-hdr-content-in-a-metal-layer , accessed 2026-11-01.
6. MoltenVK configuration parameters, `MVK_CONFIG_AUTO_GPU_CAPTURE_SCOPE` and
   `MVK_CONFIG_AUTO_GPU_CAPTURE_OUTPUT_FILE`. `Docs/MoltenVK_Configuration_Parameters.md` at 5189f8d,
   accessed 2026-11-01.
7. AMD FidelityFX FSR1 (`ffx_a.h`, `ffx_fsr1.h`): the `APrxLoRcpF1` (`0x7ef07ebb`) and `APrxMedRcpF1`
   (`0x7ef19fff`) constants. The headers are vendored in Ryubing at
   `src/Ryujinx.Graphics.OpenGL/Effects/Shaders/ffx_a.h:1843-1844` (commit 475615f), accessed 2026-11-01.
8. yuzu progress report, May 2023 (TOTK texture-cache and ASTC notes; nothing on render-target formats).
   https://yuzu-mirror.github.io/entry/yuzu-progress-report-may-2023 , accessed 2026-11-01.
9. Nintendo Everything, "Zelda: Tears of the Kingdom tech analysis, including frame rate and resolution"
   (a summary of Digital Foundry), 2023-05-11.
   https://nintendoeverything.com/zelda-tears-of-the-kingdom-tech-analysis-including-frame-rate-and-resolution/ ,
   accessed 2026-11-01.
10. Prior local evidence (private local evidence workspace and prior task reports): swapchain and
    passthrough behaviour, the render-target sizes at 1.2x, the Metal HUD caveats, and the Defogger scope.
    Read-only.

**Access failures:** the Nexus Mods page for mod 175 (https://www.nexusmods.com/site/mods/175) returned
HTTP 403. The RenoDX wiki mods list (https://github.com/clshortfuse/renodx/wiki/mods) was read only in part,
because it was truncated at 100k characters, and no TOTK row was seen. The Apple documentation HTML page
rendered empty, so the JSON endpoint was used instead.

---

## Independent verification

Checked on 2026-11-01 by a separate reviewer against primary sources: the RenoDX repository at 43c067b
(`src/games/totk/`), Ryubing official source at 475615f (read from the identical local commit), MoltenVK at
5189f8d and at tag v1.4.2, the Forgejo API and `.diff` for Ryubing PR !31, the GitHub commit history of the
RenoDX TOTK folder, the Apple `NSScreen` documentation and the Nintendo Everything summary of Digital
Foundry. No game files, shader dumps or binaries were used.

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| Tonemap pass: glow clamped to 10,000 plus scene, `1 - exp2(-x/ln2)`, blend weight `saturate(curve)^2`, `saturate()`, then a constant-buffer saturation grade; no LUT; no exposure term | Confirmed | `tonemap.slang:22-24,82-106,153-179`: only two samplers (bindings 128 and 129), luma `0.2989` red with green and blue from `fp_c1[0]`, grade bias and scale from `fp_c3[0]` | This is RenoDX's reconstruction, not the game binary. "No LUT" and "no exposure" hold for that reconstruction only |
| Post-tonemap pass is FSR1 EASU on LDR data; RenoDX replaces it with a point fetch | Confirmed | `post-tonemap.slang:32-33` (`2129690299` = `0x7EF07EBB`, `2129764351` = `0x7EF19FFF`), commented 12-tap EASU pattern at lines 100-111, active `texelFetch` at line 81; Ryubing `ffx_a.h:1843-1844`; Nintendo Everything (2023-05-11): "900p" docked target, "AMD's FidelityFX Super Resolution (FSR1)" | The constants alone are shared by all FidelityFX code (CAS, RCAS); the 12-tap layout is what identifies EASU. Note wording tightened |
| RenoDX upgrades `r8g8b8a8` targets to RGBA16F while the replaced shaders are bound | Corrected | `addon.cpp:255-318`: promotion is keyed on three separate "final buffer" hashes (values not reproduced here), three passes each, height at least 899, `r8g8b8a8_typeless` to `r16g16b16a16_float`; the swapchain is upgraded through a proxy pass (`swapchain::target_format`) | The replaced shaders (bloom, tonemap, post-tonemap) have different hashes. Summary and section 4B were corrected |
| RenoDX targets Windows Ryujinx and keys on host SPIR-V hashes, with separate sets for new Ryujinx and Intel Arc | Confirmed | `addon.cpp:229-250` (`Ryujinx.exe`, title ID `0100f2c0115b6000`, ReShade add-on); `ryu-new/` and `intel/` hash files; commits `b6f8727` ("add support for intel arc", 2026-05-14) and `b996a42` ("support new ryujinx", 2026-05-14) | Folder history ends 2026-08-17 UTC (corrected from 2026-08-18) |
| Ryubing present buffer maps to `R8G8B8A8Unorm`; host effects write `rgba8` storage images; swapchain only `B8G8R8A8Unorm` with SRGB_NONLINEAR or PASS_THROUGH | Confirmed, with nuance | `SurfaceFlinger.cs:515-516`; `FsrScaling.glsl:5`; `Fxaa.glsl:176`; `Window.cs:229-265` | `ChooseSwapSurfaceFormat` falls back to `availableFormats[0]`, which on MoltenVK is also `B8G8R8A8Unorm` + SRGB_NONLINEAR. No `hdr_metadata` or `swapchain_colorspace` code in-tree (git grep, 0 hits) |
| Guest `R11G11B10Float` maps to `B10G11R11_UFLOAT_PACK32` and RGBA16F to `R16G16B16A16_SFLOAT`; RGBA16F cannot alias RGBA8 | Confirmed | `ColorFormat.cs:21,41,89,109`; `Vulkan/FormatTable.cs:59,82`; `TextureCompatibility.cs:685-696` (equal bytes per pixel gives `Full`), `:730-744` (only three copy-only exceptions, none involving RGBA16F and a 4-byte format) | |
| MoltenVK advertises RGBA16Float and extended colour spaces; EXTENDED_SRGB_LINEAR gives `kCGColorSpaceExtendedLinearSRGB` with EDR on; PASS_THROUGH gives nil with EDR off; HDR metadata becomes `CAEDRMetadata` | Confirmed | `MVKDevice.mm:2082-2140` at 5189f8d (formats and colour spaces pushed unconditionally); `MVKSwapchain.mm:520-567` and `:338-383`. Same code at tag v1.4.2 (`MVKDevice.mm:2045+`) | Only upstream was read. The local fork 1.4.2-ryujinx.5 remains open (U7). The "over-saturated on P3" passthrough effect is inference and was re-tagged |
| Ryubing has no shader, texture or graphics-mod replacement; hook point `ShaderCache.TranslateShader`; attachment formats at `ShaderCache.cs:280` | Confirmed | `ModLoader.cs:31-43`; git grep for replacement, texture-pack and custom-shader terms in `src/` returned nothing relevant; `ShaderCache.cs:778-795` reads guest `code` and calls `context.Translate`; line 280 is `colorState.Format.Convert().Format` | The hook location is a design inference, but the code it relies on exists as described |
| PR !31: title, opened 2026-04-23, closed unmerged 2026-05-03, 33 files, +1068/-160, "too unstable to ship", kept SRGB_NONLINEAR | Confirmed | Forgejo API `pulls/31`: `created_at` 2026-04-23T14:03:55Z, `closed_at` 2026-05-03T15:25:01Z, `merged` false, 33 / 1068 / 160, head `d56e106c93`; closing comment quoted exactly; `.diff` shows `ChooseSwapSurfaceFormat` choosing `R16G16B16A16Sfloat` with `SRGB_NONLINEAR` or `PASS_THROUGH_EXT`, the `ShaderCache.cs:280` override and about 200 added lines in `PixelConverter.cs` | The PR body states the sRGB colour space was chosen deliberately "to decode the now-linear input". Under MoltenVK that colour space sets EDR off (`MVKSwapchain.mm:521-523`), so the "no EDR" inference holds |
| Upstream head is 475615f, a revert of #181, dated 2026-08-26 | Confirmed | Forgejo commits API: `475615f04` 2026-08-26T07:26:56Z, "revert \"Add raw copy dependencies for incompatible textures\" (#181)" | Still the newest commit on the access date |
| EDR headroom is read from `NSScreen.maximumExtendedDynamicRangeColorComponentValue` and changes at run time | Confirmed | Apple documentation JSON: "The current maximum color component value for the screen ... may be greater than 1.0, depending on the capabilities of the display hardware and other conditions", with a change notification | |
| Genuine HDR needs A + B + C, about 6-12 weeks; C + D fallback about 2-3 weeks | Unverifiable | No source; planning estimate | Kept as [I]. The B estimate carries the most uncertainty |

**Corrections made:** the RenoDX resource-upgrade targeting (Summary and section 4B), the swapchain fallback
nuance (Summary and section 2c), the EASU identification wording, the passthrough evidence tag (table row 9),
the U4 wording and the RenoDX folder-history end date.

**Residual doubts:** RenoDX's shader files are reconstructions, so the absence of a LUT or exposure term is
only as good as that reconstruction. Which TOTK targets the "final buffer" hashes actually bind, the
pre-tonemap formats (U1) and the local MoltenVK fork (U7) remain open and need the capture session.
