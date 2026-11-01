# TOTK Luma: overview

Status: Proposed, 2026-11-01. Every decision below is awaiting owner approval ([APPROVAL.md](APPROVAL.md)).

Tags: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal; `[M-third-party]` is a measurement by an
outside lab. `[E]` cites the
[prior local evidence](evidence/prior-local-evidence.md). `R02 §3` cites research note 02, section 3. Every effort
figure is an estimate `[I]`.

---

## 1. Vision

TOTK Luma is a personal-use, Mac-first showcase for playing a legally owned copy of *Tears of the Kingdom*
(Switch 1, game version 1.4.3) through the open-source Ryubing emulator (canary 1.3.351, commit `475615f`). It is
emulator-based, not a native port.

The target is a MacBook Pro 16-inch (M4 Pro, 20 GPU cores, 48 GB) on macOS 27.2 beta, driving its built-in XDR panel
and a Sony A95L TV over HDMI. The goals:

- **About 1080p internal rendering at the highest sustainable frame rate**, with correct game speed, physics,
  animation, audio and saves. Stable frame pacing matters more than an FPS counter.
- **Genuine HDR**: the game's own scene highlights carried to the display, not a brightened SDR image.
- **Excellent DualSense support**, without breaking the existing background automation pad.
- **A clean fullscreen default**, with one shortcut for an HDR and performance dashboard.

This is the specification phase. No production emulator code is written yet.

---

## 2. What we learned

1. **The game's HDR exists, and one pass throws it away.** In RenoDX's published reconstruction of TOTK's tonemap
   pass, it reads float scene and bloom inputs, applies a known `1 - e^-x` curve, then `saturate()` clips everything
   above 1.0 [D] (R02 verification: a reconstruction, not the game binary; the capture session confirms it). After
   that, Ryubing is 8-bit from end to end (R02 Summary, §3).

2. **No existing HDR solution runs on this Mac.** RenoDX mod 175 is real scene HDR, but it is a Windows ReShade
   add-on that matches CRC32 hashes of host SPIR-V, which Ryubing on macOS generates differently. MacShade is SDR only.
   Beast Roofer inverse-tonemaps the final 8-bit frame and ships for Windows only. RenoDX's generic MIT maths is
   reusable; none of the three can be used as delivered (R01 Summary, verification).

3. **The Mac display stack can already show EDR; Ryubing just never asks.** An `RGBA16F` swapchain with
   `EXTENDED_SRGB_LINEAR` turns on EDR in MoltenVK, and KosmicKrisp enables EDR only for float formats. That pair
   works on both backends [D] (R03 §3, §4). Live headroom on this panel read 16.0 potential and 2.67 current [M], so
   highlights may have only about 1.4 stops above paper white at high brightness settings [I] (R03 Summary; R04
   Summary, verification).

4. **The hypervisor is the biggest CPU lever, but it brings flashes.** In the Room of Awakening, the game ran at
   20.0 FPS with the hypervisor Off and 29.4-30.8 FPS with it On, with 10 flashes in 850 s. Write tracking costs about
   27% of the guest main thread with it Off. The local A+B fix needs the hypervisor and has been validated only by
   compilation: the patched tree passes the 83 memory-project unit tests, but A+B has never been tested in game [E]
   (R05 Summary).

5. **Higher frame rates need a game-time patch, and 60 is not yet reached.** Vanilla TOTK steps game time per vsync.
   The owner's D2 patch steps it from measured frame time, and kept walk-test speed within 0.995-1.005. It reached
   44.8-50.9 FPS on Great Sky Island, 38.4-45.2 under Hyrule Castle and 25.8-28.2 in the Room [E] (R06 Summary). The
   island looks GPU-bound at about 21 ms of GPU per frame at 1.2x, an upper bound from summed Metal HUD times, so 60
   FPS probably needs roughly 20% less GPU work [M]/[I] (R05 Summary, verification).

6. **There is no true frame-time measurement yet.** The status bar averages over a 750 ms window (R09 verification),
   and the Metal HUD reports host presents, not game frames [E] (R06 §5, R09 Summary). A per-frame telemetry ring
   comes first.

7. **Pacing depends on the display, and HDMI VRR is unproven.** ProMotion moves in 4.17 ms steps [M], so 45 FPS
   cannot be held evenly; 30, 40, 48 and 60 can [I, arithmetic verified] (R06 Summary, verification). Apple's
   documents conflict on HDMI VRR, and no report shows it working with a Sony TV on macOS [D]/[A] (R06 §4).

8. **The graphics layer is in transition, and Dolby Vision is closed.** Khronos deprecated MoltenVK on 2026-10-13
   (commit `0aa76ad`) and recommends KosmicKrisp [D]. Ryubing's own native Metal backend was reverted in #701 [D] (R05
   Summary). macOS has no public Dolby Vision signalling API and Dolby's SDK is open only to incorporated entities
   [D]. One third-party lab measured 136-216 ms of lag in the A95L's Dolby Vision Game mode against 8-17 ms in HDR10,
   on unstated firmware [M-third-party] (R08 Summary, §2).

The DualSense already works through SDL3; its gaps (rumble sides, lightbar, a 10 ms polling pump, adaptive
triggers) are narrow (R07 Summary).

---

