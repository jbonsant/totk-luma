# What needs the owner's approval

Status: Proposed, 2026-11-01

Nothing in this repository authorises production emulator work, a merge, a deploy or a purchase. Implementation
starts only after the owner answers the items below. They are ordered by what they block: items 1-8 block P0, and
the later items can wait until their phase.

Each item gives the decision, the options, the recommendation, and what it unblocks. Every effort figure is an
estimate `[I]`. Detail: [overview](00-overview.md), [ADR index](adr/README.md),
[plan](03-plan-and-effort.md) §7.

---

## Before P0 (foundation)

### 1. Architecture

- **Decide:** how TOTK Luma is built.
- **Options:** (A) a flagged Ryubing patch queue with one .NET toolchain; (B) a native macOS/Xcode shell;
  (C) a hybrid with a Swift presenter; (D) a different base emulator.
- **Recommend:** A-first at `475615f`. Add C only behind G-REOPEN-C or G-NATIVE. Defer B and D (ADR 0001 D1).
- **Unblocks:** all of P0.

### 2. Where the fork lives

- **Decide:** fork location and visibility, whether binaries are ever published, and whether builds use CI.
- **Options:** local-only, or a hosted fork; local builds, or free public CI.
- **Recommend:** local-only by default, local builds, and no published binaries (ADR 0001 D10).
- **Unblocks:** the P0 repository and build set-up.

### 3. Private title pack

- **Decide:** whether all TOTK-specific material lives in an owner-local private pack loaded by path. That material
  is the D2 patch, guest shader hashes, TOTK shaders, the render-target allow-list and any game-state hooks.
- **Options:** a private pack, or carrying it in the fork.
- **Recommend:** the private pack, kept out of every public repository (ADR 0001 D1).
- **Unblocks:** the P0 pack mechanism, D2 in P2, and all of P3.

### 4. Attended sessions

- **Decide:** whether to schedule owner-attended runs on an uncontended Mac.
- **Sessions:** the A+B flash test (at least 900 s per scene); the DualSense check; one GPU-capture and shader-hash
  session (dumps stay private); and the A95L display sessions (HDMI 3 or 4, Enhanced format, TV HDR Tone Mapping
  Off during calibration).
- **Recommend:** approve all of them. Each is short and needs no purchase. Please confirm that you already own a
  48 Gbps HDMI cable, because the VRR gate (G6-1) needs one.
- **Unblocks:** G-AB and G-INP-1/2 in P0; the capture and display gates in P1, including G6-1 and G6-2 in the A95L
  session; their results set the P2 TV menus and host LFC.

### 5. Default CPU profile and render scale

- **Decide:** the default until the flash test (G-AB) gives a verdict, and whether a lower scale is acceptable.
- **Options:** Hypervisor Off at 1.2x (no flashes, but 20 FPS in the Room of Awakening), or Hypervisor On (about 30
  FPS, with flashes) [E]. For scale: 1.2x is the "about 1080p" setting, and 1.0x may be the only route to 60 on the
  island (R05 Summary).
- **Recommend:** Hypervisor Off at 1.2x until G-AB. If A+B passes, it becomes the default. Treat 1.0x as your
  trade-off, and decide it only after the P2 scale test.
- **Unblocks:** the P0 baselines and the P2 scale test.

### 6. Graphics backend

- **Decide:** the backend baseline, and which evaluations to allow.
- **Options:** stay on MoltenVK `1.4.2-ryujinx.5`; A/B MoltenVK `1.4.3-ryujinx.2`; acquire a KosmicKrisp driver
  (source build, LunarG SDK, or the PR !131 prebuilt binary).
- **Recommend:** stay on 1.4.2-ryujinx.5. Run the 1.4.3 A/B only after the direct-to-display check (G6-6). Allow a
  KosmicKrisp source build or the LunarG SDK as a P5 variant. The prebuilt binary needs its own yes (ADR 0001 D2).
  MoltenVK is deprecated [D], so this choice will come back.
- **Unblocks:** P2 backend tests and the P5 KosmicKrisp track (1-3 days).

