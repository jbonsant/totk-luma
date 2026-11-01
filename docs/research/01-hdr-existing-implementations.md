# 01 - Existing HDR implementations (RenoDX mod 175, MacShade, Beast Roofer Edition)

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: what already exists for HDR in TOTK under emulation, read from source code where source exists. Prior local evidence
is cited as "the private local evidence workspace". The owner's machine is a Mac (M4 Pro, macOS 27.2 beta) running
Ryubing canary 1.3.351 (upstream commit 475615f, identical to the local official tree at 9afba70) over MoltenVK 1.4.2-ryujinx.5.

Tags: [D] documented (source or page cited), [M] measured or inspected locally, [I] inference, [A] anecdote or user report.

---

## Summary

- **RenoDX TOTK (Nexus mod 175) is real scene HDR, but it cannot run on this Mac as shipped.** It is a Windows ReShade add-on,
  "VULKAN RYUBING ONLY", version 1.03 by souperman9, published 2026-05-10 and updated 2026-07-05, shipped with a custom ReShade build [D][1][2].
- **How it works, read from source:** it replaces the game's tonemap pixel shader, which receives the untonemapped scene plus bloom
  in linear float. It reproduces the vanilla curve (1 - e^-x, a blend of luminance and per-channel mapping), then
  substitutes an HDR path (SDR-matched hue and chroma, a "psycho17" grade, a per-channel "Neutwo" rolloff to the peak). It upgrades
  the RGBA8 final buffers to RGBA16F and outputs scRGB (RGBA16F, extended linear sRGB) [D][3].
- **Its shader matching is not portable.** It matches CRC32 hashes of the *host SPIR-V* that Ryujinx generates. The source already carries separate
  hash sets for "new Ryujinx" and for Intel Arc. Ryubing on macOS generates different SPIR-V (MoltenVK-specific capability flags), so
  the Windows hashes are very unlikely to match [D][3][4] / [I] high confidence.
- **The math is portable and MIT-licensed:** the vanilla TOTK tonemap reconstruction, the UI/game white separation, the gamma 2.2
  correction, Neutwo and the hue/purity correction. None of it needs Windows [D][3][5].
- **Ryubing on macOS loads libMoltenVK.dylib directly, with no Khronos loader.** A resolver rewrites "libvulkan.dylib" to "libMoltenVK.dylib",
  and the owner's bundle ships only libMoltenVK.dylib. A Vulkan layer cannot be inserted through the usual loader mechanism [D][6] / [M][7].
- **MacShade is a real port of ReShade 6.8 to macOS**, released 2026-10-16 and BSD-3-Clause. It injects with DYLD_INSERT_LIBRARIES and
  dyld interposing of about 140 MoltenVK symbols. It builds with full add-on support, but it has **no HDR or EDR code**: it is SDR
  post-processing. It is about two weeks old and has never been tested with Ryubing [D][8].
- **The Beast Roofer Edition is a Ryujinx fork** (MIT; DLSS, TAA, VRR and "native scRGB HDR"). Its HDR is an **inverse tonemap of the final
  8-bit SDR frame**, not scene HDR. All 16 published releases are Windows-only, from a single maintainer with 0 stars and its own auto-update server [D][9].
- **Ryubing PR !31 (RGBA16F swapchain, closed unmerged on 2026-05-03) was written by the same author as RenoDX TOTK.** The author then moved the
  HDR work into the ReShade add-on [D][10].
- **The key enabler for TOTK Luma exists in MoltenVK:** an RGBA16F swapchain with VK_COLOR_SPACE_EXTENDED_SRGB_LINEAR_EXT is
  enumerated, and it sets the CAMetalLayer to extended linear sRGB with EDR on [D][11]. Ryubing never asks for it today [D][6].
- **Verdict:** none of the three candidates runs on this Mac for TOTK 1.4.3 in its current form. The right path is to reimplement the RenoDX TOTK method
  *inside Ryubing*: match the guest shader, upgrade the render targets, and output an EDR swapchain. That means reusing the MIT shader math, not the Windows add-on [I].

---

## Findings

### 1. RenoDX for TOTK (Nexus mod 175)

#### 1.1 Identity, version and requirements

| Field | Value | Tag |
|---|---|---|
| Name | "RenoDX - True HDR Mod" | [D][1] |
| Author / uploader | souperman9 (tonemapper by Musa; RenoDX framework by ShortFuse; Vulkan ReShade fork by Ritsu) | [D][1][3] |
| Version | 1.03 (main file); 1.0 on 2026-05-10, 1.01 on 2026-05-13, 1.02 on 2026-05-28, 1.03 on 2026-07-05 | [D][1] |
| File name | "RenoDX TOTK ReShade Add-on (Custom ReShade)" | [D][1] |
| Target | "VULKAN RYUBING ONLY". Install ReShade 6.8.0 with add-on support on Ryujinx.exe with the Vulkan API, and place totk-renodx.addon64 next to the exe | [D][1] |
| Emulator settings | Vulkan backend, logging enabled (the add-on reads the log to detect TOTK), anti-aliasing disabled | [D][1][3] |
| Game version | Not stated on the page. Not stated in the source | [D][1][3] |
| OS | Windows only: the add-on uses `windows.h`, `DllMain` and `__declspec(dllexport/uuid)`. The binary is a PE `.addon64` | [D][3] |
| Source | `clshortfuse/renodx`, `src/games/totk/`; first commit 2026-05-03, last TOTK-titled commit 2026-07-02 (61effc9). The last commit touching the folder is 58dc434 (2026-08-17, a psycho17 shader tweak inside a Xenoblade-titled commit) | [D][3][12] |
| Licence | MIT (repository LICENSE and SPDX headers in `addon.cpp`, `psychov_17.hlsl`, `neutwo.hlsl`) | [D][3][5] |

The direct Nexus page returned HTTP 403. The metadata above comes from the public Nexus Mods GraphQL API (game id 5363, mod id 175) [1].

The description claims that the Switch 2 Edition HDR "uses inverse-tonemapping on an SDR image". This is the mod author's claim, not verified [A][1].

**TOTK 1.4.3 coverage.** It is not documented. The hashes come from the emulator's SPIR-V of guest shaders, so they only change if the guest shader or the
emulator's translator changes. TOTK's tonemap shader is likely stable across 1.2.x to 1.4.x, but nothing confirms it [I] low-medium confidence.

