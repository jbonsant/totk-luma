# ADR 0001: Architecture, delivery form, backend track and repository logistics

- **Status:** Proposed, awaiting owner approval
- **Date:** 2026-11-01
- **Covers:** D1 (base and delivery form), D2 (graphics backend track), D10 (repository and fork logistics)
- **Related:** [0002](0002-hdr-pipeline-and-presenter.md) (presenter, HDR, in-game UI technology D9),
  [0003](0003-frame-pacing-caps-and-vrr.md) (caps and VRR)

Tags: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal. `[E]` cites the prior local evidence
summary (`docs/evidence/prior-local-evidence.md`). `R05 §3` cites research note 05, section 3. Every effort figure
in this record is an estimate `[I]`.

---

## Context

**What already exists.** Earlier hands-on work on the target Mac produced a working Ryubing build chain and three
local patch sets: shmfix (a shared-memory race fix with a regression test), hvfix A+B (a hypervisor TLB fix) and
agentpad (a virtual gamepad for automation) [E]. The build uses an isolated .NET 10 SDK, publishes for arm64 in
about 48 s, and signs ad hoc with the same 8 entitlements as the reference app [E]. Every build is a separate app
bundle, and rollback means deleting the build folder [E].

**The emulator already has the seams Luma needs.** The macOS frontend creates its own `CAMetalLayer` in a child
`NSView` through Objective-C interop (`EmbeddedWindow.CreateMacOS`), and that file did not change upstream in the
last window [D] (R10 §1.4). Presentation goes through a 7-method `IWindow` interface, input through
`IGamepadDriver`, and a local branch already composes a second input driver in 103 lines [D]/[M] (R10 Summary).
R10's hook table rates the needed hooks from Low (layer ownership, telemetry) to Medium (presentation, shader
registry) and High only for texture-format upgrades (R10 §1.4).

**The Vulkan-on-Metal layer is in transition.** Khronos deprecated MoltenVK on 2026-10-13 (commit `0aa76ad`) and
recommends KosmicKrisp on Apple Silicon; community maintenance of MoltenVK is best-effort [D]. KosmicKrisp is
Vulkan 1.4 conformant and needs macOS 26 / Metal 4 [D] (R03 §4, R05 §1.2). Ryubing's KosmicKrisp work (PR !131) is
WIP and ships a prebuilt forked-Mesa NuGet binary [D] (R05 verification). KosmicKrisp has no
`VK_EXT_metal_objects`, exports memory only as `MTLHeap`, and turns on EDR only for float swapchain formats [D]
(R03 §4). No TOTK or Ryujinx measurement exists on KosmicKrisp [D] (R05 Summary).

**A native Metal backend was tried and reverted.** About 15,000 lines were merged on 2024-12-24 and reverted on
2025-02-22 (#701): few games worked, shader translation was broken, and MoltenVK users regressed [D] (R05 §1.1,
verification).

**The cheapest performance levers are already known** [E] (R05 §3):

| Fact | Value | Tag |
|---|---|---|
| Room of Awakening, hypervisor Off / On | 20.0 FPS / 29.4-30.8 FPS (On has flashes) | [E] |
| Hypervisor On flash rate | 10 flashes in 850 s (about 0.012 flashes/s); Off: 0 in 3,654 s | [E], R05 §3 |
| Write tracking cost, hypervisor Off | about 27% of the guest main thread | [E] |
| A+B status | 83/83 memory tests pass; no gameplay measurement; needs the hypervisor | [E] |
| Great Sky Island at 1.2x | GPU-bound, about 21 ms of GPU per frame (upper bound) | [M]/[I] R05 Summary |
| Cold Metal shader cache per new build | about 85-88 s, about 1,017 shaders | [E] |

**Upstream health.** Upstream moved 143 commits and 727 files between 2026-04-29 and 2026-08-26, then went quiet;
the frontend (`src/Ryujinx`) is the most churned area [D] (R10 §1.3, verification). R10 estimates a sync of the
current queue at 0.5-2 days, rising to 2-5 days once presenter and texture patches touch `Window.cs` and
`Gpu/Image` [I] (R10 §2A).

