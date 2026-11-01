# TOTK Luma: Phased Plan and Effort

Status: Proposed, 2026-11-01

This document turns the six ADRs into a phased plan with effort ranges, gates and owner actions. It authorises
nothing. Every phase starts only after the owner approves the ADRs it depends on, and production emulator work stays
on hold until then (AGENTS.md rule 4).

**How to read the tags.** `[D]` documented, `[M]` measured, `[I]` inferred, `[A]` anecdotal. `[E]` cites
`docs/evidence/prior-local-evidence.md`. `R05 §3` cites research note 05, section 3, in `docs/research/`. ADR numbers
refer to `docs/adr/`.

**Every effort figure in this document is an estimate `[I]`.** The research notes give no measured effort, and R10's
own verification rates its phase ranges as unverifiable and keeps them as `[I]` with low confidence (R10 §Independent
verification).

---

## 1. Assumptions behind every number

- **Who does the work:** one experienced developer who knows C#, Vulkan and macOS, working with coding agents. This is
  the assumption R10's effort notes use (R10 §Effort notes).
- **Unit:** one person-week (pw) is five focused working days. Figures cover engineering time only. Owner-attended
  sessions are listed separately in section 5.
- **Owner availability:** the owner is available for short, scheduled, attended sessions on an uncontended Mac and,
  when needed, the A95L (ADR 0004, measurement hygiene).
- **No purchases.** No instrument (colorimeter), cable, TV or licence is bought. Mac nits stay computed and labelled
  "assumed" (ADR 0002, D9).
- **Base stays pinned** at Ryubing `475615f` with MoltenVK `1.4.2-ryujinx.5` (ADR 0001, D1 and D2). Upstream syncs
  are on demand and are not included in the phase totals (see section 4.4).
- **Not included:** P5 tracks (each is estimated on its own), calendar waiting time for attended sessions, and any
  owner review time.

---

## 2. The plan at a glance

```
            P1 Visible EDR + calibration (2-4 pw) ─┐
P0 (1.5-3) ─┤                                       ├─ P3 Scene HDR (4-10 pw) ─ P4 Polish (2-4 pw)
            P2 Paced higher frame rate (2-4 pw) ───┘        │
                                                            └─ if the ceiling is hit or gates fail:
                                                               Expanded SDR (3-7 days), labelled as such
P5 gated tracks: start only when their gate fires and the owner approves.
```

- **P0** builds the fork, the telemetry and the baselines. Nothing else can be measured honestly without it.
- **P1 and P2 can run in parallel** (ADR README §Phased plan). With one developer, "parallel" means they can be
  interleaved around attended sessions, and a blocker in one does not stop the other. It does not reduce person-weeks.
- **P3 needs P1** (output stage, SDR identity, capture findings) and the owner's P3 ceiling. It does not need P2.
- **P4 needs P1**, and its scene-stage looks need P3 (or run as "approximate" on the fallback tier).

---

## 3. Phases in detail

Each phase lists: goal, scope, deliverables, entry criteria, exit gate, kill criteria, effort, dependencies, and what
the owner must do or approve.

---

### P0. Foundation and truthful measurement

**Goal.** A reproducible, flag-gated Ryubing fork that behaves as stock with all flags off, plus per-frame data good
enough to support every later claim.

**Scope**

- Fork hygiene (ADR 0001, D10): `global.json` at `10.0.303` with `rollForward: disable` and `paths`; lock files with
  `--locked-mode`; SHA-256 of every dylib; `build-manifest.json` with OS and toolchain; launch by hash.
- Patch queue in the fixed order, with a `series` file and `rebase.sh` that runs `Ryujinx.Tests.Memory` and
  `Ryujinx.Tests.Input`; tags `luma/475615f/qN` (ADR 0001, D10).
- Per-variant bundles (`app.totkluma.ryubing.<variant>`: reference, measure, agent, hdr), each with its own
  `--root-data-dir`; saves copied from a manifest-checked backup.
- `luma.json` per data root and the CLI flags; profiles `macbook-xdr`, `a95l`, `measurement`, `agent-background`.
- The private title-pack loading mechanism (load by path, behind a flag). The pack's contents stay owner-local.
- The 512-entry per-frame telemetry ring: guest present, guest vsync tick, host submit, `actualPresentTime` (0 means
  dropped), cap, panel rate, present mode, D2 step, cache state (ADR 0003, §3).
- A+B in-game validation with the hypervisor On (G-AB) (ADR 0001, D2).
- C0/C1/C2 baselines in Great Sky Island, Beneath Hyrule Castle and the Room of Awakening, using the ADR 0003 protocol
  (60 s warm-up, 120 s × 3, one variable per run).
- The attended DualSense check (G-INP-1, G-INP-2) (ADR 0004).
- A headroom probe of both displays (R03 §1.6; ADR 0002, G-DISP inputs).
- One drill of the rollback ladder: flag off, previous bundle, rebuild from the previous tag, delete the build folder.

**Deliverables**