#### 1.2 How it produces HDR (from `src/games/totk`)

**Process gating.** If the process is `Ryujinx.exe`, the add-on attaches only when the latest Ryujinx log's "Application Loaded:" line contains
`0100f2c0115b6000` or the TOTK title (`addon.cpp:229-247`) [D][3].

**Shader replacement by hash.** Each file named `<name>_0xXXXXXXXX.frag.slang` is a replacement for the shader whose CRC32 matches.
RenoDX computes that CRC32 over the shader bytecode that ReShade intercepts at pipeline creation (`utils/pipeline.hpp:679,782`, `utils/hash.hpp:96`) [D][5].

Three hash families are kept, one per emulator build family:

| Family | Replaced shaders | Source folder |
|---|---|---|
| Original Ryujinx/Ryubing | One tonemap, two post-tonemap and one bloom hash | top level |
| "New Ryujinx" (commit b996a42, 2026-05-14) | One tonemap, one post-tonemap and one bloom hash | `ryu-new/` |
| Intel Arc (commit b6f8727) | One tonemap, one post-tonemap and one bloom hash | `intel/` |

[D][3][12]

The hash values themselves are not reproduced in this repository. Under the public-repository rule (AGENTS.md; NFR-HYG-02),
guest shader hash tables live only in the private title pack. Readers can find them in the cited MIT source.

The replacement GLSL uses Ryujinx's own resource naming and layout: `support_buffer`, `fp_c1` / `fp_c3` at set 0 bindings 20 and 22, and
`fp_t_tcb_8` / `fp_t_tcb_A` at set 2 bindings 128 and 129. It therefore targets **Ryujinx-family SPIR-V, not yuzu-family SPIR-V** [D][3] / [I] high confidence.

**The vanilla tonemap, reconstructed** (`tonemap.slang:29-106`) [D][3]:

- Input: `untonemapped = min(bloom, 10000) + scene`, sampled from two float textures. The scene is therefore HDR-linear before this pass.
- Curve: `ToneCurve(x) = 1 - exp2(-x / ln2) = 1 - e^-x`.
- Luminance weights: red 0.2989 (BT.601), with the green and blue weights read from a constant buffer.
- Output: `lerp(luma_scaled, per_channel, saturate(curve(luma))^2)`, then `saturate`, then a saturation grade (bias and scale taken from a constant buffer).
- Conclusion: the game's own tonemap is a hybrid of luminance and per-channel mapping that clips at 1.0. This confirms that scene HDR exists and can be recovered before
  this pass [D][3] / [I].

**The HDR path** (`tonemap.slang:180-209`) [D][3]:

1. Build an "SDR-faithful" untonemapped colour. `ApplyVanillaToneMapExtended` keeps the vanilla curve below a pivot set by "SDR Blend Factor"
   (default 18 %) and continues linearly above it.
2. Transfer the SDR hue and purity onto it with a MacLeod-Boynton based correction (`CorrectHueAndPurityMBBT709WithBT2020`). The strength is "Hue Shift"
   (default 70 %) and "SDR Blowout" (default 65 %).
3. Apply the game's saturation grade in a max-channel-normalised domain, then optionally clamp to the BT.709 gamut.
4. Apply the user grade ("psycho17": exposure, highlights, shadows, contrast, saturation, highlight saturation, flare) in BT.2020.
5. Map to the display with a **per-channel Neutwo** in BT.2020: `f(x) = p*x / sqrt(x^2 + p^2)`, where `p = peak_nits / game_nits`.
   The peak is optionally gamma-adjusted. There is no BT.2390 EETF in RenoDX's shader library (a grep finds no "2390") [D][3][5].

**Render-target and swapchain upgrades.** `r8g8b8a8_typeless` resources written by three separate "final buffer" shaders (hash values not reproduced here),
with height 899 or more, are cloned as `r16g16b16a16_float` (`addon.cpp:298-317`) [D][3].

The swapchain target format is RGBA16F. On Vulkan, RenoDX sets the swapchain `color_space` to `extended_srgb_linear` (scRGB), or HDR10 PQ when that is selected
(`mods/swapchain_v2.hpp:109,392-398,657-660`). TOTK sets `RENODX_SWAP_CHAIN_ENCODING = ENCODING_SCRGB`, with a clamp at 9999 nits (`shared.h:93-95`) [D][3][5].

**Post-tonemap pass.** The vanilla pass samples 12 taps with an adaptive kernel. RenoDX replaces it with a **single `texelFetch`**
(`post-tonemap.slang:66-81`; the original code is kept as comments) [D][3].

*Corrected by independent verification:* the commented-out vanilla code matches **AMD FidelityFX CAS (Contrast Adaptive Sharpening) in its
scaling path**, not FSR 1 EASU. The 12-tap footprint is shared by both, but the arithmetic is CAS: `pp = ip * const0.xy + const0.zw` and `floor`,
a per-bilinear-corner cross min/max, an amplitude of `min(mn, 1 - mx) / mx` with an approximate square root, a sharpness peak from a constant,
and the `1/32` "thin" bias (`SPAN_BIAS = 0.03125`), all of which appear in `ffx_cas.h` (scaling path and `thinB = 1.0/32.0`). EASU has no such
terms; it uses direction and length analysis with Lanczos-like lobes [D][3][19].

So the HDR mod gives up the game's CAS sharpen-and-scale pass, presumably because CAS's `1 - max` headroom assumes [0,1] input [I] medium confidence.
That has a real cost under dynamic resolution, where the guest renders at 1600x896.

**UI handling.** The tonemap output is multiplied by `game_nits / ui_nits` (`RENODX_INTERMEDIATE_SCALING`, `shared.h:85`). The swapchain pass then multiplies everything
by `ui_nits` (`draw.hlsl:299-300`) [D][3][5].

UI drawn after the tonemap, at 1.0, therefore lands at UI nits, and the scene's diffuse white lands at game nits.

**Exposed settings** (`templates/settings.hpp`, `addon.cpp`) [D][3][5]:

| Setting | Default | Notes |
|---|---|---|
| Tone map type | 1 (labels "Vanilla", "RenoDRT"; TOTK uses its own HDR path when > 0) | |
| Peak nits | 1000 | |
| Game brightness | 203 | |
| UI brightness | 203 | |
| Gamma correction | 1 = "2.2" (also "Off" and "BT.1886") | Fixes raised blacks |
| SDR Blend Factor / Hue Shift / SDR Blowout | 18 / 70 / 65 % | |
| Grading sliders | exposure, highlights, shadows, contrast, saturation, highlight saturation, flare | |
| Other | vanilla saturation, bloom strength | |

**Windows-only parts:**

- the ReShade add-on ABI (`reshade::register_addon`, `addon_event::*`, `api::*` types);
- DllMain and process-path checks;
- the ImGui settings UI;
- the swapchain proxy and the DXGI paths;
- MinHook and IAT hooks elsewhere in RenoDX.

The `ryujinxlog` helper also uses Win32 window APIs [D][3][5].

**Portable parts:** all `.slang` and `.hlsl` math, the vanilla curve reconstruction, the hue/purity transfer, Neutwo, the colour conversions and the
UI/game nits model [I] high confidence.

#### 1.3 Could the hashes match Ryubing 475615f on macOS?

The hashes probably do not match [I] high confidence. Evidence:

- The hash is over host SPIR-V, and RenoDX already needed separate hashes for an Intel GPU and for a newer Ryujinx [D][3][12].
- Ryubing builds its shader `Capabilities` with `needsFragmentOutputSpecialization: IsMoltenVk` and `reduceShaderPrecision: IsMoltenVk`
  (`VulkanRenderer.cs:763-764`). The translator queries `QueryHostReducedPrecision()` (`GpuAccessorBase.cs:198`), so the SPIR-V bytes differ on macOS [D][4].
  Verified mechanism: with reduced precision, the SPIR-V generator omits the `NoContraction` decoration on floating-point arithmetic unless an
  operation is forced precise (`CodeGen/Spirv/Instructions.cs:2045-2129`, `Translation/Transforms/ForcePreciseEnable.cs`). Any fragment shader with
  float arithmetic, such as the tonemap, is therefore emitted with different bytes than on Windows [D][4].
- ReShade is not available on macOS in the form RenoDX was built for. The question only matters through MacShade (section 2) [D][8].

A host-independent alternative exists inside the emulator. Ryujinx's disk cache already keys guest shaders by a hash of the guest code and cb1 data
(`DiskCacheGuestStorage.cs:268`) [D][4].

A Ryubing-side replacement keyed on the guest shader would be stable across hosts. That is an inference, and there is no replacement infrastructure in 9afba70:
a grep for "replace" and "custom shader" in `Ryujinx.Graphics.Gpu` and `Ryujinx.Graphics.Shader` finds nothing [D][4] / [I].

#### 1.4 How Ryubing on macOS loads Vulkan

- `MVKInitialization.InitializeResolver()` inserts a Silk.NET path resolver that rewrites any `libvulkan.dylib` request to
  `libMoltenVK.dylib`. It is called at `Program.cs:242` on macOS. `vkGet/SetMoltenVKConfigurationMVK` are imported from libMoltenVK directly
  (`MVKInitialization.cs:12-50`) [D][6].
- `IsMoltenVk = OperatingSystem.IsMacOS()` (`VulkanRenderer.cs:126`) [D][6].
- Instance layers are only added for `VK_LAYER_KHRONOS_validation` when graphics debug logging is on, and only if MoltenVK enumerates the layer, which it does not.
  The enabled instance extensions are the window's required extensions plus `VK_EXT_debug_utils` (`VulkanInitialization.cs:60-120`) [D][6].
- The owner's built bundle has `Contents/Frameworks/libMoltenVK.dylib` and no `libvulkan*.dylib` [M][7].

**Consequence.** Without the Khronos loader, `VK_INSTANCE_LAYERS` and implicit layer manifests do nothing, so a layer cannot intercept `vkCreateShaderModule`
[I] high confidence.

Interception is still possible in three ways:

1. dyld interposing, as MacShade does (section 2);
2. shipping the Khronos loader as `libvulkan.dylib` and removing the resolver (a source change);
3. hooking directly in Ryubing's C# Vulkan backend (we own the source).

Option 3 is the cleanest and needs no injection [I].

### 2. MacShade (klotzbrocken/MacShade)

| Field | Value | Tag |
|---|---|---|
| What | "ReShade 6.8 for macOS: injected library with Vulkan, OpenGL and Metal support, plus a SwiftUI launcher" | [D][8] |
| Created / last push | 2026-10-16 / 2026-11-01. 58 commits. Releases v0.4.8 to v0.6.1 (v0.6.1 on 2026-11-01) | [D][8] |
| Popularity | 24 stars, 1 fork, 0 issues | [D][8] |
| Licence | BSD-3-Clause for MacShade's own code (copyright Maik Klotz 2026). The vendored ReShade is BSD-3. Bundled effects keep their own licences (AstrayFX is CC BY-ND) | [D][8] |
| Platform | macOS 13+ on Apple Silicon | [D][8] |

**Injection** [D][8]:

- `libmacshade.dylib` is loaded with `DYLD_INSERT_LIBRARIES` into an **ad-hoc re-signed copy** of the app. The launcher copies the game because the hardened runtime
  blocks injection into the original.
- `vk_loader_emulation.cpp` plays the Vulkan loader. It builds the layer chain and the dispatch keys, and replaces about 140 MoltenVK symbols with jump stubs
  through `__DATA,__interpose`, `dlsym`, and `vk_icdGetInstanceProcAddr`. The NOTES say dyld also applies interposing to `dlsym` results.
- Input comes from swizzling `-[NSApplication sendEvent:]`.
- OpenGL and Metal apps go through an IOSurface bridge to a private Vulkan device.
- An opt-in "screen filter" mode uses ScreenCaptureKit and an overlay window. It needs the Screen Recording permission.

**Effects.** It uses unmodified ReShade `.fx` (ReShade FX), with the standard, SweetFX, qUINT and prod80 collections bundled [D][8].

**Add-ons.** It is built with `RESHADE_ADDON=2` (`mac/CMakeLists.txt:70`). In ReShade's `addon_manager.cpp:237`, level 1 skips external add-ons and any other level loads them,
so external add-on loading is compiled in. On macOS it uses `dlopen` through a `LoadLibraryExW` shim [D][8].