**Builds are close to reproducible but not pinned.** `global.json` uses `rollForward: latestFeature`, there are no
NuGet lock files, and every build shares the bundle id `org.ryujinx.Ryujinx` [D] (R10 §3.3, §3.4).

**Toolchain.** The Mac runs macOS 27.2 beta with Xcode 27.2 beta; R10 records the beta Xcode as a reproducibility
risk for any Swift component [M]/[I] (R10 §3.1, §3.3).

---

## Decision

### D1. Base and delivery form: a Ryubing fork as a patch queue (option A), designed so the hybrid can be added later

1. **Base.** Ryubing canary 1.3.351, commit `475615f`, pinned. Upstream syncs happen on demand, not per canary.
2. **Form.** An ordered patch queue on that base, one commit per concern, every runtime change behind an
   off-by-default flag. With all flags off, the build behaves as stock.
3. **One toolchain in v1.** Only the pinned .NET SDK. No Xcode or Swift build step in the critical path.
   Mac platform glue (layer properties, `NSScreen` headroom, display link) is written in C# through Objective-C
   runtime and C interop, the pattern `EmbeddedWindow.CreateMacOS` already uses [D] (R10 §1.4).
4. **Five narrow seams, mostly as new files** that touch upstream files only at named hook points:

   | Seam | Hook point at 475615f | Invasiveness (R10 §1.4) |
   |---|---|---|
   | Per-frame telemetry ring | `SurfaceFlinger` frame callbacks, `Window.Present`, display timing | Low |
   | Luma output stage (`IOutputStage`) | Post-scale stage inside Vulkan `Window.Present` | Medium |
   | Display helper (layer properties, headroom) | The `CAMetalLayer` that `EmbeddedWindow.CreateMacOS` creates | Low |
   | Guest-shader replacement registry | Beside `ShaderDumper` in `ShaderCache.TranslateShader` | Medium |
   | Composite gamepad driver | `InputManager` construction site | Low-Medium |

   Texture-format upgrades (High invasiveness) are confined to the exact allow-list defined in ADR 0002.
5. **Title pack.** Everything specific to TOTK 1.4.3 lives in an owner-local *title pack* outside every public
   repository: the D2 timing patch, the guest shader hash table, the TOTK replacement shaders, the render-target
   allow-list, and any future read-only game-state hooks. The fork loads it by path behind a flag and carries only
   generic mechanisms with no game identifiers. (Grafted from the maintenance-first proposal.)
6. **The hybrid is deferred, not discarded.** The Swift-dylib presenter of R10 option C plugs into the same
   `IOutputStage` seam and is built only if a gate in ADR 0002 fires. Option B (native shell) and option D
   (another emulator) are rejected for now.
7. **Portability test.** Every Luma component must pass one review question: does it still work, unchanged, if
   MoltenVK is replaced by KosmicKrisp? Components that cannot pass are marked MoltenVK-only and kept off the
   critical path.

### D2. Graphics backend track: MoltenVK baseline, selective improvements first, KosmicKrisp as a gated variant

1. **Baseline.** MoltenVK `1.4.2-ryujinx.5` (the shipped package, equal to Kenji-NX/MoltenVK `89cdc5f`, with
   `MVKSwapchain.mm` untouched [D] R03 §3.1) for every measurement and for v1.
2. **Selective improvements, in this order** (R05 §3 ranking):
   1. per-frame telemetry ring (the enabler for every later claim);
   2. in-game validation of A+B with the hypervisor On;
   3. a resolution-scale A/B, 1.0x against 1.2x, on Great Sky Island (informational: 1.2x is the
      "about 1080p" setting, so 1.0x is a trade-off the owner decides);
   4. `MVK_CONFIG_SHOULD_MAXIMIZE_CONCURRENT_COMPILATION=1` for cold-cache hitches;
   5. FencePool PR !195 A/B (expected small on macOS, because MoltenVK fences are user-space objects [I] R05 §1.4);
   6. optional A/B of the `1.4.3-ryujinx.2` MoltenVK package, judged against the direct-to-display check (G6-6),
      because it "avoids direct-to-display with asynchronous submits" [D] (R05 verification).
