# ADR 0005: Dolby Vision position

- **Status:** Proposed, awaiting owner approval
- **Date:** 2026-11-01
- **Covers:** D7 (Dolby Vision)
- **Related:** [0002](0002-hdr-pipeline-and-presenter.md) (the HDR10 / EDR path that must stay independently viable)

Tags: `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal; `[M-third-party]` measured by an outside lab;
`Rnn §x` research notes. This record is **research only**: it plans no Dolby Vision implementation, no reverse
engineering and no commercial compliance work.

---

## Context

- **No public macOS API emits Dolby Vision (DV) signalling**, and Apple documents that "Dolby Vision and HLG are
  converted to HDR10 when viewed on other HDR10-compatible external displays" [D] (R08 §3).
- **Game-side DV needs Dolby's licensed SDK** (SIDK, "Licensed product"); Dolby "only accept[s] requests from officially
  incorporated entities" [D] (R08 §1). A personal project cannot qualify as an individual.
- **Signalling.** The TV advertises DV modes in an EDID vendor-specific data block (VSVDB), which open tools can decode;
  the source signals its choice in a Dolby InfoFrame (VSIF), whose layout Dolby does not publish [D] (R08 Summary).
  Even a known VSIF layout would not help, because macOS has no InfoFrame API [D]/[I].
- **On the A95L,** DV gaming at up to 4K120 is reported [D-secondary]. One lab measured 216 ms (4K60) and 136 ms
  (4K120) input lag in DV Game mode, against 8-17 ms in HDR10 Game mode, and reports VRR and 4K120 lost on Xbox in DV
  mode [M-third-party] (R08 §2). Firmware was not stated and the page is internally inconsistent (R08 §2, verification).
- **Benefit.** DV's 12-bit container and per-scene metadata matter most when the TV does the tone mapping. Luma tone
  maps at the source to a measured panel peak (ADR 0002), so DV would add little [I] (R08 §4). Per-scene adaptive
  peak detection over HDR10 / EDR gives a "DV-like" result with documented open techniques [D]/[I] (R08 §4).
- **Open RPU libraries** (`dovi_tool` / `libdovi`, MIT) parse and generate metadata in video bitstreams; nothing in them
  makes a TV enter DV mode [D] (R08 Summary).

**Dolby Vision against HDR10 / EDR on the real stack**

| Aspect | Built-in XDR panel | Sony A95L over HDMI |
|---|---|---|
| Gaming support | None for games. DV is a video-playback feature on this panel, and the panel is internal, so there is no DV signalling at all [D] (R08 §3). The only route would be encoding each frame as DV HEVC for an AVFoundation layer, rejected for latency [I] | The TV accepts DV gaming up to 4K120 [D-secondary]. The Mac cannot send it: macOS converts DV to HDR10 on external displays and has no InfoFrame API [D] (R08 §3) |
| Image-quality benefit over Luma's path | None expected. Luma already maps to live EDR headroom, and Apple does not document its own DV-to-EDR mapping [I] | Small. DV's 12-bit transport and TV-side per-scene mapping matter mainly when the source does not tone map to the panel; Luma does (ADR 0002) [I] (R08 §4) |
| Metadata | `CAEDRMetadata` covers HDR10 and HLG only; Luma keeps it nil [D] (R08 §3) | What static HDR10 metadata macOS sends is undocumented; Luma does not rely on MaxCLL or MaxFALL [I] |
| Latency | No TV processing; the output stage's own cost is measured in P1 (test PIPE-20) | DV Game mode 136-216 ms against 8-17 ms in HDR10 Game mode; VRR and 4K120 reportedly lost in DV mode on Xbox [M-third-party] (R08 §2) |
| Access and reuse constraints | No public API to use, so nothing to license | SIDK only for incorporated entities [D]; VSIF layout unpublished by Dolby; GPL driver code that exposes one is not a specification and is not reused [D] (R08 Risks) |

Unknowns that stay open and do not block anything: the A95L's DV mode set (TV-led, low-latency or both, settled
read-only by G-DV-EDID), DV Game-mode lag on current firmware, and DV black handling in Game mode (parked in
[02 §2.10](../02-unknowns-risks-and-gates.md)).

---

## Decision

1. **Dolby Vision is not pursued.** HDR10 to the A95L and EDR on the built-in display are the only HDR paths, and
   nothing in the design may depend on DV.
2. **"DV-like" quality is delivered as Luma features** instead:
   - measured per-display profiles;
   - HGIG-style source tone mapping to the measured peak (ADR 0002);
   - an optional per-scene adaptive peak with temporal smoothing, scene-cut reset and per-profile trims (P5), with the
     detected scene peak and active knee shown in the dashboard so the effect is testable.
3. **A95L settings:** HDR10 Game mode for play; the Mac's HDMI input is never set to a DV signal format.
4. **Honest dashboard:** if the TV ever reports "Dolby Vision", the dashboard flags it as an unexpected mode.
5. **Static HDR10 metadata:** Luma must not rely on MaxCLL or MaxFALL being honoured, because what macOS sends in the
   HDMI InfoFrame is undocumented [I] (R08 implication 4).
6. **Watching brief (research only):**
   - once per major macOS SDK, grep the headers for `DolbyVision`, `InfoFrame` or an HDMI HDR-mode API, and re-read
     Dolby's eligibility wording;
   - read the A95L EDID once, read-only, and decode its DV VSVDB with `edid-decode`, for documentation only, during the
     A95L profile session.
7. **Reuse constraints recorded, nothing more:** no Dolby-confidential formats are described or shipped, even where
   GPL vendor drivers expose a VSIF layout in code; no libplacebo code is copied without LGPL compliance (R08 Risks).

**What would have to change to reopen this (all research-only):** a public macOS API that emits DV or InfoFrames, plus
eligible access to a Dolby licence, plus evidence that DV Game mode on current A95L firmware no longer costs the latency
and VRR above. Decompilation is neither necessary nor sufficient: without an output path on macOS it cannot help [I].

---

## Alternatives considered

| Option | Strengths | Why not chosen | Evidence |
|---|---|---|---|
| **HDR10 / EDR with source tone mapping, plus an optional "DV-like" adaptive peak (chosen)** | Full control; low lag class; no licence | Static metadata behaviour of macOS unknown | R08 Options A, B |
| Real DV output (Dolby SIDK or Unreal plug-in plus a VSIF) | TV-side per-scene mapping, 12-bit | Licensed, incorporated entities only [D]; no public macOS signalling path [D]; 136-216 ms lag measured in DV Game mode [M-third-party] | R08 §1, §2, §3 |
| Encode frames as DV HEVC and play them through AVFoundation | Uses Apple's licensed decoder | DV mapping on the built-in display only, HDR10 on the TV; encode and decode latency far over the frame budget [D]/[I] | R08 Options D |
| Reverse engineer Dolby signalling | None that applies | Out of scope by the owner's rule; legal risk; still no macOS output path [I] | R08 Risks |
| Inline HDMI device to "add" DV | Not software | No such product found; would be a purchase | R08 Options E |

---

## Consequences

**Positive**

- No effort is spent on a path that cannot reach either display.
- HDR10 / EDR stays independently viable and is the only thing to calibrate.

**Negative**

- No TV-side per-scene mapping; the optional adaptive peak must match that benefit at the source.
- Some third-party evidence (lag figures, RTINGS data) could not be fully read, so the A95L DV picture remains partly
  secondary [D-secondary]/[M-third-party].

---

## Evidence gates and kill criteria

| Gate | What it checks | Cost |
|---|---|---|
| G-DV-EDID | A95L VSVDB decoded read-only: Standard, Low-Latency or both, and version | About 0.5 h in the A95L session |
| G-DV-WATCH | SDK header grep and Dolby eligibility wording, per major macOS release | About 1 h per release |
| G-DV-PEAK | The scene-adaptive peak starts only after P3 exists; GPU budget about 0.3 ms or less [I] | Decided in P5 |

**Kill criterion for the DV-like extension:** if the adaptive peak exceeds its GPU budget or causes visible pumping
in the owner's side-by-side, it stays off.

---

## Effort range

All [I], from R08.

| Item | Range |
|---|---|
| DV implementation | None planned |
| EDID decode | about 0.5 h |
| Watching brief | about 1 h per major SDK release |
| Optional scene-adaptive peak | 1-3 engineer-weeks, plus 2-4 days of validation per display profile |

---

## Open questions for the owner

1. Approve Dolby Vision as "not pursued", with the light watching brief?
2. Approve the read-only A95L EDID decode during the display session?
3. Is the optional "DV-like" scene-adaptive peak wanted in P5, or should it wait for owner feedback on static profiles?
