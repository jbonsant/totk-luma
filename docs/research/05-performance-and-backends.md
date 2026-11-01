# 05 - Performance: bottlenecks, backends and profiling

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: where frame time goes in TOTK 1.4.3 on Ryubing 1.3.351 (commit 475615f) on an M4 Pro, which
graphics backends are realistic on macOS (MoltenVK, KosmicKrisp, native Metal), which improvements are
worth trying first, and how to profile without disturbing the owner.

Tags: [D] documented, [M] measured (prior local evidence), [I] inference, [A] anecdote. Sources are
cited as [n] and listed at the end. Source code line numbers refer to Ryubing 475615f, read from a
read-only mirror of the official archive [1].

---

## Summary

- **The Room of Awakening "20 FPS" is a vsync step, not a 50 ms frame.** [I] Vanilla TOTK presents at
  swap interval 2 (30 FPS). A frame that misses 33.3 ms is shown at 50 ms. With the D2 dynamic-FPS
  patch, the same scene runs at 25.8-28.2 FPS, so a frame costs about 35-39 ms [M]. A 10-15 %
  reduction in the CPU critical path would probably bring vanilla back to 30 FPS. The profile found
  no saturated thread [M], so this is a latency or serialisation limit, not a throughput limit.
  Caveats (verification): D2 requests present interval 1 and changes the game step per frame, so
  its 25.8-28.2 FPS average may be a mix of 33.3 ms and 50 ms intervals, and D2 frame cost need not
  equal vanilla frame cost. "No saturated thread" holds only when `swtch_pri` yield spinning is
  counted as idle. The 35-39 ms figure stays an inference until per-frame guest timestamps exist.
- **The hypervisor is the biggest CPU lever available.** [M] Hypervisor On holds about 30 FPS in the
  Room, against 20 with it Off. With it Off, write tracking takes about 27 % of the main guest
  thread. It goes through a Mach exception, then the .NET PAL, then SIGBUS. Validating the local A+B
  TLB fix in game is the top priority. [I]
- **PPTC does nothing on this setup.** [D] LightningJit, used when the hypervisor is Off on arm64, and
  the hypervisor engine both return a dummy disk-cache state [1]. Every session re-JITs from cold, so
  the first minutes of a session are not representative.
- **Great Sky Island is GPU-bound at about 21 ms of GPU per frame at 1.2x.** [M]/[I] That reading is
  consistent twice: 64 % HUD GPU load at 30 FPS, and a ceiling of about 48 FPS under D2. 60 FPS needs
  about 16.7 ms, so the island needs roughly 20 % less GPU work. Dropping to 1.0x scale is the
  cheapest test.
- **Khronos deprecated MoltenVK on 2026-10-13 and now recommends KosmicKrisp on Apple Silicon.** [D]
  [8] KosmicKrisp is Vulkan 1.4 conformant (2026-10-01) [11] and needs macOS 26 / Metal 4 [14].
  Ryubing PR 131 adds it as an option but is still WIP and ships a prebuilt forked-Mesa package [5].
  It is the backend to evaluate. No TOTK or Ryujinx benchmark exists yet.
- **A native Metal backend is not justified.** [D]/[I] Ryubing merged the experimental Metal backend
  (about 15,000 lines) on 2024-12-24 [3] and reverted it on 2025-02-22 (#701). Shader translation was
  broken, it supported few games, and it regressed MoltenVK users [2]. Its successor path is
  KosmicKrisp, not a rewrite.
- **FencePool (PR 195) is cheap, but probably a small gain on macOS.** [D]/[I] The 40 to 60 FPS claim
  comes from an unstated platform at the Temple of Time [6]. On MoltenVK a fence is a user-space C++
  object (mutex plus set) [9]. In the Room profile, the GPU thread was busy only 22 % of the time [M].
- **Shader stutter is mostly a cold-cache problem.** [M] Loading the 816-program cache took 69.7 s
  cold (Metal HUD on, or a new build) against 3.7 s warm. Ryubing never persists its VkPipelineCache
  [1]. First-visit stutter remains, because Ryujinx compiles new shaders synchronously.
- **MetalFX frame interpolation does not fit an emulator.** [D]/[I] It needs depth, motion vectors,
  camera matrices and near/far planes [19], which the emulator does not know for the guest. It would
  also add latency and not raise game-logic FPS. Do not invest.
- **Profiling can avoid sudo and windows.** [D]/[M] Instruments through xctrace (version 27.2,
  attach mode) [30], Metal HUD logs with shader-cache logging [18], MoltenVK performance tracking
  [9], IORegistry GPU counters (no sudo, checked locally) [30], and a new guest frame-time hook at
  `SurfaceFlinger.OnFrameAvailable` [1]. powermetrics needs sudo and is gated.

---

## Findings

### 1. Current state on macOS

#### 1.1 Backend history: MoltenVK and the reverted Metal backend

| Date | Event | Source |
|---|---|---|
| 2024-12-24 | Ryubing merges "EXPERIMENTAL: Metal backend (#441)", +14,991 / -139 lines. The commit says it is "not a continuation", only the branch brought up to date and merged behind an experiment. Co-authors include Isaac Marovitz, SamoZ256 and riperiperi. | [3] [D] |
| 2025-01-01 | "Shader translation delay hack", then "Only delay shader translation on Metal (#480)". | [4] [D] |
| 2025-02-22 | "Revert the Metal Experiment (#701)", +302 / -15,077. | [2] [D] |
| 2026-06-06 | PR 131 "WIP: Add KosmicKrisp translation layer for macOS 26+" opened. | [5] [D] |
| 2026-10-13 | Khronos adds a MoltenVK deprecation notice: community best-effort maintenance; KosmicKrisp recommended on Apple Silicon. | [8] [D] |

The revert message lists the reasons [2] [D]:

- Metal supported only a few games.
- Those games froze on first use because shader translation was broken. A 30 ms translation-delay
  hack was needed.
- The shared GPU-code changes broke many games running through MoltenVK.
- The maintainer judged the result "worse for Mac users than Ryujinx 1.1.1403".

The current build runs Vulkan through MoltenVK `1.4.2-ryujinx.5` (`Directory.Packages.props:77`) [1].
That is a fork maintained by the Kenji-NX organisation for Ryubing, Kenji-NX and MeloNX [10] [D]:

- `v1.4.2-ryujinx.5` was released 2026-07-13.
- `v1.4.3-ryujinx.2` (2026-10-29) is newer. It makes "maximize concurrent compilation" the default,
  disables residency sets, and avoids direct-to-display with asynchronous submits.

Ryubing overrides only four MoltenVK settings (`MVKInitialization.cs:20-34`) [1] [D]:

- Metal argument buffers on;
- single-queue semaphores;
- asynchronous queue submits;
- resume lost device.

MoltenVK copies a partial configuration struct and keeps the other fields [9] [D]
(`mvk_api.mm:65-76`). Every other `MVK_CONFIG_*` environment variable therefore still takes effect.
The same call logs a deprecation warning.

#### 1.2 KosmicKrisp maturity and Ryubing PR 131

Maturity [D]:

- LunarG's Mesa driver became Vulkan 1.3 conformant in October 2025 [13], and Vulkan 1.4 conformant
  on 2026-10-01 [11].
- Khronos reports performance "tripled" since the 1.3 milestone [11].
- Phoronix (2026-10-03) reports it ahead of MoltenVK and "not too far behind" native Metal, but
  gives no numbers [12].
- It requires Metal 4, so macOS 26 or later [14]. The owner's macOS 27.2 beta qualifies.

Gaps [D]/[A]:

- Geometry shaders: Blender's developer documentation said they were not supported (search
  extract, not fetched) [15]. **Corrected by verification:** Mesa `main` (27.0.0-devel, 2026-11-01)
  sets `.geometryShader = true` in `src/kosmickrisp/vulkan/kk_physical_device.c:236`, but the
  `26.2` branch does not [32] [D]. The PR 131 package is based on 26.2.5, so it probably lacks
  geometry shaders unless the fork cherry-picked them [I]. Ryubing's compute fallback covers either case.
