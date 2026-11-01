# Prior local evidence (bounded, experimental)

Status: summary written 2026-11-01 from the owner's private local evidence workspace. That workspace is not part of this repository.

This page records what earlier hands-on experiments on the target Mac established. Treat every result here as **bounded
experimental evidence**: short sessions, a few scenes, one machine, and orders that were not randomised. None of it is proof of broad
stability, and none of it is evidence about HDR, because no HDR path was ever running.

Nothing from that workspace was copied into this repository except facts. No game files, firmware, keys, saves, shader caches,
patches, binaries or credentials were copied.

---

## 1. Test platform

| Item | Value |
|---|---|
| Machine | MacBook Pro 16-inch (Mac16,7), Apple M4 Pro, 14-core CPU (10P + 4E), 20-core GPU, 48 GB |
| OS | Same Mac; macOS 27.2 (beta) at the time of this spec (the exact build during the experiments is not restated in the reports) |
| Emulator | Ryubing (community continuation of Ryujinx), canary 1.3.351, commit `475615f` |
| Graphics path | Vulkan through MoltenVK `1.4.2-ryujinx.5` (Ryubing removed its Metal backend on 2025-02-22, #701) |
| Game | Tears of the Kingdom, Switch 1 release, update 1.4.3 |
| Profile | Docked, 1.2x resolution scale, backend threading On, anti-aliasing None |

---

## 2. Verified facts

Each row below checks a fact stated in the project brief against the private reports.

| # | Fact in the brief | What the reports say | Status |
|---|---|---|---|
| 1 | Ryujinx `475615f`, TOTK 1.4.3 | Ryubing canary 1.3.351 + `475615f`, update 1.4.3 | Confirmed |
| 2 | Hypervisor Off suppresses the major artifacts | Off: 0 flashes in 3,654 s over 12/12 sessions. On: 10 flashes in 850 s over 4/4 sessions (Ryubing issue #249). Rare flashes, under about 10 per hour, are not excluded. | Confirmed, bounded |
| 3 | Room of Awakening 20 FPS (Off) versus 30 FPS (On, with corruption) | Off: 20.0 FPS (19.97-20.04). On: 29.4-30.8 FPS. "On + backend threading Off" kept about 30 FPS, but a black-block artifact appeared at 181.57 s, so that is not a fix either. | Confirmed |
| 4 | D2 local timing patch, preliminary: island about 48, Room 25.8-28.2, Castle 38.4-45.2, not a stable 60 | Island 44.8-50.9 (mostly 45-48, one dip to 32.9), Castle 38.4-45.2, Room 25.8-28.2, with Hypervisor Off at 1.2x. 60 FPS was reached only in menus. | Confirmed |
| 5 | Candidate A+B: 83 unit tests passed, game validation interrupted | `Ryujinx.Tests.Memory` 83/83 on the patched tree. The in-game candidate trial was interrupted after the shader-cache rebuild, so no gameplay measurement exists. **Nuance:** A+B itself needs the hypervisor and is validated by compilation only. The 83 tests cover the memory project, including the shared-memory regression test. | Confirmed, with nuance |
| 6 | The shared-memory "File exists" race can occur after the initial boot, and the 30 s alive check does not solve it | The race crashed a Hypervisor-Off session during a save load (at 1 min 22 s, in `MapPhysicalMemory`). The launcher counts a launch as good once the process is alive at +30 s, so it only catches the boot. A source fix (unique `shm_open` names) and its regression test exist. The test fails on the official tree and passes on the fixed one. | Confirmed |
| 7 | Controller build = official source + shmfix + agentpad, without A+B; 42 unit + 9 client-server tests | `Ryujinx.Tests.Input` 42/42 (2 new). End-to-end client-server 9/9: hold timing, release on SIGKILL, file ESTOP within 53 ms. | Confirmed |
| 8 | Short background menu, movement, camera and ESTOP verified while another app was in the foreground | Trials 2 and 3, about 2-4 min each at 1x: the emulator window stayed fully covered and never came to the foreground, except once. That one activation happened 112 ms after a physical trackpad click by the owner. | Confirmed, short |
| 9 | Dialogs or the crash reporter may steal focus; the user handoff is not fully validated | The modal dialog and crash-reporter paths were not observed. The guard's revised "the user clicked, so set ESTOP and keep the game running" path was not replayed live. | Confirmed |
| 10 | Window capture works; native Computer Use capture failed | `screencapture -l` window capture works even when the window is covered. Computer Use native capture was refused by `replayd`; the root cause is unknown and out of scope. | Confirmed |

Additional observation: the private workspace also holds a third bundle that combines A+B, shmfix and agentpad. The reviewed
reports record **no validation results** for it.

---

## 3. Measured performance (game FPS from the emulator status bar)

| Scene | Hyp. Off, no patch | Hyp. On, no patch | Hyp. Off + D2 |
|---|---|---|---|
| Great Sky Island | 29.97-30.02 | about 30 | 44.8-50.9 |
| Room of Awakening | 20.0 | 29.4-30.8 (with flashes) | 25.8-28.2 |
| Beneath Hyrule Castle | 29.95-30.05 | not measured | 38.4-45.2 |

**Limiting factor with D2 at 1.2x:** the GPU on the island, the CPU in the Room and the Castle `[I]`.

**Why the Room of Awakening is CPU-bound with the hypervisor off:** write tracking (a fault becomes a Mach exception, then a .NET
handler, then SIGBUS) takes about 27% of the main guest thread's active time. The JIT is also slower. No setting removes this cost.

**Game speed with D2:** a walk test over a fixed 3.0 s real-time span ended at the same place at 30 FPS and at about 48 FPS
(alignment scale 0.995-1.005). In that test, game time follows real time, not the frame rate.

**Not validated with D2:** audio (no objective measurement), pre-rendered cutscenes (an analysis suggests a 2x speed risk),
long-session physics, judder (the cadence is not a divisor of 60 Hz), and frame-time percentiles.

**Resolution:** at 1.2x, the 3D render targets (guest 1600x896) are allocated at 1921x1076. The output (guest 1920x1080) becomes
2304x1296. The rendered resolution per frame was not measured, because the game uses dynamic resolution.

---

## 4. Measurement caveats to carry forward

- The status-bar FPS is an average over about 1 s. **There is no per-frame game frame-time source yet.**
- The Metal HUD reports host presentation at about 117 per second on the 120 Hz panel. That is not the game frame time.
  Enabling the HUD also forces a Metal shader recompilation, so HUD runs start with a **cold cache**. Compare HUD runs only with
  other HUD runs, and keep cold and warm runs separate.
- The GPU load estimate (a sum of Metal HUD times) is an upper bound: 64% at 1.2x on the island, about 102% at 2.2x.
- A cold shader cache rebuild took about 85-88 s (about 1,017 shaders) for each new build.

---

## 5. HDR status before this project

- The Switch 1 1.4.3 build outputs **SDR**. HDR is a feature of the separate Switch 2 Edition.
- The Ryubing swapchain is `B8G8R8A8Unorm` sRGB, with no EDR.
- `enable_color_space_passthrough` selects `PASS_THROUGH_EXT`. MoltenVK then sets `colorspace = nil` and
  `wantsExtendedDynamicRangeContent = NO`. The result is 8-bit and unmanaged. It looks more saturated on a P3 panel, but it is not HDR.
- The only HDR swapchain attempt in Ryubing (PR !31, RGBA16F) was closed unmerged on 2026-05-03 as "too unstable".

---

## 6. Other relevant facts

- **Retina scale:** the swapchain renders at a 1.0 contents scale on the Retina display (Ryubing issue #461), so macOS upscales it 2x.
- **One SPIR-V to MSL failure per session:** a vertex shader uses a subgroup lane ID, which Metal forbids in vertex functions.
  Ryubing skips those draws. It is not the cause of the flashes.
- **Mods:** Serfrost Base Defogger v2.4 (CC BY-NC-ND) boots on 1.4.3 with no regression, but its visual effect was not demonstrated
  with a same-framing comparison. The Interior add-on (1.2.0) replaces the whole Bootup pack and is not compatible.
- **Unmerged upstream work:** FencePool PR !195 (the author reports about 40 to 60 FPS at the Temple of Time, platform unstated) and
  KosmicKrisp PR !131 (a successor to MoltenVK; work in progress).
- **Build facts:** an isolated official .NET 10 SDK, a NuGet cache of about 3.4 GB, an `osx-arm64` publish in about 48 s, and ad hoc
  signing with the same 8 entitlements as the reference app. Each build is a separate app bundle, and rollback means deleting the
  build folder. No system changes were made: no TCC, Gatekeeper or SIP changes.
- **Non-intrusive control design:** a Unix socket in a 0700 folder with peer-uid checks, no TCP or UDP listener, and opt-in flags.
  Commands are bounded to 5 s, and the pad goes neutral after 5 s idle and on disconnect. ESTOP works both as a command and as a file.