Without `_WIN64`, the extension filter accepts `.addon` and `.addon32` files (not `.addon64`). Any add-on would have to be a Mach-O dylib built against MacShade's Win32 shims.
The Windows RenoDX `.addon64` (a PE DLL) cannot load [D][8] / [I] high confidence.

**HDR claims.** There are none. A grep of `mac/` and `App/Sources` for EDR, `wantsExtendedDynamicRange`, extended sRGB, HDR10, ST2084 and scRGB finds nothing.
The screen filter captures BGRA 8-bit [D][8].

The vendored ReShade core does keep its generic colour-space plumbing (`reshade/source/vulkan/vulkan_impl_type_convert.cpp:568-573` maps scRGB and
HDR10 PQ to the Vulkan colour spaces). So an HDR swapchain requested by the application itself would most likely be passed through, but
MacShade adds nothing that creates one [D][8] / [I].

MacShade is **SDR post-processing**. With a ReShade add-on that changes the swapchain description, MoltenVK could in theory create an EDR layer.
No such add-on exists for macOS [I].

**Compatibility with Ryubing:**

- Ryubing's shipped entitlements include `allow-dyld-environment-variables`, `disable-library-validation`, `get-task-allow`, `allow-jit` and `hypervisor`
  (`distribution/macos/entitlements.xml`). The build script signs ad hoc with `codesign --entitlements ... -f -s -` and no `--options runtime`
  (`create_app_bundle.sh:55-61`) [D][6].
- The owner's bundle shows `flags=0x2(adhoc)`, with no hardened-runtime flag and the same entitlements [M][7]. DYLD injection is therefore not blocked [I] high confidence.
- Ryubing `dlopen`s libMoltenVK through Silk.NET and resolves entry points with `vkGetInstanceProcAddr`. That is the case MacShade's interposing covers
  [I] medium confidence.
- **No test with Ryubing exists.** The tested apps are vkQuake, UZDoom, UT2004, UT99, Quake II and Quetoo [D][8].
- The NOTES report `VK_ERROR_DEVICE_LOST` with Quake3e's Vulkan renderer under ReShade [D][8]. Ryubing's heavy use of push descriptors, extended dynamic state and
  argument buffers makes similar failures plausible [I].

**Security implications.** The shipped entitlements already let any library injected through the environment run inside the emulator, with JIT and
hypervisor rights. MacShade adds a third-party dylib with input swizzling, which also handles the owner's keyboard events [I].

For a personal project, this is acceptable only as a sandboxed experiment on a separate copy, never in the default path [I].

### 3. The Beast Roofer Edition

| Field | Value | Tag |
|---|---|---|
| What | A **fork of Ryujinx/Ryubing** "built for large HD/4K texture packs". It adds DLSS/DLAA/NIS (NVIDIA DLLs not included), TAA, mipmap generation, an ASTC pack crash fix, a VRR cap and "native scRGB HDR" | [D][9] |
| Host | Self-hosted Forgejo at thebeastroofer-edition.com. Repository created 2026-06-21. Mirror origin listed as a GitHub repo that no longer resolves | [D][9] |
| Activity | 4,875 commits (mostly inherited), 16 releases, last tag v1.2.6 on 2026-08-13, last commit 2026-08-05. 0 stars, 1 watcher | [D][9] |
| Platforms | README: "Windows 10 (20H1 or newer), macOS Big Sur (Apple Silicon)". **Every release asset is `win-x64`** | [D][9] |
| Base | MoltenVK package 1.4.2-ryujinx.3 (older than Ryubing 475615f's .5) | [D][9] |
| Licence | MIT ("Copyright (c) Ryujinx Team ... Copyright (c) 2026 The Roofer Dev - additions only") | [D][9] |
| TOTK | Mentioned only for 4K texture packs | [D][9] |

The repository was reachable on 2026-11-01. The README and the release list were read through its Forgejo API, and a `--depth 1` clone was made (commit a4fb32b) for reading.

**HDR code** (`src/Ryujinx.Graphics.Vulkan/Window.cs:511-545`, `Shaders/ColorBlitHdrFragmentShaderSource.frag`) [D][9]:

- The swapchain chooser prefers `R16G16B16A16Sfloat + ColorSpaceExtendedSrgbLinearExt`. With the environment variable `RYUJINX_HDR_PQ`, it prefers
  `A2B10G10R10 + HDR10_ST2084`. Otherwise it falls back to BGRA8 sRGB.
- The final blit takes the **guest's presented 8-bit frame**: it linearises it with a power gamma (2.2), computes a highlight weight (a luminance/max-channel mix
  raised to a "curve" of 2.8), and multiplies by `paperWhite * mix(1, peak/paperWhite, weight)`, with optional whitening.
  The defaults are 200 nits paper white and 1100 nits peak. The output is scRGB or PQ.
- This is **inverse tone mapping (SDR to HDR expansion)**, comparable in kind to AutoHDR. It cannot recover highlights that the game's tonemap clipped [D][9] / [I] high confidence.

**On a Mac**, MoltenVK does enumerate RGBA16F with extended linear sRGB [D][11], so the swapchain part would probably work if someone built the fork for macOS [I].

**Trust.** Single anonymous maintainer, no community review, auto-updates from its own server, Windows-only binaries, and NVIDIA-only features.
Read the source if you want; do not install the binaries [I].

### 4. Other prior art