- Transform feedback: Mesa `main` fills `VK_EXT_transform_feedback` properties but does not list
  the extension in the device extension table [32] [D]. Treat it as unsupported, so Ryubing's
  emulation path would still run.
- Subgroups: Mesa `main` and `26.2` both advertise subgroup stages as compute and fragment only
  [32] [D]. The one vertex-shader subgroup failure per session is therefore likely to persist on
  KosmicKrisp [I].
- An Xbox emulator port (xemu) reported more cold shader hitches with KosmicKrisp than with MoltenVK
  (11 against 6 on one cold walk, M2 Ultra only) [17] [A].

PR 131 status [5] [D] (forge API, read 2026-11-01):

- Open, 22 commits, last updated 2026-10-29.
- Adds a "Translation Layer" setting: MoltenVK or KosmicKrisp.
- Moves the MoltenVK overrides to environment variables, and selects the ICD (the driver's loader
  manifest) through `VK_DRIVER_FILES`.
- Raises the maximum Vulkan version to 1.4.

Risks in the PR [D]/[I]:

- It ships a **binary NuGet package** of a forked Mesa: `Ryujinx.Graphics.Vulkan.KosmicKrisp
  26.2.5-ryu.1`, described as "forked Mesa and cherry-picked 100+ KK commits".
- One commit reverted to 26.1.3 and added "Metal 4 pipelines".
- The ICD manifest advertises API 1.3.x.

For this project that is a supply-chain and reproducibility gate. Prefer building the KosmicKrisp
driver from Mesa source, or using the LunarG Vulkan SDK driver. Both are binary or SDK acquisitions,
which need owner approval.

There are no TOTK, Ryujinx or Switch-emulator measurements on KosmicKrisp in any source found. [D]

#### 1.3 MoltenVK limitations relevant to Switch emulation

| Limitation | Evidence | What Ryubing does | Cost or effect |
|---|---|---|---|
| Subgroup operations only in fragment and compute stages (and tessellation control) | `MVKDevice.mm:1486` [9] [D] | Emits `SubgroupLocalInvocationId` wherever the guest uses lane ID (`IoMap.cs:38`) [1] | One SPIR-V to MSL failure per session; that draw is skipped [M] |
| No geometry shaders | Not exposed by MoltenVK [9] [D] | Converts geometry to compute, and vertex too when a geometry stage exists or vertex stores are unsupported (`ShaderCache.cs:490-515`) [1] [D] | Extra compute passes and buffers, only for draws that use those stages [I] |
| No `VK_EXT_transform_feedback` | MoltenVK issue 1588 is still open [15] [D]; capability probe at `VulkanRenderer.cs:213` [1] | Emulates with storage-buffer writes or compute | Extra bandwidth [I] |
| Primitive restart cannot be disabled | User guide line 346 [9] [D] | n/a | Correctness edge cases [I] |
| No pipeline statistics queries | User guide line 692 [9] [D] | n/a | Fewer counters for profiling |
| Push descriptors capped to 16 | `VulkanRenderer.cs:455` "prevents vertex explosions on MoltenVK" [1] [D] | Workaround | More descriptor-set updates [I] |
| Render-target feedback loops need barriers | Citron-neo PR 381: TOTK hill flicker; barriers split the render pass about 100 times per frame and cost about 17 FPS on an M4 [22] [A] | Ryubing has feedback-loop handling (`PipelineBase.cs:1539-1590`) [1] | On a tile-based GPU, each render-pass split costs bandwidth [I]. MoltenVK PR 2875 (framebuffer fetch) is open [23] |

#### 1.4 PR 195 FencePool

What it changes [6] [D]:

- A new `FencePool` with a cap of 32 fences per command-buffer pool.
- `FenceHolder` now takes a fence from the pool, and `Put()` resets the fence and returns it instead
  of calling `vkDestroyFence`.
- The PR is +78 / -9 lines in 3 files, opened 2026-10-31, still open, with no comments.

The source has one constructor call site (`CommandBufferPool.cs:352`) [1] [D], so the change is
self-contained.

Evidence for the gain [A]: the author reports "~40 -> ~60 FPS" looking at the woods from the Temple
of Time steps in TOTK. The render thread was "saturated with half of the time spent on creating and
destroying fences". Platform, GPU and driver are not stated, and no logs are attached.

Transfer to macOS [I]:

- `vkCreateFence` in MoltenVK is `new MVKFence` with a mutex and an `unordered_set`
  (`MVKSync.h:353`, `MVKDevice.mm:4270`) [9]. It makes no kernel call. On Linux drivers, fence
  creation usually means kernel objects.
- In the Room profile, `GPU.MainThread` was 22 % non-waiting and `GUI.RenderThread` 18 % [M].
- So the expected macOS gain is small in the Room. It may be larger in render-thread-bound scenes
  such as Kakariko or Lookout Landing, but this is unmeasured.
- It is still worth an A/B test, because the risk is low.

#### 1.5 Hypervisor versus JIT, PPTC and write tracking

How the CPU engine is chosen (`ArmProcessContextFactory.cs:63-87`) [1] [D]:

| Mode | Engine | Memory manager on 16 KiB host pages | Write tracking | Disk cache |
|---|---|---|---|---|
| Hypervisor On | Apple Hypervisor.framework (guest code runs natively) | `HvMemoryManager` | Guest data aborts become VM exits (`DataAbortLowerEl`) | Dummy (`HvCpuContext.cs:36-38`) |
| Hypervisor Off, HostMapped | LightningJit (arm64 to arm64) | `MemoryManagerHostTracked`: the 4 KiB host-mapped path is skipped because pages are larger than 4 KiB (line 87) | mprotect, host fault, Mach exception, .NET PAL, SIGBUS, Ryujinx handler | Dummy (`LightningJitCpuContext.cs:50-53`); PPTC not used |
| SoftwarePageTable or GDB stub | ARMeilleure JIT | Software page table | Inline checks | PPTC (`JitCpuContext.cs:55-57`) |

