# 08 - Dolby Vision for gaming versus HDR10 / Apple EDR

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: research and documentation only. No reverse engineering, decompilation, disassembly or
restricted-SDK download was done or is proposed. Nothing here assumes that reverse engineering would
be necessary or sufficient.

## Summary

- **Dolby Vision (DV) output is not a viable target for TOTK Luma on the Mac.** No public macOS API
  emits DV signalling, and Apple documents that DV is converted to HDR10 on external HDR10 displays
  [D] [9] [10]. Confidence: high.

- **Game-side DV needs a licensed Dolby SDK.** Dolby ships a "Software Implementation Development Kit"
  (SIDK), labelled "Licensed product", and says it "only accept[s] requests from officially incorporated
  entities" [D] [2]. A personal-use project cannot qualify as an individual. Confidence: high for what is
  written, medium for how it is enforced.

- **Xbox Series X|S was the first console with DV gaming** ("the first game consoles to support gaming
  in Dolby Vision", Xbox Wire) [D] [1], and no other console with DV gaming was found as of 2026-11-01 [I].
  It launched on 2021-09-28 and works with ALLM, VRR and up to 120 FPS, depending on the TV [D] [1].
  Xbox also has a zero-integration "platform solution" that applies "a one-size-fits-all mapping" with "No tone mapper tweaking available" [D] [2].

- **Source-led ("low-latency", LLDV) versus TV-led ("standard") DV is a signalling choice.** The TV
  advertises which modes it accepts in a Dolby vendor-specific video data block (VSVDB) in its EDID,
  and open-source tools decode it [D] [6]. The source then signals its choice in a Dolby vendor-specific
  InfoFrame (VSIF). That VSIF layout is not decoded by the reference open-source EDID/InfoFrame tool,
  and Dolby does not publish it [D] [6]. Some GPL-licensed vendor kernel source for set-top-box chips
  does build a Dolby VSIF, but that is not an authoritative Dolby specification, and this project does not
  study, describe or reuse it [D] [23]. This does not change feasibility: macOS has no InfoFrame API
  (section 3).

- **The Sony A95L supports DV gaming at up to 4K120**, according to RTINGS (reported as a first for Sony)
  [D-secondary: search summaries only; the page body is paywalled and could not be read on re-check]
  [14]. But one lab measured 216 ms (4K60) and 136 ms (4K120) of input lag with DV in Game mode,
  against 8 to 17 ms in HDR10 Game mode. It also reports that VRR and 4K120 are lost on Xbox when the
  HDMI port is in DV mode [M-third-party] [15]. RTINGS' detailed DV latency data could not be read
  (paywall). Confidence: medium.

- **Whether the A95L's DV path is TV-led, source-led or both is not publicly documented** for this model.
  Older secondary sources say Sony moved to LLDV-only on earlier models [D-secondary] [5] [A] [19].
  This is resolvable read-only by decoding the A95L's EDID (see the evidence gates).

- **DV adds little to an HGIG-style pipeline that already tone maps to a measured panel peak.** Its
  12-bit container and per-scene metadata matter most when the *TV* does the tone mapping. Luma does
  its own source-side tone mapping. Per-scene adaptive tone mapping over HDR10/EDR gives a "DV-like"
  result without any licence [I], using documented open techniques (for example libplacebo's
  scene-adaptive peak detection) [D] [18].

- **Open RPU libraries solve parsing, not signalling.** `dovi_tool` / `libdovi` (MIT) parse, edit and
  generate RPU *bitstream* metadata for video files [D] [17]. Nothing in them sends a DV VSIF over HDMI or
  makes a TV enter DV mode.

- **HDR10 / EDR must remain independently viable and is the only planned HDR path.** DV is recorded as
  "not pursued", with a light watching brief [I].

## Findings

### 1. How Dolby Vision gaming works

**Xbox Series X|S.** Microsoft launched DV gaming on 2021-09-28 [D] [1]. The announcement lists
compatibility with DirectX Raytracing, ALLM, VRR and "up to 120 FPS depending on the capabilities of
your TV". It recommends ALLM, and warns that TVs not yet optimised "may experience latency issues"
[D] [1] (the official post was fetched directly during independent verification).

LG shipped firmware adding 4K120 DV gaming to its 2020 and 2021 OLEDs [D-secondary] [22].

**Two Dolby routes for developers** [D] [2] [3]:

| Route | What the game does | Dolby's stated properties |
|---|---|---|
| Xbox platform solution | Nothing. "Auto-enabled on the 2104 GDK. No extra integration needed" | "one-size-fits-all mapping", "No tone mapper tweaking available", "No GPU resources used", "Only on Xbox Series X and Series S" |
| SIDK (engine integration) | Integrates Dolby's tone mapper and metadata into the renderer | "Customize the rendering pipeline", "Allocate GPU resources as desired", "Licensed product" |
| Unreal Engine plug-in | Same as the SIDK, packaged for UE | Obtained by signing up with Dolby; secondary reports say Windows 10+ and Xbox Series only [D-secondary] [4] |

Dolby's developer page pitches "Master your game once in Dolby Vision — the in-game Dolby Vision tone
mapper will generate consistent and matching outputs" for DV, HDR10 and SDR displays. It lists
"scene-based metadata" and "per-target artistic trims", 12-bit depth and mastering from 1,000 up to
10,000 nits [D] [3].

**Who generates the RPU (dynamic metadata) in games.** In film and TV, the reference processing unit
(RPU) metadata is authored offline in a grading suite. In games it must come from the running engine
(through the SIDK or plug-in) or from the platform (the Xbox platform solution derives it with no title
input) [D] [2] [I].

Public pages do not describe the real-time metadata algorithm, whether metadata is per frame or per
scene in practice, or the exact HDMI mode Xbox uses for games. These are recorded as unknowns.

**Source-led (LLDV) versus TV-led (standard)** [D-secondary] [5]:

- **TV-led ("STD").** The source sends the DV base signal plus the RPU embedded in the video. The TV
  performs display management (tone mapping) using its own panel knowledge. Semtech notes that TV-side
  processing produced different latencies on different TVs.
- **Source-led / low latency ("LLDV").** Introduced in the "Dolby Vision HDMI transmission
  specification, version 2.9". "Processing (metadata handling and tone mapping) moves to the source
  device" and "metadata is not sent to the sink". The output is described as 12-bit 4:2:2 PQ, BT.2020.
  Semtech calls LLDV "mandatory for DV devices" and STD "no longer required" (a secondary claim, 2020).
- Microsoft exposes this distinction as public Windows API surface. `HdmiDisplayHdrOption.DolbyVisionLowLatency`
  ("the low-latency profile for Dolby Vision") was added in Windows 10 1809, and
  `HdmiDisplayMode.IsDolbyVisionLowLatencySupported` also exists [D] [7] [8]. Xbox One gained LLDV with
  system update 1810 [D-secondary] [5].

**HDMI signalling**:

- **VSVDB (sink to source, in the EDID).** This is a CTA-861 vendor-specific video data block with the
  Dolby OUI `0x00D046` [D] [6] (`oui.h:11`). `edid-decode` decodes versions 0, 1 and 2 [D] [6]
  (`parse-cta-block.cpp:1794-1907`). The fields include:
  - target min/max luminance (PQ) and primaries;
  - the DM version;
  - "Supports YUV422 12 bit" (line 1800);
  - v1 "Low Latency: Standard + Low Latency / Only Standard" (line 1836);
  - v2 "Interface: Low-Latency / Low-Latency + Low-Latency-HDMI / Standard + Low-Latency / ..." (line 1877);
  - "Supports 10b 12b 444" (line 1884).

  This block tells the source which DV modes the TV accepts and, for LLDV, the target luminance it must
  map to.
- **VSIF (source to sink, per frame).** This is the vendor-specific InfoFrame by which the source signals
  DV. `edid-decode`'s InfoFrame parser decodes only the HDMI and HDMI Forum OUIs. Any other vendor
  InfoFrame, Dolby's included, is dumped as a raw payload [D] [6] (`parse-if.cpp:329-337`). No public,
  authoritative Dolby VSIF specification was found; it appears to be a licensee document [I]. Some GPL
  vendor driver code fills such an InfoFrame, and its comments cite a "DV Spec version2.9" [D] [23].
  This note deliberately does not reproduce, locate or describe that layout (see Risks).
- **"RGB tunnelling" (TV-led).** Community sources describe TV-led DV as 12-bit YCbCr 4:2:2 plus
  embedded metadata, carried in a link that is signalled as 8-bit RGB 4:4:4 (same data rate). Players
  report DV appearing as "8-bit RGB" on the link [A] [19]. This is consistent with Semtech's note that
  STD mode embeds metadata in the pixel data [D-secondary] [5]. The exact bit packing is not publicly
  specified [I].

**4K120 and latency claims.** Dolby's public developer pages make no latency claim [D] [3]. Microsoft
claims "up to 120 FPS" subject to the TV and recommends ALLM [D] [1]. LLDV's rationale is lower and more
uniform latency, because TV-side processing is skipped [D-secondary] [5].

Real-world latency is TV-specific. On the A95L, one lab measured very high latency in DV Game mode
(section 2). An unsourced article claims LG C1 DV Game-mode lag of about 15-17 ms. That is too weak to
use [A].

**Licensing and SDK access (publicly known)** [D] [2] [3]:

- the SIDK is a "Licensed product";
- requests are accepted only "from officially incorporated entities";
- access goes through a contact form or Dolby Developer Relations (a games contact address is given in secondary sources);
- the logo is available to Xbox platform-solution titles, while SIDK titles must contact Dolby for logo use [D-secondary] [4].

No fees, NDA terms or certification steps are published. These are unknown. Any TV or source device
that implements DV is itself a Dolby licensee [I].

### 2. Sony A95L

| Item | Finding | Tag | Source |
|---|---|---|---|
| DV support | Yes (RTINGS "Dolby Vision: Yes") | [D] | [14] |
| DV gaming at 4K120 | "supports Dolby Vision gaming at up to 4k @ 120Hz", described as a first for Sony; the A95K was limited to 60 Hz | [D-secondary] (search snippet only; the page body is paywalled, re-check also failed) | [14] |
| DV gaming at launch | A secondary report says DV gaming was not supported at launch and was added later | [A] | search result, not fetched |
| HDMI 2.1 ports | Two of four inputs do 4K120; one of them is also eARC | [D] | [16] |
| HDR10 Game-mode lag | 8 ms at 4K120, 17 ms at 4K60 (HDR, Game) | [M-third-party] | [15]; RTINGS lists 8.2 ms at 4K120 in Game mode [14] (search snippet) |
| DV Game-mode lag | **216 ms at 4K60 and 136 ms at 4K120** (Game picture mode, DV) | [M-third-party] | [15] |
| DV plus VRR / 4K120 from Xbox | Reviewer: with the HDMI port in DV mode, "the TV does not support VRR or 120 Hz at 4K on an Xbox" | [M-third-party] | [15] |
| Reviewer verdict | "Dolby Vision – Game: NO (no mode with reasonable input lag)" | [M-third-party] | [15] |
| RTINGS DV lag | Not available: detailed results are paywalled. RTINGS' standard tests do not obviously include a DV-specific lag row | access failure | [14] |
| TV tone mapping in Game mode | "HDR Tone Mapping" is on by default in Game mode on 2023 Sony OLEDs; options include Gradation preferred, Brightness preferred and Off. The A95L has no HGIG label as such | [D-secondary] / [A] | [21] |
| TV-led versus LLDV | Not documented for the A95L. Semtech (2020): Sony "will only support LLDV going forward" and removed STD from the A1, X93E, X94E and Z9D; CoreELEC users mention old Sony TVs that do player-led only | [D-secondary] / [A] | [5] [19] |

The DV-lag figures conflict with RTINGS' positive framing, and firmware versions were not stated by
hdtvpolska. The hdtvpolska page is also internally inconsistent: its table lists a 4K120 DV lag
(136 ms) while its text says 4K at 120 Hz is unavailable on Xbox in DV mode (so the 4K120 figure was
presumably taken with another source), and its prose quotes a "216 do 233 ms" range although 233 ms
is the table's film/upscaler row [M-third-party] [15]. Reviewed.com tested on firmware v.112.602.130.1NAA, but did not measure DV lag [16].

The 136-216 ms figures are much larger than any frame-pacing budget in this project. Any DV gaming
experiment on this TV would first have to re-measure them on current firmware [I].

### 3. The Mac side

**DV signalling to an external display: none documented.** Apple's "Play HDR video on Mac" (published
2026-03-10) says the built-in display and Pro Display XDR "support Dolby Vision, HDR10, and HLG". It
also says "Dolby Vision and HLG are converted to HDR10 when viewed on other HDR10-compatible external
displays" [D] [9]. User reports of Infuse on a MacBook Pro agree: HDR10 only over HDMI [A] [20].