| Item | What it is | Relevance here | Tag |
|---|---|---|---|
| Ryubing PR !31 | "WIP: Add R16G16B16A16_float swap chain and blit option to Vulkan for HDR output" by souperman9. Open 2026-04-23 to 2026-05-03, not merged. Touches `Texture.cs` (+105/-60), `TextureCache.cs` (+191), `PixelConverter.cs` (+206), `SurfaceFlinger.cs`, the Vulkan `Window.cs` (+124) and the scaling and AA effects. Closing comment: "too unstable to ship, and I think I can work out ways to get HDR addons working without it" | It is the in-emulator plumbing that RenoDX later replaced with ReShade-side cloning. Best reference for render-target and present-path upgrades in Ryubing | [D][10] |
| Ryubing tracker | Searching "HDR" finds only PR !31 among PRs and issues | No upstream HDR work | [D][10] |
| Eden (master be21ccc, 2026-11-01) | Swapchain chooser only looks for `B8G8R8A8_UNORM` + `VK_COLOR_SPACE_SRGB_NONLINEAR_KHR`, else takes the first enumerated format (`vk_swapchain.cpp:29-40`); no HDR colour space is requested. The only "hdr" hit is an unused `hdr_support = 0` field in the LSFG frame-generation glue | No HDR output | [D][13] |
| Citron (citron-neo/emulator) | Same sRGB-only chooser (`vk_swapchain.cpp:31`) | No HDR output | [D][13] |
| Special K | Windows HDR retrofit and injection framework, GPL-3.0 | Windows-only. No macOS path | [D][14] |
| Windows Auto HDR | Windows 11 OS feature that expands SDR to HDR for DirectX 11/12 games | Not Vulkan, not macOS. Inverse tonemap only | [D][15] |
| Lilium ReShade HDR shaders (EndlesslyFlowering) | ReShade `.fx` effects: HDR analysis, inverse tone mapping, BT.2390-based tone mapping, black floor fix, test patterns. GPL-3.0 | Good reference for BT.2390 EETF math and HDR analysis overlays. GPL-3 makes copying into this repository a licence decision | [D][16] |
| TOTK Switch 2 Edition | Paid upgrade for Switch 2 hardware: higher resolution and frame rate (4K is capped at 60 fps), HDR support, faster loading. Its save data does not transfer back to Switch 1 | Not a path: the owner's copy is the Switch 1 release 1.4.3, no emulator runs Switch 2 software, and the HDR grade is Nintendo's own | [D][17] / [I] |

---

## Implications for TOTK Luma

1. **Do not plan around ReShade or RenoDX binaries on macOS.** Treat RenoDX TOTK as a **reference design and an MIT maths source**
   [D][3] / [I].
2. **Recover scene HDR at the tonemap pass, inside Ryubing.** Identify TOTK's tonemap fragment shader by **guest shader hash**, which is host-independent.
   Substitute a translated or hand-written shader that implements the RenoDX approach: reproduce the vanilla curve, then apply a display-mapped HDR path [I].
   Check every binding and constant-buffer offset against what Ryubing actually emits on macOS. Do not assume the Windows GLSL layout.
3. **Upgrade the RGBA8 final buffers to RGBA16F**, scoped to the targets written by the tonemap and post-tonemap passes. Use PR !31's texture-cache and
   present-path changes as the starting map [D][10]. Expect the same instability the author saw, and gate it behind a per-title option.
4. **Present EDR through MoltenVK's existing path:** an RGBA16F swapchain with `VK_COLOR_SPACE_EXTENDED_SRGB_LINEAR_EXT`. MoltenVK then sets
   `kCGColorSpaceExtendedLinearSRGB` and `wantsExtendedDynamicRangeContent = YES` [D][11]. Do not use `enable_color_space_passthrough`, which gives nil colour space and no EDR [D][11].
5. **Handle the post-tonemap CAS (sharpen and scale) pass explicitly** (identified as AMD FidelityFX CAS by independent verification, not FSR 1 EASU).
   Do not copy RenoDX's point-sample replacement. Instead, either run CAS on a normalised or encoded HDR signal, or
   scale and sharpen after display mapping. Otherwise image quality drops at dynamic resolution [D][19] / [I].
6. **Adopt RenoDX's luminance model:** separate game white and UI white, a scRGB intermediate, and an optional 2.2 or BT.1886 gamma correction to match how SDR content is viewed.
   On macOS, map the peak to `maximumExtendedDynamicRangeColorComponentValue` (MacBook) and to the A95L's measured peak (see the display-calibration research notes) rather than a fixed 1000 nits [I].
7. **Prefer a documented display-mapping curve for calibration profiles.** BT.2390 EETF is the obvious choice (Lilium has a reference, under GPL-3). Keep Neutwo as an alternative
   because it is simple and invertible [D][5][16] / [I].
8. **Keep any MacShade experiment out of the default path:** use a separate ad-hoc copy, SDR effects only, and a short bounded trial when the owner approves [I].

---

## Options compared

| Option | Scene HDR? | Runs on this Mac today? | Work | Licence / reuse | Verdict |
|---|---|---|---|---|---|
| RenoDX TOTK add-on as shipped | Yes | No (Windows ReShade, PE DLL, Windows SPIR-V hashes) | n/a | MIT source | Reference only |
| RenoDX TOTK ported to a MacShade add-on | Yes, in principle | No. Needs a macOS rebuild of the RenoDX framework, new hashes, and MacShade working with Ryubing | Very high, high risk | MIT + BSD-3 | Not recommended |
| MacShade + ReShade FX on Ryubing | No (SDR post-processing) | Plausible, untested | Low to try | BSD-3; effects under mixed licences | Optional SDR "vivid/defog" experiment only |
| Beast Roofer Edition HDR | No (inverse tonemap of SDR) | No macOS build | Medium (build from source) | MIT | Reuse only its swapchain chooser idea |
| Ryubing PR !31 revived | Enables it (format plumbing) | Needs a rebuild | Medium-high | MIT | Use as a map |
| **In-Ryubing tonemap replacement + RT upgrade + EDR swapchain (recommended)** | Yes | Needs implementation | High but bounded | MIT (Ryubing + RenoDX math) | **Recommended path** |

---

## Unknowns and evidence gates

| Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|
| Is TOTK 1.4.3's tonemap guest shader the one RenoDX targets, and is it stable? | It decides whether the RenoDX math transfers 1:1 | Dump guest shaders from Ryubing's cache on 1.4.3. Compare the translated GLSL structure (two float inputs, `1 - e^-x`, BT.601 red weight) | Before the HDR prototype |
| What host SPIR-V or MSL Ryubing emits for that shader on MoltenVK (bindings, cb offsets) | Needed for any replacement | Use a debug dump of the translated shader in a dev build. No game launch needed if the existing cache is reused offline | HDR prototype |
| Format of the scene and bloom inputs (R11G11B10F or RGBA16F?) and their real range | Decides how much highlight headroom exists | Log the texture formats at the tonemap draw in a dev build | HDR prototype |
| Confirm on 1.4.3 that the post-tonemap pass is AMD CAS (scaling path), as the RenoDX copy of the shader indicates, and whether it upscales or only sharpens | Image quality under dynamic resolution | Compare the dumped guest shader with `ffx_cas.h` (scaling path) | HDR prototype |
| Do the Ryubing MoltenVK 1.4.2-ryujinx.5 colour-space mappings match upstream main? | EDR depends on it | Read the fork's `MVKSwapchain.mm` at the pinned tag | Before the swapchain work |
| Does the TOTK UI draw into the upgraded buffer after the tonemap? Are there other UI passes (map, inventory, cutscenes)? | SDR-safe UI | Capture a frame and list the draws after the tonemap | HDR prototype |
| What Ritsu's "custom ReShade" changes | Explains what stock ReShade lacked for Ryubing | Ask on the RenoDX Discord, or find the fork's source. Not found on GitHub on 2026-11-01 | Informational |
| Whether MacShade can attach to Ryubing at all | Only for the optional SDR effects | A short trial on a separate ad-hoc copy, with owner approval | Optional, later |