## 3. Chosen architecture

TOTK Luma is a **Ryubing fork pinned at `475615f`, kept as an ordered, flag-gated patch queue**. With every flag off,
the build is stock. It uses one pinned .NET toolchain, with no Xcode or Swift in v1. Mac glue goes through C#
interop (ADR 0001 D1, D10).

Changes enter through five narrow seams: a telemetry ring, an output stage, a display helper, a guest-shader-hash
registry and a composite gamepad driver. Everything TOTK-specific lives in a **private, owner-local title pack**
that never enters a public repository. This covers the D2 patch, shader hashes, replacement shaders and the
render-target allow-list.

MoltenVK `1.4.2-ryujinx.5` stays the backend, and KosmicKrisp is a gated variant (ADR 0001 D2). One Luma output stage
in the Vulkan present path owns the picture. It applies each display's profile against live headroom, draws the UI and
dashboard, and presents one RGBA16F extended-linear drawable (ADR 0002 D4, D9). Caps are guest vsync rates plus D2
(ADR 0003). Input uses SDL3 with small patches and owner-wins arbitration (ADR 0004). Dolby Vision is not pursued
(ADR 0005). Optional looks run in two fixed stages (ADR 0006).

```
 TOTK (guest GPU work, float scene + bloom)
        |
        v
 [A] Tonemap replaced by guest shader hash        (title pack; P3)
     vanilla curve below a pivot, roll-off to profile peak, no saturate()
        |
        v
 [C] Allow-listed render targets upgraded RGBA8 -> RGBA16F   (host only; P3)
 [B] HDR-safe sharpen/scale: encode, filter, decode         (P3)
        |
        v
 Ryubing presenter -> Luma output stage (Vulkan Window.Present; P1)
     decode -> EETF vs live headroom -> display looks -> UI at UI white
     -> dashboard, scopes, calibration patterns -> encode
        |
        v
 Swapchain: R16G16B16A16_SFLOAT + EXTENDED_SRGB_LINEAR, EDRMetadata nil
        |   (MoltenVK today; KosmicKrisp as a gated variant)
        v
 CAMetalLayer with EDR, toneMapMode = never (C# display helper)
        |
        +--> Built-in XDR panel: relative EDR, paper white 1.0, peak = live headroom
        +--> Sony A95L over HDMI: HDR10, paper white 203 nits, measured peak
```

Until P3 passes its gates, the output stage shows SDR, or a labelled "Expanded SDR" fallback. That fallback is never
called HDR (ADR 0002 D3).

---

## 4. Phases at a glance

P1 and P2 can run in parallel. P0-P4 total about 11.5-25 person-weeks [I]. A strict bottom-up sum can run higher
([03-plan-and-effort.md](03-plan-and-effort.md) §4).

| Phase | Delivers | Effort [I] | Key exit gates |
|---|---|---|---|
| P0 Foundation | Pinned, reproducible fork; telemetry ring; A+B tested in game; warm and cold baselines | 1.5-3 pw | G-BUILD, G-TEL, G-AB, G-INP-1/2 |
| P1 Visible EDR | Output stage, display helper, dashboard core, calibration on both displays | 2-4 pw | G-HDR-0, G-PRES-1, G-UI-0 |
| P2 Paced frame rate | Per-display caps, D2 from the title pack, timed presents, DualSense v1 | 2-4 pw | G-CAP, G6-4, G-INP-6 |
| P3 Scene HDR | Tonemap replacement, RGBA16F allow-list, HDR-safe post pass | 4-10 pw | G-HDR-2/3/4, else Expanded SDR |
| P4 Polish | Waveform, counters, looks, presets, troubleshooting | 2-4 pw | G-UI-1/2, G-LOOK-1/2 |
| P5 Gated tracks | KosmicKrisp, native presenter, haptics, triggers, reshadefx, and more | per track | written go/no-go each |

A **minimum showcase** (P0 + P1 + P2 + Expanded SDR) is about 6-12.5 pw [I]. It does not deliver scene HDR.

---

## 5. The demo

[`demo/`](../demo/README.md) is an interactive web page for **visual-scope approval**. It shows the fullscreen
default, the dashboard, calibration, caps, presets and controller screens.

It is **not** evidence of anything. The game view is an original procedural scene, HDR is previewed in SDR, and every
number is simulated. Where the demo and the specification differ, the specification and ADRs win
([06-ux-spec.md](06-ux-spec.md) §1.1).

---

## 6. Where to read more

- **Decide:** [APPROVAL.md](APPROVAL.md) and the [ADR index](adr/README.md).
- **What and how well:** [01-requirements.md](01-requirements.md).
- **What could go wrong:** [02-unknowns-risks-and-gates.md](02-unknowns-risks-and-gates.md).
- **When and how much:** [03-plan-and-effort.md](03-plan-and-effort.md).
- **How it is checked:** [04-test-acceptance-matrices.md](04-test-acceptance-matrices.md) and
  [05-rollback-and-reproducibility.md](05-rollback-and-reproducibility.md).
- **What the owner sees:** [06-ux-spec.md](06-ux-spec.md).
- **Where each owner requirement is covered:** [README.md § Requirement coverage](README.md#requirement-coverage).
- **Full index:** [README.md](README.md).