The MacBook Pro 16-inch (2024, M4 Pro) HDMI port supports "8K resolution at 60Hz or 4K resolution at
240Hz", so link bandwidth is not the limiter [D] [13].

**DV on the built-in XDR display.** Apple lists DV playback for the built-in display. The tech specs
list "HDR with Dolby Vision, HDR10+/HDR10, and HLG" video playback, with 1,000 nits sustained
full-screen and 1,600 nits peak [D] [13]. The panel is internal (no HDMI), so there is no DV signalling
at all. The OS video stack decodes DV and maps it into EDR headroom [I]. Apple does not document that
mapping.

Apple's 2019 preliminary metadata guide says "Only Dolby Vision Profile 5 is supported" for file
playback [D] [12]. That is dated, and newer OS releases also handle other profiles in practice [I].

**Public APIs (macOS 27.2 SDK, Xcode 27.2 build 27B5019j)** [D] [10] [11]:

| API | What it covers | DV? |
|---|---|---|
| `CAEDRMetadata` (`CAEDRMetadata.h:55, 81, 98, 107`) | `HDR10MetadataWithDisplayInfo:contentInfo:opticalOutputScale:` (SEI MDCV and CLLI), `HDR10MetadataWithMinLuminance:maxLuminance:opticalOutputScale:`, `HLGMetadataWithAmbientViewingEnvironment:`, `HLGMetadata` | **No.** HDR10 and HLG only |
| `CAMetalLayer.EDRMetadata`, `wantsExtendedDynamicRangeContent` (`CAMetalLayer.h:128, 137`) | Tone-mapping hint for an EDR layer | No |
| `CALayer.toneMapMode` (macOS 15+), `preferredDynamicRange` and `contentsHeadroom` (macOS 26+) (`CALayer.h:461, 469, 480`) | When and how the OS tone maps layer content | No |
| `VTHDRPerFrameMetadataGenerationSession` (macOS 15+) | Generates and attaches DV per-frame metadata to a `CVPixelBuffer` / `IOSurface`. Its only format key is `..._DolbyVision` (header lines 48, 54); the API is grouped under "Interface for video compression session clients" (line 69) | Generates DV metadata **for encoding**. It is not display signalling |
| `kVTCompressionPropertyKey_HDRMetadataInsertionMode` (`VTCompressionProperties.h:520`) | Encoder inserts HDR metadata, "e.g. DolbyVision, HDR10" | Bitstream only |
| `AVPlayerHDRModeDolbyVision` (`AVPlayer.h:669`) | Capability flag | `API_UNAVAILABLE(macos)` |
| `IOGraphicsTypes.h` | Only `kIOFBAVSignalTypeHDMI` and dongle-ROM keys | No InfoFrame control |