---

## Risks

- **Hash brittleness.** Any Ryubing update can change the host SPIR-V, as RenoDX's history shows. Guest-hash matching reduces this risk but does not remove it [D][12] / [I].
- **Render-target upgrade side effects.** PR !31 was withdrawn as "too unstable" [D][10]. Format changes in the texture cache can break copies, aliasing or the guest's readbacks.
- **Upscaler regression.** Dropping the CAS sharpen-and-scale pass (as RenoDX does) softens the image at dynamic resolution [I].
- **Licence mixing.** Lilium shaders are GPL-3, Serfrost-style mods are NC-ND, AstrayFX in MacShade is CC BY-ND. Copying any of them into this public repository changes its licence obligations [D][8][16].
- **Injection security.** Ryubing's entitlements already allow injection through environment variables. MacShade adds third-party code that sees all keyboard events [D][6][8] / [I].
- **Trust.** The Beast Roofer Edition is single-maintainer and auto-updating. Do not install its binaries [D][9] / [I].
- **Measurement.** No in-game HDR validation exists yet. All the claims about RenoDX image quality come from its author [A][1].

---

## Effort notes

These assume one developer who knows Ryubing's GPU code, offline work on the existing shader cache wherever possible, and owner-approved short game sessions for validation.

| Work item | Range | Assumptions |
|---|---|---|
| Identify and dump the TOTK 1.4.3 tonemap, post-tonemap and bloom shaders in Ryubing | 1-3 days | A dev logging build. The guest hash is available |
| Port the RenoDX TOTK tonemap math to a Ryubing shader replacement (MIT, with attribution) | 3-8 days | The binding layout is understood. Vanilla parity is checked first |
| RGBA16F upgrade of the final buffers (scoped) | 1-3 weeks | Using PR !31 as a map. The instability is the main uncertainty |
| RGBA16F + extended linear sRGB swapchain, plus an EDR headroom query | 2-5 days | MoltenVK's mapping matches upstream |
| CAS (post-tonemap) handling in HDR | 2-6 days | Shader identification is done |
| Optional MacShade SDR trial | 0.5-2 days | Separate ad-hoc copy. Owner approval. No HDR |
| Porting RenoDX to a macOS ReShade add-on (not recommended) | 3-8 weeks | Would also need MacShade-to-Ryubing stability |

---

## Sources

1. Nexus Mods, "RenoDX - True HDR Mod", TOTK mod 175, https://www.nexusmods.com/legendofzeldatearsofthekingdom/mods/175. The direct fetch returned
   HTTP 403. The data came from the public GraphQL API https://api.nexusmods.com/v2/graphql (`legacyMods` with gameId 5363 and modId 175, and `modFiles`). Accessed 2026-11-01.
2. RenoDX wiki, `Mods.md` line 298 and the "Installation" section, https://github.com/clshortfuse/renodx/wiki/Mods (wiki commit 3ff082e). Accessed 2026-11-01.
3. clshortfuse/renodx at commit 43c067b (2026-10-29): `src/games/totk/addon.cpp`, `shared.h`, `tonemap.slang`, `post-tonemap.slang`, `bloom.slang`,
   `ryu-new/`, `intel/`, `ryujinxlog.hpp`, `utils/shader_hotswap.hpp`, `LICENSE` (MIT). https://github.com/clshortfuse/renodx/tree/main/src/games/totk. Accessed 2026-11-01.
4. Ryubing official source at 9afba70 (identical to upstream 475615f): `src/Ryujinx.Graphics.Vulkan/VulkanRenderer.cs:126,763-764`,
   `src/Ryujinx.Graphics.Gpu/Shader/GpuAccessorBase.cs:198`, `src/Ryujinx.Graphics.Gpu/Shader/DiskCache/DiskCacheGuestStorage.cs:268`. Accessed 2026-11-01.
5. clshortfuse/renodx at 43c067b: `src/utils/hash.hpp:96`, `src/utils/pipeline.hpp:679,782`, `src/mods/swapchain_v2.hpp:109,392-398,657-660`,
   `src/shaders/draw.hlsl:299-300,421-560`, `src/shaders/tonemap/neutwo.hlsl`, `src/templates/settings.hpp:60-125`. Accessed 2026-11-01.
6. Ryubing source at 9afba70: `src/Ryujinx.Graphics.Vulkan/MoltenVK/MVKInitialization.cs:12-50`, `src/Ryujinx/Program.cs:240-243`,
   `src/Ryujinx.Graphics.Vulkan/VulkanInitialization.cs:60-120`, `distribution/macos/entitlements.xml`, `distribution/macos/create_app_bundle.sh:39-61`. Accessed 2026-11-01.
7. Read-only inspection of the owner's Ryubing 475615f build in the private local evidence workspace: `codesign -dv` (flags 0x2 adhoc), the entitlements list,
   and `Contents/Frameworks` (libMoltenVK.dylib, no libvulkan). 2026-11-01.
8. klotzbrocken/MacShade at commit 8f6fbef (2026-11-01): `README.md`, `NOTES.md`, `GAMES.md`, `LICENSE`, `mac/CMakeLists.txt:70`,
   `mac/platform/vk_loader_emulation.cpp`, `reshade/source/addon_manager.cpp:230-245`, the release list (v0.6.1). https://github.com/klotzbrocken/MacShade. Accessed 2026-11-01.