- The fork with queue tags, `series`, `rebase.sh` and `build-manifest.json`.
- Variant bundles and data roots, and a launcher that starts only hashed executables.
- Telemetry CSV export to the private workspace, readable later by the dashboard.
- A private baseline report: p50/p90/p99/p99.9/max, jitter, drops and speed per scene and cache state.
- A written G-AB verdict that sets the default CPU profile.
- G-INP-1 and G-INP-2 records; headroom readings for both displays; a rollback drill record.

**Entry criteria**

- The owner approves ADR 0001 (architecture A-first, one .NET toolchain).
- The owner decides the fork location and visibility (local-only by default).
- The owner approves the private title pack and schedules the first attended sessions (A+B, DualSense).

**Exit gate (all must hold)**

| Gate | Pass condition |
|---|---|
| G-BUILD | A rebuild from `build-manifest.json` reproduces the executable and dylib hashes |
| G-TEL | Per-frame p50/p95/p99 available; `VK_GOOGLE_display_timing` confirmed exposed by `1.4.2-ryujinx.5` |
| G-AB | Verdict from at least 900 s per scene (Room and island) against 0.012 flashes/s, Poisson test |
| G-INP-1, G-INP-2 | Recorded (TCC prompt check, `MISC1` and PS reach SDL; rumble side, double-open, gyro signs) |
| Baselines | C0/C1/C2 exist for the three scenes |
| Rollback | The ladder has been drilled once |

**Kill criteria**

- G-BUILD fails: no measurement is trusted and no later phase starts until pinning is fixed (ADR 0001).
- G-TEL display timing is missing: fall back to averaged `presentedTime` and make **no cadence claims**; P2's timed
  presents then need extra MoltenVK work (up to 3 more days, R09 §Effort notes) or the G-PRES-3 route.
- G-AB fails: Hypervisor Off at 1.2x stays the default. The write-tracking redesign (2-6 weeks) is only a P5 option
  with owner approval (ADR 0001, D2).
- Rollback drill fails: fix the ladder before P1 work starts.
- Fork-wide kill criterion: if one upstream sync costs more than the owner's per-sync budget twice in a row, the base
  is re-evaluated (ADR 0001).

**Effort: about 1.5-3 pw [I]**

- R10 phase 0 fork hygiene: 1-2 pw.
- Telemetry: 2-4 days (R06).
- A+B validation: 2-4 h attended plus 0.5 day of analysis (R05).
- DualSense check (0.5-1 day, R07) and headroom probe (0.5-1 day, R03) fit inside the upper end only if they are
  short; see section 4.3.

**Dependencies.** None on other phases. External: the pinned .NET SDK, MoltenVK `1.4.2-ryujinx.5`, an uncontended
Mac for the baselines.

**Owner must do or approve**

- Approve ADR 0001, the fork location and visibility, and whether builds stay local or use free public CI.
- Approve the title pack and its owner-local location.
- Decide the default CPU profile until G-AB (proposed: Hypervisor Off at 1.2x).
- Attend: A+B validation (at least 900 s per scene), the DualSense check, and the baseline runs (the owner starts
  measured runs; agents never do, ADR 0004).
- Respond to any TCC (Input Monitoring) prompt personally; no TCC changes are planned.
- Set the variant set and retention (N-1 or N-2) and the per-sync budget.
- Decide the upstream policy: shmfix and the `contentsScale` fix now, A+B after G-AB.

---

### P1. Visible EDR on both displays, with calibration

**Goal.** A correct EDR image on the MacBook XDR panel and the A95L through one portable output stage, with
calibration patterns, per-display profiles and the dashboard core. Scene HDR is not part of P1: the game image is
still the SDR frame, shown honestly as "SDR".

**Scope**

- The Luma output stage behind `IOutputStage` inside Vulkan `Window.Present`: one pass that decodes, applies the
  profile EETF against live headroom, runs display-stage looks (off by default), composites UI at UI white, draws the
  dashboard and patterns, and encodes one `R16G16B16A16_SFLOAT` + `EXTENDED_SRGB_LINEAR` drawable (ADR 0002, D4).
- Safety rules: `EDRMetadata` nil, no `vkSetHdrMetadataEXT`, format pair logged, passthrough barred from HDR.
- The C# display helper: `toneMapMode = never`, the `contentsScale` fix (#461), `preferredDynamicRange` evaluated,
  all re-applied after each swapchain recreate; headroom from the notification plus a per-frame read.
- Dear ImGui draw lists rendered by Luma's own Vulkan pass, pinned and hashed (G-UI-0), or the custom renderer.
- Dashboard core: frame-time graph, FPS, headroom (current, potential, reference, stale), present mode, cadence fit,
  source mode, backend and cache state, each number labelled signal, profile or measured (ADR 0002, D9).
- Calibration patterns drawn by the stage itself: HGIG 10% and full-field, near-black PQ ramp, paper-white swatch,
  blooming box, primary ramps.
- Profiles: Mac relative EDR (paper white EDR 1.0, peak = min(live headroom, owner MaxTML)); A95L absolute nits
  through measured N (paper white 203, MaxTML starting at 1,000, MaxFFTML 250) (ADR 0002, D3).
