# 10 - Architecture Options: Maintained Fork, Native macOS Shell or Hybrid

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: how TOTK Luma should be built around the Ryubing emulator, how invasive each needed hook is,
how builds stay reproducible, and how any change can be rolled back. Xcode is treated as a candidate,
not a constraint.

---

## Summary

- **Recommendation: option C, the hybrid, built in phases on top of option A.** Keep a small Ryubing fork
  as a patch queue with feature flags. Add four narrow extension points to it. Ship the Mac-specific parts
  (HDR presenter, overlay, calibration, DualSense) as a native Swift dylib loaded into the existing .NET
  process. [I]

- **The emulator already has the seams the hybrid needs.** On macOS the frontend creates its own
  `CAMetalLayer` inside a child `NSView` [6]. Presentation goes through a 7-method `IWindow` interface [5].
  Input goes through a 7-member `IGamepadDriver` interface (one member, `Clear`, has a default body; `Dispose` comes from `IDisposable`) [9]. A local branch already composes a second
  input driver in 103 lines [31]. [D]

- **Who owns the `CAMetalLayer` decides HDR control.** When MoltenVK creates a swapchain on a layer, it
  overwrites that layer's `colorspace` and `wantsExtendedDynamicRangeContent` from the Vulkan colour space
  (MoltenVK v1.4.2 `MVKSwapchain.mm:519-570`) [22]. A native presenter therefore needs its own layer, with
  MoltenVK rendering offscreen and sharing the image through `VK_EXT_metal_objects`, which MoltenVK lists
  as supported [22]. [D]

- **A full native shell (option B) is feasible but expensive.** MeloNX proves the pattern on iOS: a
  NativeAOT `Ryujinx.Library` with C exports (`set_native_window` takes a layer pointer from Swift) and an
  Xcode project [20]. On the Mac it would drop TieredPGO, force the GPU macro JIT (which uses
  `Reflection.Emit`) back to an interpreter [11][24], and require rebuilding about 37,600 lines of frontend
  behaviour. Estimate: 10-20 person-weeks before parity. [D] for the facts, [I] for the estimate.

- **Upstream is healthy but bursty.** Master moved by 143 commits and 727 files between 2026-04-29 and
  2026-08-26 [15]. It has then been quiet: no master commits from 2026-08-26 to 2026-11-01 [13], while
  14 PRs are open, including FencePool !195, opened 2026-10-31 [13][16]. Canaries are built per commit;
  the latest is 1.3.351 (2026-08-26) [14]. The latest stable release is 1.3.3 (2025-10-11) [13]. [D]

- **Rebase cost for today's local patches is low to moderate.** About 2.6k lines, mostly new files. The
  edits to existing files sit in UI files that churn a lot (`Program.cs`, `MainWindow.axaml.cs`,
  `ContentDialogHelper.cs`) and in `HvExecutionContext.cs`, all of which changed upstream in that
  4-month window [15][31]. Estimate: 0.5-2 days per sync. [I]

- **Builds are close to reproducible but not pinned.** `global.json` pins SDK 10.0.301 with
  `rollForward: latestFeature`, and the local build actually used 10.0.303 [1][31]. There are no NuGet lock
  files in the tree [1]. MoltenVK comes as the NuGet package `1.4.2-ryujinx.5` [1]. [D] All of this is fixable
  in about 1 person-week. [I]

- **Rollback is already practised and should become the default contract.** Side-by-side bundles, pinned
  executable hashes, a private data root, a save-backup manifest, and "delete the build folder" as a
  complete undo [31]. This needs one addition: a distinct `CFBundleIdentifier` per variant. Today every
  build is `org.ryujinx.Ryujinx` [12]. [M] [D]

- **Upstreaming candidates:** shmfix (small, has a regression test, touches a file upstream has not
  changed) [31][15]; the Retina `contentsScale` fix (issue #461; the code is at `EmbeddedWindow.cs:246-251`
  [6]); hvfix A+B once in-game validation exists. FencePool !195 is another author's open PR [16]: test
  and review it, and carry it locally, but do not resubmit it. [D] [I]

- **A different base emulator (option D) is not justified now.** Every measured result so far (A+B,
  shmfix, agentpad, D2) is on Ryubing [31]. Eden's macOS builds are described as experimental [32]. [A]

---

## Findings

### 1. The Ryubing codebase at 9afba70 (identical to upstream 475615f)

#### 1.1 Structure, languages, frameworks, licence

| Item | Value at 475615f | Source |
|---|---|---|
| Language and runtime | C# with `LangVersion preview`, `net10.0` for all projects | `Directory.Build.props` [1] [D] |
| SDK pin | `10.0.301`, `rollForward: latestFeature` | `global.json` [1] [D] |
| UI | **Avalonia 12.1.1**, FluentAvaloniaUI 3.0.2, SkiaSharp 3.119.4 | `Directory.Packages.props:14` [1] [D] |
| Input and audio | Ryujinx.SDL3-CS 2026.707.0; SDL3, OpenAL, SoundIo and Apple audio backends | [1] [D] |
| Vulkan on macOS | Silk.NET Vulkan + `Ryujinx.Graphics.Vulkan.MoltenVK 1.4.2-ryujinx.5` | `Directory.Packages.props:77` [1] [D] |
| Packaging | `PublishSingleFile`, `PublishTrimmed` (partial), `TieredPGO` | `Ryujinx.csproj:10,32-35` [2] [D] |
| Central package management | Yes; no `packages.lock.json` anywhere | [1] [D] |
| Licence | MIT ("Ryujinx Team and Contributors") | `LICENSE.txt` [1] [D] |
| Size | 4,005 `.cs` files | `git ls-tree` [1] [M] |

Lines of C# per main project (counted at 9afba70) [M]:

| Project | Files | Lines | Role |
|---|---|---|---|
| Ryujinx.HLE | 1,147 | 111,595 | OS services, SurfaceFlinger, statistics |
| ARMeilleure | 431 | 70,492 | guest CPU JIT |
| Ryujinx.Cpu | 179 | 52,008 | CPU backends, including AppleHv |
| Ryujinx.Graphics.Gpu | 177 | 50,537 | GPU emulation, texture cache, shader cache |
| Ryujinx.Graphics.Shader | 190 | 41,552 | Maxwell to SPIR-V/GLSL translator |
| Ryujinx (frontend) | 224 | 37,604 | Avalonia UI, AppHost, headless mode |
| Ryujinx.Graphics.Vulkan | 104 | 25,764 | Vulkan backend and presenter |
| Ryujinx.Memory | 51 | 7,944 | host memory, shared memory |
| Ryujinx.Graphics.GAL | 188 | 6,923 | graphics abstraction, threaded renderer |
| Ryujinx.Input (+ SDL3) | 43 | 6,565 | input abstraction and SDL3 driver |