9. The Beast Roofer Edition, https://thebeastroofer-edition.com/rooferdev/the-beast-roofer-edition/src/branch/master, commit a4fb32b (2026-08-05):
   `README.md:84,96`, `LICENSE.txt`, `src/Ryujinx.Graphics.Vulkan/Window.cs:118-125,511-545`, `src/Ryujinx.Graphics.Vulkan/Shaders/ColorBlitHdrFragmentShaderSource.frag`,
   `Directory.Packages.props:48`, and the releases and repository API at `/api/v1/repos/rooferdev/the-beast-roofer-edition`. Accessed 2026-11-01.
10. Ryubing PR 31, https://git.ryujinx.app/projects/Ryubing/pulls/31: metadata, comments and file list through the Forgejo API `/api/v1/repos/projects/Ryubing/pulls/31`,
    plus the issue search for "HDR". Accessed 2026-11-01.
11. KhronosGroup/MoltenVK main at 5189f8d (2026-10-13): `MoltenVK/MoltenVK/GPUObjects/MVKSwapchain.mm` colour-space switch (file last changed in 392f6cc, 2026-05-04),
    and `MoltenVK/MoltenVK/GPUObjects/MVKDevice.mm:2082-2150` (`getSurfaceFormats`). https://github.com/KhronosGroup/MoltenVK. Accessed 2026-11-01.
12. clshortfuse/renodx commit history for `src/games/totk` (5fcfe2e 2026-05-03 through 61effc9 2026-07-02), via `gh api repos/clshortfuse/renodx/commits?path=src/games/totk`. Accessed 2026-11-01.
13. Eden, https://git.eden-emu.dev/eden-emu/eden master be21ccc: `src/video_core/renderer_vulkan/vk_swapchain.cpp:34`, `present/lsfg_common.cpp:26,183`.
    Citron, https://github.com/citron-neo/emulator: `src/video_core/renderer_vulkan/vk_swapchain.cpp:31`. Accessed 2026-11-01.
14. SpecialKO/SpecialK, https://github.com/SpecialKO/SpecialK (GPL-3.0). Accessed 2026-11-01.
15. Microsoft Support, "Use Auto HDR for better gaming in Windows", https://support.microsoft.com/en-US/Windows/Hardware/Display-Graphics/use-auto-hdr-for-better-gaming-in-windows
    (only an excerpt was retrieved through search). Accessed 2026-11-01.
16. EndlesslyFlowering/ReShade_HDR_shaders, https://github.com/EndlesslyFlowering/ReShade_HDR_shaders (GPL-3.0; `Shaders/lilium__tone_mapping.fx`,
    `Shaders/lilium__include/tone_mappers.fxh`). Accessed 2026-11-01.
17. Nintendo, "Nintendo Switch 2 Edition" featured games page, https://www.nintendo.com/us/gaming-systems/switch-2/featured-games/switch-2-edition/. Accessed 2026-11-01.
18. crosire/reshade, https://github.com/crosire/reshade (BSD-3-Clause). Accessed 2026-11-01.
19. GPUOpen-Effects/FidelityFX-CAS, `ffx-cas/ffx_cas.h` (scaling path, lines 538-560 and the `thinB = 1.0/32.0` block at 801-811),
    https://github.com/GPUOpen-Effects/FidelityFX-CAS, read through `gh api`. Added by independent verification. Accessed 2026-11-01.

**Access failures:**

- https://www.nexusmods.com/legendofzeldatearsofthekingdom/mods/175 returned HTTP 403 Forbidden to WebFetch. The public GraphQL API was used instead.
- https://gbatemp.net/threads/renodx-true-hdr-for-botw-and-totk-release.681682/ returned HTTP 403 Forbidden.
- `https://git.ryujinx.app/api/v4/projects/ryubing%2Fryujinx/merge_requests/31` returned 404. The repository moved to Forgejo at `/projects/Ryubing`, which worked.
- Ritsu's ReShade Vulkan fork could not be located (`gh api users/ritsucecil/repos` returned 404, and a GitHub search found nothing).

---

## Independent verification