- A95L sessions: G6-1 (HDMI VRR), G6-2 (mode list, HDR at 4K120 and the HiDPI limit), the read-only EDID VSVDB decode
  (G-DV-EDID), and N.
- One attended capture session (G-HDR-1): U1-U5, U8 and the identity of the post-tonemap pass (CAS or EASU). Dumps
  stay private.

**Deliverables**

- Output stage with an SDR identity mode and an EDR mode; display helper; dashboard core; calibration patterns.
- Stored HGIG results (MaxTML, MaxFFTML, MinTML) for both displays, in the private workspace.
- A95L session record (G6-1, G6-2, EDID decode, N); G-PRES-1 and G-PRES-2 records.
- Private capture findings (U1-U5, U8, post-tonemap pass identity).
- A short go/no-go note for P3 with the owner's person-week ceiling.

**Entry criteria**

- P0 exit gate met (in particular G-BUILD and G-TEL, so stage cost can be measured).
- The owner approves ADR 0002 (in-swapchain presenter, ImGui subject to G-UI-0) and ADR 0005 (DV not pursued).
- A95L session and capture session scheduled.

**Exit gate (all must hold)**

| Gate | Pass condition |
|---|---|
| G-HDR-0 | Output stage in SDR identity mode matches stock within ±1 code value |
| G-PRES-1 | Layer state survives create and recreate; a ramp card shows no system tone mapping |
| G-PRES-2 | Instruments direct-to-display state recorded, overlay on and off |
| G-UI-0 | ImGui binding and native library pinned and reproducible on osx-arm64, or the custom renderer chosen |
| G-DISP | HGIG MaxTML and MinTML stored for both displays, MaxFFTML for the A95L; headroom, N and HDMI format recorded |
| G-HDR-1 | Capture findings recorded privately |
| Owner decision | The owner has set the P3 person-week ceiling and decided whether to proceed |

G-UI-3 (GPU timestamp queries work on MoltenVK) is also checked here, because P4's G-UI-1 depends on it.

**Kill criteria**

- G-HDR-0 fails: do not proceed to EDR; fix the stage (ADR 0002).
- G-PRES-1 fails: the re-apply strategy is broken. This is a candidate trigger for the native presenter, which still
  needs G-NATIVE (a failed G-PRES gate **and** a 1-day export spike that passes SDR identity).
- G-PRES-2 shows composition: measure the latency cost first; a native presenter is considered only through G-NATIVE.
- G-UI-0 fails: switch to the custom immediate-mode renderer (4-8 days, R09), inside the P1 range.
- If Avalonia blocks clean fullscreen on the A95L, G-REOPEN-C fires (ADR 0001) and the owner decides.

**Effort: about 2-4 pw [I]**