Measured trade-offs [M]:

- Hypervisor On: about 30 FPS everywhere, but 10 flashes in 850 s.
- Hypervisor Off: 0 flashes in 3,654 s, and 20 FPS in the Room.
- With the hypervisor Off, the Room profile shows write tracking at 27 % of the guest `<MainThread>`
  active time and 12 % across guest threads.
- SoftwarePageTable was measured slower.

On the hypervisor path, Ryubing adds `Thread.Yield()` after every SVC exit
(`HvExecutionContext.cs:274`) [1] [D]. The comment says this works around MoltenVK presentation-queue
starvation. Its CPU cost is unmeasured [I].

Why the fault path is slow [D]:

- In .NET 10 on macOS, the PAL hooks `EXC_BAD_ACCESS` through Mach exception ports unless
  `PAL_MachExceptionMode` includes the flag value 4 (`MachException_SuppressManaged`)
  (`machexception.cpp:53,148-213`) [20].
- Verification note on the risk: when the PAL is built with Mach exceptions (macOS), the body of
  its `sigsegv_handler` is compiled out and the handler only chains to the previous one
  (`signal.cpp:641-729`); `sigbus_handler` still calls `common_signal_handler` [20] [D]. With mode 4,
  a managed null dereference that arrives as SIGSEGV would therefore probably not become a
  `NullReferenceException` [I]. The crash risk stays High.
- The stack in the profile matches this: `PAL_DispatchException` and `_sigtramp` both appear on the
  guest main thread [M].
- A tracked write therefore pays several Mach message round-trips before Ryujinx's signal handler
  runs. This is an inference from the source, with no per-fault timing [I].

#### 1.6 Shader compilation, caches, warm and cold

The pipeline from guest shader to GPU binary [1] [D]:

1. Guest Maxwell shader.
2. Ryujinx translation to SPIR-V.
3. `vkCreate*Pipelines`.
4. MoltenVK SPIR-V to MSL.
5. Metal compiler, then the GPU binary.

The caches involved:

| Cache | Where | Persists? | Evidence |
|---|---|---|---|
| Guest cache (`guest.toc/.data`) | Ryujinx game folder | Yes | [1] [D] |
| Host cache (`vulkan_<vendor>.toc/.data`) | Ryujinx game folder; name from `DiskCacheHostStorage.cs:227-232` | Yes. Rebuilt in the background at boot with up to min(cores, 8) threads (`ParallelDiskCacheLoader.cs:223`) | [1] [D] |
| VkPipelineCache | Created empty at `PipelineBase.cs:107-112`; `vkGetPipelineCacheData` is never called | **No** | [1] [D] |
| MoltenVK MSL in the pipeline cache | Would skip SPIR-V to MSL if serialised | Unused, because of the row above | User guide lines 609-629 [9] [D] |
| macOS Metal system shader cache | Per process, managed by the OS | Yes; reset by a new binary or by the Metal HUD | 69.7 s cold against 3.7 s warm for 816 programs; 85 s on a new build [M] |
| `MTLBinaryArchive` | Not used by MoltenVK (no reference in source) | n/a | [9] [D] |

Ryujinx has no asynchronous shader mode. New shaders block the GPU thread on first use. Only
programs restored from the cache are linked in the background (`ShaderCollection.cs:462-486`), and
the log warns "Background pipeline compile missed on draw" when that guess is wrong (line 679) [1]
[D].

`MVK_CONFIG_SHOULD_MAXIMIZE_CONCURRENT_COMPILATION` defaults to 0 upstream and in the owner's
`ryujinx.5` build. The fork's newer build turns it on by default [9] [10] [D].

### 2. Alternatives on macOS Apple Silicon (late 2026)

| Emulator | Lineage | macOS status | TOTK on Mac | License | Maintenance health |
|---|---|---|---|---|---|
| Ryubing (in use) | Ryujinx | Official arm64 builds; Vulkan through MoltenVK; Hypervisor option | Measured locally [M] | MIT (`LICENSE.txt`) [1] [D] | Active forge; named in Nintendo's 2026-02-12 DMCA notice [24] [D] |
| Eden | yuzu | DMG builds "experimental, expect major graphical glitches and crashes" (v0.2.1, 2026-06-01) [21] [D] | No primary Mac report found | GPL-3.0 [21] [D] | Active (commits on 2026-11-01); GitHub release mirror blocked by DMCA (HTTP 451) [24] [D] |
| Citron (citron-neo) | yuzu | macOS DMG nightlies; last release 2026-04-27 [22] [D] | Open PR 381 targets TOTK flicker on an M4 [22] [A] | GPL-3.0 [22] [D] | Repo active (push 2026-10-25); AppImage mirrors were in the DMCA notice [24] |
| Kenji-NX | Ryujinx | Last desktop release 2.0.5 (2025-10-06) with a macOS universal build [25] [D] | None found | MIT (Ryujinx) [I] | Forge active (2026-10-30); maintains the MoltenVK and KosmicKrisp forks [10] |
| MeloNX | Ryujinx | iOS only [26] [D] | n/a | MIT (Ryujinx) [I] | Moved to the forge after the DMCA notice [24] [26] |
| Sudachi | yuzu | Development ended in August 2025 [27] [A] | n/a | GPL-3.0 [I] | Inactive |
| Ryujinx-Nextendo | Ryujinx | Windows, Linux and macOS builds [28] [D] | Not validated on TOTK | Not stated (`NOASSERTION`) | Active (push 2026-11-01) |

Implications [I]:

- No alternative has evidence of better TOTK performance on macOS.
- The yuzu-family emulators on Mac use JIT-only Dynarmic with no hypervisor, plus MoltenVK. They
  share the MoltenVK limits and have no hypervisor path.
- Keep Ryubing as the base. Track Citron PR 381 and Nextendo issue 70 as patch sources, not as
  platforms.

### 3. Selective improvements ranked by expected gain against effort and risk

