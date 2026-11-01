# 04 - Target displays and calibration methodology

Research note - 2026-11-01 - independently verified (see Independent verification)

Scope: the MacBook Pro 16-inch (M4 Pro, Mac16,7) built-in Liquid Retina XDR display, the Sony A95L QD-OLED TV over HDMI,
and the calibration method that turns both into separate HDR profiles for TOTK Luma. Purchases are not recommended here;
equipment is described only by what it must be able to do.

## Summary

- **MacBook Pro XDR, official:** 1000 nits sustained full-screen, 1600 nits peak (HDR content only), SDR up to 1000 nits
  (outdoor), 1,000,000:1, P3, 1 billion colours, ProMotion adaptive up to 120 Hz plus fixed 47.95/48/50/59.94/60 Hz,
  nano-texture as an option. [D] [1]
  Apple publishes no dimming-zone count; 2,554 zones and 10,216 mini-LEDs is a press figure from 2021. [A] [16]
- **MacBook Pro XDR, measured by a lab:** HDR 1,620 nits (spot), 1,214 nits on a near-full white screen, SDR 632 nits
  maximum (1,063 nits with the ambient light sensor), P3 99.7 %, PWM at 14.88 kHz, and slow response (41 ms black to
  white). [D] [15] No lab blooming measurement was found for the M4 generation. [I]
- **EDR headroom on this Mac, measured today:** a read-only `NSScreen` probe reported a potential headroom of 16.0 and a
  current headroom of 2.67 for the built-in display, and no reference mode (reference headroom 0). [M] [38]
  1600 / 2.67 is about 600 nits, so SDR white was probably near the top of the slider. Highlights then have only about
  1.4 stops above paper white. [I]
- **A95L, official:** HDR10, HLG and Dolby Vision; **no HDR10+**. Four HDMI inputs. Only two carry HDMI 2.1
  features (4K120, VRR, ALLM), and HDMI 3 is one of them and the eARC port. [D] [17][18] The second is HDMI 4 per an
  RTINGS extract. [A] [23]
- **A95L, measured by labs:** 10 % window about 1,150-1,375 nits, depending on lab and mode. 5 % window 1,507 nits with
  tone mapping off. Full-field 235-255 nits, so ABL (automatic brightness limiting) is strong. DCI-P3 about 99.8 % and
  BT.2020 about 86-89 %. Input lag about 16 ms at 4K60 and about 8 ms at 120 Hz. [D] [17][18] [A] [20][21]
  **The RTINGS values are locked behind a paid membership** and could not be read. This is an access failure. [22]
- **A95L HDR tone mapping:** it is on by default, even in Game mode, and it brightens highlights. "Off" is the setting to
  use when running an HGIG-style clipping calibration. What Hi-Fi then recommends "Gradation preferred" for a small
  mid-tone fix. [D] [19] No source shows that "Off" is a true HGIG hard clip at panel peak, so the owner must test it. [I]
- **Calibration model:** use Apple's relative EDR model on the Mac (1.0 = SDR white at the current brightness) and
  BT.2408 graphics white (203 cd/m²) as the absolute target on the TV. [D] [8][9][28]
  Roll highlights off with the BT.2408 Annex 5 EETF (originally from BT.2390) towards a peak that the owner measures.
  [D] [28] Use a hard clip only when the content already sits below the panel peak. [I]
- **No colorimeter is needed to start:** HGIG-style visual tests give the clip points in renderer units, which is all the
  tone mapper needs. [D] [27] [I] An instrument rated for HDR luminance, with a spectral correction for QD-OLED and
  mini-LED, is only needed to turn "computed signal nits" into "measured panel nits". [D] [6][32]
- **Labelling rule:** every nit value in the dashboard is either *computed signal nits* (what the renderer asked for,
  derived from EDR values and an assumed SDR-white level) or *measured panel nits* (read from an instrument). The two are
  never mixed in one field. [I]

## Findings

### 1. MacBook Pro 16-inch (M4 Pro), Liquid Retina XDR

**Official specifications.** All values below are from Apple's tech specs page for the 2024 16-inch model. [D] [1]

| Item | Apple specification |
|---|---|
| Panel | 16.2-inch Liquid Retina XDR, 3456 x 2234, 254 ppi |
| Contrast | 1,000,000:1 |
| XDR brightness | 1000 nits sustained full-screen, 1600 nits peak (HDR content only) |
| SDR brightness | Up to 1000 nits (outdoor) |
| Footnote 3 | "In temperatures less than 25° C", attached to the **1600 nits peak** figure (not to the SDR figure) on this page |
| Colour | 1 billion colours, wide colour (P3), True Tone |
| Refresh | ProMotion adaptive up to 120 Hz; fixed 47.95, 48.00, 50.00, 59.94, 60.00 Hz |
| Options | Nano-texture display |
| HDMI output | One display up to 8K60 or 4K240 |

Apple gives no lower bound for ProMotion and no zone count. [D] [1]
The 2,554-zone and 10,216-LED figures trace back to one 2021 press report, not to an Apple document. [A] [16]
The current Apple page (M5 Pro and M5 Max; it also mentions an M6 base model) lists a 1-nit minimum. On that page the
< 25 °C footnote marker sits after "1000 nits sustained full-screen" and, for the 16-inch, after the 1000-nit SDR
outdoor figure. [D] [2] On the M4 page the same footnote is attached only to the 1600-nit peak. [D] [1] So the
temperature condition applies at least to the peak, and on newer pages also to the sustained and outdoor figures. [I]

**Presets and reference modes.** Apple documents the following for the MacBook Pro. [D] [3]

- **"Apple XDR Display (P3-1600 nits)"** is the default general-use preset, with XDR support up to 1600 nits peak.
  SDR white follows the brightness slider and Auto Brightness.
- **"HDR Video (P3-ST 2084)"** is a reference mode with P3 primaries and the SMPTE ST 2084 (PQ) EOTF, up to 1000 nits
  full-screen sustained, for "controlled viewing environments set up per ITU-R BT.2100".
- SDR reference modes: HDTV (BT.709-BT.1886), NTSC, PAL, Digital Cinema (P3-DCI and P3-D65), Design and Print (P3-D50),
  Photography (P3-D65) and Internet and Web (sRGB).
- In some modes "True Tone, Night Shift, Auto Brightness, brightness slider, and brightness keyboard controls might not
  be available".

Custom reference modes can set the gamut, white point, SDR transfer function, HDR on or off, local dimming, and the
maximum luminance. [D] [4] "Limit Luminance to Full Screen Capability" caps the peak at 1000 nits, and the mode needs it
before it can be fine-tuned. [D] [4] "Turn on PQ for HDR Content" is listed only for the Pro Display XDR and the Studio
Display XDR. [D] [4]

Apple does not publish the SDR-white level of the HDR Video reference mode in these pages. [I] When the display runs in
a reference mode, `NSScreen.maximumReferenceExtendedDynamicRangeColorComponentValue` becomes non-zero. [I] (Apple's
page says only that it is 0 when the hardware does not support reference rendering.) Values up to it receive no extra
display tone mapping. [D] [10] That makes the reference mode a useful, repeatable *measurement* state,
but not the everyday play state. [I]