- Output stage, EDR swapchain and headroom plumbing: 1-2 weeks (R02 option C; includes R03's 1-3 day option-A spike).
- Patterns and profile storage 2-4 days, calibration UI 2-3 days, headroom readouts 1-2 days: 5-9 days (R04).
- Part of the 4-8 day overlay renderer work (R09).
- See section 4.3 for why the bottom-up sum can exceed 4 pw.

**Dependencies.** P0. The A95L connected on HDMI 3 or 4 with Enhanced format for the TV sessions (ADR 0002, open
question 7). Independent of P2.

**Owner must do or approve**

- Approve ADR 0002 and ADR 0005.
- Approve Dear ImGui (MIT) as a pinned dependency, subject to G-UI-0, and confirm the UI scale default of 0.85.
- Attend the A95L sessions (HDMI 3 or 4, Enhanced format, TV HDR Tone Mapping Off during calibration) and the capture
  session (dumps kept private).
- Accept computed-nits-only labelling until an instrument is available.
- Set the P3 person-week ceiling and decide whether P3 proceeds.

---

### P2. Correctly paced higher frame rate

**Goal.** Higher frame rates the owner can feel, at correct game speed, with honest per-display cap menus. Stable
pacing and correct speed, physics, animation, audio and saves come before counter FPS.

**Scope**

- Cap UI with per-display policy (ADR 0003, §2): a cap is a guest vsync rate plus D2; without D2 only "30 (native)";
  under D2, Unbounded, turbo and Custom above 60 are refused and the cycling hotkey becomes direct selection.
- D2 loaded from the private title pack, with a checksum field in `luma.json`; `LSSupportsGameMode` in the plist.
- Timed presents through `VK_GOOGLE_display_timing` (`present(at:)`).
- Display-locked guest vsync (`CVDisplayLink` or `CAMetalDisplayLink`, virtual 60 at 120 Hz), keeping the timer as
  fallback.
- Host LFC, only after G6-1 passes. Movie auto-30, only after G6-3 shows how TOTK decodes movies.
- Selective performance tests (ADR 0001, D2): 1.0x vs 1.2x scale on the island, concurrent compilation
  (`MVK_CONFIG_SHOULD_MAXIMIZE_CONCURRENT_COMPILATION=1`), FencePool !195 A/B; optional `1.4.3-ryujinx.2` A/B gated
  on G6-6.
- DualSense v1 patches (CAP_RGB_LED, player index, property set, rumble sides, NpadHdRumble skip) and the composite
  driver with owner-wins arbitration (ADR 0004). The pump patch waits for G-INP-4.
- Display gates G6-3, G6-4, G6-5, G6-7, G6-8 and G6-10; G6-9 is optional. G6-6 (direct-to-display) is checked in P1
  together with G-PRES-2, and G6-1 and G6-2 in the P1 A95L session; P2 uses their results for the menus and LFC.

**Deliverables**

- Cap menus per display; a private validation report per cap and display; the status of 45 per display.
- A performance A/B report (scale, concurrent compile, FencePool) with telemetry, not status-bar FPS.
- DualSense v1 patches with tests; owner-wins arbitration with a live replay record (G-INP-6).

**Entry criteria**

- P0 exit gate met (G-TEL is a prerequisite for every cadence claim; G-AB has set the default CPU profile).
- The owner approves ADR 0003 and ADR 0004, D2 in the title pack, and the licence review of D2's FPSLocker-derived
  facts.
- D2 validation sessions (G6-4) scheduled.

**Exit gate (all must hold)**

| Gate | Pass condition |
|---|---|
| G-CAP | For every offered cap and display: p99 at most 1.25x the target interval, speed 1.00 ± 0.01, cadence error rate published, no steady-state shader spike |
| G6-4 | D2 audio, physics and 30+ minute sessions pass, or failing caps are withdrawn |
| G6-3 | Resolved, or automatic 30 is in place |
| 45 | Status recorded per display ("even", "uneven" or "VRR") |
| G-60 | 60 is unlabelled only where guest frame time is 20 ms or less with headroom |
| G-INP-6 | Owner-wins arbitration replayed live |

**Kill criteria**

- Display-locked vsync does not reduce the cadence error rate against the timer: keep the timer, drop the patch.
- Timed presents unreliable on MoltenVK: record under G-PRES-3; only then consider the native presenter.
- D2 fails G6-4 at a cap: that cap is withdrawn. If it fails at every cap above 30: ship "30 (native)" only.
- G-INP-6 fails: agent sessions run only with the physical pad disconnected.

**Effort: about 2-4 pw [I]**

- R06 work: cap UI 1-2 days, vsync lock 4-8 days, timed presents and LFC 3-6 days, validation 2-3 days.
- R05 tests: 1.5-3 days.
- R07 patches and arbitration: 2-4 days.
- Movie auto-30, if G6-3 allows it: 2-5 days (R06), not inside the ADR range; see section 4.3.

**Dependencies.** P0. Independent of P1, except that the cap and cadence readouts appear in the P1 dashboard core
once both exist. An A95L session for G6-1 (shared with P1).

**Owner must do or approve**

- Approve ADR 0003 and ADR 0004; approve D2 as an owner-supplied title-pack file plus the licence review.
- Accept 30 as the guaranteed cap and 60 as experimental until G-60. Accept 45 with a cadence warning, with 40 or 48
  suggested unless HDMI VRR is verified.
- Decide whether 1.0x scale is acceptable if it is the only route to 60, given the "about 1080p" goal (1.2x is the
  ~1080p setting).
- Decide on the optional MoltenVK `1.4.3-ryujinx.2` A/B.
- Attend: per-display validation (0.5 day each × 4-6 configurations, R06), D2 sessions of 30+ minutes per cap, and the
  live arbitration replay.

---

### P3. Genuine scene HDR

**Goal.** Recover the highlights TOTK clips at its tonemap (R02 §3) and carry them to both displays, with game UI at
a comfortable paper white. This is the core of the HDR ambition and the highest-uncertainty phase.

**Scope (ADR 0002, D3)**

- (A) Tonemap replacement keyed by guest `Hash128` in `ShaderCache.TranslateShader`: vanilla `1 - e^-x` below a pivot,
  roll-off to the profile peak instead of `saturate()`; parameters in the support buffer; bloom replacement optional.
- (B) HDR-safe post-tonemap sharpen/scale (encode, filter, decode), never a point fetch; CAS or EASU as found in P1.
- (C) Host-only RGBA16F upgrade of an exact allow-list (targets written by replaced passes plus final and present
  buffers), with half-to-RGBA8 readback conversion.
- The UI boundary model: scene written scaled by `game_white / ui_white`, UI keeps [0, 1], output multiplies by
  `ui_white`; guest-hash exceptions; video stays at paper white.
- The scene-stage looks hook (ADR 0006), scene and output histograms, and the source-clip counter.
- EETF from the BT.2390 / BT.2408 formula; Neutwo (MIT) as the alternative; no GPL code.
- TOTK shaders, hashes and the allow-list live in the title pack; the fork carries only the mechanisms.

**Deliverables**

- Registry and RT allow-list mechanisms in the fork; TOTK replacement shaders and hash table in the title pack.
- Validation tooling (CPU reference, offscreen harness, debug hash logging; about 1 week, R02).
- A private run report for G-HDR-2 and G-HDR-3, and the owner's G-HDR-4 side-by-side record.
- The dashboard source mode reads "Scene HDR" only when the gates pass.

**Entry criteria**

- P1 exit gate met, in particular G-HDR-0 and the G-HDR-1 capture findings. Without G-HDR-1, P3 does not start.
- The owner's P3 ceiling is set and the owner has decided to proceed.

**Exit gate (all must hold)**

| Gate | Pass condition |
|---|---|
| G-HDR-2 | Every host specialisation variant is covered (no frames rendered vanilla) and the cache is re-keyed |
| G-HDR-3 | A 900 s warm run with 0 new artefacts in each scene, plus an island cost A/B |
| G-HDR-4 | The owner's side-by-side on both displays shows recovered highlight detail, clean gradients and correct colour, judged on detail, not brightness; the source-clip counter confirms recovered data |

**Kill criteria**

- P3 reaches the owner's ceiling, or cannot pass G-HDR-3: ship the "Expanded SDR" fallback (3-7 days after the output
  stage, R02), clearly labelled, and record scene HDR as "not achieved". The fallback is never labelled HDR.