**Conflict with the project brief.** The brief says "Avalonia 11.3". At 475615f the pin is Avalonia
**12.1.1** [1], after PR !82 "UI: Update Avalonia to v12.1", merged 2026-08-16 [13]. [D]

#### 1.2 Headless and library frontends

- **Headless mode is built into the main executable, not a separate project.** `src/Ryujinx/Headless/`
  holds `HeadlessRyujinx.cs` (523 lines), its options, and SDL3-based OpenGL and Vulkan windows.
  `--no-gui` or `nogui` selects it (`Program.cs:165,183`) [7]. [D]
- **In headless mode, SDL3 owns the window and the Metal layer** through `SDL_Vulkan_CreateSurface`
  (`Headless/Windows/VulkanWindow.cs:43-53`) [7]. [D]
- **MeloNX (iOS, on the same Forgejo)** adds `src/Ryujinx.Library` (NativeAOT, `PublishAot`, `TrimMode full`,
  `ios-arm64`). It has 32 `UnmanagedCallersOnly` C exports (23 in `Library.cs`, 9 in `UnmanagedPassthrough.cs`), among them `initialize`,
  `set_native_window(nint layer)`, `set_unbounded_present_target_fps`, `attach_gamepad` and
  `set_gamepad_button_state`. It also adds `src/Ryujinx.Input.Native` (a gamepad driver fed from Swift)
  and `src/MeloNX/MeloNX.xcodeproj` [20]. MeloNX master was last updated 2026-08-27. [D]
- **Licence ambiguity in MeloNX.** Its README says "GPLv3", but its `LICENSE.txt` is the inherited MIT
  text [20]. Do not copy MeloNX code until this is clarified. Reading it for design ideas is fine. [D]
- **Kenji-NX** is a desktop fork with a separate Android build repository (`Kenji-NX/Android`, builds
  only) [21]. I did not find a `LibRyujinx` project in either repository. [D] (absence of evidence only)

#### 1.3 Upstream health

| Signal | Value | Source |
|---|---|---|
| Forge | Self-hosted, modified Forgejo at git.ryujinx.app; repository `projects/Ryubing` | README [19], API [13] [D] |
| Master head | `475615f` = the commit TOTK Luma builds from, 2026-08-26 | API [13] [D] |
| Commits per month | 2025-10: 34, 11: 33, 12: 20; 2026-01: 16, 02: 9, 03: 11, 04: 34, 05: 85, 06: 28, 07: 18, 08: 12 | API, last 300 commits [13] [D] |
| Quiet period | No master commits from 2026-08-26 to 2026-11-01 (67 days) | API [13] [D] |
| Canary | Built on every push to master that touches code (`canary.yml` on push, with `paths-ignore` for docs, assets and config files); 1.3.351, 2026-08-26; ten canaries on 2026-08-24 alone | [4][14] [D] |
| Stable | 1.3.1 (2025-04-24), 1.3.2 (2025-06-09), 1.3.3 (2025-10-11). The README says "every month or so" | [13][19] [D] |
| Open PRs | 14 on the repository record; recent ones include !195 FencePool, !131 KosmicKrisp WIP, !193 input physical-key migration | [13] [D] |
| macOS CI | macOS bundles are built on `dotnet-greem-ubuntu-latest` and ad hoc signed with `rcodesign` when `codesign` is absent | `build.yml:118-162`, `create_macos_build_ava.sh` [4] [D] |

**Contribution policy** (`CONTRIBUTING.md`) [19] [D]:

- Discuss large or core changes first, on an issue or on Discord.
- No style-only PRs. Run `dotnet format`.
- "DON'T commit code that you didn't write."