3. **Not now.** Write-tracking redesign and `PAL_MachExceptionMode=4` only if A+B fails its gate; the PAL mode can
   turn managed null references into fatal crashes [D]/[I] (R05 §1.5, §3).
4. **KosmicKrisp** is a flagged evaluation variant in phase P5, not a migration. All Luma graphics code (output
   stage, overlay, scopes, shader replacements) is written against Vulkan only, and the output format chosen in
   ADR 0002 (RGBA16F + `EXTENDED_SRGB_LINEAR`) is the one format both backends map to EDR [D] (R03 §3.2, §4). A
   switch therefore costs no Luma rework.
5. **No native Metal backend.** It is reopened only through G-METAL.

### D10. Repository and fork logistics

1. **Where code lives.**

   | Repository or folder | Contents | Visibility |
   |---|---|---|
   | TOTK Luma (this repository) | Specs, ADRs, test matrices, the simulated demo | Public |
   | Luma fork of Ryubing | The generic patch queue, `series` file, `rebase.sh`, build manifest | Local-only by default; any hosted location is an owner decision |
   | Title pack | D2 patch, guest hashes, TOTK shaders, RT allow-list, checksums | Owner-local, private local evidence workspace only |
   | Captures and dumps | Shader dumps, GPU traces, frame dumps | Private local evidence workspace only, never committed |

2. **Patch queue.** Fixed order: build config, shmfix, hvfix A+B, telemetry, input composite, output stage, display
   helper, shader registry, RT allow-list mechanism. A `series` file plus `rebase.sh` replays the queue on a new
   base and runs `Ryujinx.Tests.Memory` and `Ryujinx.Tests.Input` (R10 §2A). Each synced queue is tagged
   `luma/475615f/qN`.
3. **Flags and config.** Each feature has a CLI flag and a key in a separate `luma.json` in the variant's data root,
   so Ryubing's own versioned `Config.json` schema is not edited [I]. Profiles: `macbook-xdr`, `a95l`,
   `measurement`, `agent-background`.
4. **Side-by-side bundles.** One bundle per variant, each with its own name, its own `CFBundleIdentifier`
   (for example `app.totkluma.ryubing.<variant>` for `reference`, `measure`, `agent`, `hdr`), and its own data root
   through `--root-data-dir` [D] (R10 §3.4). Saves are copied in from a manifest-checked backup, never shared live.
5. **Pinning** (R10 §3.3): `global.json` at `10.0.303` with `rollForward: disable` and the .NET 10 `paths` key;
   `packages.lock.json` for `src/Ryujinx` and the test projects, restored with `--locked-mode`; SHA-256 of
   MoltenVK and every dylib; a `build-manifest.json` recording upstream commit, queue tag, SDK, lock-file hash, the
   OS and toolchain build, and executable and dylib hashes. Launchers start only executables whose hash is in the
   manifest [M] (R10 §3.5).
6. **Signing.** Ad hoc, same 8 entitlements. Removal of the debug-only entitlements (`allow-dyld-environment-
   variables`, `debugger`, `get-task-allow`) and of `disable-executable-page-protection` is tested for play
   builds [I] (R10 §3.2).
7. **Rollback ladder** (R10 §3.5): flag off; then the previous bundle; then a rebuild from the previous tag (about a
   minute with a warm cache); then delete the build folder. No system changes at any step [E].
