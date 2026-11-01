# ADR 0006: Visual effects, defog and ReShade-style support

- **Status:** Proposed, awaiting owner approval
- **Date:** 2026-11-01
- **Covers:** D8 (visual effects)
- **Related:** [0002](0002-hdr-pipeline-and-presenter.md) (tonemap replacement and output stage, where the looks run)

Tags: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal; `[E]` prior local evidence; `Rnn §x`
research notes. All effort figures are estimates `[I]`.

---

## Context

- **Grade before the tone map where possible.** Haze is additive in linear radiance, so defog is only physically
  meaningful on scene-linear values. A saturation boost before the tone map is compressed with everything else; after
  it, clipped highlights are pushed out of gamut. On today's 8-bit SDR frame any look is a display-referred
  approximation [I] (R09 Summary, §1c).
- **Colour spaces.** Oklab for relative (scene-stage) chroma; ICtCp for absolute (display-stage, nits) chroma; add
  highlight-aware desaturation near the profile peak and soft gamut compression into the panel gamut [D]/[I] (R09 §1c).
- **No source wide-gamut data exists.** Any P3 "vivid" mode is a creative expansion, not recovered information [I]
  (R02 §3).
- **Serfrost Base Defogger v2.4** (CC BY-NC-ND 4.0) edits only EnvPalette and CavePalette, is listed for all updates,
  and boots on 1.4.3 with no regression; its visual effect has not been shown in a same-framing A/B [D]/[E] (R09 §1a,
  [E] §6). It may be installed by the owner but never bundled or redistributed.
- **Depth-aware post defog is high-risk:** Ryubing has no depth hand-off, the presented frame already contains the UI,
  dynamic resolution changes target sizes, and particles, clouds and water write no reliable depth [I]/[D] (R09 §1b).
- **ReShade-style options on this Mac** (R09 §2, Options compared):

  | Candidate | Fit | Float / HDR | Licence |
  |---|---|---|---|
  | Built-in compute shaders in the output stage | High | Yes | Ours |
  | reshadefx compiler embedded on Ryubing's Vulkan device | Medium-high; runs ReShade FX | Yes (`rgba16f`); embedder must define `BUFFER_COLOR_SPACE` itself [D] (R09 verification) | BSD-3 |
  | librashader | Medium; runs RetroArch slang presets, not ReShade FX | Yes | MPL-2.0 or GPLv3 |
  | MacShade | Low; untested on .NET, needs a re-signed copy, injection sees keyboard events | No (BGRA8 with `saturate()`) | BSD-3 |
  | vkBasalt | Very low; needs the Vulkan loader, which Ryubing bypasses | Partly | Zlib |

- **Licence hazards:** Lilium and Special K are GPL-3, AstrayFX is CC BY-ND, Serfrost is NC-ND [D] (R09 Risks).

---

## Decision

1. **Luma ships its own looks as two fixed grading stages**, both built in, neutral by default, with three strengths:

   | Stage | Where | Operations, in order |
   |---|---|---|
   | Scene stage | Inside the replaced tonemap shader (ADR 0002), parameters in the support buffer | Defog by airlight subtraction, then exposure and white balance, then Oklab vivid |
   | Display stage | Inside the output stage, in nits | ICtCp highlight-aware chroma, then soft gamut compression to P3, then UI and overlay, then encode |

2. **Until scene capture exists** (before P3), only the display stage runs, on the linearised SDR frame, and the dashboard
   shows "approximate".
3. **The dashboard always shows which stage is active**, so a punchier SDR look is never mistaken for HDR.
4. **Defog priority:**
   1. Serfrost Base Defogger v2.4, installed by the owner, never bundled, verified by checksum, and judged by a
      same-framing A/B in a hazy area (G-LOOK-1);
   2. scene-stage airlight subtraction (P3 onwards);
   3. display-stage luminance-weighted subtraction with blue-noise dithering (fallback).

   No depth-based defog.
5. **ReShade FX support comes later** by embedding the reshadefx compiler (BSD-3, SPIR-V back end) on Ryubing's own
   Vulkan device at the output stage, behind gate G-FX. No Windows add-on ABI compatibility is attempted.
6. **librashader is not adopted** (wrong shader format for the requirement).
7. **MacShade** is allowed only as an optional, owner-approved SDR experiment on a separate ad hoc copy, outside the
   default path.
8. **Licence hygiene:** ideas only from GPL, ND and NC sources; never code or payloads in any Luma repository.

---

## Alternatives considered

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **Two built-in grading stages (chosen)** | Correct domain for each operation; reuses passes Luma already owns, so no extra full-screen pass | Scene stage waits for P3 | R09 implication 1; R02 implication 7 |
| Display-stage grading only, permanently | Simple; available now | On an 8-bit source, boosts amplify banding and push clipped highlights out of gamut; defog is only meaningful scene-linear [I] | R09 §1c |
| MacShade or vkBasalt as the effects host | Existing ReShade ecosystem | MacShade is BGRA8 with `saturate()`, untested on Ryubing, and its injection sees keyboard events; vkBasalt needs the loader Ryubing bypasses | R09 §2; R01 §2 |
| librashader | Mature, float-capable | Runs slang presets, not ReShade FX, so it does not meet "ReShade-style" [D] | R09 §2 |
| Depth-aware post defog | Physically motivated | No depth hand-off; UI already in frame; dynamic resolution; would need guest constant-buffer decoding | R09 §1b |
| Bundle Serfrost | Zero setup | Licence forbids redistribution (NC-ND) [D] | R09 §1a |

---

## Consequences

**Positive**

- Vivid and defog cost days, not weeks, and look natural in HDR because they run in the right domain.
- The ecosystem path (ReShade FX) stays open without depending on Windows binaries.

**Negative**

- Before P3 the looks are approximate, and the dashboard must say so.
- Strong strengths on 8-bit sources risk banding; per-frame airlight estimates need temporal smoothing [I] (R09 Risks).
- A partial ReShade FX runtime can break effects subtly (intrinsics, compute, storage formats) [I].

---

## Evidence gates and kill criteria

| Gate | What it checks | Outcome |
|---|---|---|
| G-LOOK-1 (owner attended) | Same save, time, weather and framing; window-capture A/B of Serfrost Base in a hazy surface area | Pass: recommended defog. Fail: built-in defog only |
| G-LOOK-2 | Banding on ramps at each strength; temporal stability of the airlight estimate | Fail: reduce the maximum strength or add dithering |
| G-FX | reshadefx embedding starts only after P4, and only if the owner names effects the built-in looks cannot provide | Otherwise not started |
| G-UI-1 (shared with ADR 0002) | Looks plus scopes stay within the measured output-stage budget | Fail: simplify |

**Kill criterion:** a look that fails G-LOOK-2 at every strength is removed rather than shipped with visible banding.

---

## Effort range

All [I], from R09.

| Item | Range |
|---|---|
| Built-in vivid and defog (display stage) | 3-6 days |
| Scene stage | Small once ADR 0002's tonemap replacement exists |
| reshadefx embedding (if G-FX opens) | 3-6 weeks |
| librashader (not adopted) | 1.5-3 weeks |
| Optional MacShade SDR trial (not planned) | 0.5-2 days (R01) |

---

## Open questions for the owner

1. Will you install Serfrost Base Defogger yourself for the defog A/B? It is never bundled.
2. Are there specific ReShade FX effects you want that the built-in looks would not cover (decides G-FX)?
3. Do you want the optional MacShade SDR experiment at all, on a separate copy?