No public macOS API lets user space write HDMI InfoFrames (static HDR, DV VSIF or otherwise) or choose
the HDMI HDR mode. The HDR mode of an external display is an OS and System Settings decision [D] [9]
[10] [I].

What static HDR metadata macOS actually puts in the HDMI DRM InfoFrame for an HDR10 display, and whether
`CAEDRMetadata` influences it, is undocumented. This is an unknown that matters for the A95L profile
even without DV.

**A path rejected on its face.** Encoding each game frame as DV HEVC (via VideoToolbox) and presenting it
through an AVFoundation video layer would show DV-mapped output on the built-in display. On external
TVs it would still become HDR10 [D] [9]. It would add encode and decode latency far beyond the frame
budget [I]. It is not proposed.

### 4. Image-quality benefit versus HDR10 / EDR for Luma

TOTK 1.4.3 on Switch 1 produces SDR output. Luma's HDR comes from intercepting the game's scene-linear
buffers before the game's tonemap and clip, then doing its own display mapping (see the HDR notes).
The *source* of HDR is therefore Luma's reconstruction, not any DV mastering. DV cannot add highlight
information that Luma does not recover [I].

**What DV's dynamic metadata would add, in principle** [I, reasoning from [3] [5] [6]]:

- **12-bit transport.** This is less banding headroom risk than 10-bit PQ. For rendered and dithered game
  content at roughly 1,000-nit peaks, 10-bit PQ with dithering is already near invisible. The gain is small.