8. **Upstream.** Offer shmfix and the Retina `contentsScale` fix (issue #461) early, and A+B after it passes G-AB,
   following CONTRIBUTING, once the owner approves. Test FencePool !195 and report results to its author rather
   than resubmitting it (R10 Summary).
9. **Builds run only when the owner agrees**, because they compete for CPU (R10 §3.6).

---

## Alternatives considered

### D1

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **A. Fork as a patch queue (chosen)** | Least new code; keeps CoreCLR, TieredPGO and the macro JIT; keeps all prior evidence valid; one toolchain | HDR and overlay must be written in Vulkan and C#; UX limited by Avalonia. Mitigated by drawing the dashboard in the output stage | R10 options table (1-3 pw initial, reproducibility 4/5) [I]; [E] build facts |
| C. Hybrid from day one: fork plus a Swift dylib that owns the visible layer (R10's recommendation) | Native layer control; best chance of direct-to-display; native UX | Its key mechanism, `VK_EXT_metal_objects`, exists only on the now-deprecated MoltenVK; KosmicKrisp lacks it [D]. Adds a second toolchain on a beta Xcode [M]/[I]. Avalonia run-loop conflicts were already seen with agentpad [M]. R10 puts its native phase at 4-8 pw before the first HDR pixel [I] | R03 §4, §5; R10 §2C, §3.3, effort notes; MoltenVK `0aa76ad` |
| B1. Native Swift shell, NativeAOT in-process | Best UX polish | 10-20 pw to parity [I]; NativeAOT forbids `Reflection.Emit`, so the GPU macro JIT must be off; TieredPGO lost; effect on TOTK unmeasured; invalidates prior runtime evidence | R10 §2B, verification |
| B2. Native shell plus helper process | Crash isolation | 8-14 pw [I]; IPC frame handshake, probably one extra frame of latency [I] | R10 §2B |
| D. Another base emulator (Eden, Citron, Kenji-NX) | Possible C++ performance | Eden macOS builds labelled experimental [A]; no better TOTK evidence on a Mac; discards every measured result | R10 §2D; R05 §2 |

**Maintenance cost.** R10 scores maintenance cost on a relative 1-5 scale, where 5 is cheapest [I]: A 4, C 3,
B1 2 (two runtimes, AOT trimming roots), B2 2 (IPC contract), D 2. Option A also scores best on build
reproducibility (one toolchain) and is the only option besides C that keeps all prior evidence valid (R10 Options
compared).

### D2

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **MoltenVK baseline plus selective improvements (chosen)** | Measured baseline; cheapest known levers; no rework on a later switch | MoltenVK is deprecated, so its fixes may land only in KosmicKrisp. Kept small and Vulkan-only | [E]; R05 §3; MoltenVK `0aa76ad` |
| KosmicKrisp first (PR !131) | Strategic successor; conformant | PR WIP with a prebuilt binary (supply-chain gate); no TOTK data; geometry shaders absent from the 26.2 base and no transform feedback [D]; switching now invalidates all baselines | R05 §1.2, verification |
| Native Metal backend | Full control | Reverted in #701 after about 15k lines [D]; 6-18+ person-months [I] | R05 §1.1, §5 |
| MoltenVK `1.4.3-ryujinx.2` as default | Newer fixes | Avoids direct-to-display with asynchronous submits [D]; breaks the baseline | R05 verification |
| Write-tracking redesign or `PAL_MachExceptionMode=4` now | Could recover most of the 27% | 2-6 weeks with high correctness risk; PAL mode crash risk [D]/[I] | R05 §1.5, §3 |
| MetalFX frame interpolation | Higher counter FPS | Needs depth, motion vectors and camera matrices the emulator lacks; adds latency; no game-logic FPS [D]/[I] | R05 §3 rank 14 |

#### Backend comparison: measured evidence and maintenance cost

The owner asked for native Metal, Vulkan through MoltenVK, and selective improvements to be compared on measured
evidence and on maintenance cost, not on expectation. Today only the MoltenVK baseline has measurements on this
Mac. The table states what exists, what will be measured and when, and what each path costs to keep alive.

| Path | Evidence today | What gets measured, and when | Maintenance cost [I] | Position |
|---|---|---|---|---|
| MoltenVK `1.4.2-ryujinx.5` (baseline) | Room of Awakening 20.0 FPS Hypervisor Off, 29.4-30.8 On; island about 21 ms GPU per frame at 1.2x (upper bound); cold cache about 85-88 s for about 1,017 shaders; one SPIR-V to MSL failure per session [E] | C0/C1/C2 baselines in three scenes (P0); bottleneck class and translation-layer share per scene (P0-P2) | Lowest today: Ryubing overrides only four MoltenVK settings [D] (R05 §1.1) and Luma adds no MoltenVK code, only launcher environment variables. Rising: upstream is deprecated with best-effort maintenance, and the package is a Kenji-NX fork [D] | Baseline for v1 and every measurement |
| Selective improvements (A+B, 1.0x scale test, concurrent compilation, FencePool) | A+B passes 83/83 memory tests but has no in-game data [E]; FencePool's 40-60 FPS claim has no stated platform [A] (R05 §1.4) | One-variable A/B each, in ADR order (P0-P2) | Low: a flag, a config value, an environment variable or one cherry-picked commit; each is dropped if its A/B shows no gain | Chosen first |
| MoltenVK `1.4.3-ryujinx.2` | None on TOTK; it avoids direct-to-display with asynchronous submits [D] (R05 verification) | Optional A/B after G6-6 (P2) | Low: a re-signed bundle on the same deprecated upstream | Optional A/B |
| KosmicKrisp (PR !131 or LunarG SDK) | No TOTK or Ryujinx data [D]; vendor "tripled" claim without numbers [D]; one other emulator saw 11 cold hitches against 6 on MoltenVK on one walk [A]; no geometry shaders in the 26.2 base and no transform feedback [D] (R05 §1.2) | G-KK in P5: warm C2, artefact scan, p95, EDR on both displays, pacing parity | Medium: a driver acquisition and supply-chain gate, and a WIP PR to track. Luma's own code does not change, by design (D1 item 7). Actively developed and recommended by Khronos [D] | Gated P5 variant |
| Native Metal backend | Reverted after two months: few games, broken shader translation, MoltenVK regressions [D] (R05 §1.1) | Translation-layer share recorded in every profiling session, so G-METAL can be decided from data; the G-METAL review itself only on request | Very high: about 15,000 lines last time [D]; 6-18+ person-months [I]; its shared GPU-code changes broke MoltenVK games [D], so every upstream sync would touch it | Rejected unless G-METAL passes |

**How maintenance cost is tracked [I].** Each upstream sync records its hours in the rebase log. Each backend
option records the size of its backend-specific Luma code and the count of MoltenVK-only workarounds, plus the
upstream status of the layer it depends on. These figures are reviewed together with the speed results at every
G-KK or G-METAL decision. A backend that is faster but costs more per sync than the owner's per-sync budget does not
pass on speed alone.

### D10

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **Separate fork, private title pack, specs-only public repository (chosen)** | Satisfies the public-repo rules; the fork itself holds no game identifiers | Two places to keep in step | AGENTS.md; R10 §3 |
| Patches inside this public repository | One place | Game-specific patches and hashes cannot be public; AGENTS.md forbids offsets and game-derived data | AGENTS.md; R06 Risks |
| Long-lived merge branch tracking every canary | Always current | UI-hot files churn heavily; on-demand syncs from a pinned base are cheaper [I] | R10 Risks |
| Reuse `org.ryujinx.Ryujinx` for all builds | Zero work | Variants would share defaults, window state and TCC decisions [D] | R10 §3.4 |
| A `luma` section inside Ryubing's `Config.json` | One file | Touches a versioned upstream schema on every sync [I] | Judge's inference |

---

## Consequences

**Positive**

- The first owner-visible results (truthful frame-time data, EDR on both displays, correctly paced caps) need no new
  toolchain and no new runtime.
- Every Luma graphics component survives a MoltenVK-to-KosmicKrisp switch unchanged.
- Every measurement names an exact binary, and every experiment can be undone in minutes.
- The fork carries no TOTK-specific data, so publishing it later is a smaller decision.

**Negative**

- Luma code sits next to upstream's hottest files (`Window.cs`, `Gpu/Image`), so syncs will cost 2-5 days once
  phase P3 lands [I] (R10 §2A).
- Avalonia menus stay for settings and profile selection; polish lives inside the output stage instead.
- Writing display-link and layer glue through Objective-C interop from C# is less ergonomic than Swift [I].
- MoltenVK-specific workarounds may be stranded by the deprecation; they are kept small (R05 Risks).

---

## Evidence gates and kill criteria

| Gate | Pass condition | If it fails |
|---|---|---|
| G-BUILD | A clean rebuild from `build-manifest.json` reproduces the executable and dylib hashes | Fix pinning before any measurement is trusted |
| G-TEL | Telemetry gives per-frame p50/p95/p99; `VK_GOOGLE_display_timing` confirmed exposed by `1.4.2-ryujinx.5` (R09 unknowns) | Use `presentedTime` through MoltenVK performance tracking averages only, and make no cadence claim |
| G-AB | Hypervisor On + A+B for at least 900 s in the Room and on the island, tested against 0.012 flashes/s with a Poisson test (R05 §3) | Pass: A+B becomes the default CPU profile. Fail: Hypervisor Off at 1.2x stays default; write tracking work may then be considered |
| G-KK (switch to KosmicKrisp) | Warm C2 runs with 0 new artefacts in 900 s; p95 frame time at least 10% better in a GPU-bound scene (R05 §5); RGBA16F + `EXTENDED_SRGB_LINEAR` EDR verified on both displays; pacing parity (ADR 0003); driver built from Mesa source or an owner-approved binary | Stay on MoltenVK; re-test at each major KosmicKrisp or PR !131 change |
| G-METAL | Both R05 §5 conditions hold, warm, in at least 3 heavy scenes, under MoltenVK and KosmicKrisp: (a) more than 25% of the render-thread critical path in the translation layer, or more than 20% of GPU time from translation artefacts; (b) guest CPU no longer the binding limit | Native Metal stays rejected |
| G-REOPEN-C | Any presenter gate in ADR 0002 (G-PRES-1 to 3), G-INP-3 (adaptive triggers need GameController), or Avalonia blocking clean fullscreen on the A95L | Add the Swift dylib through the existing seams |
| G-REOPEN-B | C was built and still cannot meet a required UX goal (R10 implication 7) | B stays deferred |
| G-REOPEN-D | Ryubing master silent for more than 6 months, or KosmicKrisp support lands elsewhere first (R10 §2D) | D stays a watch item |
| Rollback drill | Flag off, previous bundle, rebuild from previous tag, delete build folder: each step verified once | Fix the ladder before P1 work starts |

**Kill criterion for the whole fork approach:** if a single upstream sync costs more than the owner's stated sync
budget twice in a row, re-evaluate the base (owner sets the budget; R10 gives 0.5-2 days now, 2-5 days later [I]).

---

## Effort range

All estimates [I], from R10 and R05.

| Item | Range |
|---|---|
| Fork hygiene (pinning, manifest, bundle ids, data roots, launch by hash, `rebase.sh`) | 1-2 person-weeks (R10 phase 0) |
| Seams (telemetry, output-stage interface, display helper, registry stub, input composite) | 2-4 person-weeks spread over P0-P2 (R10 phase 1) |
| A+B in-game validation | 2-4 h attended plus 0.5 day of analysis (R05) |
| Environment sweep and FencePool A/B | 0.5-1 day each (R05) |
| KosmicKrisp evaluation (P5) | 1-3 days plus the approval wait (R05) |
| Upstream syncs | 0.5-2 days each now, 2-5 days after P3 (R10) |

---

## Open questions for the owner

1. Approve architecture A-first with the hybrid only behind gates, and B and D deferred?
2. Fork location and visibility: local-only (default), or a hosted fork? Are built binaries ever published? Local
   builds only, or free public CI on a fork (R10 §3.6)?
3. Default CPU profile until G-AB: Hypervisor Off at 1.2x?
4. Is a 1.0x internal scale acceptable if it is the only way to 60 on the island, given the "about 1080p" goal?
5. KosmicKrisp: approve acquiring a driver for evaluation (source build, LunarG SDK, or the PR !131 binary)?
6. Approve an A/B of MoltenVK `1.4.3-ryujinx.2`?
7. Upstream policy: submit shmfix and `contentsScale` now, and A+B after G-AB?
8. Variant set and retention: which bundles to keep (reference, measure, agent, hdr) and how many previous builds?
9. Bundle identifier scheme, and the per-sync budget used by the kill criterion above.
