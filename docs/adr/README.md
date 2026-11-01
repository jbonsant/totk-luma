# Architecture Decision Records

Status of every record: **Proposed, awaiting owner approval** (2026-11-01). Nothing here authorises production emulator
work; each record lists the owner questions that must be answered first.

Tags follow AGENTS.md: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal. `[E]` cites
`docs/evidence/prior-local-evidence.md`; `Rnn §x` cites research notes in `docs/research/`. All effort figures are
estimates `[I]`.

---

## Index

| ADR | Decisions | One-line summary |
|---|---|---|
| [0001](0001-architecture-and-delivery.md) | D1, D2, D10 | A Ryubing fork at `475615f` as a flagged patch queue with one .NET toolchain and TOTK specifics in a private title pack; MoltenVK `1.4.2-ryujinx.5` stays the baseline with selective improvements first (telemetry, A+B, scale, concurrent compile, FencePool) and KosmicKrisp as a gated variant; no native Metal backend; separate fork repository, per-variant bundle ids and data roots, pinned SDK and lock files, and a four-step rollback ladder |
| [0002](0002-hdr-pipeline-and-presenter.md) | D3, D4, D9 | Genuine scene HDR by replacing TOTK's tonemap by guest shader hash, an HDR-safe post-tonemap pass and an allow-listed RGBA16F upgrade; output through a backend-portable in-swapchain Luma output stage (RGBA16F + extended-linear sRGB, `EDRMetadata` nil, `toneMapMode = never`); the Swift presenter is a gated MoltenVK-only option; dashboard and calibration drawn in the same drawable with Dear ImGui draw lists; UI at paper white × 0.85 |
| [0003](0003-frame-pacing-caps-and-vrr.md) | D5 | Caps are guest vsync rates plus the owner-supplied D2 patch (30 only without it); per-display menus driven by cadence fit, with 45 shown with a warning and 40 or 48 suggested unless HDMI VRR is verified; build order: telemetry, timed presents, display-locked vsync, host LFC, movie auto-30 |
| [0004](0004-input-dualsense-and-automation.md) | D6 | SDL3 HIDAPI plus small tested patches for v1, a composite driver with owner-wins arbitration that preserves the agent pad without touching keyboard, mouse or focus, mute button as the dashboard toggle, USB for measurement, and haptics and adaptive triggers on a separate track |
| [0005](0005-dolby-vision-position.md) | D7 | Dolby Vision is not pursued (no macOS signalling path, licensed SDK, high DV Game-mode lag); HDR10 / EDR is the only HDR path; a light watching brief and a read-only EDID decode remain |
| [0006](0006-visual-effects-and-reshade-style-support.md) | D8 | Built-in looks in two fixed stages (scene-linear before the tonemap, display-stage in nits after it), defog via the owner-installed Serfrost mod first, reshadefx embedding only behind a later gate, librashader not adopted |

---

## How the D4 presenter conflict was resolved

R10 wanted a Swift dylib owning the visible layer; R03 called that hybrid the target after an in-swapchain spike; R09
wanted the overlay inside Ryubing's Vulkan present pass. ADR 0002 makes R09's model plus R03's in-swapchain path the
**product**: one Luma output stage inside Vulkan `Window.Present`, drawing scene, UI, dashboard and patterns into one
RGBA16F + `EXTENDED_SRGB_LINEAR` drawable. The reasons: it is the only presentation that both MoltenVK and KosmicKrisp map
to EDR [D] (R03 §3.2, §4); the hybrid depends on `VK_EXT_metal_objects`, which only the now-deprecated MoltenVK provides
[D]; and drawing the dashboard in Vulkan removes R03's own trigger for the hybrid. The native presenter stays as a
gated, MoltenVK-only P5 option behind the same seam.

---

## Phased plan

Phases P1 and P2 can run in parallel. Totals for P0-P4: about 11.5-25 person-weeks [I], close to R10's 11-24 for the
hybrid with scene HDR, but with no Xcode toolchain in the critical path.