- G-HDR-2 fails: fix coverage before any visual judgement.
- Any new artefact: the RT-upgrade kill switch returns to SDR and the allow-list is narrowed.

**Effort: about 4-10 pw [I], the highest uncertainty**

- (A) tonemap replacement: 1-3 weeks once hashes are known (R02).
- (C) RT allow-list upgrade: 2-5 weeks, the largest uncertainty (R02).
- UI paper-white model: 3-5 days after U2 (R02).
- Post-tonemap HDR-safe pass (CAS handling): 2-6 days (R01).
- Fallback, if needed: Expanded SDR 3-7 days, in place of the unspent remainder.

**Dependencies.** P1 (output stage, profiles, dashboard, capture findings). The D2 patch must not alter the hashed
shaders (ADR 0003, §4). Not dependent on P2.

**Owner must do or approve**

- Set the person-week ceiling before P3 starts.
- Attend the G-HDR-4 side-by-side on both displays.
- Approve any further private capture if the first one leaves an unknown open.

---

### P4. Scopes, looks and polish

**Goal.** Make the HDR and performance tools pleasant and trustworthy, and offer optional vivid and defog looks
that never pass for HDR.

**Scope**

- Full scopes (ADR 0002, D9): PQ-axis waveform, clipping and gamut counters, readback ring.
- Looks (ADR 0006, D8): display stage (ICtCp highlight-aware chroma, soft gamut compression to P3) and, with P3, the
  scene stage (airlight defog, exposure and white balance, Oklab vivid); neutral by default, three strengths. Before
  P3 only the display stage runs, labelled "approximate".
- Defog priority: owner-installed Serfrost Base v2.4 (never bundled, checksum, G-LOOK-1), then scene airlight, then
  display-stage dithered subtraction. No depth-based defog.
- Presets and a troubleshooting guide; OLED auto-dim.
- Dashboard toggle: DualSense mute (`MISC1`) removed from guest mapping, one unbound keyboard key, optional touchpad
  click, Create+Options chord as fallback (ADR 0004).
- Audit of the signal / profile / measured labels.

**Deliverables**

- Scopes and counters, looks at three strengths, presets, troubleshooting guide, toggle bindings.
- G-UI-1 timing record, G-UI-2 usability record, G-LOOK-1 and G-LOOK-2 records, labelling audit.

**Entry criteria**

- P1 exit gate met. The scene-stage looks need P3 or run "approximate" on the fallback tier.
- G-UI-3 resolved (timestamps on MoltenVK, or an Instruments trace as substitute).

**Exit gate (all must hold)**

| Gate | Pass condition |
|---|---|
| G-UI-1 | Overlay and scope cost measured with GPU timestamps (estimate 0.05-0.2 ms, R09), zero when hidden |
| G-UI-2 | Owner usability pass (HGIG clip points found without an instrument) |
| G-LOOK-1 | Same-framing Serfrost A/B in a hazy area recorded |
| G-LOOK-2 | Banding and temporal-stability checks pass |
| Labels | Every dashboard number carries its label |

**Kill criteria**

- G-UI-1 over budget: simplify scopes or sub-sample harder.
- G-LOOK-1 fails: built-in defog only.
- A look fails G-LOOK-2 at every strength: it is removed rather than shipped with visible banding.

**Effort: about 2-4 pw [I]**