**Measured reviews.** Notebookcheck tested the M4 Pro 16-inch with an X-Rite i1Pro 2 and Calman. Review dated
2024-11-14. [D] [15]

| Measurement | Value |
|---|---|
| SDR maximum (centre) / average | 632 / 616 cd/m² |
| SDR with the ambient light sensor | 1,063 cd/m² |
| HDR spot maximum | 1,620 cd/m² |
| HDR near-full white | 1,214 cd/m² |
| Black / contrast | 0 cd/m² / "∞:1" (local dimming active) |
| Gamut (ArgyllCMS) | sRGB 100 %, P3 99.7 %, AdobeRGB 88.8 % |
| Grey scale / ColorChecker ΔE | 0.8 / 0.6 |
| Gamma / CCT | 2.21 / 6450 K |
| PWM | 14,880 Hz at 90 % amplitude |
| Response | 41.2 ms black to white, 43 ms grey to grey |

On nano-texture, the review says only that bright areas look "a little grainy" up close. [D] [15]
The review does not discuss blooming. [D] [15] TechSpot's earlier XDR display review (2021 panel) returned HTTP 403.

**Blooming and local dimming.** Apple's own wording is that zones "larger than the LCD pixel size" can cause "a slight
blooming effect". [A] (quoted second-hand in [16]) Owner reports describe halos around white text on black, especially
in a dark room. [A] [16] This matters for TOTK: the Depths and caves are near-black scenes with small, very bright
emitters and a static white HUD. Those are the worst cases for zone-based dimming. [I]

**Nano-texture.** A matte etch diffuses reflections. It also raises the black that the viewer perceives under room light,
and it adds slight grain. [I] Whether the owner's unit has nano-texture is unknown; `system_profiler` does not report
it. [M] [38]

**EDR model and headroom.** These rules come from Apple's documentation. [D] [8][9][10][12]

- EDR value 1.0 is SDR white at the current brightness. Values above 1.0 are headroom.
- Headroom is about panel peak divided by current SDR white. Apple's example: with 100-nit UI and a 400-nit panel, 4.0
  maps to 400 nits. At 200-nit UI, 2.0 maps to 400 nits.
- `maximumExtendedDynamicRangeColorComponentValue` is the live limit. It changes with brightness and conditions, it is
  1.0 when nothing on screen requests EDR, and it can be 1.0 at maximum brightness.
- `maximumPotentialExtendedDynamicRangeColorComponentValue` is fixed per screen object.
- A `CAMetalLayer` with `wantsExtendedDynamicRangeContent`, RGBA16Float and an extended linear colour space clamps output
  to the live limit. With `edrMetadata` left nil, the system does no tone mapping, so values above the limit "may be
  clipped". [D] [11]
- Apple's own figure for external HDR10 displays is "roughly 5x SDR" of headroom. [D] [12]

**Probe on this machine** (read-only, no window, 2026-11-01). [M] [38]

| Screen | Points / scale | Max FPS | EDR current | EDR potential | EDR reference |
|---|---|---|---|---|---|
| Built-in Retina Display | 1312 x 848 @ 2x | 120 | 2.667 | 16.0 | 0 |
| MSI MAG 274UPF E2 (each) | 2080 x 1170 @ 2x | 120 | 1.0 | 1.0 | 0 |

Interpretation, all inference [I]:

- Some app on screen had requested EDR, because the current headroom was above 1.0.
- 1600 / 2.667 = 600 nits. That agrees with the lab's SDR maximum of about 616-632 nits, so the slider was probably at
  or near its top.
- The built-in display is set to a scaled "looks like 1312 x 848" mode. Its backing store is 2624 x 1696, not the panel's
  native 3456 x 2234. Together with Ryubing's contentsScale of 1.0 (issue #461), the fullscreen surface size needs a
  check.
- The MSI monitors report no EDR, so HDR is off on them or unavailable in their current mode.

### 2. Sony A95L (BRAVIA XR, 2023 QD-OLED)

**Official features.**

- HDR formats: HDR10, HLG and Dolby Vision. HDR10+ is absent. [D] [17][18]
- HDMI: four inputs. Only two support HDMI 2.1 features (4K at 120 Hz, VRR, ALLM), and HDMI 3 is one of them and is
  also eARC. [D] [17][18] That the second one is HDMI 4 comes from the RTINGS settings extract only. [A] [23] A 48 Gbps link on HDMI 3 and 4 versus 18 Gbps on HDMI 1 and 2 is reported only by retailers. [A]
  Sony's own spec and HDMI 2.1 support pages returned HTTP 403, so no Sony page confirms the per-port map. [25]
- VRR: HDMI Forum VRR. FreeSync is not supported: Reviewed credits FreeSync and G-SYNC only to the LG and Samsung
  rivals, which implies but does not state that the A95L lacks them. [D] [18] [I] G-SYNC Compatible is reported as
  "Yes" by an RTINGS comparison extract and by Choose.tv. [A] [22][36] Neither vendor feature matters on a Mac. [I]
  The VRR range is reported as 48-120 Hz by Choose.tv, but an RTINGS extract gives a 4K VRR minimum below 20 Hz
  (probably with frame doubling). The range is therefore unconfirmed. [A] [22][36]
- Mac side: Apple's Adaptive Sync page says "Do not use an HDMI cable or adapter" for Adaptive Sync displays. [D] [13]
  Apple's 8K page, however, lists "VRR on a compatible external display" through the Mac's HDMI port for the M2 Pro /
  M3 Pro generation and mentions TV "game mode" settings. It does not list the M4 Pro. [D] [14] The two Apple pages
  conflict, so HDMI VRR from this Mac to the A95L stays an owner test. [I]
- Sony's current Help Guide covers the BRAVIA 9, 8, 8 II, 7, 5 and the A95L. Under "HDMI signal format/VRR" it lists
  Standard, Enhanced and Enhanced (Advanced). It says 4K 100/120 Hz needs a 48 Gbps Ultra High Speed cable, and that
  available formats "depend on your model and the HDMI input". [D] [24]
- RTINGS settings text (search extract only) names "Enhanced Format (4K120)" and a VRR variant on ports 3 and 4. It says
  plain "Enhanced" limits the port to HDMI 2.0 bandwidth but still allows VRR. [A] [23] The menu names changed between
  firmware versions, so the owner records what the TV shows. [I]
- PC timings in the Help Guide include 3840 x 2160 at 60 Hz (8 bits), with a note that 3840 x 2160 at 120 Hz "can" be
  used. [D] [24]