### 7. Upstream policy

- **Decide:** what goes back to Ryubing.
- **Recommend:** submit shmfix and the `contentsScale` fix (#461) now. Submit A+B after G-AB (ADR 0001 D10).
- **Unblocks:** smaller rebases. Today a rebase costs about 0.5-2 days, and later about 2-5 days.

### 8. Variants, retention and the fork kill criterion

- **Decide:** which bundles to keep (reference, measure, agent, hdr), how many previous builds to retain (N-1 or N-2),
  the bundle identifier scheme, and the per-sync effort budget that would end the fork.
- **Recommend:** keep all four variants and retain N-1, using `app.totkluma.ryubing.<variant>` (ADR 0001 D10).
  Choose the per-sync budget yourself. It has no default.
- **Unblocks:** P0 bundles, data roots and the rollback drill.

---

## Before P1 (visible EDR)

### 9. HDR presenter and dashboard

- **Decide:** the v1 presenter, the UI library, and the default UI scale.
- **Options:** the in-swapchain Luma output stage, or a native Swift presenter. For UI, pinned Dear ImGui (MIT), or a
  custom renderer (4-8 days).
- **Recommend:** the output stage, with the Swift presenter only behind G-NATIVE. Use ImGui, subject to G-UI-0. Set
  the UI at 0.85 of paper white (ADR 0002 D4, D9).
- **Unblocks:** P1.

### 10. Labelling and purchases

- **Decide:** whether to accept computed-nits-only labels until an instrument is available.
- **Recommend:** yes. Mac values appear as "assumed N nits at EDR 1.0", and no purchases are made (ADR 0002 D9).
- **Unblocks:** P1 calibration.

### 11. Dolby Vision

- **Decide:** the Dolby Vision position.
- **Options:** pursue it, or mark it "not pursued" and keep a light watching brief.
- **Recommend:** not pursued. Keep about 1 h per major macOS release and a 0.5 h read-only A95L EDID decode. HDR10 and
  EDR stay the only paths (ADR 0005).
- **Unblocks:** closes the Dolby Vision workstream. The read-only decode runs in the P1 display session.

---

## Before P2 (paced frame rate)

### 12. The D2 game-time patch

- **Decide:** whether D2 ships as an owner-supplied file in the title pack, after a licence review of its
  FPSLocker-derived facts.
- **Recommend:** yes. The public repository describes only its behaviour and a checksum (ADR 0003).
- **Unblocks:** every cap other than "30 (native)".

### 13. Cap policy

- **Decide:** how caps are offered.
- **Recommend:** 30 is guaranteed. 60 stays labelled experimental until it passes both G-60 and G-CAP at 60. 45 is
  shown with a cadence warning, and 40 or 48 is suggested unless HDMI VRR is verified. Unbounded, turbo and Custom
  above 60 are refused while D2 is active (ADR 0003).
- **Unblocks:** the P2 cap UI.

### 14. DualSense and automation

- **Decide:** the v1 input plan and the dashboard toggle.
- **Recommend:** SDL3 with small tested patches, and owner-wins arbitration with the agent pad. Keyboard, mouse and
  focus are never touched. The toggle is the DualSense mute button plus one verified-unbound keyboard key, with the
  touchpad click optional. Using the click as the toggle removes it as a game input (ADR 0004).
- **Also:** you answer any Input Monitoring (TCC) prompt yourself. No TCC changes are planned.
- **Unblocks:** P2 input work and G-INP-6.

---

## At the end of P1 (before P3)

### 15. P3 ceiling

- **Decide:** the person-week ceiling for genuine scene HDR, and go or no-go.
- **Options:** P3 is estimated at 4-10 pw and is the most uncertain phase. If the ceiling is hit or a gate fails, the
  labelled "Expanded SDR" tier ships instead (3-7 days).
- **Recommend:** set the ceiling after the P1 capture session, when the tonemap model is confirmed.
- **Unblocks:** P3.

---

## Optional or later

### 16. Looks and effects

- **Decide:** whether you will install the Serfrost Base Defogger yourself for the defog A/B (it is never bundled),
  which ReShade FX effects you want (this decides G-FX), and whether you want the MacShade SDR experiment at all.
- **Recommend:** install Serfrost for the A/B. Name effects only if the built-in looks fall short. Skip MacShade
  unless you are curious (ADR 0006).
- **Unblocks:** P4 looks and the gated reshadefx track (3-6 weeks).

### 17. P5 tracks

- **Decide:** go or no-go per track. The candidates are USB voice-coil haptics (1-2 weeks), adaptive triggers with
  private read-only TOTK hooks (2-4 weeks), Bluetooth haptics (2-4 weeks, uncertain) and the DV-like scene-adaptive
  peak (1-3 weeks, plus 2-4 days of validation per display profile).
- **Recommend:** decide after P4, based on how the core feels in play.
- **Unblocks:** each track separately. None starts without your approval.

---

## Smaller decisions to confirm

These are short yes/no answers. Each one is already proposed somewhere in the specification, but none was in the list
above.

| # | Decide | Recommend | Needed before | Where |
|---|---|---|---|---|
| 18 | The rule that makes A+B the default CPU profile | Default only with 0 flashes per scene in at least 900 s (the Poisson test at α = 0.05 is reported too) | The G-AB run in P0 | [04](04-test-acceptance-matrices.md) PERF-06 |
| 19 | Free software installs, none of them purchases: `edid-decode` for the read-only EDID decode; an audio loopback route for the objective audio-drift check; `sudo` for `powermetrics` | Approve `edid-decode`. Decide the loopback route yourself; without it, audio is checked by listening and recorded as such. Approve `sudo` only per session | P1 (EDID), P2 (audio) | [02](02-unknowns-risks-and-gates.md) G-SW-EDID; 04 SPD-05, §4.3 |
| 20 | Length of the D2 validation sessions | At least 30 minutes per cap, including 48 | P2 | ADR 0003 open question 5 |
| 21 | Which TV connection is used | Mac HDMI port straight to A95L HDMI 3 or 4, Enhanced Format (4K120), no adapter. Other connections fall back to fixed-rate menus | The P1 A95L session | [04 §1.3a](04-test-acceptance-matrices.md#13a-vrr-support-per-display-and-connection) |
| 22 | UX details: the Hidden / Compact / Full / Interactive dashboard states; pausing on a physical-pad disconnect; an agent marker while the dashboard is hidden | Accept the proposed states; make pause-on-disconnect an owner-profile option, never active in `agent-background`; show the small agent marker only while the agent is active | P1-P2 | [06](06-ux-spec.md) §15 |

---

## Specification points to settle

The writers found these inconsistencies. They do not block P0, but each needs a ruling before its phase.

| Point | Where | Suggested ruling |
|---|---|---|
| ADR 0003 says 45 is "selectable everywhere", but its table excludes it on the built-in fixed 48 Hz mode | ADR 0003 | Follow the table |
| G-60 passes at a 20 ms guest frame time, which is longer than the 16.7 ms interval at 60 | ADR 0003 | Require G-60 and G-CAP at 60 |
| G-PRES-3 refers to pacing targets, but no cadence-error threshold exists | ADR 0002, 0003 | Set a threshold after the P0 baselines |
| The 48 cap is offered, but G6-4 validates only 30/40/45/60 | ADR 0003 | Add 48 to G6-4 |
| P2 items sum to about 2.7-5.2 pw against the stated 2-4 pw, and movie auto-30 is uncounted | ADR index, plan §4.3 | Accept the higher range |
| G-UI-3 (GPU timestamps on MoltenVK) is in no phase exit | ADR 0002 | Put it in the P1 exit |
| G-TEL and G-KK judge p95, but ADR 0003 §6 does not list it | ADR 0001, 0003 | Record p95 as well |
| The patch-queue order omits the pacing patches, SDL input patches, title-pack loader and looks hooks | ADR 0001 D10 | Append them in phase order, as [05](05-rollback-and-reproducibility.md) §9.1 proposes |