Checked on 2026-11-01 by a separate reviewer against primary sources: the Ryubing official tree at 9afba70 (read with `git show`), fresh reads of
the RenoDX (43c067b), MacShade (8f6fbef), MoltenVK main (5189f8d) and v1.4.2, The Beast Roofer Edition (a4fb32b) and Eden (be21ccc) trees,
whose heads were confirmed against the live remotes, plus the Nexus GraphQL API, the Ryubing Forgejo API, the Roofer Forgejo API, `gh api`
for Citron and FidelityFX CAS, and a read-only `codesign` inspection of the owner's local bundles. Nothing was built or run.

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| Nexus mod 175 is "RenoDX - True HDR Mod" v1.03 by souperman9, created 2026-05-10, updated 2026-07-05, "VULKAN RYUBING ONLY", ReShade 6.8.0 add-on on Ryujinx.exe, no game version stated | Confirmed | Nexus GraphQL `legacyMods` (gameId 5363, modId 175): name, version 1.03, author, createdAt 2026-05-10T17:36:02Z, updatedAt 2026-07-05T14:29:55Z; description text. `modFiles`: 1.0 / 1.01 / 1.02 / 1.03 dated 2026-05-10 / 05-13 / 05-28 / 07-05 | No game version anywhere in the description or file notes |
| The RenoDX TOTK add-on is Windows-only | Confirmed | `addon.cpp:251-254` (`__declspec(dllexport)`, `DllMain`), `windows.h` reached through `utils/shader_hotswap.hpp:8`, `ryujinxlog.hpp:132-136` (`GetWindowTextA`) | `windows.h` is included indirectly, not in `addon.cpp` itself |
| Tonemap replacement: bloom (clamped at 10000) + scene, vanilla `1 - e^-x` luma/per-channel blend, SDR hue/purity transfer, psycho17, per-channel Neutwo, scRGB output; defaults 1000 / 203 / 203 / gamma 2.2 | Confirmed | `tonemap.slang:22-24,29-31,80-104,138-209`; `shared.h:85-95`; `templates/settings.hpp:84-121`; `addon.cpp:43-71` (18 / 70 / 65 %); `mods/swapchain_v2.hpp:109,392-395` | Matches the note line by line |
| The 12-tap post-tonemap pass is FSR 1 EASU | **Corrected** | The commented vanilla code in `post-tonemap.slang:31-60,66-215` has the CAS scaling-path structure: `pp = ip*const0.xy+const0.zw`, per-corner cross min/max, `min(mn, 1-mx)/mx`, approximate sqrt, peak multiplier, and the `1/32` thin bias. `ffx_cas.h:538-560,801-811` [19] has the same terms; EASU does not | It is AMD FidelityFX CAS (sharpen + scale), not EASU. The point that RenoDX drops it for a single `texelFetch` stands |
| Windows RenoDX hashes will almost certainly not match Ryubing on macOS | Confirmed (mechanism now [D]) | `VulkanRenderer.cs:763-764`; with `ReducedPrecision` the SPIR-V generator skips `NoContraction` on float ops (`CodeGen/Spirv/Instructions.cs:2045-2129`); RenoDX hashes CRC32 of the SPIR-V passed to pipeline creation (`utils/pipeline.hpp:679,782`, `utils/hash.hpp:96`); separate `ryu-new/` and `intel/` hash sets (commits b996a42, b6f8727, 2026-05-14) | The hash mismatch itself stays [I], but the byte difference is now documented |
| Ryubing on macOS loads libMoltenVK.dylib directly; no Khronos loader in the bundle | Confirmed | `MVKInitialization.cs:12-50` (resolver rewrites `libvulkan.dylib`), `Program.cs:240-243`; `VulkanInitialization.cs` only adds `VK_LAYER_KHRONOS_validation` when debug logging is on; local bundles list only `libMoltenVK.dylib` in `Contents/Frameworks` [M] | |
| Ryubing ships ad hoc signed, no hardened runtime, with DYLD and library-validation entitlements | Confirmed | `distribution/macos/entitlements.xml` (also `allow-unsigned-executable-memory`, `disable-executable-page-protection`, `cs.debugger`); `create_app_bundle.sh:55-61`; CI `release.yml:159` and `canary.yml:157` call `create_macos_build_ava.sh`, which ad-hoc signs too; `codesign -dv` on two local bundles: `flags=0x2(adhoc)` [M] | Official CI releases use the same ad-hoc path, not only local builds |
| MacShade: BSD-3, created 2026-10-16, v0.6.1, 24 stars, DYLD injection with ~140 interposed MoltenVK symbols, `RESHADE_ADDON=2`, no EDR/HDR code, untested with Ryubing | Confirmed, one detail corrected | GitHub API (created 2026-10-16, 24 stars, 1 fork, 16 releases, v0.6.1 on 2026-11-01; GitHub reports the licence as NOASSERTION but `LICENSE` is BSD 3-Clause); `mac/CMakeLists.txt:70`; `vk_stub_list.inc` has 144 entries; `addon_manager.cpp:228-236`; `GAMES.md` | The non-Win64 add-on filter accepts `.addon` and `.addon32`, not only `.addon32`. Vendored ReShade keeps scRGB/HDR10 colour-space mapping, but MacShade adds no HDR path |
| Beast Roofer HDR is an inverse tonemap of the final SDR frame (paper white 200, peak 1100, curve 2.8) into RGBA16F scRGB or PQ; all releases win-x64; 0 stars | Confirmed | `Window.cs:120-122,510-538`; `ColorBlitHdrFragmentShaderSource.frag` (`sdrToLinear`, `boost = mix(1, peak/paperWhite, hlAmount)`); Forgejo releases API: 16 releases, latest v1.2.6 2026-08-13, every asset `win-x64`; repo API: 0 stars, 1 watcher, created 2026-06-21 | |
| MoltenVK maps RGBA16F + `EXTENDED_SRGB_LINEAR_EXT` to `kCGColorSpaceExtendedLinearSRGB` with EDR on; PASS_THROUGH gives a nil colour space with EDR off | Confirmed for upstream main and v1.4.2; unverifiable for 1.4.2-ryujinx.5 | `MVKSwapchain.mm:520-568` (main 5189f8d; same cases in the v1.4.2 tree); `MVKDevice.mm:2097-2150` enumerates every format with every colour space, including RGBA16Float + EXTENDED_SRGB_LINEAR | The Ryubing fork's source (package `Ryujinx.Graphics.Vulkan.MoltenVK` 1.4.2-ryujinx.5, `Directory.Packages.props:77`) was not found: `gh api repos/Ryubing/MoltenVK` returned 404 and a Forgejo repo search for "moltenvk" returned nothing |
| Ryubing PR !31 by souperman9, closed unmerged 2026-05-03 as "too unstable to ship"; the only HDR item in the tracker | Confirmed | Forgejo API `/repos/projects/Ryubing/pulls/31`: author souperman9, created 2026-04-23, closed 2026-05-03, merged false, 33 files, +1068/-160; closing comment quoted exactly; `Texture.cs` +105/-60, `TextureCache.cs` +191/-8, `PixelConverter.cs` +206, Vulkan `Window.cs` +124/-8. Issue search "HDR": only #31 relates to HDR (other hits are "HD Rumble") | Forgejo keyword search is fuzzy, so "only" means only in that search |
| Eden and Citron have no HDR swapchain | Confirmed, wording refined | Eden be21ccc and Citron `vk_swapchain.cpp:29-40`: look for BGRA8 + SRGB_NONLINEAR, else `formats[0]`; no HDR colour space in Eden's `renderer_vulkan` | "Forced" was slightly strong: they prefer sRGB and never ask for an HDR colour space |
| Ryubing has no shader replacement infrastructure, but its disk cache hashes guest code + cb1 data | Confirmed | `DiskCacheGuestStorage.cs:261-268` (`CalcHash(data, cb1Data)`); `git grep -i "replac\|custom shader"` in `Ryujinx.Graphics.Gpu/Shader` and `Ryujinx.Graphics.Shader` finds only optimiser and translator passes | That this key is stable across hosts and game updates remains [I] |

**Corrections made:** the post-tonemap pass is AMD CAS, not FSR 1 EASU (section 1.2, implication 5, unknowns, risks, effort);
the last commit touching `src/games/totk` is 2026-08-17; MacShade's non-Win64 add-on filter accepts `.addon` and `.addon32`;
the NoContraction mechanism behind the SPIR-V difference was added; Eden and Citron wording refined.

**Still open:** the colour-space mapping in MoltenVK 1.4.2-ryujinx.5, whether TOTK 1.4.3 uses the same tonemap and CAS guest shaders, and the identity
of Ritsu's custom ReShade fork. None of these could be checked from public sources on 2026-11-01.