| Rank | Improvement | Expected gain | Effort | Risk | Evidence |
|---|---|---|---|---|---|
| 1 | Validate the A+B hypervisor fix in game (built; 83/83 memory tests) | Room 20 to 30 FPS at vanilla if flashes drop to 0. Frees CPU margin for D2 | 1-2 attended sessions | Fix may only narrow the race; needs ≥ 900 s and a statistical comparison against 0.012 flashes/s | [M] |
| 2 | Guest frame-time instrumentation (see §4) | Enabler for every later decision | 0.5-2 days plus a build | Low | [I] |
| 3 | Resolution scale 1.0x against 1.2x under D2 on the island | Up to about 30 % fewer pixels; may lift the GPU cap from about 48 toward 60 | Config only | Below the "about 1080p" goal when dynamic resolution is at maximum | [M]/[I] |
| 4 | `MVK_CONFIG_SHOULD_MAXIMIZE_CONCURRENT_COMPILATION=1` | Shorter cold-cache boot and first-visit hitches | Environment variable | Low; unmeasured | [D]/[I] |
| 5 | FencePool (PR 195) | Small in CPU-bound scenes; larger if the render thread binds | Cherry-pick plus build | Low | [A]/[I] |
| 6 | `PAL_MachExceptionMode=4` (Hypervisor Off only) | Cheaper tracking faults; could cut part of the 27 % | Environment variable plus a boot test | **High**: managed null-reference exceptions may become fatal crashes | [D]/[I] |
| 7 | KosmicKrisp via PR 131 or the SDK driver | Unknown; vendor claims beat MoltenVK | 1-3 days plus a binary gate | WIP PR; prebuilt binary; geometry shaders absent in Mesa 26.2 (present in Mesa `main`), no transform feedback; compute fallback covers both | [D]/[A] |
| 8 | Newer MoltenVK fork (`1.4.3-ryujinx.2`) | Unknown; contains present and submit changes | A new bundle (signature breaks) | Medium | [D] |
| 9 | Persist VkPipelineCache (MSL) | Cold boot only; warm boot is already 3.7 s | 2-5 days | Low | [D]/[M] |
| 10 | Metal binary archives | Marginal while the system cache is warm | Needs MoltenVK changes | Medium | [I] |
| 11 | MetalFX spatial upscaling (through `VK_EXT_metal_objects`) | Image quality against FSR1 (already in `Effects/FsrScalingFilter.cs`) [1]; FPS only if internal scale drops | 1-3 weeks | Medium (synchronisation between APIs) | [D]/[I] |
| 12 | Asynchronous shaders (draw-skip until ready) | Fewer hitches on first visits | 1-3 weeks | Visible pop-in; cache poisoning | [I] |
| 13 | Write-tracking redesign (a native Mach handler, or coarser regions) | Most of the 27 % | 2-6 weeks | High (memory correctness) | [I] |
| 14 | MetalFX frame interpolation | Display smoothness only; **no** game-logic FPS; adds at least one frame of latency | 4-12+ weeks with game-specific depth, motion and matrix extraction | High | [D] [19] / [I] |
| 15 | Native Metal or Metal 4 backend | Unknown; the last attempt was reverted | 6-18+ person-months | Very high | [D] [2] [3] |

Notes:

- **Resolution scale against dynamic resolution.** TOTK lowers its own guest render size under load
  (maximum 1600x896 docked). The emulator scale multiplies whatever the game chose, and
  render-target allocation at 1.2x is 1921x1076 [M]. The real rendered size per frame is not
  measured.
- **Do not change both knobs at once.** The cheapest way to free GPU time is a lower emulator scale
  plus FSR1 or MetalFX spatial for output, not a change to the game's dynamic resolution [I].
- **Already measured.** `MVK_CONFIG_USE_MTLHEAP=0` crashed at 13 s with a Metal texture-view
  assertion. It is rejected [M].

### 4. Profiling methodology that does not disturb the owner

Rules [I]:

- Agents never launch the emulator. The owner starts a scripted session, or approves an attended
  window.
- Agents only attach recorders by PID and post-process the files.
- Every artefact stays in the private local evidence workspace. GPU captures and traces can contain
  game textures.

#### 4.1 Tools

| Tool | How | Disturbance | Gate |
|---|---|---|---|
| xctrace 27.2 (local: Game Performance, Metal System Trace, Time Profiler, CPU Counters, Processor Trace, os_signpost, Hitches, Display) [30] | `xcrun xctrace record --template 'Metal System Trace' --attach <pid> --time-limit 30s --no-prompt --output <private>.trace`, then `xcrun xctrace export --toc` | No window in attach mode [I]. The first use may ask for developer-tools authorisation | Test once with the owner present |
| Metal HUD logging | `MTL_HUD_ENABLED=1 MTL_HUD_LOG_ENABLED=1`, plus `MTL_HUD_LOG_SHADER_ENABLED=1` (logs `cached: 0/1`) and `MTL_HUD_ENCODER_TIMING_ENABLED=1` (removes idle gaps between encoders from GPU time) [18] [D] | Overlay; resets the Metal shader cache [M]. The present interval follows the 120 Hz host, not the game | Compare HUD runs only with HUD runs |
| MoltenVK performance tracking | `MVK_CONFIG_PERFORMANCE_TRACKING=1`, `MVK_CONFIG_PERFORMANCE_LOGGING_FRAME_COUNT=300`. Reports `spirvToMSL`, `mslCompile`, `pipelineCompile`, `commandBufferEncoding`, `mtlCommandBufferExecution` [9] [D] | Small timing overhead [I] | None |
| MoltenVK GPU capture | `METAL_CAPTURE_ENABLED=1`, `MVK_CONFIG_AUTO_GPU_CAPTURE_SCOPE=3` (named-pipe trigger), `MVK_CONFIG_AUTO_GPU_CAPTURE_OUTPUT_FILE=<private>.gputrace` [9] [D] | Heavy; huge files; holds game content | Private only, never committed |
| IORegistry GPU counters | `ioreg -r -d 1 -c IOAccelerator`: Device, Renderer and Tiler utilisation, `SplitSceneCount` (readable without sudo, checked locally 2026-11-01) [30] | None | None |
| powermetrics | `sudo powermetrics --samplers gpu_power,cpu_power -i 500` | None visible | **Sudo, an owner gate** |
| Guest frame-time hook | New: ring buffer of `Stopwatch` timestamps in `SurfaceFlinger.OnFrameAvailable` (line 534, next to `RecordGameFrameTime`) and `OnFrameReplaced` (line 539, which also calls `RecordGameFrameTime`), plus swap interval and `PostFrameBuffer` (line 402), written to CSV or `os_signpost` | None | Build gate (owner-approved patch) |

#### 4.2 Separating the bottlenecks

| Class | Signature | Confirming test |
|---|---|---|
| Guest CPU (JIT or tracking) | Guest `<MainThread>` busy in `GUEST_JIT` and in tracking; GPU idle gaps in Metal System Trace; FPS unchanged by scale | Hypervisor On/Off changes FPS; scale 1.0x/1.2x does not [M] |
| GPU | GPU time per frame (encoder timing) ≈ guest frame interval; Renderer utilisation above 90 % | FPS follows scale; `SplitSceneCount` rising suggests tile-memory overflow [I] |
| Synchronisation or latency | No thread saturated; long `psynch_cvwait` chains on `GPU.MainThread` or guest threads; GPU and CPU bubbles in the same frame; FPS quantised to 30/20 | Remove the quantisation with D2 or a custom VSync; see whether frame cost moves with CPU-side changes |
| Shader compile | Spikes line up with `cached: 0` HUD lines, MoltenVK `mslCompile` or `pipelineCompile`, or Ryujinx "Background pipeline compile missed" | Second visit to the same place is smooth |
| JIT warm-up | Hitches in the first minutes of a session, with no shader lines | Repeat the path in the same session [D: no PPTC] |
| Presentation | Guest frame times steady, but host presents irregular (120 Hz, non-integer cadence at 45-48 FPS) | Compare guest and host timestamp streams |