- **TV-side knowledge.** In TV-led mode, the TV applies Dolby's display management using its own panel
  characterisation (ABL behaviour, near-black handling). Luma approximates this by measuring the panel.
- **Per-scene and per-frame metadata.** The TV can map each scene to the panel instead of using one static
  curve. This is valuable when the source does **not** tone map to the panel. Luma does.

**What it would cost:**

- **Latency.** 136-216 ms measured on the A95L in DV Game mode [M-third-party] [15], against 8-17 ms in
  HDR10 Game mode.
- **Features.** VRR and 4K120 were reportedly lost with the DV HDMI port mode on Xbox [M-third-party] [15].
- **Processing control.** In DV mode the TV's DM runs and some picture controls are locked. The A95L's
  DV game-mode black and shadow handling is unmeasured. Raised-black or crushed-shadow complaints about
  DV gaming were searched for and **not** substantiated with a source in this pass [A, unverified].
- **Licensing and access.** See section 5.

**HGIG-style mapping plus per-scene adaptation gives a "DV-like" result over HDR10 / EDR** [I], with
documented building blocks:

1. **Measure each panel.** Measure peak luminance at the relevant window sizes, the ABL curve and the
   black floor, for the XDR (per EDR headroom state) and for the A95L (in Game mode, with HDR Tone
   Mapping set to Off for HGIG-like passthrough; to be confirmed).
2. **Tone map in the source to that measured peak** (HGIG principle). For the TV, send a PQ signal that
   never exceeds the panel peak, so the TV's own mapping is a no-op or close to identity.
3. **Add scene adaptation.** Compute a luminance histogram of the reconstructed scene-linear frame on the
   GPU and use a high percentile as the "scene peak". Smooth it temporally and reset it on scene cuts.
   Then adapt the roll-off knee per scene. This is the open equivalent of DV's L1 (min/avg/max)
   metadata driving display management. libplacebo implements exactly this pattern:
   - `pl_peak_detect_params` with `smoothing_period`, `scene_threshold_low` / `_high` and `percentile`;
   - defaults of 20 frames, 1.0/3.0 and 100 (the HQ preset uses 99.995) [D] [18] (`colorspace.h:151-213`).
4. **On the Mac display**, use `CAMetalLayer` EDR with the measured headroom (dynamic), optionally
   providing `CAEDRMetadata.HDR10...` with the real min/max, or `toneMapMode = never` when Luma owns the
   mapping [D] [10].
5. **Add an optional "trim" UI per profile**, an analogue of DV trims: highlight roll-off strength,
   shadow lift and saturation compression, stored per display profile [I].

The result controls the same things DV's DM controls: per-scene peak, knee and gamut compression. It
runs without a licence and at zero extra TV latency. The panel mapping is done by Luma, where it can be
measured and tested [I].

### 5. Technical requirements, access barriers and reuse constraints

**Technical requirements for real DV output from a game source** [D] [2] [5] [6] [I]:

1. Dolby's tone mapper and metadata generator in the render path (SIDK or UE plug-in), or a platform
   implementation (Xbox).
2. Read and honour the TV's Dolby VSVDB (mode, target luminance, primaries).
3. Produce the DV output format:
   - LLDV: 12-bit 4:2:2 PQ, BT.2020, already mapped;
   - TV-led: 12-bit 4:2:2 plus embedded RPU in an 8-bit-RGB-signalled link.
4. Emit the Dolby VSIF each frame and manage mode switching (hot-plug, HDCP, ALLM/VRR interplay).
5. Control the display engine's output format and bit depth exactly, with no OS colour management or
   dithering touching the pixels (TV-led embeds metadata in pixel LSBs) [I].
6. Pass licensing and certification as a DV source device [I].

**Access barriers:**

| Barrier | Status | Tag |
|---|---|---|
| Licence | SIDK is a "Licensed product" | [D] [2] |
| Eligibility | "only able to accept requests from officially incorporated entities" | [D] [2] |
| NDA, fees, certification | Not published; presumed to exist for licensees | [I] |
| macOS signalling path | No public API for DV output or InfoFrames; Apple converts DV to HDR10 on external displays | [D] [9] [10] |
| Emulator path | Ryubing renders through MoltenVK to `CAMetalLayer`; the Metal backend was removed upstream; the swapchain is 8-bit `B8G8R8A8` with EDR off | [M] (prior local evidence) |
| TV behaviour | A95L DV Game mode: 136-216 ms lag, reported loss of VRR and 4K120 | [M-third-party] [15] |

**Component access and reuse constraints:**

- **`dovi_tool` / `libdovi`** (MIT; release 2.3.4, 2026-09-10; main at `41dae646`). It is a "CLI tool
  combining multiple utilities for working with Dolby Vision". It parses, edits and generates RPUs, and
  demuxes and muxes HEVC [D] [17]. It does video-file metadata work only. It has no HDMI, no VSIF and no
  real-time display management.
- **libplacebo** (LGPL-2.1; master at `c4de47cd`). `pl_shader_dovi_reshape` decodes DV colour reshaping
  for *playback* (`colorspace.h:40-43`). Its peak-detection tone mapping is the reusable idea for Luma
  [D] [18]. LGPL linkage terms apply if code is reused. Re-implementing the published concept is the
  cleaner option for a public repository [I].
- **edid-decode** (v4l-utils at `d2e89246`; MIT-style per its licence header). It is useful read-only
  tooling to decode the A95L's Dolby VSVDB [D] [6].