- Picture menus include Picture mode, Brightness, Colour, "Adv. color temperature: Multi point" ("we recommend using a
  color analyzer"), per-colour adjustment, Color space and HDR mode. With Content type set to Game, Motionflow and
  CineMotion are disabled. [D] [24]

**Measured performance.** These values were collected without RTINGS, whose numbers are locked. [22]

| Metric | Value | Lab, mode | Tag |
|---|---|---|---|
| 10 % window | 1,215 nits | Tom's Guide, review mode (Professional implied) [17] | [D] |
| 10 % window | 1,348 nits; 1,373 nits calibrated Professional | AVForums [20] (search extract; page HTTP 403) | [A] |
| 10 % and 18 % windows | about 1,350 nits | Digital Trends [21] (search extract; page HTTP 404) | [A] |
| 10 % window | 1,146 cd/m² | RTINGS comparison extract; the column was not verified [22] | [A] |
| 5 % window | 1,507 nits, HDR tone mapping disabled | Reviewed [18] | [D] |
| 2 % window | 2,010 nits in Vivid | AVForums [20] (search extract) | [A] |
| 100 % window | 235-255 nits | AVForums, Digital Trends [20][21] | [A] |
| Average picture brightness in HDR | about 350 nits | Reviewed [18] | [D] |
| ANSI contrast, HDR | 359.6 / 0.0001 nits | Reviewed [18] | [D] |
| Gamut | DCI-P3 uv 99.83 %, BT.2020 uv 88.85 % | Reviewed [18] | [D] |
| Gamut | UHDA-P3 99.95 %, Rec.2020 89.41 % | Tom's Guide [17] | [D] |
| Gamut (CIELAB) | DCI-P3 99.75 %, BT.2020 86.16 % | RTINGS extract [22] | [A] |
| Input lag, 4K60 (Leo Bodnar) | 16.1 ms | Tom's Guide [17] | [D] |
| Input lag, 4K60 / 120 Hz | 16.3 / 7.9 ms; "VRR adds only a few milliseconds" | AVForums [20] | [A] |
| SDR, Professional mode | 112 nits at 10 % (Standard 273, Cinema 315) | Tom's Guide [17] | [D] |

**EOTF tracking (how closely brightness follows the PQ curve).** Reviewers describe very accurate PQ tracking outside
Game mode. [A] [22] Game-mode HDR is reported as noticeably dimmer than other modes. [A] [22] The numeric tracking
deltas (600, 1000 and 4000 nits) are locked on RTINGS. [22]

**Near-black.** Reviewed calls the A95L "better equipped to preserve near-black detail than any other OLED I've tested
this year". [D] [18] QD-OLED panels have no polariser, so black rises under room light. That is a viewing-condition
factor, not a signal one. [I] The lab value ("Black Luminance @ 1000 lx") is locked. [22]

**ABL.** A full-field level near 250 nits against about 1,200-1,350 nits at 10 % means the TV dims bright, large areas
hard. [D]/[A] [17][18][20] TOTK has large bright skies and Sky Islands. A scene-referred HDR grade that lifts the whole
sky will be pulled down by ABL and may "pump" as the camera moves. [I]

**Tone mapping and gaming modes.**

- HDR Tone Mapping (Picture > Brightness) is on by default, also in Game mode. It "artificially brighten[s]
  highlights" and defeats console HDR calibration. [D] [19]
- What Hi-Fi's procedure: set it Off, calibrate, then return to "Gradation preferred" to fix "minor inconsistency ... in
  mid-tones". [D] [19]
- RTINGS uses "Gradation Preferred", or "Brightness Preferred" for a brighter image. [A] [23]
- Reviewed measured with tone mapping disabled. [D] [18]
- Sony has no setting labelled "HGIG". Forum reports disagree on whether "Off" is a pure clip. [A]
- HGIG's own model expects the display to "preserve gradation" up to its MaxTML and the source to tone-map into it.
  [D] [27] So "Off" counts as HGIG-like only if a clipping pattern disappears exactly at the panel peak. That is a test
  for the owner. [I]
- Perfect for PlayStation 5 "Auto HDR Tone Mapping" needs a PS5 and does not apply to a Mac. [D] [17]

**Calibration options.** The TV offers multi-point white balance and per-colour HSL controls. [D] [24] Portrait
Displays lists the A95L for Calman Home for Sony with AutoCal (commercial software). [A] [26]

### 3. Calibration methodology

**3.1 Paper white.**

- **BT.2408-9 (03/2026)** defines HDR Reference White as 203 cd/m² on a PQ display (PQ as defined in BT.2100-3).
  Graphics White "has the same signal level". [D] [28] §2.1 [30]
- **Apple EDR** is relative: 1.0 is SDR white at the current brightness, and the user owns that level. [D] [8][9]
- When Apple builds EDR metadata for HDR10, `opticalOutputScale` is "often set to HDR10's 100-nit reference white"
  (1.0 = 100 nits). [D] [11][12] That is a different anchor from BT.2408's 203, and it matters on the TV. [I]

Defaults:

- **MacBook:** game paper white = EDR 1.0 × a user scale (default 1.0). The diffuse whites of the game then match the
  macOS UI the owner already sees as "white". [I]
- **A95L:** game paper white = 203 nits measured on the panel. The renderer needs N, the panel nits that the macOS HDR10
  output produces for EDR 1.0. The EDR value is then 203 / N. N is unknown and must be measured. [I]

**3.2 Peak luminance tests (HGIG style).** HGIG v1.1 (2019-07-11) defines three values. [D] [27]

- **MaxTML:** the highest PQ code that is preserved in a 10 % area.
- **MaxFFTML:** the same for 100 % of the screen.
- **MinTML:** the lowest preserved code in a 10 % area.

Each is found by moving a slider "until gray squares just disappear". Default categories give MaxFFTML = 600 nits and
MaxTML = 600, 1000, 4000 or 10,000 nits. [D] [27]

TOTK Luma should render its own three screens in its native output path: a 10 % checker, a full-field checker and a
near-black checker. Store the results in *renderer units* (an EDR value on the Mac; an EDR value plus the assumed N on
the TV). This needs no instrument. [I]

On the Mac, run the test at a recorded brightness and headroom. A headroom change invalidates the absolute result but
not the ratio. [I]

**3.3 Black level and near-black.** The tests differ by panel type. [I]

- **A95L (OLED):** MinTML can be 0. HGIG category 4 sets MinTML to 0. [D] [27] Test for crush with a 0-1 nit PQ ramp,
  for example in 0.05-nit steps.
- **MacBook (mini-LED):** black is 0 in a full-black field. [D] [15] In mixed scenes, local dimming raises black around
  bright objects. Test blooming separately, with a small white box and HUD text on black. That artefact cannot be
  calibrated away. The project can only reduce it, for example with an optional HUD-dimming setting for dark scenes.
- **Lift:** use BT.2408 Annex 5's black lift, b × (1 − E2)⁴, only if the owner measures a non-zero effective black
  (ambient light). [D] [28]

**3.4 Roll-off.**

- BT.2408-9 Annex 5 ("Displaying PQ – calculating the EETF") gives the EETF in normalised PQ space. [D] [28]
  (The independent check could not open the ITU PDF, so the annex number is unconfirmed; the formula itself matches
  libplacebo's BT.2390 implementation with a knee offset of 0.5. [D] [31])
  - It keeps a 1:1 region up to the knee, KS = 1.5 · maxLum − 0.5.
  - Above the knee it uses a Hermite spline,
    P(B) = (2T³ − 3T² + 1)·KS + (T³ − 2T² + T)·(1 − KS) + (−2T³ + 3T²)·maxLum.
  - The spline can work on ICtCp I, Y′, a luminance ratio, or per channel.
- libplacebo implements the same curve, but its default knee offset is 1.0 instead of BT.2390's 0.5.
  [D] [31] `src/tone_mapping.c:470-513` at `c4de47cd94`.
- BT.2390 itself is now at edition 12 (03/2025). [D] [29]

Design choice [I]:

- **Default:** a BT.2390-style EETF in luminance (or ICtCp I), with maxLum set to the measured MaxTML of the active
  profile. On the Mac, maxLum follows the live headroom.
- **"Hard clip" option:** for content whose scene peak is already at or below the panel peak (for example a moderated
  grade on the A95L, with TV tone mapping Off). It keeps the most contrast and risks flat highlights only when content
  exceeds the panel.
- **Never stack two roll-offs:** do not run both the renderer EETF and the TV's own tone mapping. HGIG's core point.
  [D] [27]

**3.5 Gamut.**

- TOTK's SDR content uses BT.709/sRGB primaries. [I]
- **Mac:** render scene-linear in an extended linear sRGB space. ColorSync maps it accurately into the P3 panel.
  [D] [9] [I]
- **TV:** macOS sends HDR10 (BT.2020 container), so BT.709 colours sit inside it unchanged. [I]
- **Optional "vivid" mode** (off by default): a bounded saturation expansion in a perceptual space. Cap it at P3 on both
  displays. The A95L covers about 99 % of P3 but only about 86-89 % of BT.2020, so expanding towards BT.2020 hands
  clipping to the TV's gamut mapper. [D] [17][18] [I]
- Turn off the TV's "Live Color" when calibrating, so that vividness lives in exactly one place. [I]

**3.6 SDR-safe UI.**

- The HUD, menus and the dashboard render at or below graphics white: EDR 1.0 on the Mac, 203 nits on the TV.
  [D] [28] [I]
- A UI scale slider (0.6-1.0 of paper white) helps in dark rooms. [I]
- The dashboard on the OLED should auto-hide or dim after a few seconds, to limit static-image retention on QD-OLED.
  [I] (No lab burn-in figure was readable; RTINGS risk fields are locked. [22])

**3.7 Dynamic EDR headroom (MacBook).**

- headroom = panel peak / current SDR white. [D] [9][12]
- The renderer reads `maximumExtendedDynamicRangeColorComponentValue` each frame, or on
  `didChangeScreenParametersNotification`. Its peak target is min(live headroom, the profile's MaxTML in EDR units).
  [D] [9] [I]
- Smooth the target over about 0.5-1 s, so a brightness-key press does not cause a visible jump. [I]
- The SDR-white level in nits is not exposed by the API.
  - The dashboard may show an *estimate*: SDR white ≈ 1600 / live headroom.
  - The estimate is valid only when the headroom is below the 16.0 potential, so that it is limited by the panel peak.
  - It also assumes the live limit is set by the 1600-nit peak. If macOS lowers headroom for other "conditions"
    (Apple's word in [10]), the estimate reads too high.
  - It is labelled as computed. [I]

**3.8 Instruments, software, test patterns.** No purchases are recommended. The table only states what each tool must
do.

| Need | Why | What is known |
|---|---|---|
| Spectroradiometer, for Apple Full Calibration | Apple's tool accepts only listed instruments | PR-740/745/788/1050, CR-300/250/100 (CR-100 needs an Apple-display matrix), Calibrite Display Plus HL. Newest macOS required; up to 2 h including a 30 min warm-up. [D] [6] |
| Any instrument, for Fine-Tune | Enter measured and target white point (x, y) and luminance | MacBook Pro 2021+, a separate fine-tune per preset; custom modes need "Limit Luminance to Full Screen Capability". [D] [4][5] |
| Verifying the factory calibration | Apple QuickTime test-pattern movies plus "Reference Values.txt" | macOS 14+, warm-up ≥ 30 min, dim room, ≤ 77 °F; patterns come from Apple's AVFoundation developer page. [D] [7] |
| Colorimeter rated for HDR luminance | Read 10 % windows near 1,600 nits (Mac) and 2 % windows near 2,000 nits (TV) | Retailers list 3,000 nits (Display Pro HL) and 10,000 nits (Display Plus HL). [A] [37] One buyer reports the Pro HL does not work with the MacBook Pro calibration flow. [A] [37] |
| Spectral correction | Colorimeters are matched to spectra; QD-OLED and mini-LED need CCSS/CCMX files made with a spectrometer | ArgyllCMS `ccxxmake`. [D] [32] |
| Free software | Spot reads, verification, EOTF plots | ArgyllCMS 3.5.0 (2026-02-04; macOS, Windows, Linux; AGPL). [D] [32] DisplayCAL 3.9.19 (Python 3 fork, GPL-3.0, has macOS instructions). [D] [33] HCFR (GPL-2.0, Windows build only). [D] [34] |
| Pattern generator | Patterns must pass through the *same* output path as the game | Self-generated inside TOTK Luma (preferred). dogegen is Windows-only (GPL-3.0). [D] [35] |

Lawful pattern sources:

- **Self-generated patterns:** TOTK Luma draws its own windows, ramps and checkers, so licensing is clean and the
  patterns pass through the real swapchain path. [I]
- **Apple's test patterns:** freely downloadable, but not to be redistributed in the repository (Apple terms; not
  reviewed in detail). [D] [7] [I]
- **Community sets:** freely licensed HDR pattern sets exist, but no licence was verified in this session. Do not
  bundle them. [I]

### 4. Profile-parameter table

Status key: **spec** (vendor or standard), **lab** (measured by a review lab), **owner** (to be measured by the owner),
**design** (TOTK Luma default).

**MacBook Pro 16 XDR profile**

| Parameter | Default value | Source | Status |
|---|---|---|---|
| Preset | Apple XDR Display (P3-1600 nits) | [3] | spec |
| Output encoding | RGBA16Float, extended linear sRGB, EDR on, edrMetadata nil | [9][11] | design |
| Paper white (game diffuse) | EDR 1.0 × scale 1.0 | [8][9] | design |
| UI / HUD white | EDR 1.0 × UI scale 0.85 (0.6-1.0) | [28] [I] | design |
| Peak target | min(live EDR headroom, MaxTML_EDR) | [9][10] | design + owner |
| Panel peak, small window | 1600 nits / 1,620 measured | [1][15] | spec / lab |
| Near-full / sustained full-screen | 1,214 measured / 1000 spec | [15][1] | lab / spec |
| EDR potential headroom | 16.0 | [38] | measured (probe) |
| Live headroom at the probe | 2.667 (SDR white about 600 nits, inferred) | [38] | measured (probe) |
| MaxTML_EDR (10 % clip point) | Equal to live headroom until tested | [27] | owner |
| Roll-off | BT.2390/2408 EETF, knee 1.5·maxLum − 0.5 | [28] | design |
| Black floor / lift | 0 / b = 0 | [15] | lab / design |
| Blooming check | Small-box and HUD-on-black pattern | [16] | owner |
| Gamut | BT.709 primaries; vivid off (max P3) | [15] | design |
| Refresh | 120 Hz ProMotion; fixed 60 Hz fallback | [1] | spec |
| Nano-texture | Unknown | [38] | owner |

**Sony A95L profile**

| Parameter | Default value | Source | Status |
|---|---|---|---|
| Input / format | HDMI 3 or 4; Enhanced (4K120 or VRR variant) | [17][18][24] | spec + owner |
| Picture mode | Game for play; Professional for reference measurements | [17][24] | design + owner |
| TV HDR tone mapping | Off during calibration; then compare Off and Gradation preferred | [19] | owner |
| TV Live Color / contrast enhancers | Off | [18] | design |
| Signal | HDR10 (PQ, BT.2020 container) via macOS | [12] | spec + owner |
| N = panel nits at EDR 1.0 | Unknown; Apple's "about 5x" headroom implies a TV-peak-dependent value | [12] | owner |
| Paper white | 203 nits on the panel (EDR = 203 / N) | [28] | spec + owner |
| UI / HUD white | ≤ 203 nits, UI scale 0.85 | [28] | design |
| MaxTML (10 %) | Start 1,000; expect 1,150-1,375 | [17][18][20] | lab + owner |
| MaxFFTML (100 %) | Start 250 | [20][21] | lab + owner |
| MinTML | 0 | [27] | spec + owner |
| Roll-off | BT.2390/2408 EETF to MaxTML; hard-clip option | [28] | design |
| Gamut | BT.709 in BT.2020; vivid capped at P3 | [17][18] | design |
| HDR10+ / Dolby Vision | Absent / research only (see note 08) | [17] | spec |
| Input lag | About 16 ms (4K60), about 8 ms (120 Hz) | [17][20] | lab |
| VRR | HDMI Forum VRR; range unconfirmed (48-120 Hz or below 20-120 Hz reported); macOS HDMI VRR unverified, and Apple's two pages conflict | [13][14][22][36] | owner |
| ALLM from the Mac | Unknown | - | owner |

### 5. Labelling semantics

| Label | Meaning | Where it comes from | Example |
|---|---|---|---|
| **Computed signal nits** | The luminance the renderer *requests*, assuming the profile's SDR-white value | EDR value × assumed N (TV) or × estimated SDR white (Mac) | "Peak 1,180 nits (computed)" |
| **Measured panel nits** | Luminance read from an instrument, with instrument model, correction file, window size, warm-up and date | Colorimeter or spectroradiometer | "10 % window 1,162 nits (measured, CCSS QD-OLED, 2026-11-xx)" |
| **EDR value** | Unitless renderer value; 1.0 is SDR white | Renderer | "Highlight 2.40 EDR" |
| **Headroom** | Live `maximumExtendedDynamicRangeColorComponentValue` | macOS | "Headroom 2.67x" |

Rules [I]:

- A computed value never appears without its assumption (for example "N = 205 nits, owner-measured on 2026-11-xx").
- A measured value never appears without the instrument and the window size.
- Values from the simulated demo carry "simulated", as AGENTS.md requires.

## Implications for TOTK Luma

1. **Two profile kinds, one renderer.**
   - The Mac profile works in relative EDR units and tracks headroom live.
   - The TV profile works in absolute target nits, converted to EDR through one measured constant N.
   - Both feed the same EETF. [I]
2. **Ship a built-in calibration screen before any HDR grading work.** It needs the three HGIG checkers, a PQ near-black
   ramp, a paper-white match against a macOS UI swatch, a blooming box, and P3/BT.2020 primary ramps. These are cheap,
   lawful, and they exercise the real swapchain path. [I]
3. **Do not trust the TV's or the Mac's own tone mapping for the default.** Set the TV's HDR Tone Mapping Off, leave
   `edrMetadata` nil, and do one EETF in the renderer. Offer "Gradation preferred" as an A/B setting that the owner
   evaluates. [D] [19][11] [I]
4. **Keep scene brightness modest on the A95L.**
   - Use paper white 203, and keep sky and cloud diffuse levels near paper white, not 2-3x above it.
   - The full-field limit (about 250 nits) otherwise causes ABL pumping on Sky Islands. [I]
5. **Budget for the low headroom on the Mac.** At high slider settings the headroom is about 2.7x [M] [38], and
   arithmetically at most about 1.6x near the 1000-nit outdoor SDR [I]. Apple notes the live maximum "might be 1.0, if
   the display is set to the maximum possible brightness". [D] [9] The tone mapper must degrade gracefully towards SDR at a headroom of 1.0 without changing
   mid-tones. The dashboard should show headroom so that "the HDR looks flat" can be diagnosed. [M] [38] [I]
6. **Frame-rate caps against display cadence** (detail in note 06).
   - The 45 FPS cap is smooth only with working VRR. On the TV that is unverified over HDMI.
   - At fixed 60 or 120 Hz, offer 30 and 60 (and 40 at 120 Hz). [I] [13][14]
7. **Measurement session order.** Warm up for 30 minutes, then run the HGIG tests (no instrument), the instrument spot
   reads if available, record N, and save the profile with the date, firmware and macOS build. [D] [7] [I]
8. **Record the beta OS.** macOS 27.2 is a beta. Store the build number in every profile; EDR behaviour can change
   between builds. [I]
9. **Calibration does not depend on where the HDR comes from.** The prior local report calls any HDR on 1.4.3 "an
   SDR-to-HDR conversion, not native HDR". [M] [39] The project goal is to recover scene HDR before the game's tonemap
   clips it (note 02). The profiles here hold either way. Only the label differs: the dashboard should say which source
   mode is active (recovered scene HDR or SDR expansion), so a calibrated image is not mistaken for genuine scene HDR. [I]

## Options compared

| Option | Peak accuracy | Needs an instrument | Robust to brightness changes | Risk |
|---|---|---|---|---|
| A. Renderer EETF to a measured MaxTML; TV tone mapping Off; edrMetadata nil (**recommended**) | High | No (instrument optional) | Yes, on the Mac via live headroom | Depends on "Off" being a clean clip |
| B. Renderer hard clip at the panel peak | Highest contrast | No | Partly | Flat highlights when the scene exceeds the peak |
| C. System tone mapping (CAEDRMetadata.hdr10) | Medium | No | Yes | More GPU and memory; the curve is opaque. [D] [11] |
| D. TV dynamic tone mapping (Gradation or Brightness preferred) on top of the renderer EETF | Low | No | n/a | Double tone mapping. [D] [27] [I] Note: What Hi-Fi recommends switching back to "Gradation Preferred" *after* calibrating with Off, saying it keeps the calibrated peak. [D] [19] So Gradation preferred is not proven to be double tone mapping; it is the A/B test in implication 3. |
| E. HDR Video reference mode on the Mac | Very high, repeatable | Optional | Slider locked | Not a play mode; 1000-nit sustained cap. [D] [3] |

## Unknowns and evidence gates

| Unknown | Why it matters | How to resolve | Gate or phase |
|---|---|---|---|
| N: panel nits of EDR 1.0 over macOS HDR10 to the A95L | Sets the TV paper-white EDR value | Instrument spot read of an EDR 1.0 full-field and 10 % window; or match visually against a 203-nit reference | G-DISP-1, calibration phase |
| Does macOS pass PQ code values straight to the TV, or remap them? | Decides whether TV profile values are absolute | Render PQ ramp steps, read them with an instrument, compare with the PQ curve | G-DISP-1 |
| Is A95L "HDR Tone Mapping: Off" a hard clip at the panel peak (HGIG-like)? | Choice between options A, B and D | HGIG 10 % checker; instrument reads above and below the clip | G-DISP-2 |
| A95L RTINGS values (2 %, 10 %, 100 %, Game mode, EOTF deltas, VRR range) | Lab cross-check | Read the review with RTINGS access, or rely on owner measurement | Optional |
| Game-mode peak versus Professional-mode peak on the owner's firmware | Mode choice | Measure both with the same pattern | G-DISP-2 |
| macOS HDMI VRR and ALLM to the A95L | 45 FPS smoothness, lag | Owner-attended display session (see note 06, gate G6-1) | G6-1 |
| ProMotion minimum rate under a 30/45 FPS cap | Cadence on the Mac | Present timestamps under the cap; ProMotion logging | Frame-pacing phase |
| MacBook blooming severity in Depths-like scenes | HUD and dark-scene design | Owner views the blooming pattern; camera photo optional | G-DISP-3 |
| Nano-texture or glossy panel | Perceived black, recommended room light | Owner checks the configuration | Before profiling |
| Fullscreen backing size given the scaled display mode | Sharpness and resolution goal | Log the drawable size in fullscreen | Render phase |
| A95L firmware menu names (Enhanced format variants) | Setup instructions | Owner photographs or notes the menu | G-DISP-2 |

## Risks

- **Over-trusting lab numbers.** Labs disagree by about 15 % at 10 % (1,146-1,373 nits), and units vary with mode and
  firmware. Treat them as starting points only. [D]/[A]
- **Double tone mapping** (TV DTM plus renderer EETF) can blow out highlights and make calibration meaningless.
  [D] [19][27]
- **EDR headroom collapse** at high brightness or outdoors makes "HDR" look like SDR on the Mac. This is expected
  behaviour, not a bug. [D] [9]
- **ABL pumping** on the OLED with bright, large-area content. [I]
- **Burn-in or retention** from a static HUD or dashboard on QD-OLED. [I]
- **Mini-LED blooming** around the HUD in dark scenes, and slow LCD response (41 ms) that smears motion at 60 FPS.
  [D] [15] [I]
- **Beta macOS** (27.2) may change EDR, HDMI or VRR behaviour between builds. [I]
- **Instrument error.** Without spectral correction, colorimeter readings on QD-OLED and mini-LED can be off. Label every
  measurement with its correction. [D] [32]
- **Licensing.** Do not commit Apple pattern files or third-party pattern sets to the public repository. [I]

## Effort notes

Assumptions: one developer, with the HDR output path from note 02 already working.

| Work item | Range |
|---|---|
| Built-in pattern generator (windows, ramps, checkers, primaries) and profile storage | 2-4 days |
| HGIG-style calibration UI with renderer-unit results and per-display profiles | 2-3 days |
| Live headroom tracking, smoothing and dashboard readouts (headroom, computed nits) | 1-2 days |
| Optional instrument integration (shell out to ArgyllCMS `spotread`, store measured panel nits) | 1-2 days |
| Owner measurement session per display (warm-up, visual tests, optional spot reads) | 2-4 hours each |
| A95L mode comparison (Game versus Professional; tone mapping Off versus Gradation preferred) | 1-2 hours |

Measurement sessions need the owner present and the display in use, so they cannot run in the background. [I]

## Sources

All accessed 2026-11-01 unless noted.

1. Apple, "MacBook Pro (16-inch, 2024) - Tech Specs". https://support.apple.com/en-us/121554
2. Apple, "MacBook Pro - Tech Specs" (current, M5 Pro and M5 Max). https://www.apple.com/macbook-pro/specs/
3. Apple, "Use presets and reference modes with your Apple display", published 2026-04-29. https://support.apple.com/en-us/108321
4. Apple Mac User Guide, "Create custom reference modes". https://support.apple.com/guide/mac-help/mchl50ecf3c4/mac
5. Apple Mac User Guide, "Use Fine-Tune Calibration in the Pro Display Calibrator". https://support.apple.com/guide/mac-help/mchlee9c1884/mac
6. Apple Mac User Guide, "Use Full Calibration in the Pro Display Calibrator". https://support.apple.com/guide/mac-help/mchl628f5edf/mac
7. Apple, "Measure the calibration of your MacBook Pro with Liquid Retina XDR display ...", published 2026-03-11. https://support.apple.com/en-us/105101
8. Apple Developer, "Displaying HDR content in a Metal layer". https://developer.apple.com/documentation/metal/displaying-hdr-content-in-a-metal-layer
9. Apple Developer, "Performing your own tone mapping". https://developer.apple.com/documentation/metal/performing-your-own-tone-mapping
10. Apple Developer, NSScreen `maximumExtendedDynamicRangeColorComponentValue`, `maximumPotentialExtendedDynamicRangeColorComponentValue`, `maximumReferenceExtendedDynamicRangeColorComponentValue`; also "Implementing tone mapping on reference displays". https://developer.apple.com/documentation/appkit/nsscreen
11. Apple Developer, `CAMetalLayer.edrMetadata`, `wantsExtendedDynamicRangeContent`, `CAEDRMetadata.hdr10(minLuminance:maxLuminance:opticalOutputScale:)`, `CAEDRMetadata.hlg`. https://developer.apple.com/documentation/quartzcore/caedrmetadata
12. Apple WWDC21 session 10161, "Explore HDR rendering with EDR" (transcript). https://developer.apple.com/videos/play/wwdc2021/10161/
13. Apple, "Use an Adaptive Sync external display with your Mac", published 2026-07-16. https://support.apple.com/en-us/102144
14. Apple, "Use an 8K display with your Mac", published 2025-03-18. https://support.apple.com/en-us/HT213513
15. Notebookcheck, "Apple MacBook Pro 16 2024 review: Enormous battery life and better performance of the M4 Pro", 2024-11-14. https://www.notebookcheck.net/Apple-MacBook-Pro-16-2024-review-Enormous-battery-life-and-better-performance-of-the-M4-Pro.917793.0.html
16. MacRumors, "Reports Suggest Mini-LED 'Blooming' Effect on New MacBook Pro Displays Not an Issue", 2021-10-28, and forum threads citing the Gizmodo zone count. https://www.macrumors.com/2021/10/28/macbook-pro-display-blooming-reports/ ; https://forums.macrumors.com/threads/macbook-pro-14-only-has-8-000-mini-leds.2319327 ; https://forums.macrumors.com/threads/blooming-effect-on-macbook-pro-16-nanotexture-normal-or-defect.2450171
17. Tom's Guide, "Sony Bravia XR A95L QD-OLED TV review", published 2023-11-09, modified 2024-02-08. https://www.tomsguide.com/reviews/sony-bravia-xr-a95l-oled-tv
18. Reviewed, "Sony A95L QD-OLED TV Review". https://reviewed.com/televisions/content/sony-a95l-qd-oled-tv-review
19. What Hi-Fi?, "If you're gaming on a 2023 Sony OLED TV, make sure you change this one setting", 2023-11-07. https://www.whathifi.com/advice/if-youre-gaming-on-a-2023-sony-oled-tv-make-sure-you-change-this-one-setting
20. AVForums, "Sony A95L (XR-65A95L) BRAVIA 4K QD OLED TV Review" (search extract only; HTTP 403). https://www.avforums.com/reviews/sony-a95l-xr-65a95l-bravia-4k-qd-oled-tv-review.21228/
21. Digital Trends, "Sony Bravia A95L QD-OLED TV review" (search extract only; HTTP 404). https://www.digitaltrends.com/home-theater/sony-bravia-xr-a95l-qd-oled-tv-review/
22. RTINGS, "Sony A95L OLED Review" and comparison pages (test names visible; values "Locked" for non-members). https://www.rtings.com/tv/reviews/sony/a95l-oled ; https://www.rtings.com/tv/tools/compare/sony-a95l-oled-vs-sony-bravia-9/39009/53321
23. RTINGS, "Sony A95L OLED Calibration Settings" (search extract only; the page body is rendered client-side). https://www.rtings.com/tv/reviews/sony/a95l-oled/settings
24. Sony Help Guide (BRAVIA 9 / 8 / 8 II / 7 / 5 / A95L ...), pages TP1001675611 (HDMI signal format), TP1001675534 (picture), TP1001675594 (computer signals). https://helpguide.sony.net/tv/musltn1/v1/en-003/index.html
25. Sony support article 00246472, "Which TV models support features specified in the HDMI 2.1 standard?" (HTTP 403). https://www.sony.co.th/en/electronics/support/televisions-projectors/articles/00246472
26. Portrait Displays, "Calman Home for Sony" (search extract). https://store.portrait.com/calman-home-for-sony.html
27. HDR Gaming Interest Group, "For a Better HDR Gaming Experience - Best Practice Recommendations for Game HDR Creation", version 1.1, 2019-07-11. https://www.hgig.org/doc/ForBetterHDRGaming.pdf
28. ITU-R Report BT.2408-9 (03/2026), "Guidelines for operational practices in HDR television production", §2.1 and Annex 5 (pp. 66-67). https://www.itu.int/pub/R-REP-BT.2408
29. ITU-R Report BT.2390-12 (03/2025), "High dynamic range television for production and international programme exchange". https://www.itu.int/pub/R-REP-BT.2390
30. ITU-R Recommendation BT.2100-3 (02/2025). https://www.itu.int/rec/R-REC-BT.2100
31. libplacebo, `src/tone_mapping.c` lines 470-513 (`pl_tone_map_bt2390`) at commit c4de47cd94 (2026-10-30). https://github.com/haasn/libplacebo
32. ArgyllCMS 3.5.0 (2026-02-04), home page and `ccxxmake` documentation. https://www.argyllcms.com/ ; https://www.argyllcms.com/doc/ccxxmake.html
33. DisplayCAL Python 3 fork, release 3.9.19 (2026-07-13), GPL-3.0. https://github.com/eoyilmaz/displaycal-py3
34. HCFR continuation, GPL-2.0, Windows build instructions. https://github.com/arthur-liberman/hcfr-code
35. dogegen, Windows SDR/HDR test-pattern generator, GPL-3.0. https://github.com/ledoge/dogegen
36. Choose.tv, "Sony A95L QD-OLED Review: Still the Reference King?" (VRR 48-120 Hz; search extract). https://www.choose.tv/us/tv/reviews/sony/sony-a95l_ADO
37. Calibrite Display Pro HL and Display Plus HL retailer listings (search extracts; e.g. Vistek, Markertek, Adorama). https://www.vistek.ca/store/459705/calibrite-display-pro-hl-colorimeter ; https://www.markertek.com/product/cbr-ccdis3plhl/calibrite-ccdis3plhl-display-plus-hl-hdr-monitor-projector-calibration-tool-powered-usb-10000-nits
38. Local read-only probe on the owner's Mac, 2026-11-01: an AppKit `NSScreen` query from a command-line script (no window) and `system_profiler SPDisplaysDataType` (serial numbers filtered out). Not stored in the repository.
39. Private local evidence workspace, TOTK-1.4.3-FINAL-REPORT.md §6 ("HDR: not validated"). Read-only.

## Independent verification

Checked 2026-11-01 by an independent reviewer, against primary pages fetched that day, the libplacebo source and a fresh
read-only probe. Verdicts: **confirmed**, **corrected** (the note was edited), **refuted**, **unverifiable**.

| Claim | Verdict | Evidence and source | Note |
|---|---|---|---|
| MacBook Pro 16 (2024) XDR spec: 1000 nits sustained, 1600 peak (HDR only), SDR 1000 outdoor, 1,000,000:1, P3, ProMotion to 120 Hz, fixed 47.95/48/50/59.94/60 Hz, HDMI 8K60 or 4K240 | Corrected | Apple tech specs page [1], raw HTML | All values match. The "< 25 °C" footnote is attached to the **1600-nit peak**, not to the SDR figure. Table row and the paragraph on [2] were fixed. |
| Current Apple page lists a 1-nit minimum and puts the footnote on the SDR outdoor figure | Corrected | Apple specs page [2], raw HTML | 1-nit minimum confirmed. The footnote marker appears after "1000 nits sustained full-screen" and, for the 16-inch, after the SDR outdoor figure. The page covers M5 Pro / M5 Max and mentions an M6 base model. |
| Notebookcheck: SDR 632 / 616, 1,063 with ALS, HDR 1,620 spot and 1,214 full white, P3 99.7 %, PWM 14,880 Hz, 41.2 ms black-to-white, i1Pro 2, 2024-11-14, no blooming discussion | Confirmed | Notebookcheck review [15] | Every value matches. Only the first 100 kB of the page was read; blooming was not found in that part. |
| NSScreen probe: built-in EDR current 2.667, potential 16.0, reference 0, 1312 x 848 @ 2x, 120 Hz; MSI monitors 1.0 / 1.0 / 0 | Confirmed | Re-run of a read-only AppKit query (no window) on 2026-11-01 | Identical values. Remains [M] for this machine and moment only. |
| EDR 1.0 = SDR white; 100/400-nit example; live max can be 1.0 at full brightness; values above it are clamped | Confirmed | Apple "Performing your own tone mapping" [9] (JSON doc body) | The 100/400 example is from [9], not from the WWDC session. Apple also says users "expect midtones to increase and highlights to be compressed", which supports implication 5. |
| `edrMetadata` nil means no system tone mapping, values above the max "may be clipped"; tone mapping costs memory and GPU | Confirmed | Apple `CAMetalLayer.edrMetadata` doc [11] | Exact wording matches. |
| `maximumPotential...` fixed per screen object; `maximumReference...` is 0 without reference support | Confirmed / corrected | Apple NSScreen docs [10] | Potential: "determined when you create the object, and doesn't change". The claim that the reference value becomes non-zero *in a reference mode* is not stated by Apple; retagged [I]. |
| WWDC21: "Roughly 5x SDR" on external HDR10 displays; `opticalOutputScale` "often set to HDR10's 100-nit reference white" | Confirmed | WWDC21 session 10161 transcript [12] | Exact quotes. |
| A95L: HDR10, HLG, Dolby Vision, no HDR10+; four HDMI, two HDMI 2.1, HDMI 3 eARC | Confirmed | Tom's Guide [17] ("except HDR10+", "2 HDMI 2.1, 2 HDMI 2.0"); Reviewed [18] (HDMI 3 is 2.1 and eARC) | "HDMI 4" as the second 2.1 port comes only from an RTINGS extract; retagged [A]. No Sony page confirms the per-port map. |
| A95L VRR is HDMI Forum only (no FreeSync, no G-SYNC) | Corrected | Reviewed [18] implies only; RTINGS comparison extract and Choose.tv [36] list G-SYNC Compatible "Yes" | "No FreeSync" stands. "HDMI Forum only" overstated; G-SYNC Compatible is reported. Irrelevant on a Mac. |
| A95L VRR range 48-120 Hz | Unverifiable | Choose.tv [36] says 48-120 Hz; an RTINGS extract gives a 4K VRR minimum below 20 Hz | Sources conflict; both are [A]. |
| macOS HDMI VRR to the TV is unverified | Confirmed, with new evidence | Apple 102144 [13]: "Do not use an HDMI cable or adapter" for Adaptive Sync. Apple HT213513 [14]: VRR on compatible external displays over HDMI for M2 Pro / M3 Pro-era Macs, M4 Pro not listed | Apple's own pages conflict. This directly affects the 45 FPS cap on the TV; keep it an owner test (gate G6-1). |
| A95L lab values: Tom's Guide 1,215 nits at 10 %, 99.95 % UHDA-P3, 89.41 % Rec.2020, 16.1 ms; Reviewed 1,507.4 nits at 5 % with tone mapping disabled, 99.83 % P3, 88.85 % BT.2020, about 350 nits APL, ANSI 359.6 / 0.0001 | Confirmed | Tom's Guide [17], Reviewed [18] | AVForums, Digital Trends and RTINGS values (including the about 8 ms at 120 Hz and 235-255 nits full field) were not re-checked and stay [A]. |
| What Hi-Fi: HDR Tone Mapping on by default even in Game mode, "artificially brighten highlights", turn Off (Picture > Brightness), calibrate, then "Gradation Preferred" | Confirmed | What Hi-Fi [19], published 2023-11-07 | What Hi-Fi also says Gradation Preferred "will retain the peak brightness settings you've implemented". The Options table row D was annotated, since [19] does not call it double tone mapping. |
| BT.2408-9 (03/2026) exists; reference and graphics white 203 cd/m²; EETF in Annex 5 | Partly unverifiable | ITU publication page [28] lists BT.2408-9 (03/2026) in force; BT.2390-12 (03/2025) confirmed [29] | The ITU PDF download returned "Request Rejected" (access failure, `https://www.itu.int/dms_pub/itu-r/opb/rep/R-REP-BT.2408-9-2026-PDF-E.pdf`). 203 cd/m² is widely cited from BT.2408; the annex number and graphics-white wording were not re-read. |
| EETF: KS = 1.5 · maxLum − 0.5, Hermite spline, black lift b(1 − E2)^4; libplacebo default knee offset 1.0 at `src/tone_mapping.c:470-513`, commit c4de47cd94 | Confirmed | libplacebo shallow clone at c4de47c (2026-10-30): `ks = (1 + offset) * maxLum - offset`, `param_def = 1.00`, header default `knee_offset = 1.0f`; black point exponent `bp = min(1/minLum, 4)` | With offset 0.5 this is exactly the BT.2390 knee. |
| HGIG v1.1 (2019-07-11): MaxTML 10 %, MaxFFTML 100 %, MinTML 10 %; "Adjust slider until gray squares just disappear"; categories MaxTML 600/1000/4000/10000, MaxFFTML 600, Category 4 MinTML 0 | Confirmed | HGIG PDF [27], text extracted locally | All values match. Categories 1-3 use MinTML 0.1 nits. |
| Apple Full Calibration instruments (PR-740/745/788/1050, CR-300/250/100, Calibrite Display Plus HL), up to 2 h with 30 min warm-up; Fine-Tune per preset on MacBook Pro | Confirmed | Apple guides [6], [5] | Fine-Tune lists white point x, y and luminance; the "Limit Luminance to Full Screen Capability" requirement comes from [4], which says it "must be selected to fine-tune" supported displays. |
| ArgyllCMS 3.5.0 (2026-02-04, AGPL); DisplayCAL 3.9.19 (2026-07-13, GPL-3.0); HCFR GPL-2.0; dogegen GPL-3.0 | Confirmed | argyllcms.com home page; GitHub API for the three repositories | HCFR "Windows build only" and dogegen "Windows-only" were not re-checked. |
| 2,554 zones / 10,216 mini-LEDs is a press figure, not Apple's | Confirmed | Search: ComputerBase and forum threads repeat it; Apple's 2021 marketing reportedly said "over 10,000 mini-LEDs" (second-hand) | Stays [A], low confidence. Not decision-critical. |
| SDR white about 600 nits at the probe (1600 / 2.667), so about 1.4 stops of headroom | Plausible inference | Arithmetic from [38] and Apple's headroom model [9]; agrees with Notebookcheck's 616-632 nits SDR maximum | Stays [I]. Added the caveat that other conditions can lower headroom and bias the estimate. |

Corrections made in the body: the footnote placement on both Apple spec pages, the A95L HDMI 4 tag, the A95L VRR and
G-SYNC wording, the VRR range, the Apple HDMI VRR conflict, the reference-headroom tag, the headroom wording in
implication 5, the option D annotation and the BT.2408 annex caveat.