Full GPU utilisation alone is not success. A run counts as healthy only when:

- guest frame-time p99 is ≤ 1.25 × the target;
- game speed is 1.00 ± 0.01;
- there is no shader-compile spike in steady state.

#### 4.3 Warm and cold cache protocol

| State | Definition | Use |
|---|---|---|
| C0 | Ryujinx host cache removed in a copied profile; new binary or first HUD run (Metal cold) | Worst-case boot and first-visit cost |
| C1 | Ryujinx caches warm, Metal cold (the first run with the HUD, or a new build) | Isolates the Metal compiler |
| C2 | All warm (second identical run, same binary, same HUD setting) | All steady-state FPS claims |

Per scene, run this sequence:

1. Boot, then load the save.
2. Wait 60 s for JIT warm-up.
3. Measure for 120 s on a fixed path or at a fixed point.
4. Repeat three times.

Report median, p95 and p99 guest frame time, game speed, and the shader events seen. Change one
variable per run, as the private evidence workspace already does.

#### 4.4 Representative demanding scenes

Measured [M]:

| Scene | Load type | Vanilla FPS | D2 FPS |
|---|---|---|---|
| Great Sky Island fixed point | GPU | 30 | 44.8-50.9 |
| Beneath Hyrule Castle | CPU, at 1.2x | 30 | 38.4-45.2 |
| Room of Awakening | CPU | 20 | 25.8-28.2 |

Community-reported or expected, not yet measured here:

- **Lookout Landing and Hateno Village.** About 40 FPS on a Ryzen 7 7800X3D [29] [A].
- **Temple of Time steps looking at the woods.** The FencePool reference scene [6] [A].
- **Kakariko and Korok Forest.** Dense foliage and NPCs [A, unverified].
- **The Depths.** Dark lighting and bloom; Lightroot reveals [A, unverified].
- **Large Zonai builds.** Physics and CPU load [I].
- **Rain and storms.** Particles and wet shading; GPU load [I].
- **Sky-dive streaming transitions.** Shader and JIT first-visit load [I].

### 5. Effort ranges and evidence gates

- **Native Metal backend.** Do not start unless both conditions hold, measured with the §4 tools in
  at least three heavy scenes, warm:
  - a) under MoltenVK **and** KosmicKrisp, more than 25 % of the render-thread critical path is
    CPU time in the translation layer, or more than 20 % of GPU time comes from translation
    artefacts (render-pass splits, compute-emulated geometry or transform feedback, redundant
    load/store);
  - b) guest CPU is no longer the binding limit at the target FPS.
- **Write-tracking redesign.** Only if A+B fails its flash gate and the Hypervisor-Off path stays
  the default. Even then, try `PAL_MachExceptionMode` first, in a private test profile.
- **KosmicKrisp.** Adopt only if a warm C2 run matches MoltenVK correctness (0 new artefacts in
  900 s) and improves p95 frame time by at least 10 % in a GPU-bound scene.
- **60 FPS target.** Pursue it only where guest frame time under D2 is already ≤ 20 ms, with
  headroom on both CPU and GPU. Otherwise ship the 30/45 caps.
- **Frame interpolation.** Out of scope unless a game-specific depth and motion source is
  demonstrated. Even then, keep it a display option, never a performance claim.

---

## Implications for TOTK Luma

1. **Make "guest frame time" the primary metric.** Specify the `SurfaceFlinger.OnFrameAvailable`
   timestamp hook and the dashboard's p50/p95/p99, game speed and cache-state fields. The status
   bar FPS and the Metal HUD stay secondary.
2. **Default profile.** Hypervisor Off at 1.2x stays the safe default. Promote Hypervisor On + A+B
   only after its flash gate. That is the only path to 30 everywhere and margin for 45.
3. **FPS caps.** Treat 30 as the guaranteed cap. Offer 45 only with D2, in scenes whose measured
   cost is ≤ 22 ms per frame. Leave 60 experimental. Use the guest-side pacer at integer divisors
   of the display rate where possible (45 on 90 Hz, or a variable refresh rate on the A95L); see
   the display note.
4. **Backend strategy.** Stay on the Vulkan API. Evaluate KosmicKrisp as the strategic successor to
   the deprecated MoltenVK. Keep MoltenVK-specific hacks small and upstreamable.
5. **Shader cache.** Keep the Metal HUD out of normal play, since it resets the Metal cache. Ship
   with concurrent compilation on, and document the warm-up rule (the second boot is fast).
6. **Upscaling.** Keep FSR1 as the output filter. Consider MetalFX spatial only together with a
   lower internal scale, and only after the GPU-bound gate is measured.

---

## Options compared

| Backend | Maturity on Apple Silicon | Switch-relevant features | Evidence of TOTK gain | Effort to adopt | Verdict |
|---|---|---|---|---|---|
| MoltenVK `1.4.2-ryujinx.5` (current) | Mature but deprecated (2026-10-13) [8] | No geometry shaders or transform feedback; subgroups not in vertex shaders | Baseline [M] | 0 | Keep as the default |
| MoltenVK `1.4.3-ryujinx.2` | Fork, 2026-10-29 [10] | Same, plus concurrent compile and present tweaks | None | Low, but a re-signed bundle | Optional A/B |
| KosmicKrisp (PR 131 or SDK) | Vulkan 1.4 conformant [11]; WIP in Ryubing [5] | Geometry shaders in Mesa `main` only, not 26.2 [32]; no transform feedback; subgroups not in vertex shaders; compute fallback exists | None | Medium, plus a binary gate | Evaluate |
| Native Metal (reverted design) | Reverted 2025-02-22 [2] | Full control | None | Very high | Do not pursue |

---

## Unknowns and evidence gates

| Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|
| Does A+B remove the hypervisor flashes? | It decides the default profile and the CPU margin | ≥ 900 s Hypervisor On in the Room and on the island against 0.012 flashes/s; Poisson test | G-BUILD, phase 2 |
| Real per-frame guest frame time | Every FPS and pacing claim depends on it | SurfaceFlinger timestamp hook | G-PROF-1 |
| Room critical path (latency against throughput) | Picks the CPU fix | Time Profiler plus thread-state trace; D2 run with timestamps | G-PROF-2 |
| GPU time per frame with encoder timing | The 21 ms estimate may be inflated by idle gaps | `MTL_HUD_ENCODER_TIMING_ENABLED=1`, Metal System Trace | G-PROF-2 |
| FencePool gain on MoltenVK | Cheap win or noise | A/B C2 runs at Lookout Landing and the Temple of Time | Phase 2 |
| KosmicKrisp correctness and speed on TOTK | Strategic backend choice | PR 131 build or SDK ICD; 900 s artefact scan | G-BIN, phase 3 |
| Transform feedback and geometry on KosmicKrisp | Fallback cost | Partly resolved from Mesa sources [32]: geometry in `main` only, no transform feedback. Still to check: what the PR 131 fork package advertises (`vulkaninfo` against it) | Phase 3 |
| `PAL_MachExceptionMode=4` safety | Could crash on managed null references | Private boot plus 10 min play test; watch for crashes | Owner gate |
| Cost of `Thread.Yield` per SVC on the hypervisor path | Possible hidden CPU tax | Time Profiler with Hypervisor On | Phase 2 |
| Dynamic-resolution rendered size per frame | Defines "about 1080p" honestly | Log viewport sizes in the GPU code, or a capture | Phase 2 |
| Audio, cutscenes and long-session physics under D2 | Correct speed | See the frame-pacing note; objective audio-drift test | Phase 2 |