- **CoreELEC, HDFury and similar** run on DV-licensed SoCs or dedicated hardware. VSVDB injection there
  changes what a *player* believes about the TV. It does not give a Mac a DV transmitter [A] [19].
- No open, licence-clean, real-time DV display-management implementation for games was found.

## Implications for TOTK Luma

1. **HDR10 / EDR is the HDR architecture.** Every HDR requirement (scene-HDR preservation, calibrated
   XDR and A95L profiles, SDR-safe UI, dynamic EDR headroom) must be met without DV. DV is "not pursued";
   nothing in the design may depend on it.

2. **Build "DV-like" quality as Luma features:**
   - measured per-display profiles;
   - HGIG-style source tone mapping to the measured peak;
   - optional per-scene adaptive peak, with temporal smoothing and scene-cut reset;
   - per-profile trims (roll-off, shadow, saturation).

   Show the detected scene peak and the active knee in the HDR dashboard so the effect is testable.

3. **A95L profile:**
   - target HDR10 Game mode (8-17 ms class lag [M-third-party] [15]);
   - set HDR Tone Mapping to Off during calibration, then decide between Off and Gradation preferred
     by measurement;
   - do not use a DV HDMI signal-format setting for the Mac input. It buys nothing (macOS sends HDR10)
     and reportedly costs VRR and 4K120 on other sources [I] [15].

4. **Record the macOS HDR10 InfoFrame behaviour as a gate.** The A95L's mapping depends on the static
   metadata macOS sends. Because Luma tone maps to the measured panel peak, the plan must not rely on
   MaxCLL or MaxFALL being honoured.

5. **Keep the HUD honest.** If the TV reports "Dolby Vision" at any point, label it as an unexpected
   mode. Luma's output is HDR10 / PQ to the TV and EDR on the built-in display.

6. **Watching brief, low cost.** Re-check once per major macOS release for:
   - any public DV, InfoFrame or HDMI-mode API in the SDK headers (grep `DolbyVision`, `InfoFrame`);
   - any change to Dolby's eligibility wording.

## Options compared

| Option | HDR quality for Luma | Latency on the A95L | Feasible on the Mac | Licence or access | Verdict |
|---|---|---|---|---|---|
| A. HDR10 PQ to the A95L plus EDR on the XDR, static HGIG-style mapping to the measured peak | Good; full control | 8-17 ms class in Game mode [M-third-party] | Yes (needs the EDR swapchain work tracked elsewhere) | None | **Baseline, required** |
| B. A plus per-scene adaptive tone mapping and trims ("DV-like") | Better on high-contrast scene changes; no TV dependence | Same as A, plus a GPU histogram pass (small) [I] | Yes | None (re-implement the concept) | **Recommended extension** |
| C. Real DV output (SIDK or UE plug-in plus Dolby VSIF) | Marginal over B when the source already maps to the panel [I] | 136-216 ms measured in DV Game mode [M-third-party] | **No** public signalling path [D] | Licensed; incorporated entities only [D] | Rejected |
| D. Encode frames as DV HEVC and play them through AVFoundation | DV mapping on the built-in display only; HDR10 on the TV [D] | Encode and decode latency, far over budget [I] | Technically on the built-in display only | Uses Apple's licensed decoder | Rejected |
| E. Inline HDMI device to "add" DV | Unknown; no product found that turns an HDR10 source into DV signalling | Unknown | Not a software path | Hardware vendor | Not pursued |

## Unknowns and evidence gates

| Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|
| Does the A95L's VSVDB advertise Standard, Low-Latency or both, and which version? | Answers "TV-led or not" for this model; documents what the TV claims | When the TV is connected, read the EDID read-only (an OS display-info dump) and decode it with `edid-decode`; record the "Interface" / "Low Latency" fields. No game launch needed | A95L profile phase, before calibration |
| A95L DV Game-mode lag on current firmware | Third-party 136-216 ms is one lab with no firmware stated | Only if DV is ever reconsidered: owner-run lag test with an Xbox; otherwise accept as documented | Not needed (DV not pursued) |
| What static HDR metadata (DRM InfoFrame: MDCV, MaxCLL, MaxFALL) macOS sends to an HDR10 TV, and whether `CAEDRMetadata` changes it | Affects how the A95L's own tone mapping behaves with HDR Tone Mapping on | Check the TV's signal-info overlay if available; otherwise an HDMI analyser; document "not controllable" if no change is observed | HDR calibration phase |
| Exact A95L menu names and the HGIG-like behaviour of "HDR Tone Mapping: Off" in Game mode | The profile recipe depends on it | Owner checks the menu; measure a PQ ramp with the setting Off and Gradation preferred | A95L profile phase |
| Which HDMI DV mode Xbox uses for games (TV-led or LLDV) | Explains the latency gap; background only | Dolby or Microsoft developer documentation (gated) | Not needed |
| Dolby SIDK fees, NDA and certification terms | Completes the barrier picture | Only an incorporated entity can ask Dolby | Not needed |
| Whether a future macOS adds DV output or InfoFrame APIs | Would reopen option C partially (licence still required) | Grep each new SDK for `DolbyVision`, `InfoFrame`, HDMI HDR mode | Yearly watching brief |
| Raised-black or shadow behaviour in DV gaming | Was asked; no source found | Not pursued | Not needed |

## Risks

- **Scope creep toward DV.** DV marketing ("12-bit", "dynamic") can pull effort away from the EDR
  swapchain, which is the real blocker (8-bit swapchain, EDR off, PR !31 closed [M]). Mitigation: DV is
  marked "not pursued" in the specs.