The document still links to the old GitHub repository. `gh` cannot resolve `Ryubing/Ryujinx` today
(access failure: `gh repo view Ryubing/Ryujinx` returns "Could not resolve to a Repository with the name
'Ryubing/Ryujinx'", re-checked 2026-11-01). Read the stale links as a sign of a forge migration, not of abandonment. [D] [I]

**Upstream risk on macOS.** Khronos has deprecated MoltenVK and recommends KosmicKrisp on Apple Silicon [23].
Ryubing has an open WIP PR (!131) to add KosmicKrisp as a selectable translation layer [18]. TOTK Luma
should treat the Vulkan-on-Metal layer as a variable it may need to swap. [D]

#### 1.4 How invasive each needed hook is

Churn means the number of upstream changes to the same files between 2026-04-29 and 2026-08-26 [15].

| Hook | Where it lives at 475615f | Upstream churn | Invasiveness | Notes |
|---|---|---|---|---|
| **Presentation and swapchain** | `IWindow` (7 methods) [5]; `Vulkan/Window.cs` 683 lines: `CreateSwapchain` 88-200, `ChooseSwapSurfaceFormat` 229-265 (only `B8G8R8A8Unorm`, sRGB or pass-through), `Present` 312+ | `Window.cs` and `VulkanRenderer.cs` both changed | **Medium** | PR !31 (RGBA16F swapchain plus blit) touched 33 files, +1068/−160, and its author closed it as "too unstable to ship" on 2026-05-03 [17]. A presenter interface that hands the final image out is smaller than upgrading every blit and effect in place. [D] [I] |
| **Layer ownership** | `EmbeddedWindow.CreateMacOS()` creates `CAMetalLayer` + child `NSView` through ObjC interop, sets `contentsScale` (lines 231-256) [6]; `EmbeddedWindowVulkan` hands both to `SimpleMetalWindow` [6] | `EmbeddedWindow.cs` unchanged | **Low** | This is the single point where a native view and layer could be substituted. [D] |
| **Shader translation and replacement** | `ShaderCache.TranslateShader` (about lines 732-800) with an existing `ShaderDumper` (`GraphicsConfig.ShadersDumpPath`) [8]. No replacement path exists | `ShaderCache.cs` unchanged | **Medium** | A registry keyed by guest shader hash can sit beside the dumper. The difficult part is cache invalidation and the threaded renderer, not the hook itself. [D] [I] |
| **Texture format upgrades** | `Gpu/Image/` (`FormatTable`, `TextureCache`, `TextureManager`, `Texture`, `TextureCompatibility`) | 11 files in `Graphics.Gpu` changed; PR !181 (raw copy dependencies) was merged and then reverted on 2026-08-26 [13] | **High** | Format aliasing and copy compatibility are fragile, as the revert shows. Upgrade by exact allow-list for one game only. [D] [I] |
| **Input composite driver** | `IGamepadDriver` [9]; `InputManager` built with fixed drivers at `MainWindow.axaml.cs:113` and `HeadlessRyujinx.cs:184` [9] | `Ryujinx.Input` 22 files and `Input.SDL3` 17 files changed; open PR !193 | **Low-Medium** | The local `agentpad` branch adds `CompositeGamepadDriver` (103 lines) and a virtual driver as new files [31]. Only the construction site needs editing. [M] [D] |
| **Overlay** | None in the emulator. Only effects (FSR, FXAA, SMAA, area) in `Vulkan/Effects` and the Avalonia status bar | n/a | **Medium in Vulkan, Low natively** | A native overlay layer above the game layer needs no emulator change except telemetry. [I] |
| **Telemetry stream** | `PerformanceStatistics` with a 750 ms reset timer (`:49`), `GetGameFrameRate/FrameTime/FifoPercent` (`:154-171`); `AppHost` raises `StatusUpdatedEvent` (`:1216-1229`) [10] | `AppHost.cs` changed | **Low** | Add a per-frame ring buffer (timestamps for present, guest vsync and FIFO) published over a Unix socket or shared memory. This follows the agentpad socket pattern [31]. [D] [I] |

The existing `GetGameFrameTime` is an average over the 750 ms window [10]. This is consistent with the
prior finding that there is no per-frame game frame-time source yet. It also refines the prior estimate
of "about 1 s averages" to 0.75 s windows. [D]

### 2. The options

#### (A) Maintained Ryubing fork as a patch queue with feature flags

What exists today (local branches in the private local evidence workspace) [31] [M]:

| Branch or bundle | Content | Footprint |
|---|---|---|
| `master` (local) | official + hvfix A + hvfix B + shmfix + build config + shm test | 7 files, +279/−22 |
| `agentpad` | official + shmfix + test + virtual pad + background mode + harness | 19 files, +2458/−19 |
| `hvfix-agentpad` | both of the above combined (bundle present; no measurements found in the reports) | 23 files, +2635/−26 |

Patch-queue design [I]:

- One commit per concern, in a fixed order: build config, then shmfix, hvfix, telemetry, input, presenter
  and shader registry.
- Every runtime change is off by default and enabled by a flag (command line or `Config.json`), as agentpad
  already does with `--agent-pad-socket` [31].
- One `series` file plus a `rebase.sh` that replays the queue on a new upstream base and runs
  `Ryujinx.Tests.Memory` and `Ryujinx.Tests.Input`.

Rebase-cost estimate [I]:

- shmfix touches `Memory/MemoryManagementUnix.cs`, which upstream did not change in 6 months [15]. Near-zero cost.
- hvfix A touches `HvExecutionContext.cs`, which upstream changed in the window [15]. Expect manual conflicts.
- agentpad edits `Program.cs`, `MainWindow.axaml.cs`, `MainWindowViewModel.cs` and `ContentDialogHelper.cs`,
  all changed upstream [15]. It also edits `CommandLineState.cs` (unchanged upstream) and `ReleaseInformation.cs`
  (unchanged in the 4-month window, changed in the 6-month range) [15]. The frontend has the most churn: 291 of 727 changed files are in `src/Ryujinx`.
- **About 0.5-2 days per sync** for the current queue. This rises to **2-5 days** once presenter and
  texture patches touch `Window.cs` and `Gpu/Image`. A sync during a burst (85 commits in May 2026) costs
  more than one during a quiet quarter.

Strengths: lowest new code, keeps CoreCLR (TieredPGO, macro JIT), keeps all prior evidence valid.
Weaknesses: HDR and overlay must be written in Vulkan and C# inside upstream's hottest files. UX polish is
limited by the Avalonia frontend.

#### (B) Native macOS shell (Swift, AppKit or SwiftUI, Xcode) embedding the core

Two sub-variants:

**B1 - In-process, NativeAOT dylib with C exports** (the MeloNX pattern) [20][25].

- `UnmanagedCallersOnly(EntryPoint = ...)` methods in the published assembly become C entry points [25] [D].
- macOS x64 and Arm64 are supported targets for NativeAOT [24] [D].
- Documented limits [24] [D]:
  - no `System.Reflection.Emit`;
  - trimming is required;
  - no dynamic assembly loading;
  - `System.Linq.Expressions` are interpreted.
- Consequences for Ryubing:
  - `MacroJitCompiler` uses `DynamicMethod`/`ILGenerator` [11], so `EnableMacroJit` must be off. Macros
    then fall back to MacroHLE or `MacroInterpreter` (`Macro.cs:50-62`) [11]. MeloNX, the NativeAOT precedent,
    does exactly this: `GraphicsConfig.EnableMacroJit = false` (`Library.cs:784`) [20]. [D]
  - TieredPGO (`Ryujinx.csproj:10`) [2] does not apply to AOT code. [I]
  - ARMeilleure emits host machine code directly and does not depend on the .NET JIT, so guest-CPU JIT
    should be unaffected. MeloNX running on iOS supports this view [20]. [I]
- **Performance effect of AOT on TOTK is unmeasured.** This is an evidence gate.
- The Swift app owns the process, so it needs the same entitlements: JIT, unsigned executable memory,
  hypervisor, disabled library validation [3]. [D]

**B2 - Separate process** (the Swift app plus the .NET emulator headless or as a helper) [I].

- The emulator renders into an IOSurface-backed `VkImage`, imported through `VK_EXT_metal_objects`, which
  MoltenVK lists [22].
- The IOSurface is shared over XPC (`IOSurfaceCreateXPCObject`, "Returns an xpc_object_t that holds a reference
  to the IOSurface", macOS 10.7+) [29]. GPU work is synchronised with an `MTLSharedEvent` handle passed between
  processes (`makeSharedEventHandle()`, "Creates a new shareable event handle", macOS 10.14+) [30]. Only the
  abstracts and platform lists were read (through Apple's documentation JSON); the cross-process usage is [I].
- Input and telemetry travel over the proven Unix-socket pattern [31].
- Costs: a frame-pacing handshake across processes, probably one extra frame of latency unless it is
  carefully pipelined, and two lifecycles to supervise. A crash in the emulator does not take the shell down,
  which is a benefit.

**Who owns the `CAMetalLayer`?**

| Variant | Owner today or proposed | Effect on HDR |
|---|---|---|
| Ryubing Avalonia (today) | C# `EmbeddedWindow` creates it [6]; MoltenVK then configures it from the swapchain colour space [22] | `PASS_THROUGH_EXT` makes MoltenVK set `colorspace = nil` and EDR off [22], which matches the prior evidence |
| Ryubing headless (today) | SDL3 [7] | Same MoltenVK path |
| MeloNX | Swift creates it and passes the pointer through `set_native_window` [20] | Still a MoltenVK swapchain, so MoltenVK still writes the layer properties |
| **Proposed (B or C)** | **Native code owns a presenter layer that MoltenVK never swapchains on.** MoltenVK renders offscreen | Swift sets `pixelFormat` (RGBA16Float), colour space, `wantsExtendedDynamicRangeContent` and `EDRMetadata` itself, and can follow headroom changes per display |

The rule is [I]: **one owner per layer.** If MoltenVK presents to a layer, the Vulkan colour space is the
only way to control it. The colour spaces for which MoltenVK turns EDR on are `EXTENDED_SRGB_LINEAR_EXT`,
`EXTENDED_SRGB_NONLINEAR_EXT`, `DISPLAY_P3_LINEAR_EXT`, `DISPLAY_P3_NONLINEAR_EXT`, `DCI_P3_NONLINEAR_EXT`,
`BT2020_LINEAR_EXT`, `HDR10_ST2084_EXT` and `HDR10_HLG_EXT`. `vkSetHdrMetadataEXT` then sets the layer's
`EDRMetadata` (an HDR10 `CAEDRMetadata`) and also forces `wantsExtendedDynamicRangeContent = YES`
(`MVKSwapchain.mm:338-388`) [22] [D].

Effort: B1 is 10-20 person-weeks to reach a TOTK-only shell with settings, input mapping, profiles, HUD and
error handling. B2 is 8-14 person-weeks. Both are [I].

#### (C) Hybrid: fork with narrow extension points plus native Swift components

The .NET process stays the host, so CoreCLR, the macro JIT and the Avalonia shell stay as they are. Four
extension points are added to the fork, each behind a flag [I]:

1. **Presenter interface.** For example, an `IExternalPresenter` that `Vulkan/Window.Present` calls with
   the final post-scaling image. It exports `MTLTexture` and `MTLSharedEvent` through
   `VK_EXT_metal_objects` [22]. When it is enabled, no MoltenVK swapchain is created on the visible layer.
2. **Shader-replacement registry.** It loads host shader overrides keyed by guest hash, next to
   `ShaderDumper` [8].
3. **Input driver plugin.** It generalises the `CompositeGamepadDriver` construction site [9][31].
4. **Telemetry stream.** A per-frame ring buffer on a Unix socket [10].

Native Swift components ship as **one dylib** (`libTotkLumaNative.dylib`), loaded through P/Invoke. The
existing `disable-library-validation` entitlement allows an ad hoc-signed dylib [3]. [D] [I]

- `EmbeddedWindow.CreateMacOS()` asks the dylib for an `NSView` that holds the Swift-owned presenter layer
  and an overlay layer, instead of creating its own [6].
- The dylib holds the HDR presenter (Metal), overlay (Core Animation or SwiftUI hosting view), calibration
  profiles, and an optional DualSense driver using GameController. The driver feeds the input plugin
  through a C callback.
- **Run-loop caveat.** Avalonia owns `NSApplication` in this process. Swift code must not create a second
  app delegate, and must do AppKit work on the main thread. The agentpad work found that removing
  Avalonia's app delegate breaks Cmd+Q and Dock reopen [31]. [M] [I]

Performance [I]:

- The native presenter adds one fullscreen pass, roughly 2304×1296 RGBA16F, about 24 MB read and written
  per frame.
- At 60 FPS that is about 1.4-2.9 GB/s, small against the M4 Pro's unified memory bandwidth (Apple quotes
  273 GB/s). It is not free on the GPU-bound Great Sky Island, so it must be measured.
- The sync cost is one shared-event wait per frame, in-process.

#### (D) A different base emulator, in brief

- Eden (a C++ yuzu descendant) publishes macOS builds through MoltenVK. Its release page labels macOS
  "experimental", with "major graphical glitches and crashes" (third-party listing, checked 2026-09-28)
  [32]. [A]
- Switching would discard the measured work (A+B, shmfix, agentpad, D2 offsets validated on Ryubing 1.4.3
  runs) [31].
- Keep D as a watch item, re-evaluated only if Ryubing development stops for more than 6 months or
  KosmicKrisp support lands elsewhere first. [I]

### 3. Reproducible builds and rollback

#### 3.1 Prior local build facts (private local evidence workspace) [31] [M]

- Isolated official .NET SDK 10.0.303 (runtime 10.0.11), checked against `releases.json` with SHA-512 and
  Microsoft-signed. Environment: `DOTNET_ROOT`, `NUGET_PACKAGES` (a 3.4 GB cache) and `DOTNET_CLI_HOME`,
  all inside the build folder.
- Source archive identical to the official git.ryujinx.app archive of `475615f` (4,312 files, SHA-256 checked).
- arm64 publish in **48 s** with 0 errors. MoltenVK `1.4.2-ryujinx.5`, identical to the reference app.
- Ad hoc signing with the **same 8 entitlements** as the reference app; no new permissions.
- `Ryujinx.Tests.Memory` 83/83 (A+B tree), `Ryujinx.Tests.Input` 42/42, client-server end-to-end 9/9 (agentpad).
- Separate bundles: `…-hvfix.app` (kept pinned as the performance-measurement reference), `…-agentpad.app`,
  and a combined `…-hvfix-agentpad.app`.
- A new build triggers a shader-cache rebuild: 1,017 shaders in 88 s, or 85 s for agentpad.
- Local toolchain observed on this machine: Xcode 27.2 (27B5019j, beta) and Swift 6.4. [M]

#### 3.2 Entitlements in the source (`distribution/macos/entitlements.xml`) [3] [D]

| Entitlement | Why Ryubing needs it | Keep for TOTK Luma? |
|---|---|---|
| `com.apple.security.cs.allow-jit` | ARMeilleure and .NET JIT write executable code | Yes |
| `com.apple.security.cs.allow-unsigned-executable-memory` | JIT pages without `MAP_JIT` discipline | Yes (test removal later) |
| `com.apple.security.cs.allow-dyld-environment-variables` | `DYLD_*` overrides, for example MoltenVK debugging | Debug builds only [I] |
| `com.apple.security.cs.disable-library-validation` | Loads ad hoc or unsigned dylibs (MoltenVK, SDL3, a future Swift dylib) | Yes |
| `com.apple.security.cs.disable-executable-page-protection` | Broad W+X allowance | Test removal [I] |
| `com.apple.security.cs.debugger` | Acts as a debugger | Debug builds only [I] |
| `com.apple.security.get-task-allow` | Lets debuggers attach | Debug builds only [I] |
| `com.apple.security.hypervisor` | Hypervisor.framework CPU backend | Yes |

`Ryujinx.csproj:28` re-signs the build output with these entitlements on every macOS build, using
`SigningCertificate` with `-` (ad hoc) as the default [2]. Signing with a paid Developer ID is not needed
for personal use. [D]

#### 3.3 Pinning

| Item | Today | Proposed |
|---|---|---|
| SDK | `10.0.301` + `latestFeature` (resolved to 10.0.303 locally) [1][31] | `"version": "10.0.303", "rollForward": "disable"`, plus the .NET 10 `paths` key pointing at the isolated SDK. Microsoft recommends `disable` with lock files [26] [D] |
| NuGet | Central versions, no lock files [1] | `RestorePackagesWithLockFile=true`, commit `packages.lock.json` per executable project, CI runs `dotnet restore --locked-mode` [27] [D] |
| NuGet sources | nuget.org plus the git.ryujinx.app feed for `Ryujinx.LibHac` only [1] | Keep source mapping. Optionally mirror the restored `.nupkg` set (with hashes) into a private local feed so builds survive feed outages [I] |
| MoltenVK | NuGet `1.4.2-ryujinx.5` [1] | Pin via the lock file and record the dylib SHA-256 in the build manifest. Treat a KosmicKrisp ICD as a separate, flagged variant (PR !131) [18] |
| Swift dylib | n/a | `xcodebuild` or `swift build` with a pinned Xcode version recorded in the manifest. The Xcode 27.2 beta on this Mac is a reproducibility risk [M] [I] |
| Output | App bundle | `build-manifest.json` with upstream commit, patch-queue hash, SDK, lock-file hash, and SHA-256 of the executable and every dylib. The existing launchers already pin by executable hash [31] |

Note: the NuGet docs say lock files are not meaningful for library projects consumed by others [27].
Lock only `src/Ryujinx` and the test projects. [D]

#### 3.4 Side-by-side bundles, data roots, profiles

- **Bundles.** Use one bundle per variant, with a distinct name **and** a distinct `CFBundleIdentifier`.
  Today all builds share `org.ryujinx.Ryujinx` [12], so they share defaults, saved window state and any
  TCC decisions. Example scheme: `app.totkluma.ryubing.<variant>`. [D] [I]
- **Data roots.** Ryubing supports `-r`/`--root-data-dir` and a `portable` folder next to the executable
  or next to the `.app` bundle (`AppDataManager.cs:60-75`, `CommandLineState.cs:49-50`) [12]. Give every
  variant its own root, or at least its own config and shader cache. Saves should be copied in from the
  manifest-checked backup, never shared live between variants. [D] [I]
- **Profiles.** Keep named configs per variant and per display: MacBook, A95L, agent-controlled
  background. The private evidence already uses this pattern (`Config.FINAL-local.json`,
  `Config.AGENT-bg.json`) [31]. `-p`/`--profile` selects the user profile [12]. [M] [D]

#### 3.5 Rollback strategy

1. **Never replace, only add.** A new build is a new bundle. The previous known-good bundle and the
   original reference app stay untouched. [M]
2. **Launch by hash.** Launchers refuse an executable whose SHA-256 is not in the manifest. [M]
3. **Data isolation.** Each variant has its own data root. Before a first run, saves are restored from the
   manifest-checked backup. [M]
4. **Flags first.** A feature is rolled back by turning its flag off. Only if that fails is the bundle
   rolled back. [I]
5. **Queue rollback.** Every synced queue is tagged (for example `luma/475615f/q7`). Rolling back means
   rebuilding from the previous tag. With a pinned SDK, lock files and a warm cache, a rebuild takes
   about a minute (48 s publish) [31]. [M] [I]
6. **Full undo.** Delete the build folder (SDK, NuGet cache, sources, bundles). This changes nothing on the
   system [31]. [M]

#### 3.6 CI options (no purchase assumed)

| Option | Cost | Fit |
|---|---|---|
| Local scripted build on the owner's Mac (CLI only, no GUI) | None | Works today. Must run only when the owner agrees, because it competes for CPU [M] |
| GitHub Actions on a **public** fork | Standard hosted runners are free in public repositories [28] | Good for build plus unit tests. Publishing emulator binaries is an owner decision. The TOTK Luma repository itself must stay specs-only [D] [I] |
| Linux runner building macOS bundles | Free tier as above | Upstream does exactly this with `rcodesign` [4]. It cannot build the Swift dylib, which needs Xcode [D] [I] |
| Forgejo Actions | Needs an owner-provided runner | Only if the fork lives on a Forgejo instance [I] |
| Xcode Cloud | Requires an Apple Developer Program membership | Mentioned only. Not assumed [I] |

---

## Implications for TOTK Luma

1. **Adopt C as the target and A as its foundation.** The fork exists anyway (shmfix, hvfix, agentpad). C
   adds four flagged extension points and a separate native dylib, so most Mac-specific code lives outside
   upstream's churn.

2. **Make native code the sole owner of the visible layer when the HDR presenter is on.** MoltenVK renders
   offscreen. With the flag off, the stock MoltenVK swapchain path is unchanged, and that is the rollback.

3. **Gate the presenter on an SDR identity test.** With the native presenter in sRGB and no EDR, captured
   output must match the stock path within ±1 code value before any HDR work starts.

4. **Keep scene-HDR work (format upgrades, tonemap replacement) separate from the presenter.** It is the
   highest-risk part, it is the same in every option, and PR !31 shows the cost of doing it broadly.
   Restrict it to an allow-list of TOTK 1.4.3 render targets and shaders.

5. **Build the telemetry ring buffer first.** Every later gate (frame pacing, HDR overhead, AOT question)
   needs per-frame data, and the hook is low-risk.

6. **Upstream early.** Upstream shmfix and the `contentsScale` fix, and support !195 by testing it on
   Apple Silicon. Every patch accepted upstream is one less to rebase.

7. **Defer option B.** Revisit it only if the Avalonia frontend blocks a required UX goal, such as clean
   fullscreen on the A95L, which C cannot meet with a native overlay. If revisited, prototype B2 first:
   it keeps CoreCLR and can be measured against C.

8. **Make the build manifest and per-variant bundle IDs mandatory**, so that every measurement names an
   exact binary.

---

## Options compared

Scores are relative: 1 is worst, 5 is best. All scores are [I] unless marked otherwise.

| Criterion | A: Fork + patch queue | B1: Swift shell + NativeAOT | B2: Swift shell + helper process | C: Hybrid (recommended) | D: Other base |
|---|---|---|---|---|---|
| Initial effort | 1-3 pw | 10-20 pw | 8-14 pw | 6-12 pw (incl. A) | 8-20+ pw (redo all) |
| Maintenance cost | 4 | 2 (two runtimes, AOT trimming roots) | 2 (IPC contract) | 3 | 2 |
| Upstream rebase burden | 3 (UI-hot files) | 2 (AOT entry layer and core edits) | 3 | 4 (narrow seams; native code outside) | n/a |
| Performance | 5 (stock CoreCLR) | ? (TieredPGO lost, macro interpreter, unmeasured) | 4 (IPC sync, possible +1 frame) | 4-5 (one extra pass, in-process) | ? |
| HDR feasibility | 3 (Vulkan colour space only; PR !31 history) [D] | 4 (native layer) | 4 (native layer) | 5 (native layer, flag back to stock) | ? |
| UX polish | 2 (Avalonia) | 5 | 5 | 4 (native overlay, Avalonia menus) | ? |
| Build reproducibility | 4 (one toolchain) | 2 (dotnet + Xcode + AOT) | 3 | 3 (dotnet + Xcode, separable) | ? |
| Risk | Low | High | Medium-High | Medium | High |
| Keeps prior evidence valid | Yes [M] | Partly (AOT changes the runtime) | Mostly | Yes | No |

---

## Unknowns and evidence gates

| Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|
| Does `VK_EXT_metal_objects` export work in MoltenVK `1.4.2-ryujinx.5` for Ryubing's final present image, including `MTLSharedEvent` sync? | The C presenter depends on it | A 1-day spike: export the post-scaling `TextureView` and present it from Swift, SDR only, then compare captures | Phase 1 exit |
| Cost of the extra presenter pass on the GPU-bound island | 45-48 FPS today under D2 [M] | Per-frame telemetry, A/B with the flag on and off, same route | Phase 2 exit |
| NativeAOT viability and speed for the full core (macro interpreter, trimming roots, no TieredPGO) | Decides whether B1 is ever worth it | Optional: an AOT build of headless mode, run against the same scenes | Only if B is reopened |
| Can Avalonia 12 host the Swift `NSView` and overlay without breaking fullscreen, Spaces or EDR? | UX of C | Prototype in `EmbeddedWindow.CreateMacOS` behind a flag | Phase 2 |
| Will upstream accept shmfix, the `contentsScale` fix, and later A+B? | Rebase burden | Open an issue, then a PR, following CONTRIBUTING [19] | Phase 0-1 |
| MoltenVK vs KosmicKrisp under macOS 27 | MoltenVK is deprecated [23]; SPIR-V to MSL behaviour differs | Watch PR !131 [18]; test a flagged ICD variant | Watch item |
| MeloNX licence (README says GPLv3, file says MIT) | Whether any code may be reused | Ask the maintainers, or reuse nothing | Before any reuse |
| Whether a `LibRyujinx` exists in Kenji-NX or Android forks | Alternative library frontend | Not found [21]; not needed for C | Closed unless B |
| Scene-HDR data path for TOTK 1.4.3 (which render targets are clipped before tonemap) | The core HDR goal; same for every option | Shader dump plus render-target capture (other specialist notes) | Phase 3 entry |

---

## Risks

- **Upstream bursts.** A month like May 2026 (85 commits) or a UI framework migration (Avalonia 12, PR !82)
  can turn a 1-day sync into a week. Mitigation: keep the fork on a pinned base, sync on demand rather than
  per canary, and keep UI edits minimal. [D] [I]
- **Fragile GPU-side changes.** Texture-format work regresses easily: PR !181 was merged and then reverted
  the same week [13], and PR !31 was abandoned [17]. Mitigation: per-game allow-lists, flags, and capture
  diffs. [D]
- **The Vulkan-on-Metal layer is in transition** (MoltenVK deprecated [23], KosmicKrisp WIP [18]). Keep the
  presenter independent of which ICD renders. [D] [I]
- **Beta toolchain.** macOS 27.2 and Xcode 27.2 are betas on this Mac [M]. Swift dylib builds may not
  reproduce on a release toolchain. Record the toolchain in every manifest. [I]
- **Run-loop and AppKit conflicts** between Swift components and Avalonia's `NSApplication`, as seen with
  the agentpad background mode [31]. [M]
- **Security surface.** The broad entitlements, plus new sockets (input, telemetry), widen exposure. Keep
  0600 Unix sockets with peer uid checks, as agentpad does [31], and drop debug entitlements from play
  builds. [M] [I]
- **Shared data roots between variants** can corrupt saves or mix shader caches. Enforce per-variant roots
  and the backup manifest. [I]
- **Measurement drift.** Every new build cold-starts the shader cache (85-88 s) [31]. Warm it before
  timing anything. [M]

---

## Effort notes

Assumptions: one experienced developer working with coding agents; the owner available for short
attended game trials; no purchases; Apple Silicon only (arm64), no universal binaries. The ranges are
[I] and are wide because no in-game HDR or presenter measurement exists yet.

| Phase | Content | Person-weeks |
|---|---|---|
| 0 - Build and fork hygiene | Fork location, patch queue with `series` and `rebase.sh`, `global.json` `disable`+`paths`, lock files, manifest, per-variant bundle IDs and data roots, launcher by hash. Upstream PRs for shmfix and `contentsScale` | 1-2 |
| 1 - Extension points | Telemetry ring buffer and socket; input plugin (generalise the agentpad composite); presenter interface plus the `VK_EXT_metal_objects` spike; shader-registry stub (load only, no-op) | 2-4 |
| 2 - Native dylib | Swift Metal presenter (SDR identity, then EDR on MacBook XDR), overlay and dashboard toggle, calibration profile storage, optional GameController DualSense driver | 4-8 |
| 3 - Scene HDR for TOTK 1.4.3 | Allow-listed render-target format upgrades plus tonemap replacement through the registry; A95L profile | 4-10 (highest uncertainty) |
| Ongoing | Upstream syncs | 0.5-2 days per sync now; 2-5 days after phase 3 |
| Not recommended now | B1 full native shell | 10-20 |
| Not recommended now | B2 helper-process shell | 8-14 |

Total for C through phase 2: about **7-14 person-weeks**. With scene HDR: about **11-24 person-weeks**.

### Decisions the owner must make

1. **Target architecture.** Approve C, with A as its base, and defer B and D.
2. **Fork location and visibility.** Local-only, a Forgejo account on git.ryujinx.app, or a public GitHub
   fork. Also decide whether any built binaries are ever published.
3. **Process host.** Accept that the .NET process stays the host (Avalonia menus remain) in exchange for
   lower risk.
4. **Upstream policy.** Whether to submit shmfix, `contentsScale` and later A+B, and to engage on issues
   or Discord as CONTRIBUTING asks.
5. **Sync cadence.** Pinned base with on-demand syncs, or a fixed cadence (for example monthly, or only
   when a needed upstream fix lands).
6. **Variant set to keep.** For example: reference app, measurement build (A+B), agent build, and HDR
   build. Also decide how many previous bundles to keep (N-1 or N-2).
7. **Vulkan-on-Metal track.** Stay on MoltenVK `1.4.2-ryujinx.5`, or also maintain a flagged KosmicKrisp
   variant.
8. **CI.** Local-only builds, or free public CI on a fork.
9. **Bundle identifier and naming scheme**, and per-variant data roots.
10. **HDR investment ceiling.** How many person-weeks phase 3 may take before falling back to an
    SDR-plus-EDR presentation.

---

## Sources

1. Ryubing source at upstream `475615f` (local archive commit `9afba70`): `Directory.Packages.props:14,77,79`,
   `Directory.Build.props`, `global.json`, `nuget.config`, `LICENSE.txt`. Read-only local repository. Accessed 2026-11-01.
2. Same: `src/Ryujinx/Ryujinx.csproj:10,28,32-35`. Accessed 2026-11-01.
3. Same: `distribution/macos/entitlements.xml`. Accessed 2026-11-01.
4. Same: `distribution/macos/create_macos_build_ava.sh`, `.forgejo/workflows/canary.yml`,
   `.forgejo/workflows/build.yml:118-162`. Accessed 2026-11-01.
5. Same: `src/Ryujinx.Graphics.GAL/IWindow.cs`; `src/Ryujinx.Graphics.Vulkan/Window.cs:88-265,312`. Accessed 2026-11-01.
6. Same: `src/Ryujinx/UI/Renderer/EmbeddedWindow.cs:231-256`; `EmbeddedWindowVulkan.cs`. Accessed 2026-11-01.
7. Same: `src/Ryujinx/Program.cs:165,183`; `src/Ryujinx/Headless/` (`HeadlessRyujinx.cs`,
   `Windows/VulkanWindow.cs:43-53`). Accessed 2026-11-01.
8. Same: `src/Ryujinx.Graphics.Gpu/Shader/ShaderCache.cs:57,96,732-800`; `ShaderDumper.cs`;
   `GraphicsConfig.cs:22`. Accessed 2026-11-01.
9. Same: `src/Ryujinx.Input/IGamepadDriver.cs`; `src/Ryujinx/UI/Windows/MainWindow.axaml.cs:113`;
   `src/Ryujinx/Headless/HeadlessRyujinx.cs:184`. Accessed 2026-11-01.
10. Same: `src/Ryujinx.HLE/PerformanceStatistics.cs:49,154-171`; `src/Ryujinx/Systems/AppHost.cs:1216-1229`.
    Accessed 2026-11-01.
11. Same: `src/Ryujinx.Graphics.Gpu/Engine/MME/Macro.cs:50-62`; `MacroJitCompiler.cs:4-27`; `GraphicsConfig.cs:42,47`.
    Accessed 2026-11-01.
12. Same: `src/Ryujinx.Common/Configuration/AppDataManager.cs:12,60-75`; `src/Ryujinx/Utilities/CommandLineState.cs:49-50,90-91`;
    `distribution/macos/Info.plist:34-35`. Accessed 2026-11-01.
13. Ryubing Forgejo API: repository, branches, commits (last 300 on master), releases, pulls.
    https://git.ryujinx.app/api/v1/repos/projects/Ryubing (and `/commits`, `/releases`, `/pulls`, `/branches`). Accessed 2026-11-01.
14. Ryubing canary releases: https://git.ryujinx.app/api/v1/repos/Ryubing/Canary/releases. Accessed 2026-11-01.
15. Ryubing compare API: https://git.ryujinx.app/api/v1/repos/projects/Ryubing/compare/93f23cde4f09...475615f04
    (143 commits, 727 files) and `cc6d2dc162ca...475615f04` (188 commits, 839 files). Accessed 2026-11-01.
16. Ryubing PR !195 "feat: back FenceHolder with FencePool" (open, created 2026-10-31, +78/−9, 3 files):
    https://git.ryujinx.app/projects/Ryubing/pulls/195. Accessed 2026-11-01.
17. Ryubing PR !31 "WIP: Add R16G16B16A16_float swap chain and blit option to Vulkan for HDR output"
    (closed unmerged 2026-05-03, +1068/−160, 33 files; author comment "too unstable to ship"):
    https://git.ryujinx.app/projects/Ryubing/pulls/31. Accessed 2026-11-01.
18. Ryubing PR !131 "WIP: Add KosmicKrisp translation layer for macOS 26+" (open, created 2026-06-06):
    https://git.ryujinx.app/projects/Ryubing/pulls/131. Accessed 2026-11-01.
19. Ryubing `README.md` and `CONTRIBUTING.md` at `475615f`. Accessed 2026-11-01.
20. MeloNX: https://git.ryujinx.app/projects/MeloNX (`src/Ryujinx.Library/Library.cs:85-180`,
    `Ryujinx.Library.csproj:4-16`, `UnmanagedPassthrough.cs`, `src/Ryujinx.Input.Native/`,
    `src/MeloNX/MeloNX.xcodeproj`, `README.md`, `LICENSE.txt`), master as of 2026-08-27. Accessed 2026-11-01.
21. Kenji-NX: https://git.ryujinx.app/projects/Kenji-NX (`README.md`, `src/` listing) and
    https://git.ryujinx.app/Kenji-NX/Android (repository metadata). Accessed 2026-11-01.
22. MoltenVK v1.4.2 (released 2026-07-24): `MoltenVK/MoltenVK/GPUObjects/MVKSwapchain.mm:365-385,519-570`;
    `MVKSwapchain.mm:338-388` (`setHDRMetadataEXT`); `Docs/MoltenVK_Runtime_UserGuide.md:354,371,405` at the v1.4.2 tag
    (lines 355,372,408 on `main` as of 2026-10-13) (`VK_EXT_hdr_metadata`, `VK_EXT_metal_objects`,
    `VK_EXT_swapchain_colorspace`); `MVKImage.mm:1313-1334` and `MVKSync.mm:107-187` (Metal texture, IOSurface
    and shared-event import/export). https://github.com/KhronosGroup/MoltenVK. Accessed 2026-11-01.
23. MoltenVK commit `0aa76ad` "Add deprecation notice":
    https://github.com/KhronosGroup/MoltenVK/commit/0aa76ad7800f3c470103e2004d9a3dc0401693ee. Accessed 2026-11-01.
24. Microsoft Learn, "Native AOT deployment overview" (updated 2026-07-27):
    https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/. Accessed 2026-11-01.
25. Microsoft Learn, "Native code interop with Native AOT" (updated 2026-10-23):
    https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/interop. Accessed 2026-11-01.
26. Microsoft Learn, "global.json overview" (updated 2026-04-30):
    https://learn.microsoft.com/en-us/dotnet/core/tools/global-json. Accessed 2026-11-01.
27. Microsoft Learn, "NuGet PackageReference in project files", section "Locking dependencies" (updated 2026-08-15):
    https://learn.microsoft.com/en-us/nuget/consume-packages/package-references-in-project-files. Accessed 2026-11-01.
28. GitHub Docs, "GitHub Actions billing":
    https://docs.github.com/en/billing/concepts/product-billing/github-actions. Accessed 2026-11-01.
29. Apple Developer Documentation, `IOSurfaceCreateXPCObject(_:)` (abstract and platforms read through the documentation JSON):
    https://developer.apple.com/documentation/iosurface/iosurfacecreatexpcobject(_:). Accessed 2026-11-01.
30. Apple Developer Documentation, `MTLSharedEvent.makeSharedEventHandle()` (abstract and platforms read through the documentation JSON):
    https://developer.apple.com/documentation/metal/mtlsharedevent/makesharedeventhandle(). Accessed 2026-11-01.
31. Private local evidence workspace: `HANDOFF-turn16.md` (build facts, commits, rollback),
    `CONTROL-RESULT.md` (agentpad branch, tests, entitlements, background mode), and the read-only local
    Ryubing repository branches `master`, `agentpad` and `hvfix-agentpad` (`git diff --stat` against `9afba70`).
    Accessed 2026-11-01.
32. Eden macOS status, secondary sources: MacMyths listing https://macmyths.com/apps/eden/ (cites the Eden
    release page, checked 2026-09-28) and an Eden docs mirror https://git.minecraftlegacy.com/null/eden/src/tag/v0.0.3/docs/build/macOS.md.
    Not primary; not independently verified. Accessed 2026-11-01.