---

## Risks

- **Legal and maintenance.** Nintendo's 2026-02-12 DMCA notice names Ryubing, Eden, Citron,
  Kenji-NX and MeloNX, and several GitHub repositories are blocked [24]. Forges may move or vanish.
  Keep a pinned, archived source of every build input.
- **Supply chain.** PR 131 and the MoltenVK forks ship prebuilt binaries. Build from source where
  possible, and record hashes.
- **Measurement artefacts.**
  - The Metal HUD resets the shader cache and reports host cadence.
  - With no PPTC, every session starts with a cold JIT.
  - Window focus and App Nap were checked only briefly [M].
- **Upstream drift.** MoltenVK is deprecated, so fixes may land only in KosmicKrisp. A
  MoltenVK-specific investment may be stranded.
- **Over-reading GPU utilisation.** High utilisation can coexist with bad pacing, or come from
  render-pass splits. Judge with guest frame time and game speed.
- **Owner disturbance.** xctrace may raise an authorisation prompt the first time. GPU captures are
  large and slow. Schedule both.

---

## Effort notes

Assumptions: one engineer familiar with C# and macOS tooling; the owner available for attended
sessions; the build toolchain already approved (G-BUILD).

| Item | Range |
|---|---|
| Frame-time hook plus CSV and dashboard feed | 0.5-2 days |
| A+B in-game validation | 2-4 h attended, plus 0.5 day analysis |
| Environment-variable sweep (concurrent compile, performance tracking, PAL mode) | 0.5-1 day attended |
| FencePool A/B | 0.5-1 day |
| KosmicKrisp evaluation | 1-3 days, plus the approval wait |
| Persisting VkPipelineCache | 2-5 days |
| MetalFX spatial integration | 1-3 weeks |
| Asynchronous shader mode | 1-3 weeks |
| Write-tracking redesign | 2-6 weeks |
| MetalFX frame interpolation (game-specific) | 4-12+ weeks; not recommended |
| Native Metal backend | 6-18+ person-months; not recommended (the reverted attempt was about 15k lines from several contributors over months) |

---

## Sources

All accessed 2026-11-01 unless stated otherwise.

1. Ryubing source at upstream commit 475615f (read-only local mirror of the official archive).
   Files: `src/Ryujinx.HLE/HOS/ArmProcessContextFactory.cs`,
   `src/Ryujinx.Cpu/LightningJit/LightningJitCpuContext.cs`, `src/Ryujinx.Cpu/AppleHv/HvCpuContext.cs`,
   `src/Ryujinx.Cpu/AppleHv/HvExecutionContext.cs`, `src/Ryujinx.Cpu/Jit/JitCpuContext.cs`,
   `src/Ryujinx.Graphics.Vulkan/MoltenVK/MVKInitialization.cs`,
   `src/Ryujinx.Graphics.Vulkan/PipelineBase.cs`, `src/Ryujinx.Graphics.Vulkan/ShaderCollection.cs`,
   `src/Ryujinx.Graphics.Vulkan/VulkanRenderer.cs`, `src/Ryujinx.Graphics.Vulkan/CommandBufferPool.cs`,
   `src/Ryujinx.Graphics.Vulkan/Effects/FsrScalingFilter.cs`,
   `src/Ryujinx.Graphics.Gpu/Shader/ShaderCache.cs`,
   `src/Ryujinx.Graphics.Gpu/Shader/DiskCache/DiskCacheHostStorage.cs`,
   `src/Ryujinx.Graphics.Gpu/Shader/DiskCache/ParallelDiskCacheLoader.cs`,
   `src/Ryujinx.Graphics.Shader/CodeGen/Spirv/IoMap.cs`,
   `src/Ryujinx.HLE/HOS/Services/SurfaceFlinger/SurfaceFlinger.cs`, `Directory.Packages.props`.
2. Ryubing commit fe1617ff, "Revert the Metal Experiment (#701)", 2025-02-22.
   https://git.ryujinx.app/projects/Ryubing/commit/fe1617ffeae0edd58bf61b1e008304e1221a1f7d
3. Ryubing commit 85282310, "EXPERIMENTAL: Metal backend (#441)", 2024-12-24.
   https://git.ryujinx.app/projects/Ryubing/commit/852823104f3af3d67484377b5d8d8ba370687ccb
4. Ryubing commit 37c165e9, "Only delay shader translation on Metal (#480)", 2025-01-01.
   https://git.ryujinx.app/projects/Ryubing/commit/37c165e9fc79ab442d868bec40580797a80421c8
5. Ryubing PR 131, "WIP: Add KosmicKrisp translation layer for macOS 26+" (forge API: state, commits,
   files, diff). https://git.ryujinx.app/projects/Ryubing/pulls/131
6. Ryubing PR 195, "feat: back FenceHolder with FencePool" (forge API: body and diff).
   https://git.ryujinx.app/projects/Ryubing/pulls/195
7. Ryubing PR 31, RGBA16F swapchain, closed 2026-05-03.
   https://git.ryujinx.app/projects/Ryubing/pulls/31
8. MoltenVK commit 0aa76ad, "Add deprecation notice", 2026-10-13.
   https://github.com/KhronosGroup/MoltenVK/commit/0aa76ad7800f3c470103e2004d9a3dc0401693ee
9. MoltenVK source at commit 5189f8de (2026-10-13): `Docs/MoltenVK_Runtime_UserGuide.md`,
   `Docs/MoltenVK_Configuration_Parameters.md`, `MoltenVK/MoltenVK/GPUObjects/MVKDevice.mm`,
   `MVKSync.h`, `Vulkan/mvk_api.mm`, `include/MoltenVK/mvk_private_api.h`.
   https://github.com/KhronosGroup/MoltenVK
10. Kenji-NX MoltenVK fork: releases `v1.4.2-ryujinx.5` (2026-07-13) to `v1.4.3-ryujinx.2`
    (2026-10-29); commits 1ded5ccc8, 9a3cc66d3, 4555af26e. https://github.com/Kenji-NX/MoltenVK