- **Wrong TV settings.** Leaving the A95L's HDMI port in a DV signal format, or with HDR Tone Mapping on,
  could add TV processing on top of Luma's mapping (double tone mapping) or change the available modes
  [I] [15] [21].
- **Undocumented macOS HDR10 metadata.** If macOS sends fixed static metadata, the A95L's own mapping
  (when enabled) may compress highlights unpredictably. Mitigation: tone map to the measured peak and
  prefer HDR Tone Mapping Off.
- **Evidence quality.** The DV latency figures are from one third-party lab, and RTINGS' data was
  paywalled. Several Dolby and What Hi-Fi pages could not be read in full. All of this is tagged.
- **Licence hygiene in a public repository.** Do not copy libplacebo code without LGPL compliance. Do not
  ship, describe or point to Dolby-confidential formats (the VSIF layout), even where third-party code
  happens to contain one [23]. Only cite public sources.
- **Reverse engineering temptation.** Emulating Dolby signalling without a licence would raise legal and
  licensing risk and would still have no public macOS output path. It is out of scope.

## Effort notes

- **This research note**, including the evidence gates written above: done.
- **DV output (option C):** not estimable. It is blocked by eligibility (incorporated entity), licence
  and the missing macOS signalling path. Treat it as "no effort will be spent".
- **A95L EDID decode gate:** about 0.5 h, assuming the TV is connected and the owner allows a read-only
  display-info dump. No installation beyond a source build of `edid-decode` in a temporary folder is needed.
- **Option B, scene-adaptive tone mapping:**
  - Effort: about 1-3 engineer-weeks after the EDR/HDR10 swapchain and pre-tonemap capture exist.
    That covers a GPU histogram or percentile pass, temporal smoothing and scene-cut reset, knee
    adaptation, per-profile trims, and HUD readouts.
  - Validation: plus about 2-4 days of measurement per display profile.
  - Assumptions: Metal or Vulkan compute is available in the presentation pass, and the per-frame cost
    budget is under about 0.3 ms on the M4 Pro at 1080p internal [I].
- **Watching brief:** about 1 h per major macOS SDK release.

## Access failures

- RTINGS A95L review: https://www.rtings.com/tv/reviews/sony/a95l-oled - HTTP 200, but the test results
  are paywalled ("triggered_paywall": true in the page data). Only the summary was readable.
  RTINGS compare page https://www.rtings.com/tv/tools/compare/sony-a95l-oled-samsung-s95d-oled/39009/49702
  - the body was truncated with no data.
- Sony A95L feature page: https://www.sony.ca/en/bravia/products/a95l-series/feature3 - HTTP 403.
  https://www.sony.com.tw/en/bravia/products/a95l-series/feature3 - HTTP 403.
- Sony community thread: https://community.sony.pl/t5/android-tv/dolby-vision-game-mode/td-p/3828051 - HTTP 403.
- Dolby newsroom: https://news.dolby.com/en-WW/227541-dolby-releases-native-dolby-vision-and-dolby-atmos-plug-ins-for-unreal-engine/
  - "unable to verify the first certificate" (TLS error).
- Dolby: https://professional.dolby.com/gaming/the-problem-with-hdr-in-gaming--and-how-to-solve-it/ and the
  `.../migrated/gaming-old/...` variant - 404. games.dolby.com URLs redirect (301) to the generic gaming page.
- What Hi-Fi: https://www.whathifi.com/news/dolby-vision-gaming-arrives-on-xbox-series-x-and-s-but-theres-a-catch
  and https://www.whathifi.com/advice/if-youre-gaming-on-a-2023-sony-oled-tv-make-sure-you-change-this-one-setting
  - the body was truncated; only search summaries were used.
- Apple developer documentation page https://developer.apple.com/documentation/quartzcore/caedrmetadata -
  JavaScript-rendered with no content. It was replaced by the installed SDK headers.
- Xbox Wire 2021-09-28 post: not fetched directly by the author; content taken from search summaries of
  the official post and syndicated copies. It was fetched directly during independent verification
  (2026-11-01) and the quoted points were confirmed.

## Sources

1. Xbox Wire, "Dolby Vision Gaming Now Available on Xbox Series X|S", 2021-09-28,
   https://news.xbox.com/en-us/2021/09/28/dolby-vision-gaming-now-available-on-xbox-series-x-s/ (through search summaries), accessed 2026-11-01.
2. Dolby, "Dolby Vision" developer access page (© 2025), https://professional.dolby.com/en-in/gaming/downloads/dolby-vision-access/, accessed 2026-11-01.
3. Dolby, "Dolby Vision for developers", https://professional.dolby.com/gaming/gaming-getting-started/dolby-vision-for-developers/, accessed 2026-11-01.
4. Dolby newsroom, "Dolby Releases Native Dolby Vision and Dolby Atmos Plug-ins for Unreal Engine" (2023),
   https://news.dolby.com/en-WW/227541-dolby-releases-native-dolby-vision-and-dolby-atmos-plug-ins-for-unreal-engine/
   (TLS failure; secondary coverage through search), accessed 2026-11-01.
5. Semtech, S. Tremblay, "Demystifying Dolby Vision for Pro AV", 2020-11-18 (modified 2025-03-07), https://blog.semtech.com/demystifying-dolby-vision-for-pro-av, accessed 2026-11-01.
6. linuxtv v4l-utils, `utils/edid-decode` at commit `d2e89246cefcb6371425361b12c4ca2a36a662d2` (2026-10-30):
   `oui.h:11`, `parse-cta-block.cpp:1794-1907` and `:2968`, `parse-if.cpp:302-337`, https://git.linuxtv.org/v4l-utils.git, accessed 2026-11-01.