---

## Independent verification

Checked 2026-11-01 by an independent reviewer against primary sources: the official Ryubing tree
(`9afba70`, identical to upstream `475615f`), a fresh shallow clone of MoltenVK at tag `v1.4.2`
(`db66022`) and at `main` (`5189f8d`, 2026-10-13), the git.ryujinx.app Forgejo API, MeloNX raw files on
git.ryujinx.app, Microsoft Learn and Apple's documentation JSON. No code was built or run.

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| MoltenVK overwrites the layer's colour space and EDR flag from the Vulkan colour space at swapchain creation; `PASS_THROUGH_EXT` sets `colorspace = nil` and EDR off | Confirmed | `MVKSwapchain::initCAMetalLayer`, `MVKSwapchain.mm:519-568` at v1.4.2 (identical on `main`) | The EDR-on list was incomplete; corrected above. `setHDRMetadataEXT` (`:338-388`) also forces EDR on. Ryubing ships a repackaged `1.4.2-ryujinx.5`, whose source was not inspected |
| MoltenVK lists `VK_EXT_metal_objects`, `VK_EXT_swapchain_colorspace`, `VK_EXT_hdr_metadata` | Corrected (line numbers) | User guide lines 354, 371, 405 at v1.4.2; the cited 355, 372, 408 are `main`. `MVKImage.mm:1313-1334` and `MVKSync.mm:107-187` implement texture, IOSurface and shared-event import/export | Whether the export works for Ryubing's present image in `1.4.2-ryujinx.5` stays untested |
| `EmbeddedWindow.CreateMacOS` creates `CAMetalLayer` + child `NSView` (231-256); the file did not change upstream | Confirmed | `EmbeddedWindow.cs:231-259` at `9afba70`; absent from compare `93f23cde4f09...475615f04` | "Single substitution point" holds for the Avalonia path only; headless uses SDL3 |
| `IWindow` has 7 methods; `IGamepadDriver` has 6 members | Corrected | `IWindow.cs`: 7 methods. `IGamepadDriver.cs`: 7 members (`DriverName`, `GamepadsIds`, 2 events, `GetGamepad`, `GetGamepads`, default `Clear`) plus `IDisposable` | Summary text fixed |
| Headless is in the main executable (`--no-gui`); SDL3 creates the surface | Confirmed | `Program.cs:165,181-183`; `Headless/Windows/VulkanWindow.cs:43-53` (`SDL_Vulkan_CreateSurface`) | |
| MeloNX: NativeAOT `Ryujinx.Library`, about 32 C exports incl. `set_native_window(nint layer)`, Xcode project | Confirmed | `Ryujinx.Library.csproj` (`PublishAot`, `TrimMode full`, `ios-arm64`); 23 exports in `Library.cs` + 9 in `UnmanagedPassthrough.cs`; `Library.cs:166-171`; `src/MeloNX/MeloNX.xcodeproj`; master head 2026-08-27 | README says GPLv3, `LICENSE.txt` is MIT: confirmed |
| NativeAOT forbids `Reflection.Emit`; `MacroJitCompiler` uses `DynamicMethod`/`ILGenerator`, so B1 needs MacroHLE or the interpreter | Confirmed | Microsoft Learn Native AOT overview (updated 2026-07-27): "No runtime code generation, for example, System.Reflection.Emit"; `MacroJitCompiler.cs:4,13-27`; `Macro.cs:51-62`; MeloNX `Library.cs:784` sets `EnableMacroJit = false` | Loss of TieredPGO under AOT stays [I]; performance on TOTK unmeasured |
| Upstream: 143 commits / 727 files 2026-04-29..08-26; no master commits since 2026-08-26; canary 1.3.351 (2026-08-26); stable 1.3.3 (2025-10-11); 14 open PRs | Confirmed | Compare API (base `93f23cde` dated 2026-04-29, 143 commits, 727 files, 291 under `src/Ryujinx/`); master head `475615f` 2026-08-26; releases and Canary releases APIs; open pulls = 14 | |
| Local patch footprint; agentpad UI files and `HvExecutionContext.cs` changed upstream, `MemoryManagementUnix.cs` did not | Confirmed, with additions | `git diff --shortstat` vs `9afba70`: 7/+279/-22, 19/+2458/-19, 23/+2635/-26. Per-file check against both compare ranges | agentpad also edits `CommandLineState.cs` (unchanged) and `ReleaseInformation.cs` (changed in the 6-month range only). The 0.5-2 day estimate stays [I] |
| Builds not pinned: `10.0.301` + `latestFeature`, no lock files; Microsoft recommends `disable` with lock files | Confirmed | `global.json` at `9afba70`; `git ls-tree` finds 0 `packages.lock.json`; global.json docs (updated 2026-04-30): "When you use package lock files, set rollForward to disable"; `paths` is .NET 10 SDK+; NuGet "Locking dependencies" (updated 2026-08-15) documents `RestorePackagesWithLockFile` and `--locked-mode` | "1 person-week" retagged [I] |
| 8 entitlements; disabled library validation lets an ad hoc dylib load | Confirmed | `entitlements.xml` (8 keys, as listed); `Ryujinx.csproj:8,28` (ad hoc `-` default, codesign PostBuild on macOS); Apple doc: disable-library-validation lets the app load "plug-ins or frameworks, without requiring code signing" | |
| All builds share `org.ryujinx.Ryujinx`; data root via `-r`/`--root-data-dir` or a `portable` folder next to the executable or `.app` | Confirmed | `Info.plist` `CFBundleIdentifier`; `AppDataManager.cs:59-77`; `CommandLineState.cs:49-50,90-91` | |
| PR !31 33 files +1068/-160, closed by its author as too unstable; PR !181 merged then reverted | Confirmed | Pulls API: !31 closed unmerged 2026-05-03, author comment "this solution is too unstable to ship"; !181 merged 2026-08-24, reverted by `475615f` on 2026-08-26 | |
| Khronos deprecated MoltenVK and recommends KosmicKrisp on Apple Silicon | Confirmed | MoltenVK commit `0aa76ad` (2026-10-13), README notice on `main`; still MoltenVK-recommended for Intel Macs and iOS | |
| Effort ranges (phases 0-3, B1, B2) | Unverifiable | No external source; inference only | Kept as [I], low confidence |

Access notes: the two Apple pages that the author could read only by title were read through
`https://developer.apple.com/tutorials/data/documentation/<path>.json` (abstracts and platform lists only).
The note referred to an "access failures" section that did not exist; those references now state the
failure inline.