| Phase | Goal | Effort [I] | Exit gate |
|---|---|---|---|
| P0 Foundation and truthful measurement | Pinned, flag-gated fork; telemetry ring; A+B validated in game; warm baselines; attended DualSense check | 1.5-3 pw | G-BUILD; G-TEL (p50/p95/p99, display timing confirmed); G-AB verdict from at least 900 s; G-INP-1 and G-INP-2 recorded; cold and warm baselines in the three measured scenes |
| P1 Visible EDR and calibration | Output stage, display helper, live headroom, dashboard core, patterns and per-display profiles; A95L sessions; one capture session | 2-4 pw | G-HDR-0 (±1 code value); G-PRES-1; G-PRES-2 recorded; HGIG clip points stored for both displays; capture findings (U1-U5, U8) recorded privately; owner sets the P3 ceiling |
| P2 Correctly paced higher frame rate | Cap UI and policy, D2 from the title pack, timed presents, display-locked vsync, LFC if G6-1 passes; scale, compile and FencePool tests; DualSense v1 patches and arbitration | 2-4 pw | G-CAP for every offered cap and display (p99 at most 1.25x target, speed 1.00 ± 0.01, cadence error published); G6-4; G6-3 resolved or auto-30 in place; 60 only where G-60 holds |
| P3 Genuine scene HDR | Tonemap replacement, HDR-safe post-tonemap pass, allow-listed RGBA16F upgrade, UI boundary model, scene-stage looks hook, source-clip counter | 4-10 pw (highest uncertainty) | G-HDR-2, G-HDR-3 (900 s warm, 0 new artefacts, cost A/B), G-HDR-4 (owner side-by-side); else ship labelled Expanded SDR (3-7 days) |
| P4 Scopes, looks and polish | Waveform, clipping and gamut counters, vivid and defog, Serfrost A/B, presets, troubleshooting guide, OLED auto-dim, labelling audit | 2-4 pw | G-UI-1, G-UI-2, G-LOOK-1, G-LOOK-2; every dashboard number labelled |
| P5 Gated tracks | KosmicKrisp variant, native presenter, GameController shim, PCM haptics, adaptive triggers, Bluetooth haptics, reshadefx, DV-like adaptive peak, write-tracking redesign | Per track (see ADRs) | Each track ends in a written go/no-go with measured evidence; none starts without owner approval |

---

## How the proposals were judged

Three architect proposals were requested. The input contained the full "owner value first" proposal and the opening of
the "maintenance and reproducibility first" proposal (its text was truncated after D1); no third proposal was present.
Scores are the judge's assessment on a 1-10 scale.

| Proposal | Evidence fit | Feasibility | Maintenance | Owner value | Outcome |
|---|---|---|---|---|---|
| Owner value first | 9 | 8 | 8 | 9 | Chosen as the basis |
| Maintenance and reproducibility first (partial) | 8 | 8 | 9 | 7 | Ideas grafted: private title pack, C# interop instead of Swift, the "works unchanged on KosmicKrisp" review test, mostly-new-file seams |

**Orchestration note (added after the judging).** The truncation was an orchestration error: the combined proposals were
cut at a fixed size before they reached the judge. All three full proposals were produced and kept. The orchestrator
afterwards compared the missing "correctness and evidence gates first" proposal, and the full maintenance proposal,
with these ADRs:

- **D1, D2, D4, D5 and D9:** all three proposals independently agree with the decisions recorded here. That is a
  flagged Ryubing patch queue; MoltenVK as the measured baseline with selective improvements first and KosmicKrisp
  as a gated variant; a backend-portable output stage inside Vulkan `Window.Present` writing an RGBA16F extended-linear
  EDR swapchain, with no layer ownership in v1; caps as guest vsync rates plus D2, never Unbounded; and an ImGui
  dashboard drawn into the same drawable.
- **What the gates-first proposal adds:** separate owner-attended display gate sessions, and DualSense v1 as its own
  short phase. Both are already present here, as the P1 A95L session and the P2 input work.

A rerun of the judge would not change any decision.

Judge's own changes: a separate `luma.json` instead of editing Ryubing's `Config.json`; extended-linear sRGB chosen
explicitly for KosmicKrisp portability; ImGui used for draw lists only, rendered by Luma's shader, with a dependency gate
(G-UI-0) and a custom-renderer fallback; a live replay gate for owner-wins arbitration (G-INP-6); the 1.0x scale test
treated as an owner trade-off against the "about 1080p" goal.