7. Microsoft Learn, "HdmiDisplayHdrOption Enum" (Windows.Graphics.Display.Core), https://learn.microsoft.com/en-us/uwp/api/windows.graphics.display.core.hdmidisplayhdroption, accessed 2026-11-01.
8. Microsoft Learn, "HdmiDisplayMode.IsDolbyVisionLowLatencySupported", https://learn.microsoft.com/en-us/uwp/api/windows.graphics.display.core.hdmidisplaymode.isdolbyvisionlowlatencysupported, accessed 2026-11-01.
9. Apple Support, "Play HDR video on Mac" (published 2026-03-10), https://support.apple.com/en-us/102205, accessed 2026-11-01.
10. Apple macOS 27.2 SDK (Xcode 27.2, build 27B5019j), QuartzCore headers: `CAEDRMetadata.h:55-109`, `CAMetalLayer.h:128-138`,
    `CALayer.h:39-90, 436-480`; IOKit `graphics/IOGraphicsTypes.h:1475, 1509`, read locally 2026-11-01.
11. Apple macOS 27.2 SDK: VideoToolbox `VTHDRPerFrameMetadataGenerationSession.h`, `VTCompressionProperties.h:505-520`;
    AVFoundation `AVPlayer.h:666-677`; CoreMedia `CMFormatDescription.h:607, 653`, read locally 2026-11-01.
12. Apple, "High Dynamic Range Metadata for Apple Devices (Preliminary)", v0.9, 2019-05-31, https://developer.apple.com/av-foundation/High-Dynamic-Range-Metadata-for-Apple-Devices.pdf, accessed 2026-11-01.
13. Apple Support, "MacBook Pro (16-inch, 2024) - Tech Specs", https://support.apple.com/en-us/121554, accessed 2026-11-01.
14. RTINGS, "Sony A95L OLED review" (first published 2023-11-08; test bench 2.3.1; results paywalled), https://www.rtings.com/tv/reviews/sony/a95l-oled, accessed 2026-11-01.
15. HDTVPolska, "Test, recenzja telewizor Sony A95L QD-OLED", page 11 (input lag, DV gaming), https://hdtvpolska.com/test-recenzja-telewizor-sony-a95l-qd-oled-opinie-cena/11/, accessed 2026-11-01.
16. Reviewed, "Sony A95L QD-OLED TV review", 2023-10-20 (firmware v.112.602.130.1NAA), https://reviewed.com/televisions/content/sony-a95l-qd-oled-tv-review, accessed 2026-11-01.
17. quietvoid/dovi_tool (includes the `dolby_vision` crate / `libdovi`), MIT, main at `41dae646193c12de152333ff5dbc33579cb9ef4a` (2026-10-23 20:13 -0400, i.e. 2026-10-24 UTC), release 2.3.4 (2026-09-10), https://github.com/quietvoid/dovi_tool, accessed 2026-11-01.
18. haasn/libplacebo, LGPL-2.1, master at `c4de47cd94af6ce15573debe84306e01bca33996` (2026-10-30), `src/include/libplacebo/shaders/colorspace.h:40-43, 151-213`, https://github.com/haasn/libplacebo, accessed 2026-11-01.
19. CoreELEC forum, "EDID Override - Injecting a Dolby VSVDB Block" and related threads (community, [A]), https://discourse.coreelec.org/t/edid-override-injecting-a-dolby-vsvdb-block/51510, accessed 2026-11-01.
20. Firecore community, "Does Infuse Output DV from MacBook Pro to External Device?" (community, [A]), https://community.firecore.com/t/does-infuse-output-dv-from-macbook-pro-to-external-device/38855, accessed 2026-11-01.
21. What Hi-Fi, "If you're gaming on a 2023 Sony OLED TV, make sure you change this one setting" (through search summary; body not readable), https://www.whathifi.com/advice/if-youre-gaming-on-a-2023-sony-oled-tv-make-sure-you-change-this-one-setting, accessed 2026-11-01.
22. What Hi-Fi, "LG CX and GX OLED TVs now support 4K@120Hz with Dolby Vision" (secondary), https://www.whathifi.com/news/lg-cx-and-gx-oled-tvs-now-support-4k120hz-with-dolby-vision, accessed 2026-11-01.
23. A public GPL-2.0 Android vendor kernel for a set-top-box SoC, consulted during independent verification (2026-11-01) only to
    confirm that a Dolby VSIF builder and a "DV Spec version2.9" comment exist in public code. File, symbol and field references are
    intentionally omitted from this public repository.

## Independent verification