11. Khronos, "KosmicKrisp achieves Vulkan 1.4 conformance on Apple silicon", 2026-10-01.
    https://www.khronos.org/news/permalink/kosmickrisp-achieves-vulkan-1.4-conformance-on-apple-silicon
12. Phoronix, "KosmicKrisp Now Conformant To Vulkan 1.4…", 2026-10-03.
    https://www.phoronix.com/news/KosmicKrisp-Vulkan-1.4-2026
13. LunarG, "LunarG Achieves Vulkan 1.3 Conformance with KosmicKrisp on Apple Silicon", 2025-10-30.
    https://www.lunarg.com/lunarg-achieves-vulkan-1-3-conformance-with-kosmickrisp-on-apple-silicon/
14. Mesa documentation, KosmicKrisp driver. https://docs.mesa3d.org/drivers/kosmickrisp.html
15. Blender developer docs, KosmicKrisp (search extract only, not fetched), and MoltenVK issue 1588
    (transform feedback). https://developer.blender.org/docs/features/gpu/vulkan/kosmic_krisp/ ;
    https://github.com/KhronosGroup/MoltenVK/issues/1588
16. Phoronix, "Mesa's KosmicKrisp Vulkan-On-Metal Achieves MoltenVK Feature Parity" (February 2026;
    search extract). https://phoronix.com/news/KosmicKrisp-Parity
17. xemu-macos v0.16 release notes (search extract; anecdote).
    https://github.com/MichaelJSr/xemu-macos/releases/tag/v0.16
18. Apple, "Monitoring your Metal app's graphics performance".
    https://developer.apple.com/documentation/xcode/monitoring-your-metal-apps-graphics-performance
19. Apple, MetalFX `MTLFXFrameInterpolatorBase` (macOS 26.0+).
    https://developer.apple.com/documentation/metalfx/mtlfxframeinterpolatorbase
20. dotnet/runtime `release/10.0`, `src/coreclr/pal/src/exception/machexception.cpp` and
    `src/coreclr/pal/src/exception/signal.cpp`.
    https://github.com/dotnet/runtime/blob/release/10.0/src/coreclr/pal/src/exception/machexception.cpp ;
    https://github.com/dotnet/runtime/blob/release/10.0/src/coreclr/pal/src/exception/signal.cpp
21. Eden forge, repository and releases v0.1.1 to v0.2.1 (forge API).
    https://git.eden-emu.dev/eden-emu/eden
22. Citron-neo repository, releases and PR 381. https://github.com/citron-neo/emulator ;
    https://github.com/citron-neo/emulator/pull/381
23. MoltenVK PR 2875, "fix: enable framebuffer fetch for subpass inputs on Apple GPUs" (open).
    https://github.com/KhronosGroup/MoltenVK/pull/2875
24. GitHub DMCA repository, Nintendo notice 2026-02-12.
    https://github.com/github/dmca/blob/master/2026/02/2026-02-12-nintendo.md
25. Kenji-NX forge and releases. https://git.ryujinx.app/projects/Kenji-NX
26. MeloNX forge. https://git.ryujinx.app/projects/MeloNX
27. Android Authority, "Sudachi ends development" (search extract).
    https://www.androidauthority.com/sudachi-ends-development-3590776/
28. Ryujinx-Nextendo repository and issue 70. https://github.com/NextendoNetwork/Ryujinx-Nextendo
29. Community TOTK performance anecdotes (Lemmy thread, search extract).
    https://lemmy.dbzer0.com/post/186537
30. Local read-only tool checks on the owner's Mac, 2026-11-01: `xcrun xctrace version` (27.2,
    27B5019j), `xctrace list templates/instruments`, and an `ioreg` IOAccelerator
    PerformanceStatistics read.
31. Private local evidence workspace: final report, phase 1 checkpoint and result, control result,
    CPU profile of the Room (`per_thread.txt`), and the prior overnight handoff (cache runs R1/R2,
    P3). Not public.
32. Mesa `src/kosmickrisp/vulkan/kk_physical_device.c`, on `main` (27.0.0-devel, commit 1558388,
    2026-11-01) and on the `26.2` branch (raw file read 2026-11-01).
    https://gitlab.freedesktop.org/mesa/mesa/-/blob/main/src/kosmickrisp/vulkan/kk_physical_device.c ;
    https://gitlab.freedesktop.org/mesa/mesa/-/raw/26.2/src/kosmickrisp/vulkan/kk_physical_device.c

---

## Independent verification