- Scopes 4-7 days plus 2-3 days of validation (R09).
- Looks 3-6 days (R09).
- Input toggle 2-4 days (R09; R07's 0.5-1 day covers the touchpad click only).
- Headroom readouts 1-2 days (R04).

**Dependencies.** P1; P3 for the scene stage; the owner's Serfrost install for G-LOOK-1.

**Owner must do or approve**

- Decide whether to install Serfrost Base yourself for the A/B.
- Confirm the toggle bindings (mute plus one key; touchpad click optional).
- Attend the usability pass and the same-framing A/B.
- Name any ReShade FX effects you want (this decides G-FX in P5).

---

### P5. Gated tracks

**Goal.** Optional extensions, each started only when its gate fires and the owner approves, and each ending in a
written go/no-go with measured evidence.

| Track | Gate that opens it | Effort [I] | Notes |
|---|---|---|---|
| KosmicKrisp variant | Owner approves a driver (source build, LunarG SDK, or PR !131 binary); switch only via G-KK | 1-3 days evaluation (R05) | G-KK: warm C2, 0 new artefacts in 900 s, p95 at least 10% better GPU-bound, EDR verified on both displays, pacing parity |
| Native Swift presenter | G-NATIVE (a G-PRES-1..3 failure **and** a passing 1-day export spike); shelved by G-PRES-4 | 1.5-3 weeks (R03) | MoltenVK-only, same `IOutputStage` seam |
| GameController shim | G-INP-3 fails (SDL cannot drive adaptive triggers) | Not estimated; R07 gives "weeks" | Reopens G-REOPEN-C |
| USB voice-coil PCM haptics | Owner go | 1-2 weeks (R07) | |
| Adaptive triggers | Owner go; read-only TOTK hooks kept private | 2-4 weeks (R07) | |
| Bluetooth haptics | Owner go | 2-4 weeks, uncertain (R07) | May be a no-go |
| reshadefx embedding | G-FX: after P4, only if the owner names effects | 3-6 weeks (R09) | No Windows add-on ABI |
| DV-like scene-adaptive peak | G-DV-PEAK: after P3; at most about 0.3 ms GPU | 1-3 weeks plus 2-4 days per display profile (R08) | Off if it pumps or exceeds budget |
| Write-tracking redesign | Only if A+B fails G-AB | 2-6 weeks (R05) | High correctness risk |

Never opened by default: native Metal (G-METAL; 6-18+ person-months, R05), option B (G-REOPEN-B), option D
(G-REOPEN-D).

---

## 4. Effort summary

### 4.1 Per-phase and cumulative ranges

| Phase | Optimistic | Expected | Pessimistic | Cumulative (opt / exp / pess) |
|---|---|---|---|---|
| P0 Foundation and measurement | 1.5 | 2.25 | 3 | 1.5 / 2.25 / 3 |
| P1 Visible EDR and calibration | 2 | 3 | 4 | 3.5 / 5.25 / 7 |
| P2 Paced higher frame rate | 2 | 3 | 4 | 5.5 / 8.25 / 11 |
| P3 Genuine scene HDR | 4 | 7 | 10 | 9.5 / 15.25 / 21 |
| P4 Scopes, looks and polish | 2 | 3 | 4 | 11.5 / 18.25 / 25 |
| **P0-P4 total** | **11.5** | **about 18** | **25** | |

All figures are person-weeks `[I]`. The order P1 then P2 is arbitrary; they can be swapped or interleaved.

**What each column assumes**

- **Optimistic (the ADR low end).** Every gate passes first time; ImGui passes G-UI-0; `VK_GOOGLE_display_timing`
  works as read; the capture session confirms R02's model of the tonemap; agents do the unit-probe and harness work
  while the developer works on the hot paths; attended sessions happen on schedule.
- **Expected (the midpoint of each ADR range).** One or two gates need a second attempt (for example G-UI-0 falls back
  to the custom renderer, or one cap is withdrawn after G6-4); the RT allow-list in P3 is moderately larger than the
  minimum; normal rework after owner reviews.
- **Pessimistic (the ADR high end).** P3 hits the upper end of R02's RT-upgrade range (several alias or copy paths);
  presentation needs extra MoltenVK work; P1 and P2 each need a second round after display sessions.

**Beyond the pessimistic column.** If P3 spends a full 10 pw and still fails its gates, the labelled Expanded SDR tier
adds 3-7 days, giving up to about 26.5 pw for P0-P4. Section 4.3 lists the places where a strict bottom-up sum runs
above the ADR ranges.

**Comparison.** R10 gives 11-24 pw for the hybrid with scene HDR (R10 §Effort notes). The ADR plan is 11.5-25 pw with
no Xcode toolchain in the critical path. The two are close because R10's 4-8 pw native-dylib phase is replaced by the
in-swapchain output stage (P1) plus the parts of the dashboard, pacing and input work that R10 placed in that phase.

### 4.2 Minimum showcase versus full ambition

**Minimum showcase.** P0 + P1 + P2 + the labelled Expanded SDR tier, with no P3 attempt.

| Item | Effort [I] |
|---|---|
| P0 | 1.5-3 pw |
| P1 | 2-4 pw |
| P2 | 2-4 pw |
| Expanded SDR (3-7 days, R02) | about 0.6-1.4 pw |
| **Total** | **about 6-12.5 pw** (expected about 9) |

What it delivers: a reproducible fork with rollback; truthful frame-time data; visible, calibrated EDR on both
displays with SDR-safe UI; the dashboard core; speed-correct 30 with 40, 48 and experimental 60 where the gates allow;
DualSense v1 with owner-wins automation. What it does **not** deliver: genuine scene HDR. The dashboard says
"Expanded SDR", never "HDR". It also lacks the waveform, full counters, looks and presets of P4.

A middle path is the same plus a P3 attempt under a tight ceiling (for example the optimistic 4 pw): about 10-16.5 pw,
falling back to Expanded SDR if the ceiling is hit.

**Full ambition.** P0-P4, plus the P5 tracks most likely to add owner value:

| Item | Effort [I] |
|---|---|
| P0-P4 | 11.5-25 pw |
| KosmicKrisp evaluation | 1-3 days |
| USB voice-coil PCM haptics | 1-2 weeks |
| Adaptive triggers | 2-4 weeks |
| DV-like scene-adaptive peak, plus 2-4 days validation for each of two display profiles | 1-3 weeks plus 0.8-1.6 pw |
| **Total** | **about 16.5-36 pw** |

Conditional tracks are **not** in that total because they start only if a gate fires: native presenter (1.5-3 weeks),
write-tracking redesign (2-6 weeks), reshadefx (3-6 weeks), Bluetooth haptics (2-4 weeks, uncertain) and the
GameController shim (not estimated). If every one of them fired, the full ambition would grow by about 8.5-19 pw plus
the shim.

### 4.3 Where the research estimates differ, and how they were reconciled

| Item | Estimates in the notes | Used in this plan | Why |
|---|---|---|---|
| Telemetry | R05: 0.5-2 days (guest-frame hook only); R06: 2-4 days; R09: 3-5 days plus up to 3 if display timing needs MoltenVK work | 2-4 days in P0 | R06 covers the full ring and CSV. R09's extra 3 days is the cost if G-TEL fails |
| Output stage | R01: 2-5 days (swapchain plus headroom); R03: 1-3 days (option-A spike); R02: 1-2 weeks (swapchain, float effects, output pass, headroom) | 1-2 weeks in P1 | R02's scope is the product; the R01 and R03 figures are subsets of it |
| Tonemap replacement | R01: 1-3 days dump plus 3-8 days port; R02: 1-3 weeks | 1-3 weeks | R02 includes the replacement table, cache re-key and support-buffer parameters |
| RGBA16F upgrade | R01: 1-3 weeks; R02: 2-5 weeks | 2-5 weeks | R02 accounts for alias and copy paths, the cause of PR !31's instability |
| Scene HDR total | R02: 6-12 weeks for A+B+C+UI; R10 phase 3: 4-10 pw | 4-10 pw in P3 | R02's C (1-2 weeks) and part of its validation tooling sit in P1 |
| Dashboard toggle | R07: 0.5-1 day (touchpad click); R09: 2-4 days (mute, chord, guest swallow) | 2-4 days in P4 | The ADR 0004 decision is the mute button plus chord, which is R09's scope. P1 uses a keyboard key only |
| Whole programme | R10: 11-24 pw (hybrid with scene HDR) | 11.5-25 pw | See section 4.1 |

**Bottom-up checks against the ADR phase ranges.** Adding the cited items at face value gives the following. The
plan keeps the ADR ranges, and these overruns are why the expected column should not be read as a promise.

| Phase | ADR range | Bottom-up sum of cited items | Gap and what absorbs it |
|---|---|---|---|
| P0 | 1.5-3 pw | about 1.7-3.4 pw (fork 1-2 pw, telemetry 2-4 d, A+B 0.6-1 d, DualSense 0.5-1 d, probe 0.5-1 d), plus baseline runs | Upper end slightly over. The probe already exists as an out-of-tree diagnostic (R03 §Effort notes) |
| P1 | 2-4 pw | about 4.5-7.5 pw if R09's presenter-stage chain (3-5 d), the full overlay renderer (4-8 d) and R02's validation tooling (about 1 week) do not overlap R02's option C | The ADR range assumes those overlap with option C, and that most of the tooling lands in P3 |
| P2 | 2-4 pw | about 2.7-5.2 pw (R06 10-19 d, R05 1.5-3 d, R07 2-4 d), plus movie auto-30 (2-5 d) if G6-3 allows it | Upper end over. Auto-30 is conditional; if it is built, expect P2 at or above its pessimistic figure |
| P3 | 4-10 pw | about 4-10 pw (A, C, UI model, CAS handling) | Consistent |
| P4 | 2-4 pw | about 2.4-4.4 pw, plus presets, troubleshooting guide, auto-dim and audit (not estimated in the notes) | Upper end slightly over |

If every cited item landed at its upper end with no overlap, P0-P4 would reach about 31-32 pw. That is a stress case,
not a planning figure.

### 4.4 Costs outside the phase totals

- **Upstream syncs:** 0.5-2 days each now, 2-5 days each after P3 lands in `Window.cs` and `Gpu/Image` (R10 §2A).
  Syncs are on demand from the pinned base, so the owner controls how often this cost is paid.
- **Watching brief for Dolby Vision:** about 1 h per major macOS SDK release (ADR 0005).
- **Builds** run only when the owner agrees, because they compete for CPU (ADR 0001, D10). A new build also costs a
  cold shader cache of about 85-88 s and about 1,017 shaders before any timing [E].

---

## 5. Owner-attended sessions

Attended time is short but sets the calendar, because no measured run is started by an agent and the host must be
uncontended (ADR 0004).

| Session | Phase | Owner time [I] | Gate(s) |
|---|---|---|---|
| A+B flash validation (at least 900 s per scene, Room and island) | P0 | 2-4 h (R05) | G-AB |
| DualSense check over USB and Bluetooth | P0 | about 1 h within 0.5-1 day (R07) | G-INP-1, G-INP-2 |
| Baseline runs (3 scenes × C0/C1/C2, 60 s warm-up, 120 s × 3) | P0 | Owner starts each run | Baselines |
| A95L display session (HDMI 3/4, Enhanced, TV tone mapping Off) | P1 | 2-4 h per display, plus 1-2 h mode comparison (R04) | G6-1, G6-2, G-DISP, G-DV-EDID |
| GPU capture and shader-hash session (dumps private) | P1 | One scheduled run | G-HDR-1 |
| Per-display cap validation | P2 | 0.5 day × 4-6 configurations (R06) | G-CAP, G6-5/7, G6-8 |
| D2 long sessions | P2 | 30+ minutes per cap | G6-4 |
| Live arbitration replay | P2 | Short | G-INP-6 |
| HDR side-by-side on both displays | P3 | Short | G-HDR-4 |
| Usability pass and Serfrost same-framing A/B | P4 | Short | G-UI-2, G-LOOK-1 |

---

## 6. How evidence gates stop spending

The plan spends money (developer time) only after a cheap check shows the expensive step is worth it. Each gate below
costs hours or days and protects weeks.

| Cheap check | Its cost [I] | What it protects | Rule |
|---|---|---|---|
| G-BUILD, G-TEL | Part of P0 | Every later claim | Nothing is measured until the build reproduces and per-frame data exists |
| G-AB | 2-4 h attended plus 0.5 day | Write-tracking redesign, 2-6 weeks | The redesign is considered only if A+B fails |
| G-HDR-0 | Part of P1 | All EDR and scene-HDR work | No EDR work on a stage that alters the SDR image |
| G-HDR-1 capture session | One attended session | P3 RT upgrade (2-5 weeks) and tonemap work (1-3 weeks) | P3 does not start without it |
| Owner's P3 ceiling | A decision | The open-ended part of scene HDR | At the ceiling, ship labelled Expanded SDR (3-7 days) and stop |
| G-NATIVE | A 1-day spike, only after a G-PRES failure | Native presenter, 1.5-3 weeks plus a second toolchain | Both conditions must hold |
| G-KK | 1-3 days evaluation | A backend switch that would reset every baseline | Switch only on measured gains and parity |
| G-METAL | Profiling within normal runs | Native Metal, 6-18+ person-months | Stays closed unless translation dominates in 3 heavy scenes on both backends |
| G-FX | A decision after P4 | reshadefx, 3-6 weeks | Opens only if the owner names effects the built-in looks cannot provide |
| G-INP-3 | Part of P5 trigger work | GameController shim, weeks | Opens only if SDL cannot drive the triggers |
| G6-4 per cap | 30+ min per cap | Shipping caps that break audio or physics | Failing caps are withdrawn, not fixed at any cost |
| Fork kill criterion | Tracking sync time | Endless rebase cost | Two syncs over the owner's budget in a row: re-evaluate the base |

**Proposed phase rule [I].** If a phase reaches its pessimistic figure without meeting its exit gate, work stops and
the owner decides: extend with a new ceiling, cut scope, or take the documented fallback. Gates are pass or fail on
recorded evidence. Effort already spent is never a reason to pass a gate.

---

## 7. What the owner must approve, by phase

| Before | Approvals and decisions |
|---|---|
| P0 | ADR 0001 (A-first, one toolchain; hybrid only behind G-REOPEN-C / G-NATIVE; B and D deferred); fork location and visibility, binaries, CI; title pack; default CPU profile until G-AB; variant set, retention, bundle ids and per-sync budget; upstream policy; attended A+B and DualSense sessions; any TCC prompt answered personally |
| P1 | ADR 0002 and ADR 0005; Dear ImGui subject to G-UI-0; UI scale 0.85; computed-nits-only labelling; A95L and capture sessions |
| P2 | ADR 0003 and ADR 0004; D2 in the title pack plus licence review; 30 guaranteed and 60 experimental; 45 with a warning; 1.0x scale trade-off; optional MoltenVK `1.4.3-ryujinx.2` A/B; validation and arbitration sessions |
| P3 | The person-week ceiling and the go decision |
| P4 | ADR 0006; Serfrost install for the A/B; toggle bindings; ReShade FX effects wanted (G-FX) |
| P5 | Each track separately: KosmicKrisp driver acquisition; haptics and adaptive triggers (with private read-only hooks); DV-like peak; MacShade SDR experiment (if wanted at all) |