Verified on 2026-11-01 by an independent reviewer who re-read primary sources: the installed macOS
27.2 SDK headers (Xcode 27.2, build 27B5019j), fresh shallow clones of v4l-utils (`d2e89246`),
libplacebo (`c4de47cd`) and dovi_tool (`41dae646`), the GitHub API, and direct fetches of the Apple,
Dolby, Microsoft, Xbox Wire, Semtech and hdtvpolska pages. No code was built or run.

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| No public macOS API emits DV signalling or writes HDMI InfoFrames; `CAEDRMetadata` offers only HDR10 and HLG; `AVPlayerHDRModeDolbyVision` is `API_UNAVAILABLE(macos)` | Confirmed | SDK: `CAEDRMetadata.h:55, 81, 98, 107`; `AVPlayer.h:663-670`; `IOGraphicsTypes.h:1475, 1509`. A grep of all SDK framework headers, `usr/include` and the DriverKit SDK finds no "InfoFrame"; "DolbyVision" appears only in AVPlayer, AVCaptureDevice, CoreMedia (`dvh1`) and VideoToolbox headers. `CoreDisplay.framework` ships only a `.tbd`, no headers | Absence in headers is strong evidence, not proof of what private frameworks can do; tag kept as [D] for the headers plus [I] |
| Apple: built-in display and Pro Display XDR support DV, HDR10 and HLG; DV and HLG are converted to HDR10 on other HDR10 external displays | Confirmed | https://support.apple.com/en-us/102205, both sentences quoted verbatim; published 2026-03-10 | Decision-critical; this alone rules out DV to the A95L from a Mac |
| `VTHDRPerFrameMetadataGenerationSession` (macOS 15+) generates DV per-frame metadata for encoding, not display signalling | Confirmed | `VTHDRPerFrameMetadataGenerationSession.h:42, 48, 54, 61, 69` ("Interface for video compression session clients") | Line citation added to the API table |
| Dolby SIDK is a "Licensed product"; requests only "from officially incorporated entities"; Xbox platform solution is one-size-fits-all, no tone-mapper tweaking, Xbox Series X and S only | Confirmed | Raw HTML of https://professional.dolby.com/en-in/gaming/downloads/dolby-vision-access/ (HTTP 200) contains each phrase verbatim | Enforcement terms remain unpublished |
| LLDV: source tone maps, no metadata to the sink, 12-bit 4:2:2 BT.2020 PQ, from DV HDMI transmission spec v2.9; STD embeds metadata in pixel data | Confirmed as secondary | Semtech blog (S. Tremblay, 2020-11-18, modified 2025-03-07); it says "SMPTE 2084" rather than "PQ" (same thing). A GPL vendor driver independently cites "DV Spec version2.9" [23] | Still [D-secondary]; not a Dolby primary document |
| Dolby VSVDB (OUI `0x00D046`) decoded by edid-decode with "Interface" / "Low Latency" fields; the Dolby VSIF is not decoded by edid-decode "or any other public source", so its layout is not publicly documented | Corrected | edid-decode confirmed: `oui.h:11`, `parse-cta-block.cpp:1800, 1836, 1877, 1884`, `parse-if.cpp:329-337` (non-HDMI OUIs are hex-dumped). But a public GPL vendor kernel builds a Dolby VSIF [23] | Rewritten to: no Dolby-published spec; third-party GPL code containing a layout exists but is not studied or described here. No feasibility change, because macOS has no InfoFrame API |
| Windows exposes `HdmiDisplayHdrOption.DolbyVisionLowLatency` and `HdmiDisplayMode.IsDolbyVisionLowLatencySupported` from Windows 10 1809 | Confirmed | Microsoft Learn: enum version history lists "1809 / 17763 / DolbyVisionLowLatency" (enum itself from 15063); property "introduced in 10.0.17763.0" | - |
| RTINGS: A95L supports DV gaming at up to 4K120, a first for Sony | Unverifiable (directly) | Re-fetch of https://www.rtings.com/tv/reviews/sony/a95l-oled returned HTTP 200 with `"triggered_paywall":true` and no review text; only search summaries repeat the claim | Tag lowered from [D] to [D-secondary]; confidence stays medium |
| HDTVPolska: 216 ms (4K60) and 136 ms (4K120) DV Game-mode lag versus 8-17 ms HDR10 Game; VRR and 4K120 lost on Xbox in DV mode | Confirmed (with caveats) | https://hdtvpolska.com/test-recenzja-telewizor-sony-a95l-qd-oled-opinie-cena/11/ table and text; "Dolby Vision – Gra: NIE (brak trybu z rozsądnym input lag)" | No firmware stated; page is internally inconsistent (4K120 DV row versus "no 4K120 on Xbox"; "216 do 233 ms" prose). Caveat added in section 2 |
| A95L DV mode (TV-led, LLDV or both) is not documented | Confirmed (as an unknown) | Fresh searches for A95L VSVDB / player-led data found nothing; Semtech's 2020 Sony LLDV-only statement re-read | The EDID gate remains the right way to resolve it |
| dovi_tool / libdovi (MIT) works on RPU bitstreams only, with no HDMI or VSIF signalling | Confirmed | Fresh clone at `41dae646`: MIT licence; no "hdmi", "vsif" or "infoframe" anywhere in the tree; release 2.3.4 published 2026-09-10 (GitHub API) | Commit date is 2026-10-23 -0400 (2026-10-24 UTC); source entry clarified |
| libplacebo peak detection implements percentile peak, temporal smoothing and scene-cut reset; defaults 20 / 1.0 / 3.0 / 100, HQ 99.995 | Confirmed | Fresh clone at `c4de47cd`: `colorspace.h:151-213`, `PL_PEAK_DETECT_DEFAULTS` and `PL_PEAK_DETECT_HQ_DEFAULTS`; smoothing is an IIR filter with the period in frames; scene thresholds are in 1% PQ units; LGPL-2.1 | The "DV-like over HDR10 / EDR" conclusion stays [I] |
| MacBook Pro 16-inch (2024) HDMI: 8K60 or 4K240 | Confirmed | https://support.apple.com/en-us/121554: "up to 8K resolution at 60Hz or 4K resolution at 240Hz"; XDR 1000 nits sustained, 1600 nits peak | - |
| Xbox Series X\|S is "the only console" with DV gaming | Corrected | Xbox Wire 2021-09-28 (fetched directly) says "the first game consoles"; searches found no DV gaming on PS5 or Switch 2 | Reworded to "first", with "no other found" as [I] |

**Effect on the note's conclusions.** None of the corrections changes the decision. DV output stays
"not pursued" because of Apple's documented conversion to HDR10 on external displays, the absence of
any public macOS InfoFrame or HDR-mode API, Dolby's incorporated-entity requirement, and the measured
A95L DV Game-mode latency. HDR10 / EDR with source-side, scene-adaptive tone mapping remains the plan.