Checked 2026-11-01 by an independent reviewer. Method: the official Ryubing source at 475615f
(read with `git show` from the local mirror), a fresh shallow clone of MoltenVK (5189f8de), the
Ryubing forge API (PRs 31, 131, 195 and the Metal commits), the GitHub API (Kenji-NX MoltenVK
releases and compare, MoltenVK issue 1588 and PR 2875, the DMCA notice), Mesa sources, Apple
documentation JSON, .NET runtime sources, read-only local tool checks, and the private local
evidence workspace. Nothing was built or run.

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| Room of Awakening frame costs about 35-39 ms; vanilla 20 FPS is a vsync step; 10-15 % cut restores 30 | Unverifiable (plausible) | Private D2 table: 20.0 vanilla, 25.8-28.2 D2 [M]. 1000/28.2 = 35.5 ms, 1000/25.8 = 38.8 ms. The D2 patch notes say it requests present interval 1 and steps the game by measured time | The averages may mix 33.3 ms and 50 ms present intervals, and D2 changes per-frame work. "No saturated thread" holds only with yield spinning (`swtch_pri`) counted as idle. Caveat added; tag stays [I], medium |
| PPTC does nothing with LightningJit or the hypervisor | Confirmed | `LightningJitCpuContext.cs` and `HvCpuContext.cs` return `DummyDiskCacheLoadState`; `JitCpuContext.cs` (ARMeilleure) returns a real `JitDiskCacheLoadState`; selection in `ArmProcessContextFactory.cs:63-87` [1] | [D], high |
| Hypervisor Off on 16 KiB pages uses `MemoryManagerHostTracked`; tracked writes pass through Mach exception and the PAL; `PAL_MachExceptionMode=4` is risky | Confirmed, wording corrected | Factory line 87 skips the 4 KiB host-mapped path when the page size is above 0x1000 [1]. `machexception.cpp:53` names the variable; `MachException_SuppressManaged = 4` removes `PAL_EXC_MANAGED_MASK` [20]. On macOS `sigsegv_handler` only chains (`signal.cpp:641-729`) [20] | "Bit 4" changed to "flag value 4". The crash risk is supported by source; per-fault timing is still unmeasured |
| Khronos deprecated MoltenVK on 2026-10-13 and recommends KosmicKrisp on Apple Silicon; KosmicKrisp Vulkan 1.4 conformant (2026-10-01); needs Metal 4 / macOS 26 | Confirmed | MoltenVK commit 0aa76ad dated 2026-10-13; README text recommends KosmicKrisp on Apple Silicon and keeps MoltenVK for Intel Macs and iOS [8]. Khronos news dated 2026-10-01, "tripled" performance claim, no benchmarks [11]. Mesa docs: "implemented on top of Metal 4, which requires macOS 26 and up" [14] | [D], high |
| KosmicKrisp lacks geometry shaders; transform feedback unknown | Corrected | Mesa `main` `kk_physical_device.c:236` `.geometryShader = true`; the `26.2` branch has no `geometryShader` entry; `VK_EXT_transform_feedback` is not in the extension table on `main`; subgroup stages are compute and fragment only [32] | Gaps list, options table, ranking and unknowns updated. The PR 131 fork (26.2.5 plus cherry-picks) was not inspected as a binary, so its feature set is [I] |
| PR 131 open WIP, 22 commits, last updated 2026-10-29, ships `26.2.5-ryu.1` NuGet, ICD advertises 1.3, raises max Vulkan to 1.4 | Confirmed | Forge API: state open, updated 2026-10-29T23:11Z, 22 commits; diff adds `nuget/Ryujinx.Graphics.Vulkan.KosmicKrisp.26.2.5-ryu.1.nupkg` (binary), `libkosmickrisp_icd.json` with `api_version` 1.3.0, `VK_DRIVER_FILES` selection, `Version14` as the maximum [5] | [D], high. No TOTK benchmark found in the PR |
| Metal backend #441 merged 2024-12-24 (about 15k lines), reverted by #701 on 2025-02-22, for the stated reasons | Confirmed | Forge API: 852823104 dated 2024-12-24, +14,991/-139; fe1617ffe dated 2025-02-22, +302/-15,077; the revert message lists few games, broken shader translation with a 30 ms delay hack, and MoltenVK regressions [2] [3] | [D], high |
| FencePool caps 32 fences per pool; 40 to 60 FPS claim has no stated platform; MoltenVK fences are user-space | Confirmed | PR 195 diff: `MaxCachedFences = 32`; body cites the Temple of Time scene with no platform or driver [6]. `MVKDevice.mm:4270` `createFence` is `new MVKFence`; `MVKSync.h` members are a `std::mutex`, an `unordered_set` and a bool [9]. Private profile: `GPU.MainThread` 22 % not waiting, `GUI.RenderThread` 18 % [M] | The small-gain expectation stays [I], medium |
| Great Sky Island needs about 21 ms GPU per frame at 1.2x | Confirmed as arithmetic, unverifiable as a measurement | Private final report: 64 % HUD GPU load at 1.2x, labelled an upper bound (sum of HUD times) [M]. 0.64 × 33.3 = 21.3 ms; 1000/48 = 20.8 ms. Apple documents that standard GPU time can be inflated by idle gaps between encoders [18] | The D2 ceiling may also be shaped by 60 Hz present quantisation. Tag stays [M]/[I], medium |
| VkPipelineCache never serialised; MoltenVK has no `MTLBinaryArchive`; cold 69.7-85 s against 3.7 s warm; no async shaders for new shaders | Confirmed | `PipelineBase.cs:107-112` creates an empty cache; no `GetPipelineCacheData` in the tree; `ShaderCollection.cs:152-157` starts background compilation only through the cache-loading constructor; no `BinaryArchive` in MoltenVK sources; user guide lines 609-629 describe MSL serialisation [1] [9]. Prior handoff R1/R2: 816 shaders in 69.7 s with HUD, 3.7 s without; control result: 85 s once per build [M] | [D]/[M], high |
| MoltenVK subgroups only in fragment and compute (plus tessellation control), no transform feedback, primitive restart always on | Confirmed | `MVKDevice.mm:1486`; user guide line 346; issue 1588 open since 2023; `ShaderCache.cs:490-515` [1] [9] [15] | Vertex is converted to compute only when a geometry stage exists or vertex stores are unsupported; table row clarified |
| MetalFX frame interpolation needs depth, motion, matrices and near/far planes | Confirmed | Apple documentation JSON for `MTLFXFrameInterpolatorBase`: `depthTexture`, `motionTexture`, `worldToViewMatrix`, `viewToClipMatrix`, `nearPlane`, `farPlane`, `fieldOfView`, `deltaTime`, `prevColorTexture`; macOS 26.0+ [19] | The "not recommended" verdict is [I] and well supported |
| Profiling without sudo or windows: xctrace 27.2 templates, Metal HUD logging, MoltenVK tracking, IORegistry counters | Confirmed, except the window and prompt behaviour | Local `xctrace version 27.2 (27B5019j)`; templates include Metal System Trace, Game Performance, Time Profiler, CPU Counters, Processor Trace; `ioreg` returned Device, Renderer and Tiler utilisation and `SplitSceneCount` without sudo [30]. Apple documents `MTL_HUD_LOG_SHADER_ENABLED`, `MTL_HUD_ENCODER_TIMING_ENABLED` and the `cached:` field [18]. MoltenVK documents performance tracking and capture scope 3 (named pipe) [9] | "No window in attach mode" and the first-use prompt were not tested |
| Guest frame-time hook at `SurfaceFlinger.OnFrameAvailable` | Confirmed, refined | `SurfaceFlinger.cs:534-537` calls `RecordGameFrameTime`; `OnFrameReplaced` (539-542) calls it too; `PostFrameBuffer` at line 402 [1] | Tool table now names both callbacks |
| Kenji-NX MoltenVK fork: `ryujinx.5` 2026-07-13, `1.4.3-ryujinx.2` 2026-10-29 with concurrent compile on, residency sets off, no direct-to-display with async submits | Confirmed | GitHub releases API; compare `v1.4.2-ryujinx.5...v1.4.3-ryujinx.2` lists commits 1ded5ccc8, 4555af26e, 9a3cc66d3 [10]. Upstream default for concurrent compilation is `0` [9] | [D], high |
| No alternative emulator has better TOTK evidence on macOS; Eden, Citron, Kenji-NX dates; DMCA notice names | Confirmed | Eden v0.2.1 2026-06-01 notes say macOS DMG builds are experimental [21]; Citron latest release 2026-04-27 with a macOS nightly DMG [22]; Kenji-NX 2.0.5 2025-10-06 with `macos_universal` [25]; the DMCA notice mentions Ryubing, Eden, Citron, Kenji and MeloNX [24]. Eden enables NCE only for arm64 Android or Linux (`CMakeLists.txt:302-305`) and has no Hypervisor.framework code | Supports the "JIT-only on Mac" point for Eden; Citron not checked in source |

Residual doubts:

- The Room and island frame costs come from about 1 s status-bar averages with 60 Hz present
  quantisation. They stay inferences until the guest frame-time hook exists.
- The PR 131 KosmicKrisp package is a prebuilt binary that was not inspected. Its geometry,
  transform feedback and subgroup support are inferred from the Mesa branch it is based on.
- `PAL_MachExceptionMode=4` safety and any speed gain are unmeasured.
- Whether xctrace in attach mode shows any window or authorisation prompt has not been tested.
